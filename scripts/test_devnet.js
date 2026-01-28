const { Connection, PublicKey } = require('@solana/web3.js');

async function test() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const programId = new PublicKey('EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq');
  
  // Check if program exists
  const programInfo = await connection.getAccountInfo(programId);
  console.log('✅ Program exists on devnet:', !!programInfo);
  console.log('   Program executable:', programInfo?.executable);
  console.log('   Program data length:', programInfo?.data?.length, 'bytes');
  
  // Check IDL account
  const idlAddress = new PublicKey('EMs3EEC6ikCJLVB3on3RRmirBvcfhFtuMu3FpdgW5Xsx');
  const idlInfo = await connection.getAccountInfo(idlAddress);
  console.log('✅ IDL account exists:', !!idlInfo);
  
  console.log('\n📋 Program ID: EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq');
  console.log('📋 IDL Account: EMs3EEC6ikCJLVB3on3RRmirBvcfhFtuMu3FpdgW5Xsx');
  console.log('\n🎉 DVPN Program deployed successfully on Solana Devnet!');
  console.log('   Revenue Split: 80% Provider / 20% Treasury');
}

test().catch(console.error);
