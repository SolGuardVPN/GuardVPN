const anchor = require('@coral-xyz/anchor');
const { PublicKey, SystemProgram, TransactionInstruction, Transaction } = require('@solana/web3.js');

const programId = new PublicKey('2CK6gCxcfaX5JuCfJRnn7ZBf6V5ZpiK69T9yeHRJP7Vq');
const providerPda = new PublicKey('43y5RPkeFTrLz6ECNpKKT5vthuS9ge6WeaJwsi4gUFx7');
const wallet = new PublicKey('5wm7gTHTFEGsZm6oMgsk84tqh4twVYrVGCSkPKPv8Pyo');

function bufLE(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}
function bufBE(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(n));
  return b;
}

const idLE = bufLE(1);
const idBE = bufBE(1);

const seedsSecond = [providerPda.toBuffer(), wallet.toBuffer()];
const providerBump = Buffer.from([0xfe]);
const seedBases = [Buffer.from('node')];
const ids = [idLE, idBE, Buffer.from([1]), idLE.slice(0,4), idBE.slice(0,4)];

const combos = [];
for (const base of seedBases) {
  for (const s of seedsSecond) {
    for (const id of ids) {
      combos.push([base, s, id]);
      combos.push([base, s, id, providerBump]);
      combos.push([base, s, providerBump, id]);
      combos.push([base, providerBump, s, id]);
      combos.push([providerBump, base, s, id]);
      combos.push([base, s, id, Buffer.from([0]), providerBump]);
    }
  }
}

const provider = anchor.AnchorProvider.env();
const conn = provider.connection;

(async ()=>{
  for (const s of combos) {
    try {
      const [pda, bump] = await PublicKey.findProgramAddress(s, programId);
      // build manual register_node instruction data (disc + node_id + endpoint + region + price + wg)
      const disc = Buffer.from([102,85,117,114,194,188,211,168]);
      const nodeIdBuf = idLE;
      const endpoint = '127.0.0.1:51820';
      const epBuf = Buffer.from(endpoint);
      const epLen = Buffer.alloc(4); epLen.writeUInt32LE(epBuf.length,0);
      const region = 'us-east'; const regionBuf=Buffer.from(region); const regionLen=Buffer.alloc(4); regionLen.writeUInt32LE(regionBuf.length,0);
      const priceBuf = Buffer.alloc(8); priceBuf.writeBigUInt64LE(BigInt(1000));
      const wg = Buffer.alloc(32);
      const data = Buffer.concat([disc, nodeIdBuf, epLen, epBuf, regionLen, regionBuf, priceBuf, wg]);

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: wallet, isSigner: true, isWritable: true },
          { pubkey: providerPda, isSigner: false, isWritable: true },
          { pubkey: pda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId,
        data,
      });

      const tx = new Transaction().add(ix);
      tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
      tx.feePayer = wallet;
      // sign with wallet keypair loaded from file via anchor provider
      const signed = await provider.wallet.signTransaction(tx);
      const sim = await conn.simulateTransaction(signed, {sigVerify:false});
      const logs = sim.value && sim.value.logs ? sim.value.logs.join('\n') : '';
      if (sim.value && sim.value.err == null) {
        return;
      }
      if (logs && !logs.includes('ConstraintSeeds') && !logs.includes('writable privilege escalated')) {
      }
    } catch(e) {
      // ignore
    }
  }
})();
