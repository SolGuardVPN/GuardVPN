// Enhanced node daemon with receipt submission and reputation handling
const anchor = require('@coral-xyz/anchor');
const { PublicKey, Keypair, Connection } = require('@solana/web3.js');
const fs = require('fs');
const idl = require('../target/idl/dvpn.json');
const crypto = require('crypto');

const PROGRAM_ID = idl.metadata.address;
const url = process.env.ANCHOR_PROVIDER_URL || 'http://127.0.0.1:8899';
const conn = new Connection(url, 'confirmed');

// Load provider keypair (for claiming payouts)
const PROVIDER_KEYPAIR_PATH = process.env.PROVIDER_KEYPAIR || './provider-keypair.json';
let providerKeypair;
try {
  const secret = JSON.parse(fs.readFileSync(PROVIDER_KEYPAIR_PATH, 'utf8'));
  providerKeypair = Keypair.fromSecretKey(Buffer.from(secret));
} catch (e) {
  console.error('❌ Failed to load provider keypair:', e.message);
  process.exit(1);
}

const wallet = new anchor.Wallet(providerKeypair);
const provider = new anchor.AnchorProvider(conn, wallet, { commitment: 'confirmed' });
const program = new anchor.Program(idl, PROGRAM_ID, provider);

// Usage tracking: session -> { bytesUsed, lastClaim }
const usageTracker = {};

// Track bytes used for a session (called by WireGuard monitoring)
function trackUsage(sessionPda, bytesTransferred) {
  if (!usageTracker[sessionPda]) {
    usageTracker[sessionPda] = { bytesUsed: 0, lastClaim: Date.now() };
  }
  usageTracker[sessionPda].bytesUsed += bytesTransferred;
}

// Submit usage receipt and claim chunk (called periodically)
async function submitReceipt(sessionPda, bytesUsed) {
  try {
    
    // Generate proof hash (in production: use merkle tree or hash-chain)
    const proofHash = crypto.createHash('sha256')
      .update(`${sessionPda}:${bytesUsed}:${Date.now()}`)
      .digest();

    // Calculate claim amount (example: charge per MB)
    const MB_IN_BYTES = 1024 * 1024;
    const mbUsed = Math.floor(bytesUsed / MB_IN_BYTES);
    const PRICE_PER_MB_LAMPORTS = 1000000; // 0.001 SOL per MB
    const claimAmount = mbUsed * PRICE_PER_MB_LAMPORTS;

    if (claimAmount === 0) {
      return;
    }

    const [providerPda] = await PublicKey.findProgramAddress(
      [Buffer.from('provider'), providerKeypair.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .claimChunk(
        new anchor.BN(bytesUsed),
        Array.from(proofHash),
        new anchor.BN(claimAmount)
      )
      .accounts({
        authority: providerKeypair.publicKey,
        provider: providerPda,
        session: new PublicKey(sessionPda),
      })
      .signers([providerKeypair])
      .rpc();

    
    // Update tracker
    usageTracker[sessionPda].lastClaim = Date.now();
  } catch (err) {
    console.error(`❌ Failed to submit receipt for ${sessionPda}:`, err.message);
  }
}

// Monitor sessions and submit receipts every 5 minutes
async function receiptSubmitter() {
  const CLAIM_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  
  setInterval(async () => {
    const now = Date.now();
    
    for (const [sessionPda, data] of Object.entries(usageTracker)) {
      const timeSinceLastClaim = now - data.lastClaim;
      
      // Submit if 5+ minutes passed and bytes > 0
      if (timeSinceLastClaim >= CLAIM_INTERVAL_MS && data.bytesUsed > 0) {
        await submitReceipt(sessionPda, data.bytesUsed);
        // Reset after claim
        data.bytesUsed = 0;
      }
    }
  }, 60000); // Check every minute
}

// Claim final payout when session ends
async function claimFinalPayout(sessionPda) {
  try {
    
    const session = await program.account.session.fetch(sessionPda);
    const now = Math.floor(Date.now() / 1000);
    
    // Check if session ended
    if (now < session.endTs.toNumber()) {
      return;
    }

    const [providerPda] = await PublicKey.findProgramAddress(
      [Buffer.from('provider'), providerKeypair.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .claimPayout()
      .accounts({
        authority: providerKeypair.publicKey,
        provider: providerPda,
        node: session.node,
        session: new PublicKey(sessionPda),
      })
      .signers([providerKeypair])
      .rpc();

    
    // Remove from tracker
    delete usageTracker[sessionPda];
  } catch (err) {
    console.error(`❌ Failed to claim payout for ${sessionPda}:`, err.message);
  }
}

// Auto-claim ended sessions every 10 minutes
async function payoutClaimer() {
  setInterval(async () => {
    try {
      // Fetch all sessions for our nodes
      const sessions = await program.account.session.all();
      const now = Math.floor(Date.now() / 1000);
      
      for (const acc of sessions) {
        const session = acc.account;
        const sessionPda = acc.publicKey.toString();
        
        // Check if session ended and not claimed
        const ended = now >= session.endTs.toNumber();
        const stateKey = Object.keys(session.state)[0];
        const isNotClaimed = stateKey !== 'claimed' && stateKey !== 'disputed';
        
        if (ended && isNotClaimed) {
          await claimFinalPayout(sessionPda);
        }
      }
    } catch (err) {
      console.error('❌ Payout claimer error:', err.message);
    }
  }, 10 * 60 * 1000); // Every 10 minutes
}

// Monitor WireGuard traffic and track usage (Linux only)
async function monitorTraffic() {
  if (process.platform !== 'linux') {
    return;
  }
  
  const { exec } = require('child_process');
  const WG_INTERFACE = process.env.WG_INTERFACE || 'wg0';
  
  // Read peers.json to map WG pubkeys to sessions
  const PEERS_FILE = './state/peers.json';
  let peers = {};
  try {
    peers = JSON.parse(fs.readFileSync(PEERS_FILE, 'utf8') || '{}');
  } catch (e) {
  }
  
  // Reverse map: clientWgPubkey -> sessionPda
  const wgToSession = {};
  for (const [sessionPda, data] of Object.entries(peers)) {
    wgToSession[data.clientWgPubkey] = sessionPda;
  }
  
  setInterval(() => {
    exec(`sudo wg show ${WG_INTERFACE} transfer`, (err, stdout) => {
      if (err) return;
      
      // Parse output: <pubkey>\t<rx>\t<tx>
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        const [pubkey, rx, tx] = line.split('\t');
        const sessionPda = wgToSession[pubkey];
        
        if (sessionPda) {
          const bytesTransferred = parseInt(rx || 0) + parseInt(tx || 0);
          trackUsage(sessionPda, bytesTransferred);
        }
      }
    });
  }, 60000); // Check every minute
}

// Start all background tasks
receiptSubmitter();
payoutClaimer();
monitorTraffic();

