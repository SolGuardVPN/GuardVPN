#!/usr/bin/env node
/**
 * Script to restore and merge all historical sessions from IPFS
 * This will combine all session CIDs and create a new merged CID
 */

const PINATA_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI0ODkyYjA3YS05MWZhLTQxYTYtOWNkYS1kZWY3MWM4ZTAzOTciLCJlbWFpbCI6ImJlc3R0ZWNob25jaGFpbkBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiYzllYjAyODFhODllNjBiY2YwYjgiLCJzY29wZWRLZXlTZWNyZXQiOiJjYTg2ZGQxYmM5OTYxYzIwNDk1Zjg5NDg5OTgzMTk1OTljM2FmYjZmMWEwNDU3MjZjYjE5Y2VlYjM5Yzg1OTQzIiwiZXhwIjoxODAwNjI5ODQ0fQ.av5ETqtwPQE-XyzLFsTXN06qwi6IPn0Ic-YIzwW3Rr0';

const GATEWAYS = [
  'https://w3s.link/ipfs/',
  'https://nftstorage.link/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
];

async function fetchAllSessionCIDs() {
  
  const response = await fetch(
    'https://api.pinata.cloud/data/pinList?status=pinned&metadata[name]=gvpn-sessions&pageLimit=100',
    {
      headers: {
        'Authorization': `Bearer ${PINATA_JWT}`
      }
    }
  );
  
  if (response.ok) {
    const data = await response.json();
    return data.rows.map(pin => ({
      cid: pin.ipfs_pin_hash,
      date: pin.date_pinned
    }));
  }
  
  throw new Error('Failed to fetch CIDs');
}

async function fetchSessionsFromCID(cid) {
  for (const gateway of GATEWAYS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${gateway}${cid}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        return data.sessions || [];
      }
    } catch (error) {
      // Try next gateway
    }
  }
  return [];
}

async function publishMergedSessions(sessions) {
  
  const payload = {
    pinataContent: {
      name: 'GVPN Sessions (Merged)',
      version: '1.0',
      updated_at: new Date().toISOString(),
      merged: true,
      sessions: sessions
    },
    pinataMetadata: {
      name: 'gvpn-sessions',
      keyvalues: {
        type: 'gvpn-sessions',
        count: sessions.length.toString(),
        merged: 'true',
        updated: new Date().toISOString()
      }
    }
  };
  
  const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PINATA_JWT}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  
  if (response.ok) {
    const result = await response.json();
    return result.IpfsHash;
  }
  
  throw new Error('Failed to publish merged sessions');
}

async function main() {
  
  // Target wallet
  const targetWallet = '67N56dCWoKUKDgZpngqc7YTRYs6TMyw76p85LNF1wwtB';
  
  try {
    // 1. Get all session CIDs
    const allCIDs = await fetchAllSessionCIDs();
    
    // 2. Fetch and merge all sessions
    const sessionMap = new Map();
    let totalFetched = 0;
    
    for (const { cid, date } of allCIDs) {
      const sessions = await fetchSessionsFromCID(cid);
      totalFetched += sessions.length;
      
      sessions.forEach(session => {
        const id = session.id || session.session_id;
        if (id) {
          // Keep the most complete version
          const existing = sessionMap.get(id);
          if (!existing || 
              (session.end_time && !existing.end_time) ||
              (session.duration_seconds && !existing.duration_seconds)) {
            sessionMap.set(id, session);
          }
        }
      });
    }
    
    const mergedSessions = Array.from(sessionMap.values());
    
    // 3. Show sessions for target wallet
    const walletSessions = mergedSessions.filter(s => 
      s.node_provider === targetWallet || s.provider === targetWallet
    );
    
    
    let totalEarnings = 0;
    walletSessions.forEach((s, i) => {
      let duration = s.duration_seconds || 0;
      if (s.is_active && s.start_time) {
        duration = Math.floor((Date.now() - new Date(s.start_time).getTime()) / 1000);
      }
      const earnings = (duration / 60) * 0.001;
      totalEarnings += earnings;
      
    });
    
    
    // 4. Publish merged sessions
    const newCID = await publishMergedSessions(mergedSessions);
    
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
