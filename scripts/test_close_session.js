const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair} = require("@solana/web3.js");
const fs = require("fs");

async function main() {
  // Load user wallet (who created the session)
  const userWalletData = JSON.parse(fs.readFileSync("./wallet.json", "utf8"));
  const userWallet = Keypair.fromSecretKey(Uint8Array.from(userWalletData));
  
  // Connect to local
  const connection = new anchor.web3.Connection("http://localhost:8899", "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(userWallet), {});
  anchor.setProvider(provider);

  // Program ID
  const programId = new PublicKey("8LQKwvHJPdK6fKmopXmUwct8JjVGQhf3RFQd64nCV39i");
  
  console.log("Program ID:", programId.toString());
  console.log("User wallet:", userWallet.publicKey.toString());
  
  // Provider PDA
  const [providerPda] = await PublicKey.findProgramAddress(
    [Buffer.from("provider"), userWallet.publicKey.toBuffer()],
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
  
  // Session ID
  const sessionId = 1767612350093; // From previous test
  const sessionIdBuf = Buffer.alloc(8);
  sessionIdBuf.writeBigUInt64LE(BigInt(sessionId));
  
  const [sessionPda] = await PublicKey.findProgramAddress(
    [Buffer.from("session"), userWallet.publicKey.toBuffer(), nodePda.toBuffer(), sessionIdBuf],
    programId
  );
  
  console.log("\n📊 Testing close_session (partial refund)...");
  console.log("Session PDA:", sessionPda.toString());
  
  // Check session before closing
  const sessionAccountBefore = await connection.getAccountInfo(sessionPda);
  if (!sessionAccountBefore) {
    console.error("❌ Session not found!");
    return;
  }
  console.log("Session exists with", sessionAccountBefore.lamports, "lamports");
  
  // Get close_session discriminator
  const closeSessionDiscriminator = Buffer.from([68, 114, 178, 140, 222, 38, 248, 211]);
  
  const data = Buffer.concat([closeSessionDiscriminator]);
  
  const instruction = new anchor.web3.TransactionInstruction({
    keys: [
      { pubkey: userWallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: sessionPda, isSigner: false, isWritable: true },
    ],
    programId: programId,
    data: data,
  });
  
  console.log("\n🔒 Closing session...");
  
  const transaction = new anchor.web3.Transaction().add(instruction);
  const signature = await provider.sendAndConfirm(transaction);
  console.log("✅ Session closed! Signature:", signature);
  
  // Check session after closing
  const sessionAccountAfter = await connection.getAccountInfo(sessionPda);
  if (sessionAccountAfter) {
    console.log("✅ Session account still exists (state updated to Closed)");
  } else {
    console.log("✅ Session account closed");
  }
  
  console.log("\n🎉 Close session test complete!");
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
