const anchor = require('@coral-xyz/anchor');
const { PublicKey } = require('@solana/web3.js');
const idl = require('../target/idl/dvpn.json');

// Simple node daemon: polls node + provider accounts and logs state.
async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, idl.metadata.address, provider);

  const nodePub = new PublicKey('EG4d3Y7rmEFvsCjTFWhxY71mDrhZb5NoYx2bqQdhSpfZ');
  const providerPub = new PublicKey('43y5RPkeFTrLz6ECNpKKT5vthuS9ge6WeaJwsi4gUFx7');

  console.log('Node daemon starting. Poll interval=10s. Ctrl-C to stop.');

  async function poll() {
    try {
      const node = await program.account.node.fetchNullable(nodePub);
      const prov = await program.account.provider.fetchNullable(providerPub);
      const ts = new Date().toISOString();
      if (!node) {
        console.log(`[${ts}] Node account not found: ${nodePub.toBase58()}`);
      } else {
        console.log(`[${ts}] Node: id=${node.nodeId?.toString?node.nodeId.toString():node.node_id} endpoint=${node.endpoint} region=${node.region} price=${node.pricePerMinuteLamports?.toString?node.pricePerMinuteLamports.toString():node.price_per_minute_lamports} bump=${node.bump}`);
      }
      if (!prov) {
        console.log(`[${ts}] Provider account not found: ${providerPub.toBase58()}`);
      } else {
        console.log(`[${ts}] Provider: authority=${prov.authority.toBase58()} node_count=${prov.nodeCount?.toString?prov.nodeCount.toString():prov.node_count}`);
      }
    } catch (e) {
      console.error('poll error:', e.message || e.toString());
    }
  }

  await poll();
  const iv = setInterval(poll, 10000);
  process.on('SIGINT', () => { clearInterval(iv); console.log('daemon stopped'); process.exit(0); });
}

main().catch(e=>{console.error(e); process.exit(1)})
