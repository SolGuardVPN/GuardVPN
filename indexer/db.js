// Database schema and connection for PostgreSQL
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'dvpn_indexer',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS providers (
        pubkey VARCHAR(44) PRIMARY KEY,
        authority VARCHAR(44) NOT NULL,
        node_count INTEGER NOT NULL DEFAULT 0,
        stake_lamports BIGINT NOT NULL DEFAULT 0,
        reputation_score INTEGER NOT NULL DEFAULT 1000,
        total_uptime_seconds BIGINT NOT NULL DEFAULT 0,
        total_sessions BIGINT NOT NULL DEFAULT 0,
        total_earnings BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS nodes (
        pubkey VARCHAR(44) PRIMARY KEY,
        provider VARCHAR(44) NOT NULL REFERENCES providers(pubkey),
        node_id BIGINT NOT NULL,
        endpoint VARCHAR(100) NOT NULL,
        region VARCHAR(20) NOT NULL,
        price_per_minute_lamports BIGINT NOT NULL,
        wg_server_pubkey TEXT NOT NULL,
        max_capacity INTEGER NOT NULL,
        active_sessions INTEGER NOT NULL DEFAULT 0,
        total_uptime_seconds BIGINT NOT NULL DEFAULT 0,
        total_earnings BIGINT NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(provider, node_id)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_nodes_region ON nodes(region);
      CREATE INDEX IF NOT EXISTS idx_nodes_active ON nodes(is_active);
      CREATE INDEX IF NOT EXISTS idx_nodes_reputation ON nodes(provider);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        pubkey VARCHAR(44) PRIMARY KEY,
        user_pubkey VARCHAR(44) NOT NULL,
        node VARCHAR(44) NOT NULL REFERENCES nodes(pubkey),
        session_id BIGINT NOT NULL,
        start_ts BIGINT NOT NULL,
        end_ts BIGINT NOT NULL,
        escrow_lamports BIGINT NOT NULL,
        remaining_balance BIGINT NOT NULL,
        bytes_used BIGINT NOT NULL DEFAULT 0,
        last_proof_hash TEXT,
        payment_token VARCHAR(44),
        state VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_pubkey, node, session_id)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_pubkey);
      CREATE INDEX IF NOT EXISTS idx_sessions_node ON sessions(node);
      CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
    `);

  } finally {
    client.release();
  }
}

async function upsertProvider(data) {
  const { pubkey, authority, node_count, stake_lamports, reputation_score, total_uptime_seconds, total_sessions, total_earnings } = data;
  await pool.query(`
    INSERT INTO providers (pubkey, authority, node_count, stake_lamports, reputation_score, total_uptime_seconds, total_sessions, total_earnings, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (pubkey) DO UPDATE SET
      authority = EXCLUDED.authority,
      node_count = EXCLUDED.node_count,
      stake_lamports = EXCLUDED.stake_lamports,
      reputation_score = EXCLUDED.reputation_score,
      total_uptime_seconds = EXCLUDED.total_uptime_seconds,
      total_sessions = EXCLUDED.total_sessions,
      total_earnings = EXCLUDED.total_earnings,
      updated_at = NOW()
  `, [pubkey, authority, node_count, stake_lamports, reputation_score, total_uptime_seconds, total_sessions, total_earnings || 0]);
}

async function upsertNode(data) {
  const { pubkey, provider, node_id, endpoint, region, price_per_minute_lamports, 
          wg_server_pubkey, max_capacity, active_sessions, total_uptime_seconds, total_earnings, is_active } = data;
  await pool.query(`
    INSERT INTO nodes (pubkey, provider, node_id, endpoint, region, price_per_minute_lamports,
                      wg_server_pubkey, max_capacity, active_sessions, total_uptime_seconds, total_earnings, is_active, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
    ON CONFLICT (pubkey) DO UPDATE SET
      endpoint = EXCLUDED.endpoint,
      region = EXCLUDED.region,
      price_per_minute_lamports = EXCLUDED.price_per_minute_lamports,
      max_capacity = EXCLUDED.max_capacity,
      active_sessions = EXCLUDED.active_sessions,
      total_uptime_seconds = EXCLUDED.total_uptime_seconds,
      total_earnings = EXCLUDED.total_earnings,
      is_active = EXCLUDED.is_active,
      updated_at = NOW()
  `, [pubkey, provider, node_id, endpoint, region, price_per_minute_lamports, 
      wg_server_pubkey, max_capacity, active_sessions, total_uptime_seconds, total_earnings || 0, is_active]);
}

async function upsertSession(data) {
  const { pubkey, user_pubkey, node, session_id, start_ts, end_ts, escrow_lamports,
          remaining_balance, bytes_used, last_proof_hash, payment_token, state } = data;
  await pool.query(`
    INSERT INTO sessions (pubkey, user_pubkey, node, session_id, start_ts, end_ts, escrow_lamports,
                         remaining_balance, bytes_used, last_proof_hash, payment_token, state, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
    ON CONFLICT (pubkey) DO UPDATE SET
      remaining_balance = EXCLUDED.remaining_balance,
      bytes_used = EXCLUDED.bytes_used,
      last_proof_hash = EXCLUDED.last_proof_hash,
      state = EXCLUDED.state,
      updated_at = NOW()
  `, [pubkey, user_pubkey, node, session_id, start_ts, end_ts, escrow_lamports,
      remaining_balance, bytes_used, last_proof_hash, payment_token, state]);
}

async function getNodes(filters = {}) {
  let query = 'SELECT n.*, p.reputation_score FROM nodes n JOIN providers p ON n.provider = p.pubkey WHERE 1=1';
  const params = [];
  let paramCount = 1;

  if (filters.region) {
    query += ` AND n.region = $${paramCount++}`;
    params.push(filters.region);
  }

  if (filters.is_active !== undefined) {
    query += ` AND n.is_active = $${paramCount++}`;
    params.push(filters.is_active);
  }

  if (filters.min_reputation) {
    query += ` AND p.reputation_score >= $${paramCount++}`;
    params.push(filters.min_reputation);
  }

  query += ' ORDER BY p.reputation_score DESC, n.price_per_minute_lamports ASC';

  if (filters.limit) {
    query += ` LIMIT $${paramCount++}`;
    params.push(filters.limit);
  }

  const result = await pool.query(query, params);
  return result.rows;
}

async function getSessions(filters = {}) {
  let query = 'SELECT * FROM sessions WHERE 1=1';
  const params = [];
  let paramCount = 1;

  if (filters.user_pubkey) {
    query += ` AND user_pubkey = $${paramCount++}`;
    params.push(filters.user_pubkey);
  }

  if (filters.node) {
    query += ` AND node = $${paramCount++}`;
    params.push(filters.node);
  }

  if (filters.state) {
    query += ` AND state = $${paramCount++}`;
    params.push(filters.state);
  }

  query += ' ORDER BY created_at DESC';

  if (filters.limit) {
    query += ` LIMIT $${paramCount++}`;
    params.push(filters.limit);
  }

  const result = await pool.query(query, params);
  return result.rows;
}

module.exports = {
  pool,
  initDatabase,
  upsertProvider,
  upsertNode,
  upsertSession,
  getNodes,
  getSessions,
};
