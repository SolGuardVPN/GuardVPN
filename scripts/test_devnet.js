const { Connection, PublicKey } = require('@solana/web3.js');

async function test() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const programId = new PublicKey('EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq');
  
  // Check if program exists
  const programInfo = await connection.getAccountInfo(programId);
  
  // Check IDL account
  const idlAddress = new PublicKey('EMs3EEC6ikCJLVB3on3RRmirBvcfhFtuMu3FpdgW5Xsx');
  const idlInfo = await connection.getAccountInfo(idlAddress);
  
}

test().catch(console.error);
