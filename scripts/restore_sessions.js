/**
 * RESTORE MISSING SESSIONS SCRIPT
 * 
 * This script merges sessions from multiple IPFS CIDs to recover lost session data.
 * Your wallet: 67N56dCWoKUKDgZpngqc7YTRYs6TMyw76p85LNF1wwtB
 */

const fetch = require('node-fetch');

const PINATA_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI0ODkyYjA3YS05MWZhLTQxYTYtOWNkYS1kZWY3MWM4ZTAzOTciLCJlbWFpbCI6ImJlc3R0ZWNob25jaGFpbkBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiYzllYjAyODFhODllNjBiY2YwYjgiLCJzY29wZWRLZXlTZWNyZXQiOiJjYTg2ZGQxYmM5OTYxYzIwNDk1Zjg5NDg5OTgzMTk1OTljM2FmYjZmMWEwNDU3MjZjYjE5Y2VlYjM5Yzg1OTQzIiwiZXhwIjoxODAwNjI5ODQ0fQ.av5ETqtwPQE-XyzLFsTXN06qwi6IPn0Ic-YIzwW3Rr0';

const MY_WALLET = '67N56dCWoKUKDgZpngqc7YTRYs6TMyw76p85LNF1wwtB';

const GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://w3s.link/ipfs/',
  'https://ipfs.filebase.io/ipfs/'
];

async function fetchFromGateway(cid) {
  for (const gateway of GATEWAYS) {
    try {
      const response = await fetch(gateway + cid, { timeout: 15000 });
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      // Try next gateway
    }
  }
  return null;
}

async function restoreSessions() {
  
  // Step 1: Get all session CIDs
  const pinResponse = await fetch(
    'https://api.pinata.cloud/data/pinList?status=pinned&metadata[name]=gvpn-sessions&pageLimit=50',
    { headers: { 'Authorization': 'Bearer ' + PINATA_JWT } }
  );
  
  const pinData = await pinResponse.json();
  
  // Step 2: Fetch sessions from ALL CIDs and merge
  const allSessions = new Map(); // Use Map to dedupe by session ID
  
  for (const row of pinData.rows) {
    const cid = row.ipfs_pin_hash;
    
    const data = await fetchFromGateway(cid);
    if (data && data.sessions) {
      for (const session of data.sessions) {
        const sessionId = session.id || session.session_id;
        
        // Check if this session belongs to our wallet
        const isMySession = 
          session.node_provider === MY_WALLET || 
          session.provider === MY_WALLET ||
          session.user_wallet === MY_WALLET;
        
        if (isMySession) {
          // Keep the most recent version of the session (with end_time if exists)
          const existing = allSessions.get(sessionId);
          if (!existing || (session.end_time && !existing.end_time)) {
            allSessions.set(sessionId, session);
          }
        }
      }
    }
  }
  
  
  const mergedSessions = Array.from(allSessions.values());
  
  // Calculate total earnings
  let totalEarnings = 0;
  mergedSessions.forEach((s, i) => {
    let duration = s.duration_seconds || 0;
    if (s.is_active && s.start_time && !duration) {
      const startTime = new Date(s.start_time);
      duration = Math.floor((Date.now() - startTime.getTime()) / 1000);
    }
    const earnings = (duration / 60) * 0.001;
    totalEarnings += earnings;
    
  });
  
  
  // Step 3: Publish merged sessions back to IPFS
  
  // First get ALL sessions from all providers (not just ours)
  const allProviderSessions = new Map();
  for (const row of pinData.rows) {
    const cid = row.ipfs_pin_hash;
    const data = await fetchFromGateway(cid);
    if (data && data.sessions) {
      for (const session of data.sessions) {
        const sessionId = session.id || session.session_id;
        const existing = allProviderSessions.get(sessionId);
        if (!existing || (session.end_time && !existing.end_time)) {
          allProviderSessions.set(sessionId, session);
        }
      }
    }
  }
  
  const finalSessions = Array.from(allProviderSessions.values());
  
  const payload = {
    pinataContent: {
      name: 'GVPN Sessions',
      version: '1.0',
      updated_at: new Date().toISOString(),
      sessions: finalSessions
    },
    pinataMetadata: {
      name: 'gvpn-sessions',
      keyvalues: {
        type: 'gvpn-sessions',
        count: finalSessions.length.toString(),
        updated: new Date().toISOString(),
        restored: 'true'
      }
    }
  };
  
  const pubResponse = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + PINATA_JWT,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  
  if (pubResponse.ok) {
    const result = await pubResponse.json();
  } else {
  }
}

restoreSessions().catch(console.error);
