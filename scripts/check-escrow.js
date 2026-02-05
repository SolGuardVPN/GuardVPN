const { Connection, PublicKey } = require('@solana/web3.js');

async function checkEscrow() {
  // Program ID from lib.rs (mainnet)
  const programId = new PublicKey('HJ3a4jtmfcMRpemKpYVFQH9vPbauKNzJAdtmxzKvRP3f');
  
  // Devnet program
  const devnetProgramId = new PublicKey('EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq');
  
  // Your wallet
  const providerWallet = new PublicKey('67N56dCWoKUKDgZpngqc7YTRYs6TMyw76p85LNF1wwtB');
  
  
  // Check Devnet
  const devnetConnection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  try {
    // Get all accounts owned by the program
    const devnetAccounts = await devnetConnection.getProgramAccounts(devnetProgramId);
    
    let totalEscrow = 0;
    let sessionCount = 0;
    
    for (const account of devnetAccounts) {
      const balance = account.account.lamports;
      // Only show accounts with balance > rent exempt minimum
      if (balance > 1000000) { // > 0.001 SOL (likely has escrow funds)
        totalEscrow += balance;
        sessionCount++;
      }
    }
    
    
  } catch (e) {
  }
  
  // Check Mainnet
  const mainnetConnection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  
  try {
    const mainnetAccounts = await mainnetConnection.getProgramAccounts(programId);
    
    let totalEscrow = 0;
    let sessionCount = 0;
    
    for (const account of mainnetAccounts) {
      const balance = account.account.lamports;
      if (balance > 1000000) {
        totalEscrow += balance;
        sessionCount++;
      }
    }
    
    
  } catch (e) {
  }
  
  // Check provider wallet balance
  try {
    const devBalance = await devnetConnection.getBalance(providerWallet);
  } catch (e) {
  }
  
  try {
    const mainBalance = await mainnetConnection.getBalance(providerWallet);
  } catch (e) {
  }
  
}

checkEscrow().catch(console.error);
