const { Keypair, Connection, PublicKey, Transaction, TransactionInstruction } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const fs = require('fs');

const PROGRAM_ID = new PublicKey('2CK6gCxcfaX5JuCfJRnn7ZBf6V5ZpiK69T9yeHRJP7Vq');
const NODE_PUB = new PublicKey('EG4d3Y7rmEFvsCjTFWhxY71mDrhZb5NoYx2bqQdhSpfZ');
const PROVIDER_PUB = new PublicKey('43y5RPkeFTrLz6ECNpKKT5vthuS9ge6WeaJwsi4gUFx7');

async function main(){
  const secret = JSON.parse(fs.readFileSync(process.argv[2] || 'wallet.json','utf8'));
  const kp = Keypair.fromSecretKey(Buffer.from(secret));
  const conn = new Connection(process.env.ANCHOR_PROVIDER_URL || 'https://api.testnet.solana.com','confirmed');
  const wallet = new anchor.Wallet(kp);
  const provider = new anchor.AnchorProvider(conn, wallet, anchor.AnchorProvider.defaultOptions());

  const sessionId = Number(process.argv[3] || 1);
  const minutes = Number(process.argv[4] || 60);

  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(sessionId));
  const [sessionPda] = await PublicKey.findProgramAddress([Buffer.from('session'), kp.publicKey.toBuffer(), NODE_PUB.toBuffer(), idBuf], PROGRAM_ID);

  const disc = Buffer.from([130,54,124,7,236,20,104,104]);
  const minutesBuf = Buffer.alloc(4);
  minutesBuf.writeUInt32LE(minutes, 0);
  const data = Buffer.concat([disc, idBuf, minutesBuf]);

  const keys = [
    { pubkey: kp.publicKey, isSigner: true, isWritable: true },
    { pubkey: PROVIDER_PUB, isSigner: false, isWritable: false },
    { pubkey: NODE_PUB, isSigner: false, isWritable: false },
    { pubkey: sessionPda, isSigner: false, isWritable: true },
    { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false }
  ];

  const ix = new TransactionInstruction({ keys, programId: PROGRAM_ID, data });
  const tx = new Transaction().add(ix);
  const sig = await provider.sendAndConfirm(tx, [kp]);
  console.log(JSON.stringify({ tx: sig, sessionPda: sessionPda.toBase58() }));
}

main().catch(e=>{ console.error(e); process.exit(1) })
