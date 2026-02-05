const anchor = require('@coral-xyz/anchor');
const { PublicKey } = require('@solana/web3.js');
const idl = require('../target/idl/dvpn.json');

async function main(){
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, idl.metadata.address, provider);

  const nodePub = new PublicKey('EG4d3Y7rmEFvsCjTFWhxY71mDrhZb5NoYx2bqQdhSpfZ');
  const node = await program.account.node.fetch(nodePub);
    provider: node.provider.toBase58(),
    node_id: node.nodeId?.toString ? node.nodeId.toString() : node.node_id?.toString(),
    endpoint: node.endpoint,
    region: node.region,
    price_per_minute_lamports: node.pricePerMinuteLamports?.toString ? node.pricePerMinuteLamports.toString() : node.price_per_minute_lamports?.toString(),
    wg_server_pubkey: Buffer.from(node.wgServerPubkey || node.wg_server_pubkey).toString('hex'),
    bump: node.bump
  });
}

main().catch(e=>{console.error(e); process.exit(1)})
