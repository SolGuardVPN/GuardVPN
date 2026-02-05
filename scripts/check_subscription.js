const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const PROGRAM_ID = new PublicKey('EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq');

async function checkSubscription(userWallet) {
  const userPubkey = new PublicKey(userWallet);
  
  const [subscriptionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('subscription'), userPubkey.toBuffer()],
    PROGRAM_ID
  );
  
  
  const accountInfo = await connection.getAccountInfo(subscriptionPda);
  
  if (!accountInfo) {
    return;
  }
  
  
  // Parse data (skip 8 byte discriminator)
  const data = accountInfo.data;
  
  // Plan is at offset 40
  const plan = data[40];
  
  // Escrow lamports at offset 41 (u64)
  const escrow = data.readBigUInt64LE(41);
  
  // Start timestamp at offset 49 (i64)
  const startTs = Number(data.readBigInt64LE(49));
  
  // End timestamp at offset 57 (i64)
  const endTs = Number(data.readBigInt64LE(57));
  
  // State at offset 65
  const state = data[65];
  
  const now = Date.now() / 1000;
}

// Check subscription for user
checkSubscription('4YuWriLCekwfoiV6ngwZ82K3vHKqwkP85YfFdGzCrMjC');
