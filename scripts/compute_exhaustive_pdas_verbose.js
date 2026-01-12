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
  idFormats.push({name:`LE${s}`, fn:(n)=>leBuf(n,s), size:s, end:'LE'});
  idFormats.push({name:`BE${s}`, fn:(n)=>beBuf(n,s), size:s, end:'BE'});
}

const bumpCandidates = [null, Buffer.from([0]), Buffer.from([1]), Buffer.from([255])];

const orders = [
  {name:'pref,prov,id', fn:(a,b,c)=>[a,b,c]},
  {name:'pref,id,prov', fn:(a,b,c)=>[a,c,b]},
  {name:'prov,pref,id', fn:(a,b,c)=>[b,a,c]},
  {name:'prov,id,pref', fn:(a,b,c)=>[b,c,a]},
  {name:'id,pref,prov', fn:(a,b,c)=>[c,a,b]},
  {name:'id,prov,pref', fn:(a,b,c)=>[c,b,a]}
];

async function run(){
  let count=0;
  for (let pi=0; pi<prefixes.length; pi++){
    const pref = prefixes[pi];
    for (let pvi=0; pvi<provVariants.length; pvi++){
      const prov = provVariants[pvi];
      for (let idf=0; idf<idFormats.length; idf++){
        const idFmt = idFormats[idf];
        for (let oi=0; oi<orders.length; oi++){
          const order = orders[oi];
          for (const bump of bumpCandidates){
            for (let nid=0;nid<256;nid++){
              const idBuf = idFmt.fn(nid);
              const parts = order.fn(pref, prov, idBuf);
              const seeds = bump? [...parts, bump] : parts;
              try{
                const [p,_] = await PublicKey.findProgramAddress(seeds, programId);
                count++;
                if (p.toBase58()===target){
                  console.log('FOUND', {
                    prefixIndex: pi,
                    prefix: pref.toString(),
                    provVariantIndex: pvi,
                    provFirst4: prov.slice(0,4).toString('hex'),
                    idFormat: idFmt.name,
                    idValue: nid,
                    order: order.name,
                    bump: bump? bump[0]:null,
                    tried: count,
                    seeds: seeds.map(s=>s.toString('hex'))
                  });
                  return;
                }
              }catch(e){}
            }
          }
        }
      }
    }
  }
  console.log('not found after', count, 'tries');
}

run().catch(e=>{console.error(e); process.exit(1)})
