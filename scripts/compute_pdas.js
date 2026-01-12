const { PublicKey } = require('@solana/web3.js');

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

const nodeId = 1;
const idLE = bufLE(nodeId);
const idBE = bufBE(nodeId);
const provBuf = providerPda.toBuffer();
const authBuf = wallet.toBuffer();
const bumpBuf = Buffer.from([0xfe]);

const combos = [];
const bases = [Buffer.from('node'), 'node'];
const seconds = [provBuf, authBuf];
const ids = [idLE, idBE, idLE.slice(0,4), idBE.slice(0,4)];

for (const b of bases) {
  for (const s of seconds) {
    for (const i of ids) {
      combos.push([b, s, i]);
      combos.push([b, s, i, bumpBuf]);
      combos.push([b, bumpBuf, s, i]);
    }
  }
}

const target = 'EG4d3Y7rmEFvsCjTFWhxY71mDrhZb5NoYx2bqQdhSpfZ';
(async ()=>{
  for (const s of combos) {
    try {
      const [pda, bump] = await PublicKey.findProgramAddress(s, programId);
      const p = pda.toBase58();
      const label = s.map(x => (Buffer.isBuffer(x) ? x.toString('hex').slice(0,16) : x.toString())).join(' | ');
      if (p === target) console.log('MATCH seeds:', label, '->', p);
      // otherwise print some for inspection
      // console.log('seeds:', label, '->', p);
    } catch (e) {
      // ignore
    }
  }
})();
