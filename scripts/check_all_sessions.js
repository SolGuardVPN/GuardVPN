const fetch = require('node-fetch');

const PINATA_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI0ODkyYjA3YS05MWZhLTQxYTYtOWNkYS1kZWY3MWM4ZTAzOTciLCJlbWFpbCI6ImJlc3R0ZWNob25jaGFpbkBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiYzllYjAyODFhODllNjBiY2YwYjgiLCJzY29wZWRLZXlTZWNyZXQiOiJjYTg2ZGQxYmM5OTYxYzIwNDk1Zjg5NDg5OTgzMTk1OTljM2FmYjZmMWEwNDU3MjZjYjE5Y2VlYjM5Yzg1OTQzIiwiZXhwIjoxODAwNjI5ODQ0fQ.av5ETqtwPQE-XyzLFsTXN06qwi6IPn0Ic-YIzwW3Rr0';

// Your provider wallet (from onchain-config.json)
const MY_PROVIDER_WALLET = '5wm7gTHTFEGsZm6oMgsk84tqh4twVYrVGCSkPKPv8Pyo';

async function getAllSessions() {
  
  // Step 1: Get latest sessions CID from Pinata
  const pinResponse = await fetch(
    'https://api.pinata.cloud/data/pinList?status=pinned&metadata[name]=gvpn-sessions&pageLimit=5',
    { headers: { 'Authorization': 'Bearer ' + PINATA_JWT } }
  );
  
  const pinData = await pinResponse.json();
  
  if (!pinData.rows || pinData.rows.length === 0) {
    return;
  }
  
  // Show all session CIDs
  pinData.rows.forEach((row, i) => {
  });
  
  // Get most recent CID
  const latestCID = pinData.rows[0].ipfs_pin_hash;
  
  // Step 2: Fetch sessions from IPFS
  const gateways = [
    'https://w3s.link/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
    'https://ipfs.filebase.io/ipfs/'
  ];
  
  let sessions = [];
  
  for (const gateway of gateways) {
    try {
      const response = await fetch(gateway + latestCID, { timeout: 15000 });
      
      if (response.ok) {
        const data = await response.json();
        sessions = data.sessions || [];
        break;
      }
    } catch (error) {
    }
  }
  
  if (sessions.length === 0) {
    return;
  }
  
  
  // Group by node provider
  const byProvider = {};
  sessions.forEach(s => {
    const provider = s.node_provider || 'unknown';
    if (!byProvider[provider]) byProvider[provider] = [];
    byProvider[provider].push(s);
  });
  
  for (const [provider, provSessions] of Object.entries(byProvider)) {
    const isMyNode = provider === MY_PROVIDER_WALLET;
  }
  
  // My node sessions
  const mySessions = sessions.filter(s => s.node_provider === MY_PROVIDER_WALLET);
  
  
  if (mySessions.length === 0) {
  } else {
    mySessions.forEach((s, i) => {
    });
  }
  
  // Show all sessions for reference
  
  sessions.forEach((s, i) => {
    const isMySession = s.node_provider === MY_PROVIDER_WALLET;
  });
}

getAllSessions().catch(console.error);
