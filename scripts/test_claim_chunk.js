const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair} = require("@solana/web3.js");
const fs = require("fs");

async function main() {
  // Load provider wallet (who owns the node)
  const providerWalletData = JSON.parse(fs.readFileSync("./wallet.json", "utf8"));
  const providerWallet = Keypair.fromSecretKey(Uint8Array.from(providerWalletData));
  
  // Connect to local
  const connection = new anchor.web3.Connection("http://localhost:8899", "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(providerWallet), {});
  anchor.setProvider(provider);

  // Program ID
  const programId = new PublicKey("8LQKwvHJPdK6fKmopXmUwct8JjVGQhf3RFQd64nCV39i");
  
  console.log("Program ID:", programId.toString());
  console.log("Provider wallet:", providerWallet.publicKey.toString());
  
  // Provider PDA
  const [providerPda] = await PublicKey.findProgramAddress(
    [Buffer.from("provider"), providerWallet.publicKey.toBuffer()],
    programId
  );
  
  // Node PDA
  const nodeId = 1;
  const nodeIdBuf = Buffer.alloc(8);
  nodeIdBuf.writeBigUInt64LE(BigInt(nodeId));
  
  const [nodePda] = await PublicKey.findProgramAddress(
    [Buffer.from("node"), providerPda.toBuffer(), nodeIdBuf],
    programId
  );
  
  // User (session owner)
  const userPubkey = new PublicKey("5wm7gTHTFEGsZm6oMgsk84tqh4twVYrVGCSkPKPv8Pyo");
  
  // Session ID (you need to replace this with actual session ID)
  const sessionId = 1767612350093; // From previous test
  const sessionIdBuf = Buffer.alloc(8);
  sessionIdBuf.writeBigUInt64LE(BigInt(sessionId));
  
  const [sessionPda] = await PublicKey.findProgramAddress(
    [Buffer.from("session"), userPubkey.toBuffer(), nodePda.toBuffer(), sessionIdBuf],
    programId
  );
  
  console.log("\n📊 Testing claim_chunk (usage-based billing)...");
  console.log("Session PDA:", sessionPda.toString());
  
  // Get claim_chunk discriminator
  const claimChunkDiscriminator = Buffer.from([97, 205, 27, 215, 169, 117, 227, 131]);
  
  // Parameters: bytes_used (u64), proof_hash ([u8; 32])
  const bytesUsed = 1024 * 1024 * 100; // 100 MB
  const bytesUsedBuf = Buffer.alloc(8);
  bytesUsedBuf.writeBigUInt64LE(BigInt(bytesUsed));
  
  // Create a proof hash (in production, this would be crypto hash of usage data)
  const proofHash = Buffer.alloc(32);
  Buffer.from("proof_" + Date.now()).copy(proofHash);
  
  const data = Buffer.concat([
    claimChunkDiscriminator,
    bytesUsedBuf,
    proofHash
  ]);
  
  const instruction = new anchor.web3.TransactionInstruction({
    keys: [
      { pubkey: providerWallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: providerPda, isSigner: false, isWritable: false },
      { pubkey: nodePda, isSigner: false, isWritable: false },
      { pubkey: sessionPda, isSigner: false, isWritable: true },
    ],
    programId: programId,
    data: data,
  });
  
  console.log("\n💰 Claiming chunk payment...");
  console.log("Bytes used:", bytesUsed, "bytes");
  
  const transaction = new anchor.web3.Transaction().add(instruction);
  const signature = await provider.sendAndConfirm(transaction);
  console.log("✅ Chunk claimed! Signature:", signature);
  
  // Check session account to see updated bytes_used
  const sessionAccount = await connection.getAccountInfo(sessionPda);
  if (sessionAccount) {
    console.log("✅ Session account updated!");
    console.log("   - Data length:", sessionAccount.data.length, "bytes");
  }
  
  console.log("\n🎉 Usage-based billing test complete!");
  console.log("\n Next: Test close_session for partial refunds");
}

main().then(() => {
  console.log("\n✅ Success!");
  process.exit(0);
}).catch((err) => {
  console.error("❌ Error:", err);
  if (err.transactionLogs) {
    console.error("\nTransaction logs:");
    err.transactionLogs.forEach(log => console.error(log));
  }
  process.exit(1);
});
