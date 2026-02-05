const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const PROGRAM_ID = 'EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq';
const PROVIDER_SEED = Buffer.from('provider');
const WALLET = '67N56dCWoKUKDgZpngqc7YTRYs6TMyw76p85LNF1wwtB';

async function debug() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const programId = new PublicKey(PROGRAM_ID);
  const providerPubkey = new PublicKey(WALLET);
  
  // Derive provider PDA
  const [providerPda] = PublicKey.findProgramAddressSync(
    [PROVIDER_SEED, providerPubkey.toBuffer()],
    programId
  );
  
  // Get all program accounts
  const allAccounts = await connection.getProgramAccounts(programId);
  
  // Categorize by size
  const bySize = {};
  for (const acc of allAccounts) {
    const size = acc.account.data.length;
    const balance = acc.account.lamports;
    if (!bySize[size]) bySize[size] = [];
    bySize[size].push({ pubkey: acc.pubkey.toBase58(), balance, data: acc.account.data });
  }
  
  for (const [size, accounts] of Object.entries(bySize).sort((a,b) => parseInt(a[0]) - parseInt(b[0]))) {
    const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  }
  
  // Look for accounts with significant balance (escrow)
  for (const acc of allAccounts) {
    if (acc.account.lamports > 1000000) {
      const data = acc.account.data;
      
      // Try to extract pubkeys at various offsets
      if (data.length >= 72) {
        try {
          const key1 = new PublicKey(data.slice(8, 40)).toBase58();
          const key2 = new PublicKey(data.slice(40, 72)).toBase58();
        } catch(e) {}
      }
    }
  }
  
  // Find which accounts might be nodes (typically 100-500 bytes with endpoint strings)
  for (const acc of allAccounts) {
    const data = acc.account.data;
    const size = data.length;
    
    // Nodes have strings for endpoint, region etc - usually larger
    if (size >= 100 && size < 500) {
      
      // First pubkey after discriminator should be provider PDA
      try {
        const providerKey = new PublicKey(data.slice(8, 40)).toBase58();
      } catch(e) {}
    }
  }
  
  // Find provider accounts
  for (const acc of allAccounts) {
    const data = acc.account.data;
    const size = data.length;
    
    // Provider struct is typically smaller (authority pubkey + some flags)
    if (size >= 40 && size < 100) {
      
      // Authority should be at offset 8
      try {
        const authorityKey = new PublicKey(data.slice(8, 40)).toBase58();
      } catch(e) {}
    }
  }
}

debug().catch(console.error);
