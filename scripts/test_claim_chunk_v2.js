const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const fs = require("fs");

async function main() {
  // Load IDL
  const idl = JSON.parse(fs.readFileSync("./target/idl/dvpn.json", "utf8"));
  
  // Load wallet
  const walletData = JSON.parse(fs.readFileSync("./wallet.json", "utf8"));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(walletData));
  
  // Connect to local
  const connection = new anchor.web3.Connection("http://localhost:8899", "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), {});
  anchor.setProvider(provider);

  // Program
  const programId = new PublicKey(idl.metadata.address);
  const program = new anchor.Program(idl, programId, provider);
  
  
  // Get PDAs
  const [providerPda] = await PublicKey.findProgramAddress(
    [Buffer.from("provider"), wallet.publicKey.toBuffer()],
    programId
  );
  
  const nodeId = "1";
  const [nodePda] = await PublicKey.findProgramAddress(
    [Buffer.from("node"), providerPda.toBuffer(), Buffer.from(nodeId)],
    programId
  );
  
  // Create a new session first
  const sessionId = Date.now().toString();
  const [sessionPda] = await PublicKey.findProgramAddress(
    [Buffer.from("session"), wallet.publicKey.toBuffer(), nodePda.toBuffer(), Buffer.from(sessionId)],
    programId
  );
  
  
  try {
    // Create session with 0.1 SOL escrow
    const tx1 = await program.methods
      .openSession(sessionId, new anchor.BN(0.1 * LAMPORTS_PER_SOL))
      .accounts({
        session: sessionPda,
        user: wallet.publicKey,
        provider: providerPda,
        node: nodePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Now test claim_chunk
    const bytesUsed = 50 * 1024 * 1024; // 50 MB
    
    const tx2 = await program.methods
      .claimChunk(new anchor.BN(bytesUsed))
      .accounts({
        session: sessionPda,
        provider: providerPda,
        node: nodePda,
        authority: wallet.publicKey,
      })
      .rpc();
    
    
    // Verify session state
    const sessionAccount = await program.account.session.fetch(sessionPda);
    
    // Test multiple claims
    const tx3 = await program.methods
      .claimChunk(new anchor.BN(25 * 1024 * 1024))
      .accounts({
        session: sessionPda,
        provider: providerPda,
        node: nodePda,
        authority: wallet.publicKey,
      })
      .rpc();
    
    
    const sessionAccount2 = await program.account.session.fetch(sessionPda);
    
    
  } catch (err) {
    console.error("❌ Error:", err.message);
    if (err.logs) {
    }
  }
}

main().catch(console.error);
