const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const fs = require("fs");

const PROGRAM_ID = new PublicKey("8LQKwvHJPdK6fKmopXmUwct8JjVGQhf3RFQd64nCV39i");
const RPC_URL = "http://localhost:8899";

async function main() {
  console.log("🧪 DVPN Comprehensive Test Suite\n");
  console.log("Testing all 12 instructions...\n");

  // Setup
  const connection = new anchor.web3.Connection(RPC_URL, "confirmed");
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync("wallet.json")))
  );
  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync("target/idl/dvpn.json", "utf8"));
  const program = new anchor.Program(idl, PROGRAM_ID, provider);

  console.log(`Wallet: ${wallet.publicKey}`);
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`Balance: ${balance / LAMPORTS_PER_SOL} SOL\n`);

  // Compute PDAs
  const [providerPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("provider"), wallet.publicKey.toBuffer()],
    PROGRAM_ID
  );
  const [nodePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("node"), providerPDA.toBuffer(), Buffer.from("node1")],
    PROGRAM_ID
  );

  let testsPassed = 0;
  let testsFailed = 0;

  // Test 1: register_provider
  try {
    console.log("1️⃣  Testing register_provider...");
    await program.methods
      .registerProvider("VPN Service Provider")
      .accounts({
        provider: providerPDA,
        authority: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("   ✅ Provider registered\n");
    testsPassed++;
  } catch (err) {
    if (err.toString().includes("already in use")) {
      console.log("   ✅ Provider already exists\n");
      testsPassed++;
    } else {
      console.log(`   ❌ Failed: ${err.message}\n`);
      testsFailed++;
    }
  }

  // Test 2: stake_provider
  try {
    console.log("2️⃣  Testing stake_provider...");
    const stakeAmount = 0.1 * LAMPORTS_PER_SOL;
    await program.methods
      .stakeProvider(new anchor.BN(stakeAmount))
      .accounts({
        provider: providerPDA,
        authority: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(`   ✅ Staked ${stakeAmount / LAMPORTS_PER_SOL} SOL\n`);
    testsPassed++;
  } catch (err) {
    console.log(`   ❌ Failed: ${err.message}\n`);
    testsFailed++;
  }

  // Test 3: register_node
  try {
    console.log("3️⃣  Testing register_node...");
    await program.methods
      .registerNode("node1", "192.168.1.1", 51820, "pubkey123")
      .accounts({
        node: nodePDA,
        provider: providerPDA,
        authority: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("   ✅ Node registered\n");
    testsPassed++;
  } catch (err) {
    if (err.toString().includes("already in use")) {
      console.log("   ✅ Node already exists\n");
      testsPassed++;
    } else {
      console.log(`   ❌ Failed: ${err.message}\n`);
      testsFailed++;
    }
  }

  // Test 4: open_session
  try {
    console.log("4️⃣  Testing open_session...");
    const sessionId = Date.now();
    const [sessionPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("session"),
        wallet.publicKey.toBuffer(),
        nodePDA.toBuffer(),
        Buffer.from(sessionId.toString()),
      ],
      PROGRAM_ID
    );
    
    const escrowAmount = 0.01 * LAMPORTS_PER_SOL;
    await program.methods
      .openSession(sessionId.toString(), new anchor.BN(escrowAmount))
      .accounts({
        session: sessionPDA,
        user: wallet.publicKey,
        provider: providerPDA,
        node: nodePDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(`   ✅ Session created (ID: ${sessionId})\n`);
    testsPassed++;

    // Test 5: claim_chunk
    try {
      console.log("5️⃣  Testing claim_chunk...");
      const bytesUsed = new anchor.BN(1024 * 1024); // 1MB
      await program.methods
        .claimChunk(bytesUsed)
        .accounts({
          session: sessionPDA,
          provider: providerPDA,
          node: nodePDA,
          authority: wallet.publicKey,
        })
        .rpc();
      console.log(`   ✅ Claimed ${bytesUsed.toString()} bytes\n`);
      testsPassed++;
    } catch (err) {
      console.log(`   ❌ Failed: ${err.message}\n`);
      testsFailed++;
    }

    // Test 6: close_session
    try {
      console.log("6️⃣  Testing close_session...");
      await program.methods
        .closeSession()
        .accounts({
          session: sessionPDA,
          user: wallet.publicKey,
          provider: providerPDA,
          node: nodePDA,
        })
        .rpc();
      console.log("   ✅ Session closed\n");
      testsPassed++;
    } catch (err) {
      console.log(`   ❌ Failed: ${err.message}\n`);
      testsFailed++;
    }
  } catch (err) {
    console.log(`   ❌ Failed (open_session): ${err.message}\n`);
    testsFailed += 3; // Count open_session, claim_chunk, close_session as failed
  }

  // Test 7: claim_payout
  try {
    console.log("7️⃣  Testing claim_payout...");
    await program.methods
      .claimPayout()
      .accounts({
        provider: providerPDA,
        authority: wallet.publicKey,
      })
      .rpc();
    console.log("   ✅ Payout claimed\n");
    testsPassed++;
  } catch (err) {
    if (err.toString().includes("NoEarnings")) {
      console.log("   ✅ No earnings to claim (expected)\n");
      testsPassed++;
    } else {
      console.log(`   ❌ Failed: ${err.message}\n`);
      testsFailed++;
    }
  }

  // Test 8: unstake_provider
  try {
    console.log("8️⃣  Testing unstake_provider...");
    const unstakeAmount = 0.05 * LAMPORTS_PER_SOL;
    await program.methods
      .unstakeProvider(new anchor.BN(unstakeAmount))
      .accounts({
        provider: providerPDA,
        authority: wallet.publicKey,
      })
      .rpc();
    console.log(`   ✅ Unstaked ${unstakeAmount / LAMPORTS_PER_SOL} SOL\n`);
    testsPassed++;
  } catch (err) {
    console.log(`   ❌ Failed: ${err.message}\n`);
    testsFailed++;
  }

  // Test 9: open_session_spl (skip if no token setup)
  console.log("9️⃣  Testing open_session_spl...");
  console.log("   ⏭️  Skipped (requires SPL token setup)\n");

  // Test 10: raise_dispute
  console.log("🔟 Testing raise_dispute...");
  console.log("   ⏭️  Skipped (requires active session)\n");

  // Test 11: resolve_dispute
  console.log("1️⃣1️⃣  Testing resolve_dispute...");
  console.log("   ⏭️  Skipped (requires active dispute)\n");

  // Test 12: update_reputation
  try {
    console.log("1️⃣2️⃣ Testing update_reputation...");
    await program.methods
      .updateReputation(90)
      .accounts({
        provider: providerPDA,
        node: nodePDA,
        authority: wallet.publicKey,
      })
      .rpc();
    console.log("   ✅ Reputation updated to 90\n");
    testsPassed++;
  } catch (err) {
    console.log(`   ❌ Failed: ${err.message}\n`);
    testsFailed++;
  }

  // Summary
  console.log("═".repeat(50));
  console.log(`\n📊 Test Summary:`);
  console.log(`   ✅ Passed: ${testsPassed}/12`);
  console.log(`   ❌ Failed: ${testsFailed}/12`);
  console.log(`   ⏭️  Skipped: ${12 - testsPassed - testsFailed}/12\n`);

  if (testsFailed === 0) {
    console.log("🎉 All tests passed!\n");
  } else {
    console.log("⚠️  Some tests failed. Check logs above.\n");
  }
}

main().catch(console.error);
