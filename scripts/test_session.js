const anchor = require("@coral-xyz/anchor");
const { PublicKey, SystemProgram, Keypair} = require("@solana/web3.js");
const fs = require("fs");

async function main() {
  // Load wallet
  const walletPath = "./wallet.json";
  const walletData = JSON.parse(fs.readFileSync(walletPath, "utf8"));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(walletData));
  
  // Load user keypair for session
  const userPath = "./user-keypair.json";
  const userData = JSON.parse(fs.readFileSync(userPath, "utf8"));
  const user = Keypair.fromSecretKey(Uint8Array.from(userData));
  
  // Connect to local
  const connection = new anchor.web3.Connection("http://localhost:8899", "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(user), {});
  anchor.setProvider(provider);

  // Program ID
  const programId = new PublicKey("8LQKwvHJPdK6fKmopXmUwct8JjVGQhf3RFQd64nCV39i");
  
  
  // Check user balance
  let balance = await connection.getBalance(user.publicKey);
  
  // Airdrop if needed
  if (balance < 1e9) {
    const sig = await connection.requestAirdrop(user.publicKey, 2e9);
    await connection.confirmTransaction(sig);
    balance = await connection.getBalance(user.publicKey);
  }
  
  // Provider PDA (from provider's authority which is wallet.json)
  const providerAuthority = wallet.publicKey;
  const [providerPda] = await PublicKey.findProgramAddress(
    [Buffer.from("provider"), providerAuthority.toBuffer()],
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
  
  
  // Session PDA (uses user, node, session_id as seeds)
  const sessionId = Date.now();
  const sessionIdBuf = Buffer.alloc(8);
  sessionIdBuf.writeBigUInt64LE(BigInt(sessionId));
  
  const [sessionPda] = await PublicKey.findProgramAddress(
    [Buffer.from("session"), user.publicKey.toBuffer(), nodePda.toBuffer(), sessionIdBuf],
    programId
  );
  
  
  // Check if session exists
  const sessionAccount = await connection.getAccountInfo(sessionPda);
  if (sessionAccount) {
    return;
  }
  
  
  // Get open_session discriminator
  const openSessionDiscriminator = Buffer.from([130, 54, 124, 7, 236, 20, 104, 104]);
  
  // Parameters: session_id (u64), minutes (u32), node_id (u64)
  const minutes = 10; // 10 minutes
  const minutesBuf = Buffer.alloc(4);
  minutesBuf.writeUInt32LE(minutes);
  
  const data = Buffer.concat([
    openSessionDiscriminator,
    sessionIdBuf,
    minutesBuf,
    nodeIdBuf
  ]);
  
  // Calculate escrow amount (10 minutes * price_per_minute)
  // We set price to 1000000 lamports (0.001 SOL) per minute
  const escrowAmount = 1000000 * minutes;
  
  const instruction = new anchor.web3.TransactionInstruction({
    keys: [
      { pubkey: user.publicKey, isSigner: true, isWritable: true },
      { pubkey: providerPda, isSigner: false, isWritable: true },
      { pubkey: nodePda, isSigner: false, isWritable: true },
      { pubkey: sessionPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: programId,
    data: data,
  });
  
  const transaction = new anchor.web3.Transaction().add(instruction);
  const signature = await provider.sendAndConfirm(transaction);
  
  // Verify session account
  const createdSession = await connection.getAccountInfo(sessionPda);
  if (createdSession) {
  }
  
}

main().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
