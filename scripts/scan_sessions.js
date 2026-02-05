const anchor = require('@coral-xyz/anchor');
const bs58 = require('bs58');
const { PublicKey } = require('@solana/web3.js');
const idl = require('../target/idl/dvpn.json');

async function main(){
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, idl.metadata.address, provider);
  const programId = program.programId;

  // Session discriminator from IDL: [243,81,72,115,214,188,72,144]
  const disc = Buffer.from([243,81,72,115,214,188,72,144]);
  const discBase58 = bs58.encode(disc);

  const accounts = await provider.connection.getProgramAccounts(programId, {
    filters: [{ memcmp: { offset: 0, bytes: discBase58 } }],
    commitment: 'confirmed'
  });

  for (const a of accounts) {
    const pk = a.pubkey;
    try {
      // decode via Anchor program account fetch (may perform another RPC)
      const session = await program.account.session.fetch(pk);
        user: session.user.toBase58(),
        node: session.node.toBase58(),
        session_id: session.sessionId?.toString ? session.sessionId.toString() : session.session_id?.toString(),
        start_ts: session.startTs?.toString ? session.startTs.toString() : session.start_ts?.toString(),
        end_ts: session.endTs?.toString ? session.endTs.toString() : session.end_ts?.toString(),
        escrow_lamports: session.escrowLamports?.toString ? session.escrowLamports.toString() : session.escrow_lamports?.toString(),
        state: session.state,
        bump: session.bump
      });
    } catch (e) {
    }
  }
}

main().catch(e=>{console.error(e); process.exit(1)})
