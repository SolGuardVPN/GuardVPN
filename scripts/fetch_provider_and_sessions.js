const anchor = require('@coral-xyz/anchor');
const { PublicKey } = require('@solana/web3.js');
const idl = require('../target/idl/dvpn.json');

async function main(){
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, idl.metadata.address, provider);

  const providerPda = new PublicKey('43y5RPkeFTrLz6ECNpKKT5vthuS9ge6WeaJwsi4gUFx7');
  const prov = await program.account.provider.fetch(providerPda);
    authority: prov.authority.toBase58(),
    node_count: prov.nodeCount?.toString ? prov.nodeCount.toString() : prov.node_count?.toString(),
    bump: prov.bump
  });

  // Try session PDAs for session_id 0..4 using user=authority and node=EG4d3Y7r...
  const user = new PublicKey('5wm7gTHTFEGsZm6oMgsk84tqh4twVYrVGCSkPKPv8Pyo');
  const node = new PublicKey('EG4d3Y7rmEFvsCjTFWhxY71mDrhZb5NoYx2bqQdhSpfZ');
  for (let sid=0; sid<5; sid++){
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(sid));
    const [sessionPda] = await PublicKey.findProgramAddress([
      Buffer.from('session'),
      user.toBuffer(),
      node.toBuffer(),
      buf
    ], program.programId);
    try{
      const s = await program.account.session.fetch(sessionPda);
        user: s.user.toBase58(),
        node: s.node.toBase58(),
        session_id: s.sessionId?.toString ? s.sessionId.toString() : s.session_id?.toString(),
        start_ts: s.startTs?.toString ? s.startTs.toString() : s.start_ts?.toString(),
        end_ts: s.endTs?.toString ? s.endTs.toString() : s.end_ts?.toString(),
        escrow_lamports: s.escrowLamports?.toString ? s.escrowLamports.toString() : s.escrow_lamports?.toString(),
        state: s.state,
        bump: s.bump
      });
    }catch(e){
    }
  }
}

main().catch(e=>{console.error(e); process.exit(1)})
