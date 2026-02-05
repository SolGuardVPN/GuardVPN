/**
 * Register Node On-Chain Script
 * 
 * This script registers your IPFS node on the Solana blockchain
 * so you can claim subscription rewards (80% of user payments).
 * 
 * Usage: node scripts/register-node-onchain.js
 */

const { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

// Configuration
const PROGRAM_ID = 'EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq';
const RPC_URL = 'https://api.devnet.solana.com';
const PROVIDER_SEED = Buffer.from('provider');
const NODE_SEED = Buffer.from('node');

// Your node details (update these!)
const NODE_CONFIG = {
  endpoint: '147.45.159.233:51820',  // Your WireGuard endpoint
  region: 'germany',                  // Max 12 chars
  pricePerHourSOL: 0.001,            // Price in SOL per hour
  maxCapacity: 100,                   // Max concurrent users
  bandwidthMbps: 100,                // Bandwidth in Mbps
  wgPubkey: ''                       // Leave empty or provide base64 encoded 32-byte key
};

async function main() {
  
  // Load wallet
  const walletPath = path.join(__dirname, '..', 'wallet.json');
  if (!fs.existsSync(walletPath)) {
    console.error('❌ wallet.json not found!');
    process.exit(1);
  }
  
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const secretKey = walletData.secretKey || walletData;
  const wallet = Keypair.fromSecretKey(new Uint8Array(secretKey));
  
  
  // Connect to Solana
  const connection = new Connection(RPC_URL, 'confirmed');
  const balance = await connection.getBalance(wallet.publicKey);
  
  if (balance < 0.01 * LAMPORTS_PER_SOL) {
    console.error('❌ Insufficient balance! Need at least 0.01 SOL');
    process.exit(1);
  }
  
  const programId = new PublicKey(PROGRAM_ID);
  
  // Derive Provider PDA
  const [providerPda, providerBump] = PublicKey.findProgramAddressSync(
    [PROVIDER_SEED, wallet.publicKey.toBuffer()],
    programId
  );
  
  // Check if provider exists
  const providerAccount = await connection.getAccountInfo(providerPda);
  if (!providerAccount) {
    console.error('❌ Provider account does not exist!');
    process.exit(1);
  }
  
  // Generate unique node ID
  const nodeId = BigInt(Date.now());
  
  // Derive Node PDA
  const nodeIdBuffer = Buffer.alloc(8);
  nodeIdBuffer.writeBigUInt64LE(nodeId);
  
  const [nodePda, nodeBump] = PublicKey.findProgramAddressSync(
    [NODE_SEED, providerPda.toBuffer(), nodeIdBuffer],
    programId
  );
  
  // Check if node already exists
  const existingNode = await connection.getAccountInfo(nodePda);
  if (existingNode) {
    process.exit(0);
  }
  
  // Prepare instruction data
  
  // Calculate price per minute in lamports
  const pricePerMinuteLamports = BigInt(Math.floor(NODE_CONFIG.pricePerHourSOL * LAMPORTS_PER_SOL / 60));
  
  // Build instruction data
  // Anchor discriminator for register_node (8 bytes)
  const discriminator = Buffer.from([178, 100, 167, 106, 183, 36, 109, 61]);
  
  // node_id: u64 (8 bytes)
  const nodeIdBytes = Buffer.alloc(8);
  nodeIdBytes.writeBigUInt64LE(nodeId);
  
  // endpoint: String (4 byte length + content)
  const endpoint = NODE_CONFIG.endpoint.substring(0, 80);
  const endpointBuffer = Buffer.alloc(4 + endpoint.length);
  endpointBuffer.writeUInt32LE(endpoint.length, 0);
  endpointBuffer.write(endpoint, 4);
  
  // region: String (4 byte length + content)
  const region = NODE_CONFIG.region.substring(0, 12);
  const regionBuffer = Buffer.alloc(4 + region.length);
  regionBuffer.writeUInt32LE(region.length, 0);
  regionBuffer.write(region, 4);
  
  // price_per_minute_lamports: u64 (8 bytes)
  const priceBuffer = Buffer.alloc(8);
  priceBuffer.writeBigUInt64LE(pricePerMinuteLamports);
  
  // wg_server_pubkey: [u8; 32] (32 bytes)
  let wgPubkeyBytes = Buffer.alloc(32);
  if (NODE_CONFIG.wgPubkey) {
    try {
      const decoded = Buffer.from(NODE_CONFIG.wgPubkey, 'base64');
      if (decoded.length === 32) {
        wgPubkeyBytes = decoded;
      }
    } catch (e) {}
  }
  
  // max_capacity: u32 (4 bytes)
  const capacityBuffer = Buffer.alloc(4);
  capacityBuffer.writeUInt32LE(NODE_CONFIG.maxCapacity);
  
  // bandwidth_mbps: u32 (4 bytes)
  const bandwidthBuffer = Buffer.alloc(4);
  bandwidthBuffer.writeUInt32LE(NODE_CONFIG.bandwidthMbps);
  
  // Concatenate all
  const instructionData = Buffer.concat([
    discriminator,
    nodeIdBytes,
    endpointBuffer,
    regionBuffer,
    priceBuffer,
    wgPubkeyBytes,
    capacityBuffer,
    bandwidthBuffer
  ]);
  
  
  // Create instruction
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: providerPda, isSigner: false, isWritable: true },
      { pubkey: nodePda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    programId: programId,
    data: instructionData
  });
  
  // Create transaction
  const transaction = new Transaction();
  transaction.add(instruction);
  
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = wallet.publicKey;
  
  // Sign and send
  transaction.sign(wallet);
  
  try {
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });
    
    
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight
    }, 'confirmed');
    
    if (confirmation.value.err) {
      console.error('❌ Transaction failed:', confirmation.value.err);
      process.exit(1);
    }
    
    
  } catch (error) {
    console.error('❌ Transaction error:', error.message);
    
    // Check if it's a simulation error and show logs
    if (error.logs) {
    }
    
    process.exit(1);
  }
}

main().catch(console.error);
