import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Dvpn as unknown as anchor.Program;
  console.log("program id:", program.programId.toBase58());
  const wallet = provider.wallet.publicKey;

  // Provider PDA
  const [providerPda] = await PublicKey.findProgramAddress(
    [Buffer.from("provider"), wallet.toBuffer()],
    program.programId
  );
  console.log("provider PDA:", providerPda.toBase58());

  // Call register_provider
  const tx1 = await program.methods
    .registerProvider()
    .accounts({
      authority: wallet,
      provider: providerPda,
      system_program: SystemProgram.programId,
    })
    .instruction();

  console.log("register_provider instruction keys:", tx1.keys.map(k => ({pubkey: k.pubkey.toBase58(), isSigner: k.isSigner, isWritable: k.isWritable})));

  // Send manual register_provider only if provider PDA does not already exist
  const conn = provider.connection;
  const acc = await conn.getAccountInfo(providerPda);
  if (!acc) {
    const registerProviderDiscriminator = Buffer.from([254,209,54,184,46,197,109,78]);
    const manualIx = new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: providerPda, isSigner: false, isWritable: true },
        { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: program.programId,
      data: registerProviderDiscriminator,
    });

    const tx = new anchor.web3.Transaction().add(manualIx);
    const sig1 = await provider.sendAndConfirm(tx);
    console.log("manual register_provider tx:", sig1);
  } else {
    console.log("provider PDA already exists, skipping create");
  }

  // Create a node with id = 0 (matches on-chain PDA seed)
  const nodeId = new anchor.BN(0);
  const idBufLE = nodeId.toArrayLike(Buffer, "le", 8);
  const idBufBE = nodeId.toArrayLike(Buffer, "be", 8);

  const [nodePdaLE] = await PublicKey.findProgramAddress(
    [Buffer.from("node"), providerPda.toBuffer(), idBufLE],
    program.programId
  );
  const [nodePdaBE] = await PublicKey.findProgramAddress(
    [Buffer.from("node"), providerPda.toBuffer(), idBufBE],
    program.programId
  );
  console.log("node PDA (le):", nodePdaLE.toBase58());
  console.log("node PDA (be):", nodePdaBE.toBase58());

  const [nodePdaAuth] = await PublicKey.findProgramAddress(
    [Buffer.from("node"), wallet.toBuffer(), idBufLE],
    program.programId
  );
  console.log("node PDA (using authority):", nodePdaAuth.toBase58());

  // choose LE by default
  const nodePda = nodePdaLE;

  const endpoint = "127.0.0.1:51820";
  const region = "us-east";
  const price = new anchor.BN(1000);
  const wg = Buffer.alloc(32);

  const ix2 = await program.methods
    .registerNode(new anchor.BN(0), endpoint, region, price, wg)
    .accounts({
      authority: wallet,
      provider: providerPda,
      node: nodePda,
      system_program: SystemProgram.programId,
    })
    .instruction();

  console.log("register_node instruction keys:", ix2.keys.map(k => ({pubkey: k.pubkey.toBase58(), isSigner: k.isSigner, isWritable: k.isWritable})));

  // Build manual instruction data for register_node and send directly
  try {
    const disc = Buffer.from([102,85,117,114,194,188,211,168]);
    const nodeIdBuf = idBufLE; // 8 bytes LE
    const endpointBuf = Buffer.from(endpoint, 'utf8');
    const endpointLen = Buffer.alloc(4);
    endpointLen.writeUInt32LE(endpointBuf.length, 0);
    const regionBuf = Buffer.from(region, 'utf8');
    const regionLen = Buffer.alloc(4);
    regionLen.writeUInt32LE(regionBuf.length, 0);
    const priceBuf = price.toArrayLike(Buffer, 'le', 8);
    const wgBuf = wg;
    const data = Buffer.concat([disc, nodeIdBuf, endpointLen, endpointBuf, regionLen, regionBuf, priceBuf, wgBuf]);

    const manualIx2 = new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: providerPda, isSigner: false, isWritable: true },
        { pubkey: nodePda, isSigner: false, isWritable: true },
        { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: program.programId,
      data: data,
    });

    const txm = new anchor.web3.Transaction().add(manualIx2);
    const sigManual = await provider.sendAndConfirm(txm);
    console.log('register_node tx (manual):', sigManual);
  } catch (err) {
    console.error('manual register_node failed:', err);
    throw err;
  }
}

main()
  .then(() => console.log("done"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
