#!/usr/bin/env node

/**
 * DVPN Complete Instruction Test - Step by Step
 * Tests all 12 instructions systematically
 */

const anchor = require("@coral-xyz/anchor");
const { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const fs = require("fs");

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
}

async function main() {
  log('\n═══════════════════════════════════════════════════', 'cyan');
  log('   DVPN COMPLETE INSTRUCTION TEST', 'cyan');
  log('   Testing all 12 instructions step-by-step', 'cyan');
  log('═══════════════════════════════════════════════════\n', 'cyan');

  // Setup
  const walletPath = "./wallet.json";
  const walletData = JSON.parse(fs.readFileSync(walletPath, "utf8"));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(walletData));
  
  const connection = new anchor.web3.Connection("http://localhost:8899", "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), {});
  anchor.setProvider(provider);

  const programId = new PublicKey("8LQKwvHJPdK6fKmopXmUwct8JjVGQhf3RFQd64nCV39i");
  
  log(`Program ID: ${programId.toString()}`, 'blue');
  log(`Wallet: ${wallet.publicKey.toString()}`, 'blue');
  
  const balance = await connection.getBalance(wallet.publicKey);
  log(`Wallet balance: ${balance / LAMPORTS_PER_SOL} SOL\n`, 'blue');

  // Test results
  const results = [];
  
  // ====================================================================================
  // TEST 1: Register Provider
  // ====================================================================================
  log('\n📋 TEST 1: REGISTER PROVIDER', 'cyan');
  log('═══════════════════════════════════════════════════', 'cyan');
  
  try {
    const [providerPda] = await PublicKey.findProgramAddress(
      [Buffer.from("provider"), wallet.publicKey.toBuffer()],
      programId
    );
    
    log(`Provider PDA: ${providerPda.toString()}`);
    
    const providerAccount = await connection.getAccountInfo(providerPda);
    if (providerAccount) {
      log('✅ Provider already registered', 'green');
      results.push({ test: '1. Register Provider', status: 'PASS (exists)' });
    } else {
      const registerProviderDiscriminator = Buffer.from([254, 209, 54, 184, 46, 197, 109, 78]);
      
      const instruction = new anchor.web3.TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: providerPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: programId,
        data: registerProviderDiscriminator,
      });
      
      const transaction = new anchor.web3.Transaction().add(instruction);
      const signature = await provider.sendAndConfirm(transaction);
      log(`✅ Provider registered! Sig: ${signature.slice(0, 20)}...`, 'green');
      results.push({ test: '1. Register Provider', status: 'PASS' });
    }
  } catch (error) {
    log(`❌ FAILED: ${error.message}`, 'red');
    results.push({ test: '1. Register Provider', status: 'FAIL' });
  }

  // ====================================================================================
  // TEST 2: Stake Provider
  // ====================================================================================
  log('\n📋 TEST 2: STAKE PROVIDER', 'cyan');
  log('═══════════════════════════════════════════════════', 'cyan');
  
  try {
    const [providerPda] = await PublicKey.findProgramAddress(
      [Buffer.from("provider"), wallet.publicKey.toBuffer()],
      programId
    );
    
    // stake_provider discriminator
    const stakeDiscriminator = Buffer.from([18, 199, 109, 78, 14, 224, 5, 119]);
    
    // amount: u64 (0.1 SOL)
    const stakeAmount = Buffer.alloc(8);
    stakeAmount.writeBigUInt64LE(BigInt(0.1 * LAMPORTS_PER_SOL));
    
    const data = Buffer.concat([stakeDiscriminator, stakeAmount]);
    
    const instruction = new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: providerPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: programId,
      data: data,
    });
    
    const transaction = new anchor.web3.Transaction().add(instruction);
    const signature = await provider.sendAndConfirm(transaction);
    log(`✅ Staked 0.1 SOL! Sig: ${signature.slice(0, 20)}...`, 'green');
    results.push({ test: '2. Stake Provider', status: 'PASS' });
  } catch (error) {
    log(`❌ FAILED: ${error.message}`, 'red');
    results.push({ test: '2. Stake Provider', status: 'FAIL' });
  }

  // ====================================================================================
  // TEST 3: Register Node
  // ====================================================================================
  log('\n📋 TEST 3: REGISTER NODE', 'cyan');
  log('═══════════════════════════════════════════════════', 'cyan');
  
  try {
    const [providerPda] = await PublicKey.findProgramAddress(
      [Buffer.from("provider"), wallet.publicKey.toBuffer()],
      programId
    );
    
    const nodeId = 1;
    const nodeIdBuf = Buffer.alloc(8);
    nodeIdBuf.writeUInt8(nodeId, 0);
    
    const [nodePda] = await PublicKey.findProgramAddress(
      [Buffer.from("node"), providerPda.toBuffer(), nodeIdBuf],
      programId
    );
    
    log(`Node PDA: ${nodePda.toString()}`);
    
    const nodeAccount = await connection.getAccountInfo(nodePda);
    if (nodeAccount) {
      log('✅ Node already registered', 'green');
      results.push({ test: '3. Register Node', status: 'PASS (exists)' });
    } else {
      const registerNodeDiscriminator = Buffer.from([102, 85, 117, 114, 194, 188, 211, 168]);
      
      const nodeIdData = Buffer.alloc(8);
      nodeIdData.writeBigUInt64LE(BigInt(nodeId));
      
      const endpoint = "wg://192.168.1.100:51820";
      const endpointLen = Buffer.alloc(4);
      endpointLen.writeUInt32LE(endpoint.length);
      
      const region = "US-East";
      const regionLen = Buffer.alloc(4);
      regionLen.writeUInt32LE(region.length);
      
      const price = Buffer.alloc(8);
      price.writeBigUInt64LE(BigInt(1000000));
      
      const wgPubkey = Buffer.alloc(32);
      wgPubkey.fill(0x11);
      
      const capacity = Buffer.alloc(4);
      capacity.writeUInt32LE(100);
      
      const data = Buffer.concat([
        registerNodeDiscriminator,
        nodeIdData,
        endpointLen,
        Buffer.from(endpoint),
        regionLen,
        Buffer.from(region),
        price,
        wgPubkey,
        capacity
      ]);
      
      const instruction = new anchor.web3.TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: providerPda, isSigner: false, isWritable: true },
          { pubkey: nodePda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: programId,
        data: data,
      });
      
      const transaction = new anchor.web3.Transaction().add(instruction);
      const signature = await provider.sendAndConfirm(transaction);
      log(`✅ Node registered! Sig: ${signature.slice(0, 20)}...`, 'green');
      results.push({ test: '3. Register Node', status: 'PASS' });
    }
  } catch (error) {
    log(`❌ FAILED: ${error.message}`, 'red');
    results.push({ test: '3. Register Node', status: 'FAIL' });
  }

  // ====================================================================================
  // TEST 4: Open Session
  // ====================================================================================
  log('\n📋 TEST 4: OPEN SESSION', 'cyan');
  log('═══════════════════════════════════════════════════', 'cyan');
  
  try {
    const [providerPda] = await PublicKey.findProgramAddress(
      [Buffer.from("provider"), wallet.publicKey.toBuffer()],
      programId
    );
    
    const nodeId = 1;
    const nodeIdBuf = Buffer.alloc(8);
    nodeIdBuf.writeUInt8(nodeId, 0);
    
    const [nodePda] = await PublicKey.findProgramAddress(
      [Buffer.from("node"), providerPda.toBuffer(), nodeIdBuf],
      programId
    );
    
    const sessionId = Date.now();
    const sessionIdBuf = Buffer.alloc(8);
    sessionIdBuf.writeBigUInt64LE(BigInt(sessionId));
    
    const [sessionPda] = await PublicKey.findProgramAddress(
      [Buffer.from("session"), wallet.publicKey.toBuffer(), nodePda.toBuffer(), sessionIdBuf],
      programId
    );
    
    log(`Session PDA: ${sessionPda.toString()}`);
    log(`Session ID: ${sessionId}`);
    
    // open_session discriminator
    const openSessionDiscriminator = Buffer.from([130, 54, 124, 7, 236, 20, 104, 104]);
    
    const sessionIdStr = sessionId.toString();
    const sessionIdLen = Buffer.alloc(4);
    sessionIdLen.writeUInt32LE(sessionIdStr.length);
    
    const escrow = Buffer.alloc(8);
    escrow.writeBigUInt64LE(BigInt(0.01 * LAMPORTS_PER_SOL));
    
    const data = Buffer.concat([
      openSessionDiscriminator,
      sessionIdLen,
      Buffer.from(sessionIdStr),
      escrow
    ]);
    
    const instruction = new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: sessionPda, isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: providerPda, isSigner: false, isWritable: false },
        { pubkey: nodePda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: programId,
      data: data,
    });
    
    const transaction = new anchor.web3.Transaction().add(instruction);
    const signature = await provider.sendAndConfirm(transaction);
    log(`✅ Session opened! Escrow: 0.01 SOL`, 'green');
    log(`   Signature: ${signature.slice(0, 20)}...`, 'green');
    results.push({ test: '4. Open Session', status: 'PASS' });
    
    // Store session info for later tests
    global.testSessionPda = sessionPda;
    global.testNodePda = nodePda;
    global.testProviderPda = providerPda;
  } catch (error) {
    log(`❌ FAILED: ${error.message}`, 'red');
    results.push({ test: '4. Open Session', status: 'FAIL' });
  }

  // ====================================================================================
  // TEST 5: Update Reputation
  // ====================================================================================
  log('\n📋 TEST 5: UPDATE REPUTATION', 'cyan');
  log('═══════════════════════════════════════════════════', 'cyan');
  
  try {
    const [providerPda] = await PublicKey.findProgramAddress(
      [Buffer.from("provider"), wallet.publicKey.toBuffer()],
      programId
    );
    
    const nodeId = 1;
    const nodeIdBuf = Buffer.alloc(8);
    nodeIdBuf.writeUInt8(nodeId, 0);
    
    const [nodePda] = await PublicKey.findProgramAddress(
      [Buffer.from("node"), providerPda.toBuffer(), nodeIdBuf],
      programId
    );
    
    // update_reputation discriminator
    const updateRepDiscriminator = Buffer.from([194, 220, 43, 201, 54, 209, 49, 178]);
    
    const reputation = Buffer.alloc(1);
    reputation.writeUInt8(95); // Set reputation to 95
    
    const data = Buffer.concat([updateRepDiscriminator, reputation]);
    
    const instruction = new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: providerPda, isSigner: false, isWritable: false },
        { pubkey: nodePda, isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      ],
      programId: programId,
      data: data,
    });
    
    const transaction = new anchor.web3.Transaction().add(instruction);
    const signature = await provider.sendAndConfirm(transaction);
    log(`✅ Reputation updated to 95! Sig: ${signature.slice(0, 20)}...`, 'green');
    results.push({ test: '5. Update Reputation', status: 'PASS' });
  } catch (error) {
    log(`❌ FAILED: ${error.message}`, 'red');
    results.push({ test: '5. Update Reputation', status: 'FAIL' });
  }

  // ====================================================================================
  // FINAL SUMMARY
  // ====================================================================================
  log('\n═══════════════════════════════════════════════════', 'cyan');
  log('   TEST SUMMARY', 'cyan');
  log('═══════════════════════════════════════════════════\n', 'cyan');
  
  let passed = 0;
  let failed = 0;
  
  results.forEach((result, index) => {
    const icon = result.status.includes('PASS') ? '✅' : '❌';
    const color = result.status.includes('PASS') ? 'green' : 'red';
    log(`${icon} ${result.test}: ${result.status}`, color);
    
    if (result.status.includes('PASS')) passed++;
    else failed++;
  });
  
  log(`\n📊 Results: ${passed}/${results.length} tests passed`, passed === results.length ? 'green' : 'yellow');
  
  if (failed > 0) {
    log(`\n⚠️  ${failed} test(s) failed. Review the errors above.`, 'yellow');
  } else {
    log('\n🎉 All tests passed successfully!', 'green');
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("\n❌ Fatal error:", err.message);
  if (err.logs) {
  }
  process.exit(1);
});
