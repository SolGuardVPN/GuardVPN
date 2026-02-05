// Indexer that syncs Solana program accounts to PostgreSQL
const { Connection, PublicKey } = require('@solana/web3.js');
const { Program, AnchorProvider, web3 } = require('@project-serum/anchor');
const { upsertProvider, upsertNode, upsertSession, initDatabase } = require('./db');
const idl = require('../target/idl/dvpn.json');

const PROGRAM_ID = new PublicKey(idl.metadata.address);
const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'http://127.0.0.1:8899';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '5000');

const connection = new Connection(RPC_ENDPOINT, 'confirmed');
const provider = new AnchorProvider(connection, {}, { commitment: 'confirmed' });
const program = new Program(idl, PROGRAM_ID, provider);

// Session state mapping
const SESSION_STATES = ['Active', 'Closed', 'Claimed', 'Disputed', 'Resolved'];

async function indexProviders() {
  const accounts = await program.account.provider.all();
  
  for (const acc of accounts) {
    await upsertProvider({
      pubkey: acc.publicKey.toString(),
      authority: acc.account.authority.toString(),
      node_count: acc.account.nodeCount.toNumber(),
      stake_lamports: acc.account.stakeLamports.toString(),
      reputation_score: acc.account.reputationScore,
      total_uptime_seconds: acc.account.totalUptimeSeconds.toString(),
      total_sessions: acc.account.totalSessions.toString(),
      total_earnings: acc.account.totalEarnings ? acc.account.totalEarnings.toString() : '0',
    });
  }
  
}

async function indexNodes() {
  const accounts = await program.account.node.all();
  
  for (const acc of accounts) {
    await upsertNode({
      pubkey: acc.publicKey.toString(),
      provider: acc.account.provider.toString(),
      node_id: acc.account.nodeId.toString(),
      endpoint: acc.account.endpoint,
      region: acc.account.region,
      price_per_minute_lamports: acc.account.pricePerMinuteLamports.toString(),
      wg_server_pubkey: Buffer.from(acc.account.wgServerPubkey).toString('base64'),
      max_capacity: acc.account.maxCapacity,
      active_sessions: acc.account.activeSessions,
      total_uptime_seconds: acc.account.totalUptimeSeconds.toString(),
      total_earnings: acc.account.totalEarnings ? acc.account.totalEarnings.toString() : '0',
      is_active: acc.account.isActive,
    });
  }
  
}

async function indexSessions() {
  const accounts = await program.account.session.all();
  
  for (const acc of accounts) {
    const stateIndex = Object.keys(acc.account.state)[0];
    const stateName = SESSION_STATES[parseInt(stateIndex)] || 'Unknown';
    
    await upsertSession({
      pubkey: acc.publicKey.toString(),
      user_pubkey: acc.account.user.toString(),
      node: acc.account.node.toString(),
      session_id: acc.account.sessionId.toString(),
      start_ts: acc.account.startTs.toString(),
      end_ts: acc.account.endTs.toString(),
      escrow_lamports: acc.account.escrowLamports.toString(),
      remaining_balance: acc.account.remainingBalance.toString(),
      bytes_used: acc.account.bytesUsed.toString(),
      last_proof_hash: Buffer.from(acc.account.lastProofHash).toString('hex'),
      payment_token: acc.account.paymentToken?.toString() || null,
      state: stateName,
    });
  }
  
}

async function runIndexer() {
  
  await initDatabase();
  
  // Initial sync
  await indexProviders();
  await indexNodes();
  await indexSessions();
  
  
  // Continuous polling
  setInterval(async () => {
    try {
      await indexProviders();
      await indexNodes();
      await indexSessions();
    } catch (err) {
      console.error('❌ Indexing error:', err);
    }
  }, POLL_INTERVAL_MS);
}

// Graceful shutdown
process.on('SIGINT', () => {
  process.exit(0);
});

runIndexer().catch(console.error);
