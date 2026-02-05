const fetch = require('node-fetch');

const PINATA_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI0ODkyYjA3YS05MWZhLTQxYTYtOWNkYS1kZWY3MWM4ZTAzOTciLCJlbWFpbCI6ImJlc3R0ZWNob25jaGFpbkBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiYzllYjAyODFhODllNjBiY2YwYjgiLCJzY29wZWRLZXlTZWNyZXQiOiJjYTg2ZGQxYmM5OTYxYzIwNDk1Zjg5NDg5OTgzMTk1OTljM2FmYjZmMWEwNDU3MjZjYjE5Y2VlYjM5Yzg1OTQzIiwiZXhwIjoxODAwNjI5ODQ0fQ.av5ETqtwPQE-XyzLFsTXN06qwi6IPn0Ic-YIzwW3Rr0';

// Your wallet address
const MY_WALLET = '67N56dCWoKUKDgZpngqc7YTRYs6TMyw76p85LNF1wwtB';

async function checkWalletEarnings() {
  
  try {
    // Get all session CIDs from Pinata
    const pinResponse = await fetch(
      'https://api.pinata.cloud/data/pinList?status=pinned&metadata[name]=gvpn-sessions&pageLimit=20',
      { headers: { 'Authorization': 'Bearer ' + PINATA_JWT } }
    );
    
    const pinData = await pinResponse.json();
    
    if (pinData.rows === undefined || pinData.rows.length === 0) {
      return;
    }
    
    pinData.rows.forEach((row, i) => {
    });
    
    // Get most recent CID
    const latestCID = pinData.rows[0].ipfs_pin_hash;
    
    // Fetch sessions
    const response = await fetch('https://w3s.link/ipfs/' + latestCID);
    const data = await response.json();
    const sessions = data.sessions || [];
    
    
    // Find sessions related to this wallet
    const mySessions = sessions.filter(s => 
      s.node_provider === MY_WALLET || 
      s.provider === MY_WALLET ||
      s.user_wallet === MY_WALLET
    );
    
    
    // Calculate earnings
    let totalEarnings = 0;
    mySessions.forEach((s, i) => {
      let duration = s.duration_seconds || 0;
      if (s.is_active && s.start_time && (duration === 0 || duration === undefined)) {
        const startTime = new Date(s.start_time);
        duration = Math.floor((Date.now() - startTime.getTime()) / 1000);
      }
      const earnings = (duration / 60) * 0.001;
      totalEarnings += earnings;
      
    });
    
    
    // Check earnings/withdrawals
    
    const earningsResponse = await fetch(
      'https://api.pinata.cloud/data/pinList?status=pinned&metadata[name]=gvpn-earnings&pageLimit=5',
      { headers: { 'Authorization': 'Bearer ' + PINATA_JWT } }
    );
    
    const earningsData = await earningsResponse.json();
    if (earningsData.rows && earningsData.rows.length > 0) {
      const earningsCID = earningsData.rows[0].ipfs_pin_hash;
      
      const earnResponse = await fetch('https://w3s.link/ipfs/' + earningsCID);
      const earnData = await earnResponse.json();
      
      const myEarningsRecord = earnData.earnings ? earnData.earnings[MY_WALLET] : null;
      if (myEarningsRecord) {
        
        if (myEarningsRecord.withdrawals && myEarningsRecord.withdrawals.length > 0) {
          myEarningsRecord.withdrawals.forEach((w, i) => {
          });
        }
        
      } else {
      }
    } else {
    }
    
    // Check for node registration
    
    const registryResponse = await fetch(
      'https://api.pinata.cloud/data/pinList?status=pinned&metadata[name]=gvpn-nodes-registry&pageLimit=1',
      { headers: { 'Authorization': 'Bearer ' + PINATA_JWT } }
    );
    
    const registryData = await registryResponse.json();
    if (registryData.rows && registryData.rows.length > 0) {
      const regCID = registryData.rows[0].ipfs_pin_hash;
      
      const regResponse = await fetch('https://w3s.link/ipfs/' + regCID);
      const regData = await regResponse.json();
      
      const myNodes = (regData.nodes || []).filter(n => n.provider === MY_WALLET);
      
      myNodes.forEach((n, i) => {
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkWalletEarnings().catch(console.error);
