const { Connection, PublicKey } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Load IDL
const idl = require('../target/idl/dvpn.json');
const PROGRAM_ID = new PublicKey(idl.metadata.address);

// Database setup
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'dvpn',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// Logger
const log = (level, msg, meta) => {
  const out = { ts: new Date().toISOString(), level, msg, ...meta };
};

// Initialize database schema
async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS providers (
        pubkey TEXT PRIMARY KEY,
        authority TEXT NOT NULL,
        node_count BIGINT NOT NULL,
        stake_lamports BIGINT NOT NULL,
        reputation_score INTEGER NOT NULL,
        total_uptime_seconds BIGINT NOT NULL,
        total_sessions BIGINT NOT NULL,
        last_updated TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS nodes (
        pubkey TEXT PRIMARY KEY,
        provider TEXT NOT NULL REFERENCES providers(pubkey),
        node_id BIGINT NOT NULL,
        endpoint TEXT NOT NULL,
        region TEXT NOT NULL,
        price_per_minute_lamports BIGINT NOT NULL,
        wg_server_pubkey TEXT NOT NULL,
        max_capacity INTEGER NOT NULL,
        active_sessions INTEGER NOT NULL,
        total_uptime_seconds BIGINT NOT NULL,
        is_active BOOLEAN NOT NULL,
        last_updated TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sessions (
        pubkey TEXT PRIMARY KEY,
        user_pubkey TEXT NOT NULL,
        node_pubkey TEXT NOT NULL REFERENCES nodes(pubkey),
        session_id BIGINT NOT NULL,
        start_ts BIGINT NOT NULL,
        end_ts BIGINT NOT NULL,
        escrow_lamports BIGINT NOT NULL,
        remaining_balance BIGINT NOT NULL,
        bytes_used BIGINT NOT NULL,
        state TEXT NOT NULL,
        last_updated TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_nodes_provider ON nodes(provider);
      CREATE INDEX IF NOT EXISTS idx_nodes_region ON nodes(region);
      CREATE INDEX IF NOT EXISTS idx_nodes_active ON nodes(is_active);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_pubkey);
      CREATE INDEX IF NOT EXISTS idx_sessions_node ON sessions(node_pubkey);
      CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
    `);
    log('info', 'Database initialized');
  } finally {
    client.release();
  }
}

// Decode accounts
function decodeProvider(data) {
  let off = 8;
  const authority = new PublicKey(data.slice(off, off + 32)); off += 32;
  const node_count = Number(data.readBigUInt64LE(off)); off += 8;
  const stake_lamports = Number(data.readBigUInt64LE(off)); off += 8;
  const reputation_score = data.readUInt16LE(off); off += 2;
  const total_uptime_seconds = Number(data.readBigUInt64LE(off)); off += 8;
  const total_sessions = Number(data.readBigUInt64LE(off)); off += 8;
  const bump = data.readUInt8(off); off += 1;
  return { authority, node_count, stake_lamports, reputation_score, total_uptime_seconds, total_sessions, bump };
}

function decodeNode(data) {
  let off = 8;
  const provider = new PublicKey(data.slice(off, off + 32)); off += 32;
  const node_id = Number(data.readBigUInt64LE(off)); off += 8;
  const endpointLen = data.readUInt32LE(off); off += 4;
  const endpoint = data.slice(off, off + endpointLen).toString('utf8'); off += endpointLen;
  const regionLen = data.readUInt32LE(off); off += 4;
  const region = data.slice(off, off + regionLen).toString('utf8'); off += regionLen;
  const price_per_minute_lamports = Number(data.readBigUInt64LE(off)); off += 8;
  const wg_server_pubkey = data.slice(off, off + 32); off += 32;
  const max_capacity = data.readUInt32LE(off); off += 4;
  const active_sessions = data.readUInt32LE(off); off += 4;
  const total_uptime_seconds = Number(data.readBigUInt64LE(off)); off += 8;
  const is_active = data.readUInt8(off) === 1; off += 1;
  const bump = data.readUInt8(off); off += 1;
  return { provider, node_id, endpoint, region, price_per_minute_lamports, wg_server_pubkey, max_capacity, active_sessions, total_uptime_seconds, is_active, bump };
}

function decodeSession(data) {
  let off = 8;
  const user = new PublicKey(data.slice(off, off + 32)); off += 32;
  const node = new PublicKey(data.slice(off, off + 32)); off += 32;
  const session_id = Number(data.readBigUInt64LE(off)); off += 8;
  const start_ts = Number(data.readBigInt64LE(off)); off += 8;
  const end_ts = Number(data.readBigInt64LE(off)); off += 8;
  const escrow_lamports = Number(data.readBigUInt64LE(off)); off += 8;
  const remaining_balance = Number(data.readBigUInt64LE(off)); off += 8;
  const bytes_used = Number(data.readBigUInt64LE(off)); off += 8;
  const last_proof_hash = data.slice(off, off + 32); off += 32;
  const stateByte = data.readUInt8(off); off += 1;
  const state = ['Active', 'Closed', 'Claimed', 'Disputed', 'Resolved'][stateByte] || 'Unknown';
  const bump = data.readUInt8(off); off += 1;
  return { user, node, session_id, start_ts, end_ts, escrow_lamports, remaining_balance, bytes_used, last_proof_hash, state, bump };
}

// Index all accounts
async function indexAllAccounts(connection) {
  log('info', 'Starting full account index');
  
  const accounts = await connection.getProgramAccounts(PROGRAM_ID);
  log('info', 'Found accounts', { count: accounts.length });

  for (const { pubkey, account } of accounts) {
    try {
      const discriminator = account.data.slice(0, 8).toString('hex');
      
      // Provider discriminator
      if (discriminator === '5eed8c9dfb32e2a5') {
        const decoded = decodeProvider(account.data);
        await upsertProvider(pubkey.toBase58(), decoded);
      }
      // Node discriminator
      else if (discriminator === '8e3c72c8aa7a2b2e') {
        const decoded = decodeNode(account.data);
        await upsertNode(pubkey.toBase58(), decoded);
      }
      // Session discriminator
      else if (discriminator === 'c49c1a8ea4cc44e8') {
        const decoded = decodeSession(account.data);
        await upsertSession(pubkey.toBase58(), decoded);
      }
    } catch (err) {
      log('error', 'Failed to index account', { pubkey: pubkey.toBase58(), error: err.message });
    }
  }

  log('info', 'Full index complete');
}

// Upsert functions
async function upsertProvider(pubkey, data) {
  await pool.query(`
    INSERT INTO providers (pubkey, authority, node_count, stake_lamports, reputation_score, total_uptime_seconds, total_sessions, last_updated)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (pubkey) DO UPDATE SET
      authority = EXCLUDED.authority,
      node_count = EXCLUDED.node_count,
      stake_lamports = EXCLUDED.stake_lamports,
      reputation_score = EXCLUDED.reputation_score,
      total_uptime_seconds = EXCLUDED.total_uptime_seconds,
      total_sessions = EXCLUDED.total_sessions,
      last_updated = NOW()
  `, [pubkey, data.authority.toBase58(), data.node_count, data.stake_lamports, data.reputation_score, data.total_uptime_seconds, data.total_sessions]);
}

async function upsertNode(pubkey, data) {
  await pool.query(`
    INSERT INTO nodes (pubkey, provider, node_id, endpoint, region, price_per_minute_lamports, wg_server_pubkey, max_capacity, active_sessions, total_uptime_seconds, is_active, last_updated)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    ON CONFLICT (pubkey) DO UPDATE SET
      provider = EXCLUDED.provider,
      node_id = EXCLUDED.node_id,
      endpoint = EXCLUDED.endpoint,
      region = EXCLUDED.region,
      price_per_minute_lamports = EXCLUDED.price_per_minute_lamports,
      wg_server_pubkey = EXCLUDED.wg_server_pubkey,
      max_capacity = EXCLUDED.max_capacity,
      active_sessions = EXCLUDED.active_sessions,
      total_uptime_seconds = EXCLUDED.total_uptime_seconds,
      is_active = EXCLUDED.is_active,
      last_updated = NOW()
  `, [pubkey, data.provider.toBase58(), data.node_id, data.endpoint, data.region, data.price_per_minute_lamports, Buffer.from(data.wg_server_pubkey).toString('base64'), data.max_capacity, data.active_sessions, data.total_uptime_seconds, data.is_active]);
}

async function upsertSession(pubkey, data) {
  await pool.query(`
    INSERT INTO sessions (pubkey, user_pubkey, node_pubkey, session_id, start_ts, end_ts, escrow_lamports, remaining_balance, bytes_used, state, last_updated)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    ON CONFLICT (pubkey) DO UPDATE SET
      user_pubkey = EXCLUDED.user_pubkey,
      node_pubkey = EXCLUDED.node_pubkey,
      session_id = EXCLUDED.session_id,
      start_ts = EXCLUDED.start_ts,
      end_ts = EXCLUDED.end_ts,
      escrow_lamports = EXCLUDED.escrow_lamports,
      remaining_balance = EXCLUDED.remaining_balance,
      bytes_used = EXCLUDED.bytes_used,
      state = EXCLUDED.state,
      last_updated = NOW()
  `, [pubkey, data.user.toBase58(), data.node.toBase58(), data.session_id, data.start_ts, data.end_ts, data.escrow_lamports, data.remaining_balance, data.bytes_used, data.state]);
}

// HTTP API
async function startAPI() {
  const http = require('http');
  const url = require('url');

  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
      // GET /providers
      if (parsedUrl.pathname === '/providers') {
        const result = await pool.query('SELECT * FROM providers ORDER BY reputation_score DESC');
        res.writeHead(200);
        res.end(JSON.stringify(result.rows));
      }
      // GET /nodes?region=&active=true
      else if (parsedUrl.pathname === '/nodes') {
        const { region, active } = parsedUrl.query;
        let query = 'SELECT * FROM nodes WHERE 1=1';
        const params = [];
        
        if (region) {
          params.push(region);
          query += ` AND region = $${params.length}`;
        }
        if (active === 'true') {
          query += ' AND is_active = true';
        }
        
        query += ' ORDER BY reputation_score DESC LIMIT 100';
        
        const result = await pool.query(query, params);
        res.writeHead(200);
        res.end(JSON.stringify(result.rows));
      }
      // GET /sessions?user=&node=
      else if (parsedUrl.pathname === '/sessions') {
        const { user, node } = parsedUrl.query;
        let query = 'SELECT * FROM sessions WHERE 1=1';
        const params = [];
        
        if (user) {
          params.push(user);
          query += ` AND user_pubkey = $${params.length}`;
        }
        if (node) {
          params.push(node);
          query += ` AND node_pubkey = $${params.length}`;
        }
        
        query += ' ORDER BY start_ts DESC LIMIT 100';
        
        const result = await pool.query(query, params);
        res.writeHead(200);
        res.end(JSON.stringify(result.rows));
      }
      // GET /stats
      else if (parsedUrl.pathname === '/stats') {
        const stats = await pool.query(`
          SELECT 
            (SELECT COUNT(*) FROM providers) as total_providers,
            (SELECT COUNT(*) FROM nodes) as total_nodes,
            (SELECT COUNT(*) FROM nodes WHERE is_active = true) as active_nodes,
            (SELECT COUNT(*) FROM sessions) as total_sessions,
            (SELECT COUNT(*) FROM sessions WHERE state = 'Active') as active_sessions
        `);
        res.writeHead(200);
        res.end(JSON.stringify(stats.rows[0]));
      }
      else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (err) {
      log('error', 'API error', { error: err.message });
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  const port = process.env.INDEXER_PORT || 8080;
  server.listen(port, () => {
    log('info', 'Indexer API listening', { port });
  });
}

// Main
async function main() {
  const rpcUrl = process.env.ANCHOR_PROVIDER_URL || 'https://api.testnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  await initDatabase();
  await indexAllAccounts(connection);
  
  // Start API
  await startAPI();

  // Re-index every 60 seconds
  setInterval(async () => {
    try {
      await indexAllAccounts(connection);
    } catch (err) {
      log('error', 'Periodic index failed', { error: err.message });
    }
  }, 60000);
}

main().catch(err => {
  log('error', 'Fatal error', { error: err.message, stack: err.stack });
  process.exit(1);
});
