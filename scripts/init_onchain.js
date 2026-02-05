/**
 * Initialize Treasury and Provider on Solana Devnet
 * Using raw transaction construction (no Anchor client)
 */

const { 
  Connection, 
  PublicKey, 
  Keypair, 
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction
} = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Program ID (deployed on devnet)
const PROGRAM_ID = new PublicKey('EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq');

// Seeds
const TREASURY_SEED = Buffer.from('treasury');
const PROVIDER_SEED = Buffer.from('provider');
const NODE_SEED = Buffer.from('node');

// Generate Anchor instruction discriminator
function getDiscriminator(instructionName) {
  const preimage = `global:${instructionName}`;
  const hash = crypto.createHash('sha256').update(preimage).digest();
  return hash.slice(0, 8);
}

async function main() {
  
  // Load wallet
  const walletPath = path.join(__dirname, '..', 'wallet.json');
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(walletData));
  
  
  // Connect to devnet
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Check balance
  const balance = await connection.getBalance(wallet.publicKey);
  
  if (balance < 0.1 * 1e9) {
    console.error('❌ Insufficient balance. Need at least 0.1 SOL');
    return;
  }
  
  // === 1. Initialize Treasury ===
  
  const [treasuryPda, treasuryBump] = PublicKey.findProgramAddressSync(
    [TREASURY_SEED],
    PROGRAM_ID
  );
  
  try {
    const treasuryAccount = await connection.getAccountInfo(treasuryPda);
    if (treasuryAccount) {
    } else {
      const data = getDiscriminator('initialize_treasury');
      
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: treasuryPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: data,
      });
      
      const tx = new Transaction().add(instruction);
      const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
    }
  } catch (error) {
    if (error.message?.includes('already in use') || error.logs?.some(l => l.includes('already in use'))) {
    } else {
      console.error('   ❌ Treasury error:', error.message);
      if (error.logs) console.error('   Logs:', error.logs.slice(-5).join('\n   '));
    }
  }
  
  // === 2. Register Provider ===
  
  const [providerPda, providerBump] = PublicKey.findProgramAddressSync(
    [PROVIDER_SEED, wallet.publicKey.toBuffer()],
    PROGRAM_ID
  );
  
  try {
    const providerAccount = await connection.getAccountInfo(providerPda);
    if (providerAccount) {
    } else {
      const data = getDiscriminator('register_provider');
      
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: providerPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: data,
      });
      
      const tx = new Transaction().add(instruction);
      const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
    }
  } catch (error) {
    if (error.message?.includes('already in use') || error.logs?.some(l => l.includes('already in use'))) {
    } else {
      console.error('   ❌ Provider error:', error.message);
      if (error.logs) console.error('   Logs:', error.logs.slice(-5).join('\n   '));
    }
  }
  
  // === 3. Register Node ===
  
  const nodeId = BigInt(1);
  const nodeIdBuffer = Buffer.alloc(8);
  nodeIdBuffer.writeBigUInt64LE(nodeId);
  
  const [nodePda, nodeBump] = PublicKey.findProgramAddressSync(
    [NODE_SEED, providerPda.toBuffer(), nodeIdBuffer],
    PROGRAM_ID
  );
  
  try {
    const nodeAccount = await connection.getAccountInfo(nodePda);
    if (nodeAccount) {
    } else {
      // WireGuard public key (from config)
      const wgPubkey = 'Av03lrIXovuEzBmN2LD9i0qDGOMry9cD9aIuHg+OfzM=';
      const wgPubkeyBytes = Buffer.from(wgPubkey, 'base64');
      
      // Build instruction data
      const endpoint = '31.57.228.54:51820';
      const region = 'me-dubai';
      const pricePerMinute = BigInt(100000); // 0.0001 SOL
      const maxCapacity = 100;
      
      const dataBuffer = Buffer.alloc(8 + 8 + 4 + endpoint.length + 4 + region.length + 8 + 32 + 4);
      let offset = 0;
      
      // Discriminator
      getDiscriminator('register_node').copy(dataBuffer, offset);
      offset += 8;
      
      // node_id (u64)
      dataBuffer.writeBigUInt64LE(nodeId, offset);
      offset += 8;
      
      // endpoint (String: 4-byte length + bytes)
      dataBuffer.writeUInt32LE(endpoint.length, offset);
      offset += 4;
      dataBuffer.write(endpoint, offset);
      offset += endpoint.length;
      
      // region (String: 4-byte length + bytes)
      dataBuffer.writeUInt32LE(region.length, offset);
      offset += 4;
      dataBuffer.write(region, offset);
      offset += region.length;
      
      // price_per_minute_lamports (u64)
      dataBuffer.writeBigUInt64LE(pricePerMinute, offset);
      offset += 8;
      
      // wg_server_pubkey ([u8; 32])
      wgPubkeyBytes.copy(dataBuffer, offset);
      offset += 32;
      
      // max_capacity (u32)
      dataBuffer.writeUInt32LE(maxCapacity, offset);
      
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: providerPda, isSigner: false, isWritable: true },
          { pubkey: nodePda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: dataBuffer,
      });
      
      const tx = new Transaction().add(instruction);
      const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
    }
  } catch (error) {
    if (error.message?.includes('already in use') || error.logs?.some(l => l.includes('already in use'))) {
    } else {
      console.error('   ❌ Node error:', error.message);
      if (error.logs) console.error('   Logs:', error.logs.slice(-5).join('\n   '));
    }
  }
  
  // === Summary ===
  
  // Save PDAs to config file
  const config = {
    programId: PROGRAM_ID.toBase58(),
    treasuryPda: treasuryPda.toBase58(),
    providerPda: providerPda.toBase58(),
    nodePda: nodePda.toBase58(),
    providerWallet: wallet.publicKey.toBase58(),
    nodeId: 1,
  };
  
  const configPath = path.join(__dirname, '..', 'onchain-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

main().catch(console.error);
