const { Connection, PublicKey } = require('@solana/web3.js');
const fetch = require('node-fetch');

const PROGRAM_ID = 'EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq';

async function checkNodesAndSessions() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const programId = new PublicKey(PROGRAM_ID);
  const accounts = await connection.getProgramAccounts(programId);
  
  let nodes = [];
  let providers = [];
  let sessions = [];
  let subscriptions = [];
  
  
  for (const a of accounts) {
    const size = a.account.data.length;
    const data = a.account.data;
    const balance = a.account.lamports;
    
    // Node accounts are typically 200-300 bytes (214 based on earlier data)
    if (size >= 200 && size <= 300) {
      try {
        const providerPda = new PublicKey(data.slice(8, 40)).toBase58();
        // Try to extract endpoint
        let endpoint = '';
        try {
          const endpointLen = data.readUInt32LE(48);
          if (endpointLen > 0 && endpointLen < 100) {
            endpoint = data.slice(52, 52 + endpointLen).toString('utf8');
          }
        } catch(e) {}
        nodes.push({ pubkey: a.pubkey.toBase58(), providerPda, size, endpoint });
      } catch(e) {}
    }
    
    // Provider accounts are typically 80-100 bytes (83 based on earlier data)
    if (size >= 80 && size <= 100) {
      try {
        const authority = new PublicKey(data.slice(8, 40)).toBase58();
        providers.push({ pubkey: a.pubkey.toBase58(), authority, size });
      } catch(e) {}
    }
    
    // Subscription accounts are 67 bytes with balance
    if (size === 67 && balance > 1000000) {
      subscriptions.push({ pubkey: a.pubkey.toBase58(), balance: balance / 1e9 });
    }
  }
  
  // Build wallet to provider PDA mapping
  const walletToProvider = {};
  providers.forEach(p => {
    walletToProvider[p.authority] = p.pubkey;
  });
  
  // Build provider PDA to wallet mapping
  const providerToWallet = {};
  providers.forEach(p => {
    providerToWallet[p.pubkey] = p.authority;
  });
  
  nodes.forEach((n, i) => {
    const wallet = providerToWallet[n.providerPda] || 'Unknown';
  });
  
  providers.forEach((p, i) => {
  });
  
  
  // Now fetch sessions from IPFS
  
  try {
    // Get node registry from IPFS
    const registryRes = await fetch('https://gateway.pinata.cloud/ipfs/QmW2PXhJVvJNCEaNZT1PJFHgiSjRzZPhYKJQexxpGoiFF9');
    const registry = await registryRes.json();
    const ipfsNodes = registry.nodes || [];
    
    
    // Try to fetch sessions from indexer or IPFS
    let ipfsSessions = [];
    try {
      const sessionsRes = await fetch('http://localhost:3001/api/sessions', { timeout: 3000 });
      if (sessionsRes.ok) {
        ipfsSessions = await sessionsRes.json();
      }
    } catch(e) {
    }
    
    
    // Count sessions per node/provider
    const sessionsByProvider = {};
    const sessionsByEndpoint = {};
    
    // Initialize counters for on-chain providers
    providers.forEach(p => {
      sessionsByProvider[p.authority] = { total: 0, active: 0, completed: 0, duration: 0 };
    });
    
    // Initialize counters for IPFS nodes
    ipfsNodes.forEach(n => {
      sessionsByEndpoint[n.endpoint] = { total: 0, active: 0, completed: 0, duration: 0, provider: n.provider };
    });
    
    // Count sessions
    ipfsSessions.forEach(s => {
      const provider = s.node_provider || s.provider;
      const endpoint = s.node_endpoint || s.endpoint;
      const duration = s.duration_seconds || s.durationSeconds || 0;
      const isActive = s.is_active || s.isActive;
      
      if (provider && sessionsByProvider[provider]) {
        sessionsByProvider[provider].total++;
        sessionsByProvider[provider].duration += duration;
        if (isActive) sessionsByProvider[provider].active++;
        else sessionsByProvider[provider].completed++;
      }
      
      if (endpoint && sessionsByEndpoint[endpoint]) {
        sessionsByEndpoint[endpoint].total++;
        sessionsByEndpoint[endpoint].duration += duration;
        if (isActive) sessionsByEndpoint[endpoint].active++;
        else sessionsByEndpoint[endpoint].completed++;
      }
    });
    
    Object.entries(sessionsByProvider).forEach(([wallet, stats]) => {
      const shortWallet = wallet.slice(0, 8) + '...' + wallet.slice(-4);
    });
    
    Object.entries(sessionsByEndpoint).forEach(([endpoint, stats]) => {
      const shortProvider = stats.provider ? stats.provider.slice(0, 8) + '...' : 'Unknown';
    });
    
    
  } catch(e) {
  }
}

checkNodesAndSessions().catch(console.error);
