const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const PROGRAM_ID = new PublicKey('EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq');

async function checkSubscription(userWallet) {
  const userPubkey = new PublicKey(userWallet);
  
  const [subscriptionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('subscription'), userPubkey.toBuffer()],
    PROGRAM_ID
  );
  
  console.log('Subscription PDA:', subscriptionPda.toBase58());
  
  const accountInfo = await connection.getAccountInfo(subscriptionPda);
  
  if (!accountInfo) {
    console.log('No subscription found');
    return;
  }
  
  console.log('Balance:', accountInfo.lamports / 1e9, 'SOL');
  console.log('Data length:', accountInfo.data.length);
  
  // Parse data (skip 8 byte discriminator)
  const data = accountInfo.data;
  
  // Plan is at offset 40
  const plan = data[40];
  console.log('Plan:', ['Weekly', 'Monthly', 'Yearly'][plan] || plan);
  
  // Escrow lamports at offset 41 (u64)
  const escrow = data.readBigUInt64LE(41);
  console.log('Escrow:', Number(escrow) / 1e9, 'SOL');
  
  // Start timestamp at offset 49 (i64)
  const startTs = Number(data.readBigInt64LE(49));
  console.log('Start:', new Date(startTs * 1000).toISOString());
  
  // End timestamp at offset 57 (i64)
  const endTs = Number(data.readBigInt64LE(57));
  console.log('End:', new Date(endTs * 1000).toISOString());
  
  // State at offset 65
  const state = data[65];
  console.log('State:', ['Active', 'Cancelled', 'Claimed'][state] || state);
  
  const now = Date.now() / 1000;
  console.log('');
  console.log('Now:', new Date().toISOString());
  console.log('Expired?:', now >= endTs);
  console.log('Time until expiry:', ((endTs - now) / 3600).toFixed(2), 'hours');
}

// Check subscription for user
checkSubscription('4YuWriLCekwfoiV6ngwZ82K3vHKqwkP85YfFdGzCrMjC');
