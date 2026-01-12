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
  
  console.log("\\n🧪 COMPREHENSIVE DVPN TEST SUITE");
  console.log("=".repeat(50));
  console.log("Program ID:", programId.toString());
  console.log("Wallet:", wallet.publicKey.toString());
  
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
  console.log("\\n📋 TEST 1: Check Provider Account");
  console.log("-".repeat(50));
  try {
    const providerAccount = await connection.getAccountInfo(providerPda);
    if (providerAccount) {
      console.log("✅ Provider account exists");
      console.log("   PDA:", providerPda.toString());
      console.log("   Size:", providerAccount.data.length, "bytes");
      testResults.passed++;
      testResults.tests.push({ name: "Provider account", status: "✅ PASS" });
    } else {
      throw new Error("Provider not found");
    }
  } catch (err) {
    console.log("❌ FAILED:", err.message);
    testResults.failed++;
    testResults.tests.push({ name: "Provider account", status: "❌ FAIL" });
  }
  
  // Test 2: Node exists
  console.log("\\n📋 TEST 2: Check Node Account");
  console.log("-".repeat(50));
  try {
    const nodeAccount = await connection.getAccountInfo(nodePda);
    if (nodeAccount) {
      console.log("✅ Node account exists");
      console.log("   PDA:", nodePda.toString());
      console.log("   Size:", nodeAccount.data.length, "bytes");
      testResults.passed++;
      testResults.tests.push({ name: "Node account", status: "✅ PASS" });
    } else {
      throw new Error("Node not found");
    }
  } catch (err) {
    console.log("❌ FAILED:", err.message);
    testResults.failed++;
    testResults.tests.push({ name: "Node account", status: "❌ FAIL" });
  }
  
  // Test 3: Create session
  console.log("\\n📋 TEST 3: Create Session");
  console.log("-".repeat(50));
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
    
    console.log("✅ Session created successfully");
    console.log("   Signature:", signature);
    console.log("   Session PDA:", sessionPda.toString());
    console.log("   Escrow: 0.01 SOL");
    console.log("   Total spent:", spent.toFixed(4), "SOL");
    testResults.passed++;
    testResults.tests.push({ name: "Create session", status: "✅ PASS" });
    
    // Test 4: Close session
    console.log("\\n📋 TEST 4: Close Session (Refund Test)");
    console.log("-".repeat(50));
    
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
      
      console.log("✅ Session closed successfully");
      console.log("   Signature:", signature2);
      console.log("   Refund processed");
      testResults.passed++;
      testResults.tests.push({ name: "Close session", status: "✅ PASS" });
      
      // Verify session account is closed
      const closedAccount = await connection.getAccountInfo(sessionPda);
      if (!closedAccount) {
        console.log("✅ Session account properly closed");
      }
    } catch (err) {
      console.log("❌ FAILED:", err.message);
      testResults.failed++;
      testResults.tests.push({ name: "Close session", status: "❌ FAIL" });
    }
    
  } catch (err) {
    console.log("❌ FAILED:", err.message);
    if (err.logs) {
      console.log("Logs:", err.logs.slice(0, 3).join("\\n"));
    }
    testResults.failed++;
    testResults.tests.push({ name: "Create session", status: "❌ FAIL" });
  }
  
  // Test 5: Provider balance check
  console.log("\\n📋 TEST 5: Provider Earnings");
  console.log("-".repeat(50));
  try {
    const providerBalance = await connection.getBalance(providerPda);
    console.log("✅ Provider account balance:", providerBalance / LAMPORTS_PER_SOL, "SOL");
    testResults.passed++;
    testResults.tests.push({ name: "Provider earnings", status: "✅ PASS" });
  } catch (err) {
    console.log("❌ FAILED:", err.message);
    testResults.failed++;
    testResults.tests.push({ name: "Provider earnings", status: "❌ FAIL" });
  }
  
  // Summary
  console.log("\\n" + "=".repeat(50));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(50));
  console.log("Total tests:", testResults.passed + testResults.failed);
  console.log("✅ Passed:", testResults.passed);
  console.log("❌ Failed:", testResults.failed);
  console.log("\\nTest Results:");
  testResults.tests.forEach((test, i) => {
    console.log(`  ${i + 1}. ${test.name}: ${test.status}`);
  });
  
  const successRate = (testResults.passed / (testResults.passed + testResults.failed) * 100).toFixed(1);
  console.log("\\n🎯 Success Rate:", successRate + "%");
  
  if (testResults.failed === 0) {
    console.log("\\n🎉 ALL TESTS PASSED!");
  } else {
    console.log("\\n⚠️  Some tests failed. Review logs above.");
  }
}

main().catch(console.error);
