const anchor = require("@coral-xyz/anchor");
const { PublicKey, SystemProgram, Keypair} = require("@solana/web3.js");
const fs = require("fs");

async function main() {
  // Load wallet
  const walletPath = "./wallet.json";
  const walletData = JSON.parse(fs.readFileSync(walletPath, "utf8"));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(walletData));
  
  // Connect to local
  const connection = new anchor.web3.Connection("http://localhost:8899", "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), {});
  anchor.setProvider(provider);

  // Program ID
  const programId = new PublicKey("8LQKwvHJPdK6fKmopXmUwct8JjVGQhf3RFQd64nCV39i");
  
  
  // Check wallet balance
  const balance = await connection.getBalance(wallet.publicKey);
  
  // Compute provider PDA
  const [providerPda, providerBump] = await PublicKey.findProgramAddress(
    [Buffer.from("provider"), wallet.publicKey.toBuffer()],
    programId
  );
  
  
  // Check if provider exists
  const providerAccount = await connection.getAccountInfo(providerPda);
  if (providerAccount) {
  } else {
    
    // Manual instruction for register_provider
    // Discriminator for register_provider
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
  }
  
  // Compute node PDA (uses provider PDA as seed, not authority)
  const nodeId = 1;
  const nodeIdBuf = Buffer.alloc(8); // u64 is 8 bytes
  nodeIdBuf.writeUInt8(nodeId, 0);
  
  const [nodePda, nodeBump] = await PublicKey.findProgramAddress(
    [Buffer.from("node"), providerPda.toBuffer(), nodeIdBuf],
    programId
  );
  
  
  // Check if node exists
  const nodeAccount = await connection.getAccountInfo(nodePda);
  if (nodeAccount) {
  } else {
    
    // Manual instruction for register_node
    // Discriminator for register_node
    const registerNodeDiscriminator = Buffer.from([102, 85, 117, 114, 194, 188, 211, 168]);
    
    // Prepare parameters: node_id (u64), endpoint (String), region (String), 
    // price_per_minute_lamports (u64), wg_server_pubkey ([u8; 32]), max_capacity (u32)
    
    // node_id: u64
    const nodeIdBuf = Buffer.alloc(8);
    nodeIdBuf.writeBigUInt64LE(BigInt(nodeId));
    
    // endpoint: String (length prefix + data)
    const endpointStr = "wg://192.168.1.100:51820";
    const endpointLen = Buffer.alloc(4);
    endpointLen.writeUInt32LE(endpointStr.length);
    const endpointData = Buffer.from(endpointStr);
    
    // region: String (length prefix + data)
    const regionStr = "US-East";
    const regionLen = Buffer.alloc(4);
    regionLen.writeUInt32LE(regionStr.length);
    const regionData = Buffer.from(regionStr);
    
    // price_per_minute_lamports: u64
    const priceBuf = Buffer.alloc(8);
    priceBuf.writeBigUInt64LE(BigInt(1000000)); // 0.001 SOL per minute
    
    // wg_server_pubkey: [u8; 32]
    const wgPubkey = Buffer.alloc(32);
    wgPubkey.fill(0x11); // dummy pubkey
    
    // max_capacity: u32
    const maxCapBuf = Buffer.alloc(4);
    maxCapBuf.writeUInt32LE(100);
    
    const data = Buffer.concat([
      registerNodeDiscriminator,
      nodeIdBuf,
      endpointLen,
      endpointData,
      regionLen,
      regionData,
      priceBuf,
      wgPubkey,
      maxCapBuf
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
  }
  
}

main().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
