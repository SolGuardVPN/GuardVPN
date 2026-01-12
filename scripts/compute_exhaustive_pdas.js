const { PublicKey } = require('@solana/web3.js');

const programId = new PublicKey('2CK6gCxcfaX5JuCfJRnn7ZBf6V5ZpiK69T9yeHRJP7Vq');
const providerPda = new PublicKey('43y5RPkeFTrLz6ECNpKKT5vthuS9ge6WeaJwsi4gUFx7');
const authority = new PublicKey('5wm7gTHTFEGsZm6oMgsk84tqh4twVYrVGCSkPKPv8Pyo');
const target = 'EG4d3Y7rmEFvsCjTFWhxY71mDrhZb5NoYx2bqQdhSpfZ';

function leBuf(n, bytes=8){ const tmp=Buffer.alloc(8); tmp.writeBigUInt64LE(BigInt(n)); return tmp.slice(0,bytes); }
function beBuf(n, bytes=8){ const tmp=Buffer.alloc(8); tmp.writeBigUInt64BE(BigInt(n)); return tmp.slice(0,bytes); }

const prefixes = [Buffer.from('node'), Buffer.from('node\0'), Buffer.from('node1'), Buffer.from('n')];
const providers = [providerPda.toBuffer(), authority.toBuffer()];
const provVariants = [];
for (const p of providers) {
  provVariants.push(p);
  provVariants.push(p.slice(1));
  provVariants.push(p.slice(0,31));
  provVariants.push(Buffer.from(p).reverse());
}

const idSizes = [1,2,4,8];
const idFormats = [];
for (const s of idSizes) {
  idFormats.push((n)=>leBuf(n,s));
  idFormats.push((n)=>beBuf(n,s));
}

const bumpCandidates = [null, Buffer.from([0]), Buffer.from([1]), Buffer.from([255])];

const orders = [
  (a,b,c)=>[a,b,c],
  (a,b,c)=>[a,c,b],
  (a,b,c)=>[b,a,c],
  (a,b,c)=>[b,c,a],
  (a,b,c)=>[c,a,b],
  (a,b,c)=>[c,b,a]
];

async function run(){
  let count=0;
  for (const pref of prefixes) for (const prov of provVariants) for (const idSizeFn of idFormats) for (const orderFn of orders) for (const bump of bumpCandidates) {
    for (let nid=0;nid<256;nid++){
      const idBuf = idSizeFn(nid);
      const parts = orderFn(pref, prov, idBuf);
      const seeds = bump? [...parts, bump] : parts;
      try{
        const [p,_] = await PublicKey.findProgramAddress(seeds, programId);
        count++;
        if (p.toBase58()===target){
          console.log('FOUND', {pref:pref.toString(), nid, order:orderFn.name, bump: bump? bump[0]:null, provSlice: prov.slice(0,4).toString('hex'), p: p.toBase58(), tried:count});
          return;
        }
      }catch(e){}
    }
  }
  console.log('not found after', count, 'tries');
}

run().catch(e=>{console.error(e); process.exit(1)})
