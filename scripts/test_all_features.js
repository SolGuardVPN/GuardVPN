const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const fs = require("fs");

const PROGRAM_ID = new PublicKey("8LQKwvHJPdK6fKmopXmUwct8JjVGQhf3RFQd64nCV39i");
const RPC_URL = "http://localhost:8899";

async function main() {

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

  const balance = await connection.getBalance(wallet.publicKey);

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
    await program.methods
      .registerProvider("VPN Service Provider")
      .accounts({
        provider: providerPDA,
        authority: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    testsPassed++;
  } catch (err) {
    if (err.toString().includes("already in use")) {
      testsPassed++;
    } else {
      testsFailed++;
    }
  }

  // Test 2: stake_provider
  try {
    const stakeAmount = 0.1 * LAMPORTS_PER_SOL;
    await program.methods
      .stakeProvider(new anchor.BN(stakeAmount))
      .accounts({
        provider: providerPDA,
        authority: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    testsPassed++;
  } catch (err) {
    testsFailed++;
  }

  // Test 3: register_node
  try {
    await program.methods
      .registerNode("node1", "192.168.1.1", 51820, "pubkey123")
      .accounts({
        node: nodePDA,
        provider: providerPDA,
        authority: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    testsPassed++;
  } catch (err) {
    if (err.toString().includes("already in use")) {
      testsPassed++;
    } else {
      testsFailed++;
    }
  }

  // Test 4: open_session
  try {
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
    testsPassed++;

    // Test 5: claim_chunk
    try {
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
      testsPassed++;
    } catch (err) {
      testsFailed++;
    }

    // Test 6: close_session
    try {
      await program.methods
        .closeSession()
        .accounts({
          session: sessionPDA,
          user: wallet.publicKey,
          provider: providerPDA,
          node: nodePDA,
        })
        .rpc();
      testsPassed++;
    } catch (err) {
      testsFailed++;
    }
  } catch (err) {
    testsFailed += 3; // Count open_session, claim_chunk, close_session as failed
  }

  // Test 7: claim_payout
  try {
    await program.methods
      .claimPayout()
      .accounts({
        provider: providerPDA,
        authority: wallet.publicKey,
      })
      .rpc();
    testsPassed++;
  } catch (err) {
    if (err.toString().includes("NoEarnings")) {
      testsPassed++;
    } else {
      testsFailed++;
    }
  }

  // Test 8: unstake_provider
  try {
    const unstakeAmount = 0.05 * LAMPORTS_PER_SOL;
    await program.methods
      .unstakeProvider(new anchor.BN(unstakeAmount))
      .accounts({
        provider: providerPDA,
        authority: wallet.publicKey,
      })
      .rpc();
    testsPassed++;
  } catch (err) {
    testsFailed++;
  }

  // Test 9: open_session_spl (skip if no token setup)

  // Test 10: raise_dispute

  // Test 11: resolve_dispute

  // Test 12: update_reputation
  try {
    await program.methods
      .updateReputation(90)
      .accounts({
        provider: providerPDA,
        node: nodePDA,
        authority: wallet.publicKey,
      })
      .rpc();
    testsPassed++;
  } catch (err) {
    testsFailed++;
  }

  // Summary

  if (testsFailed === 0) {
  } else {
  }
}

main().catch(console.error);
