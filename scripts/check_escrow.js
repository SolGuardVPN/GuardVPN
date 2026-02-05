const { Connection, PublicKey } = require('@solana/web3.js');

async function checkEscrow() {
  // Try devnet first (current config), then localnet
  const rpcUrls = [
    'https://api.devnet.solana.com',
    'http://localhost:8899'
  ];
  
  const config = require('../onchain-config.json');
  const programId = new PublicKey(config.programId);
  
  
  for (const rpcUrl of rpcUrls) {
    
    try {
      const connection = new Connection(rpcUrl, 'confirmed');
      
      // Check if program exists on this network
      const programInfo = await connection.getAccountInfo(programId);
      if (!programInfo) {
        continue;
      }
      
      // Fetch all accounts owned by the program
      const accounts = await connection.getProgramAccounts(programId);
      
      if (accounts.length === 0) {
        continue;
      }
      
      // Check for session accounts (they hold escrow)
      let totalEscrow = 0;
      let sessionCount = 0;
      
      
      for (const acc of accounts) {
        const balance = acc.account.lamports;
        const dataLen = acc.account.data.length;
        const rentExempt = await connection.getMinimumBalanceForRentExemption(dataLen);
        const escrowBalance = balance - rentExempt;
        
        // Identify account type by data length
        let accountType = 'Unknown';
        if (dataLen >= 200 && dataLen < 350) accountType = 'Session';
        else if (dataLen >= 100 && dataLen < 200) accountType = 'Provider/Node';
        else if (dataLen >= 60 && dataLen < 100) accountType = 'Subscription';
        else if (dataLen >= 40 && dataLen < 60) accountType = 'Treasury';
        
        
        if (escrowBalance > 0) {
          totalEscrow += escrowBalance / 1e9;
          sessionCount++;
        }
      }
      
      
      break; // Found the program, exit loop
      
    } catch (err) {
    }
  }
}

checkEscrow().catch(console.error);
