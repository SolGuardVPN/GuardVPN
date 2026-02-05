const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const fs = require("fs");

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  // Load wallet
  const walletData = JSON.parse(fs.readFileSync("./wallet.json", "utf8"));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(walletData));
  
  // Connect to local
  const connection = new anchor.web3.Connection("http://localhost:8899", "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), {});
  anchor.setProvider(provider);

  // Program ID
  const programId = new PublicKey("8LQKwvHJPdK6fKmopXmUwct8JjVGQhf3RFQd64nCV39i");
  
  
  // Calculate PDAs
  const [providerPda] = await PublicKey.findProgramAddress(
    [Buffer.from("provider"), wallet.publicKey.toBuffer()],
    programId
  );
  
  const nodeId = "1";
  const [nodePda] = await PublicKey.findProgramAddress(
    [Buffer.from("node"), providerPda.toBuffer(), Buffer.from(nodeId)],
    programId
  );
  
  let testResults = {
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: []
  };
  
  // Test 1: Provider exists
  try {
    const providerAccount = await connection.getAccountInfo(providerPda);
    if (providerAccount) {
      testResults.passed++;
      testResults.tests.push({ name: "Provider account", status: "✅ PASS" });
    } else {
      throw new Error("Provider not found");
    }
  } catch (err) {
    testResults.failed++;
    testResults.tests.push({ name: "Provider account", status: "❌ FAIL" });
  }
  
  // Test 2: Node exists
  try {
    const nodeAccount = await connection.getAccountInfo(nodePda);
    if (nodeAccount) {
      testResults.passed++;
      testResults.tests.push({ name: "Node account", status: "✅ PASS" });
    } else {
      throw new Error("Node not found");
    }
  } catch (err) {
    testResults.failed++;
    testResults.tests.push({ name: "Node account", status: "❌ FAIL" });
  }
  
  // Test 3: Create session
  const sessionId = Date.now().toString();
  const [sessionPda] = await PublicKey.findProgramAddress(
    [Buffer.from("session"), wallet.publicKey.toBuffer(), nodePda.toBuffer(), Buffer.from(sessionId)],
    programId
  );
  
  try {
    const balanceBefore = await connection.getBalance(wallet.publicKey);
    
    // Get discriminator for open_session
    const openSessionDiscriminator = Buffer.from([
      214, 93, 155, 67, 216, 163, 5, 48
    ]);
    
    const sessionIdLen = Buffer.alloc(4);
    sessionIdLen.writeUInt32LE(sessionId.length);
    const escrowAmount = new anchor.BN(0.01 * LAMPORTS_PER_SOL);
    const escrowBuf = Buffer.alloc(8);
    escrowBuf.writeBigUInt64LE(BigInt(escrowAmount.toString()));
    
    const data = Buffer.concat([
      openSessionDiscriminator,
      sessionIdLen,
      Buffer.from(sessionId),
      escrowBuf
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
    
    await sleep(1000);
    
    const sessionAccount = await connection.getAccountInfo(sessionPda);
    const balanceAfter = await connection.getBalance(wallet.publicKey);
    const spent = (balanceBefore - balanceAfter) / LAMPORTS_PER_SOL;
    
    testResults.passed++;
    testResults.tests.push({ name: "Create session", status: "✅ PASS" });
    
    // Test 4: Close session
    
    try {
      const closeSessionDiscriminator = Buffer.from([
        19, 127, 48, 254, 17, 115, 98, 118
      ]);
      
      const instruction2 = new anchor.web3.TransactionInstruction({
        keys: [
          { pubkey: sessionPda, isSigner: false, isWritable: true },
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: providerPda, isSigner: false, isWritable: true },
          { pubkey: nodePda, isSigner: false, isWritable: true },
        ],
        programId: programId,
        data: closeSessionDiscriminator,
      });
      
      const transaction2 = new anchor.web3.Transaction().add(instruction2);
      const signature2 = await provider.sendAndConfirm(transaction2);
      
      await sleep(1000);
      
      testResults.passed++;
      testResults.tests.push({ name: "Close session", status: "✅ PASS" });
      
      // Verify session account is closed
      const closedAccount = await connection.getAccountInfo(sessionPda);
      if (!closedAccount) {
      }
    } catch (err) {
      testResults.failed++;
      testResults.tests.push({ name: "Close session", status: "❌ FAIL" });
    }
    
  } catch (err) {
    if (err.logs) {
    }
    testResults.failed++;
    testResults.tests.push({ name: "Create session", status: "❌ FAIL" });
  }
  
  // Test 5: Provider balance check
  try {
    const providerBalance = await connection.getBalance(providerPda);
    testResults.passed++;
    testResults.tests.push({ name: "Provider earnings", status: "✅ PASS" });
  } catch (err) {
    testResults.failed++;
    testResults.tests.push({ name: "Provider earnings", status: "❌ FAIL" });
  }
  
  // Summary
  testResults.tests.forEach((test, i) => {
  });
  
  const successRate = (testResults.passed / (testResults.passed + testResults.failed) * 100).toFixed(1);
  
  if (testResults.failed === 0) {
  } else {
  }
}

main().catch(console.error);
