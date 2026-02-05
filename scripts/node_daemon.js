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


  async function poll() {
    try {
      const node = await program.account.node.fetchNullable(nodePub);
      const prov = await program.account.provider.fetchNullable(providerPub);
      const ts = new Date().toISOString();
      if (!node) {
      } else {
      }
      if (!prov) {
      } else {
      }
    } catch (e) {
      console.error('poll error:', e.message || e.toString());
    }
  }

  await poll();
  const iv = setInterval(poll, 10000);
}

main().catch(e=>{console.error(e); process.exit(1)})
