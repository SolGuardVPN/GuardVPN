const { PublicKey } = require('@solana/web3.js');

const programId = new PublicKey('2CK6gCxcfaX5JuCfJRnn7ZBf6V5ZpiK69T9yeHRJP7Vq');
const providerPda = new PublicKey('43y5RPkeFTrLz6ECNpKKT5vthuS9ge6WeaJwsi4gUFx7');
const wallet = new PublicKey('5wm7gTHTFEGsZm6oMgsk84tqh4twVYrVGCSkPKPv8Pyo');

function bufLE(n) {const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b}
function bufBE(n) {const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(n));return b}

const target = 'EG4d3Y7rmEFvsCjTFWhxY71mDrhZb5NoYx2bqQdhSpfZ';
const idLE = bufLE(1);
const idBE = bufBE(1);
const prov = providerPda.toBuffer();
const auth = wallet.toBuffer();
const bump = Buffer.from([0xfe]);

const variants = [];
const bases = [Buffer.from('node'), Buffer.from('node\0'), Buffer.from('node\x00')];
const seconds = [prov, auth, prov.slice(1), prov.slice(0,31), Buffer.from(prov).reverse(), Buffer.from(prov).map(x=>x^0xff)];
const ids = [idLE, idBE, Buffer.from([1]), Buffer.from('1')];

for (const b of bases) for (const s of seconds) for (const i of ids) {
  variants.push([b,s,i]);
  variants.push([b,s,i,bump]);
  variants.push([b,bump,s,i]);
  variants.push([b,s,bump,i]);
}

(async ()=>{
  for (const v of variants) {
    try {
      const [p] = await PublicKey.findProgramAddress(v, programId);
      if (p.toBase58()===target) {
        return;
      }
    } catch(e){}
  }
})();
