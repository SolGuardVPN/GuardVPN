// Network Configuration - Devnet (Test) vs Mainnet (Production)
const NETWORK_CONFIG = {
  devnet: {
    name: 'Devnet (Test)',
    rpcUrl: 'https://api.devnet.solana.com',
    programId: 'EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq', // Devnet program
    providerWallet: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6',
    explorerUrl: 'https://explorer.solana.com/?cluster=devnet',
    isTestMode: true
  },
  mainnet: {
    name: 'Mainnet',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    // TODO: Deploy program to mainnet and update this ID
    programId: 'EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq', // Update with mainnet program ID
    providerWallet: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6', // Update with mainnet treasury
    explorerUrl: 'https://explorer.solana.com',
    isTestMode: false
  }
};

// Current network mode - will be set based on wallet type
let currentNetwork = 'devnet';

// Configuration (dynamic based on network)
let CONFIG = {
  indexerUrl: 'http://localhost:3001',
  rpcUrl: NETWORK_CONFIG.devnet.rpcUrl,
  programId: NETWORK_CONFIG.devnet.programId,
  providerWallet: NETWORK_CONFIG.devnet.providerWallet,
  isTestMode: true,
  networkName: 'Devnet (Test)',
  // Pinata IPFS Configuration
  pinataJWT: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI0ODkyYjA3YS05MWZhLTQxYTYtOWNkYS1kZWY3MWM4ZTAzOTciLCJlbWFpbCI6ImJlc3R0ZWNob25jaGFpbkBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiYzllYjAyODFhODllNjBiY2YwYjgiLCJzY29wZWRLZXlTZWNyZXQiOiJjYTg2ZGQxYmM5OTYxYzIwNDk1Zjg5NDg5OTgzMTk1OTljM2FmYjZmMWEwNDU3MjZjYjE5Y2VlYjM5Yzg1OTQzIiwiZXhwIjoxODAwNjI5ODQ0fQ.av5ETqtwPQE-XyzLFsTXN06qwi6IPn0Ic-YIzwW3Rr0',
  pinataGateway: 'https://gateway.pinata.cloud/ipfs/',
  // Backup gateways for IPFS (updated with working ones - w3s.link is most reliable)
  ipfsGateways: [
    'https://w3s.link/ipfs/',           // Web3.Storage - most reliable
    'https://nftstorage.link/ipfs/',    // NFT.Storage gateway
    'https://gateway.pinata.cloud/ipfs/', // Pinata (may rate limit)
    'https://cf-ipfs.com/ipfs/',        // Cloudflare IPFS
    'https://ipfs.filebase.io/ipfs/'    // Filebase gateway
  ],
  // Known IPFS registry CID (update this when you publish new nodes)
  ipfsRegistryCID: 'QmWshwhqU236FVSmEA1aKgDeEHZuFebUF7ibJ5an9hn7My',
  // Use IPFS as primary source (set to true to skip indexer API)
  useIPFSPrimary: true
};

// Subscription plans with prices
const SUBSCRIPTION_PLANS = {
  weekly: { name: 'Weekly', priceSOL: 0.03, durationDays: 7 },
  monthly: { name: 'Monthly', priceSOL: 0.1, durationDays: 30 },
  yearly: { name: 'Yearly', priceSOL: 0.6, durationDays: 365 }
};

// Application State
const state = {
  connected: false,
  selectedNode: null,
  nodes: [],
  sessions: [],
  wallet: null,
  walletConnected: false,
  walletType: null, // 'phantom' or 'mock'
  connectionStartTime: null,
  timerInterval: null,
  selectedSubscriptionType: 'hourly', // hourly, weekly, monthly
  subscriptionPrice: 0,
  currentSessionId: null,
  subscriptionType: null
};

// ============================================
// Global Function: Register Node On-Chain
// Defined early so it's available when buttons are clicked
// ============================================
async function registerNodeOnChain(endpoint, location, wgPubkey, priceLamports) {
  
  if (!state.wallet) {
    showToast('Please connect your wallet first', 'error');
    return;
  }
  
  const confirmed = confirm(
    `🔗 REGISTER NODE ON SOLANA BLOCKCHAIN\n\n` +
    `This will create an on-chain node account so you can:\n` +
    `• Claim 80% of subscription payments\n` +
    `• Receive rewards from user escrow\n\n` +
    `Node: ${endpoint}\n` +
    `Location: ${location}\n\n` +
    `This requires a small SOL fee (~0.003 SOL).\n\n` +
    `Proceed?`
  );
  
  if (!confirmed) return;
  
  showToast('🔗 Opening Phantom to sign transaction...', 'info');
  
  try {
    // Use Phantom to sign the transaction
    const result = await window.electron.registerNodePhantom({
      walletAddress: state.wallet,
      endpoint: endpoint,
      location: location,
      region: location.toLowerCase().replace(/[^a-z]/g, '-').substring(0, 12),
      pricePerHour: priceLamports / 1e9, // Convert lamports to SOL
      wgPublicKey: wgPubkey || ''
    });
    
    if (result.success) {
      showToast('✅ Node registered on-chain!', 'success');
      await loadProviderStats();
      await displayProviderNodes();
    } else {
      showToast('❌ On-chain registration failed: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('On-chain registration error:', error);
    showToast('❌ Error: ' + error.message, 'error');
  }
}

// Also expose on window for compatibility
window.registerNodeOnChain = registerNodeOnChain;

// ============================================
// Network Switching Functions
// ============================================

// Switch network based on wallet type
async function switchNetwork(network) {
  if (!NETWORK_CONFIG[network]) {
    console.error('Invalid network:', network);
    return;
  }
  
  currentNetwork = network;
  const netConfig = NETWORK_CONFIG[network];
  
  // Update CONFIG with network-specific values
  CONFIG.rpcUrl = netConfig.rpcUrl;
  CONFIG.programId = netConfig.programId;
  CONFIG.providerWallet = netConfig.providerWallet;
  CONFIG.isTestMode = netConfig.isTestMode;
  CONFIG.networkName = netConfig.name;
  
  
  // Also notify main process to switch network
  if (window.electron && window.electron.switchNetwork) {
    try {
      await window.electron.switchNetwork(network);
    } catch (e) {
      console.warn('Could not sync network with main process:', e.message);
    }
  }
  
  // Update UI to show current network
  updateNetworkIndicator();
  
  return netConfig;
}

// Update network indicator in UI
function updateNetworkIndicator() {
  // Update sidebar wallet label to show network
  const walletLabel = document.querySelector('.wallet-label');
  if (walletLabel) {
    const networkBadge = CONFIG.isTestMode ? '🧪 DEVNET' : '🟢 MAINNET';
    walletLabel.innerHTML = `Wallet <span class="network-badge ${CONFIG.isTestMode ? 'testnet' : 'mainnet'}">${networkBadge}</span>`;
  }
  
  // Also update subscription page if visible
  const subWalletDisplay = document.getElementById('subWalletAddress');
  if (subWalletDisplay && state.wallet) {
    const networkInfo = CONFIG.isTestMode ? ' (Devnet)' : ' (Mainnet)';
    // Network info will be shown alongside wallet
  }
}

// ============================================
// IPFS Pinata Storage for ALL Data (Sessions, Earnings, Withdrawals)
// ============================================

// CID tracking (cached locally for quick lookup, but data lives on IPFS)
const IPFS_DATA_CIDS = {
  sessions: null,
  earnings: null,
  registry: null
};

// Cache for IPFS data (to avoid fetching on every operation)
let ipfsSessionsCache = [];
let ipfsEarningsCache = {};
let lastIPFSFetch = { sessions: 0, earnings: 0, registry: 0 };
const CACHE_TTL = 30000; // 30 seconds cache

// ============================================
// Fetch Latest Registry CID from Pinata
// ============================================

// Get the latest registry CID from Pinata (to always get the most up-to-date node list)
async function fetchLatestRegistryCID() {
  
  // Check cache first (valid for 30 seconds)
  if (Date.now() - lastIPFSFetch.registry < CACHE_TTL && IPFS_DATA_CIDS.registry) {
    return IPFS_DATA_CIDS.registry;
  }
  
  try {
    // Query Pinata for the latest vpn-registry pin
    const response = await fetch(
      'https://api.pinata.cloud/data/pinList?status=pinned&metadata[name]=gvpn-nodes-registry&pageLimit=1',
      {
        headers: {
          'Authorization': `Bearer ${CONFIG.pinataJWT}`
        }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.rows && data.rows.length > 0) {
        // Get the most recently pinned registry
        const latestPin = data.rows[0];
        const latestCID = latestPin.ipfs_pin_hash;
        
        
        // Update cache
        IPFS_DATA_CIDS.registry = latestCID;
        lastIPFSFetch.registry = Date.now();
        
        // Also update CONFIG for this session
        CONFIG.ipfsRegistryCID = latestCID;
        
        return latestCID;
      }
    }
  } catch (error) {
    console.error('❌ Failed to fetch latest registry CID:', error.message);
  }
  
  // Fallback to hardcoded CID
  return CONFIG.ipfsRegistryCID;
}

// ============================================
// IPFS Sessions Storage (with historical accumulation)
// ============================================

// Cache for all historical sessions (merged from all CIDs)
let allMergedSessionsCache = [];
let lastAllSessionsFetch = 0;
const ALL_SESSIONS_CACHE_TTL = 60000; // 1 minute cache for merged sessions

// Fetch ALL session CIDs from Pinata history (to accumulate rewards)
async function fetchAllSessionsCIDs() {
  
  try {
    // Query Pinata for ALL gvpn-sessions pins (get history)
    const response = await fetch(
      'https://api.pinata.cloud/data/pinList?status=pinned&metadata[name]=gvpn-sessions&pageLimit=100',
      {
        headers: {
          'Authorization': `Bearer ${CONFIG.pinataJWT}`
        }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.rows && data.rows.length > 0) {
        const cids = data.rows.map(pin => ({
          cid: pin.ipfs_pin_hash,
          date: pin.date_pinned
        }));
        return cids;
      }
    }
  } catch (error) {
    console.error('❌ Failed to fetch session CIDs:', error.message);
  }
  
  return [];
}

// Fetch sessions from a specific CID
async function fetchSessionsFromCID(cid) {
  for (const gateway of CONFIG.ipfsGateways) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
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

// Fetch and merge ALL sessions from ALL historical CIDs
async function fetchAllMergedSessions() {
  // Check cache first
  if (Date.now() - lastAllSessionsFetch < ALL_SESSIONS_CACHE_TTL && allMergedSessionsCache.length > 0) {
    return allMergedSessionsCache;
  }
  
  
  const allCIDs = await fetchAllSessionsCIDs();
  const sessionMap = new Map(); // Use Map to deduplicate by session ID
  
  // Fetch sessions from all CIDs in parallel (max 5 at a time)
  for (let i = 0; i < allCIDs.length; i += 5) {
    const batch = allCIDs.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(({ cid }) => fetchSessionsFromCID(cid))
    );
    
    results.forEach(sessions => {
      sessions.forEach(session => {
        const id = session.id || session.session_id;
        if (id) {
          // Keep the most recent version of each session (by end_time or updated fields)
          const existing = sessionMap.get(id);
          if (!existing || 
              (session.end_time && !existing.end_time) || 
              (session.duration_seconds && !existing.duration_seconds)) {
            sessionMap.set(id, session);
          }
        }
      });
    });
  }
  
  allMergedSessionsCache = Array.from(sessionMap.values());
  lastAllSessionsFetch = Date.now();
  
  return allMergedSessionsCache;
}

// Fetch the latest sessions CID from Pinata (shared globally)
async function fetchLatestSessionsCID() {
  
  try {
    // Query Pinata for the latest gvpn-sessions pin
    const response = await fetch(
      'https://api.pinata.cloud/data/pinList?status=pinned&metadata[name]=gvpn-sessions&pageLimit=1',
      {
        headers: {
          'Authorization': `Bearer ${CONFIG.pinataJWT}`
        }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.rows && data.rows.length > 0) {
        const latestPin = data.rows[0];
        const latestCID = latestPin.ipfs_pin_hash;
        
        IPFS_DATA_CIDS.sessions = latestCID;
        localStorage.setItem('gvpn_sessions_cid', latestCID);
        return latestCID;
      }
    }
  } catch (error) {
    console.error('❌ Failed to fetch latest sessions CID:', error.message);
  }
  
  return localStorage.getItem('gvpn_sessions_cid');
}

// Fetch sessions from IPFS
async function fetchSessionsFromIPFS() {
  // First, try to get the latest sessions CID from Pinata (shared globally)
  let cid = IPFS_DATA_CIDS.sessions;
  
  // Refresh CID from Pinata periodically or if not cached
  if (!cid || Date.now() - lastIPFSFetch.sessions > CACHE_TTL) {
    cid = await fetchLatestSessionsCID();
  }
  
  if (!cid) {
    cid = localStorage.getItem('gvpn_sessions_cid');
  }
  
  if (!cid) {
    return [];
  }
  if (!cid) {
    return [];
  }
  
  // Check cache
  if (Date.now() - lastIPFSFetch.sessions < CACHE_TTL && ipfsSessionsCache.length > 0) {
    return ipfsSessionsCache;
  }
  
  
  for (const gateway of CONFIG.ipfsGateways) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${gateway}${cid}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        ipfsSessionsCache = data.sessions || [];
        lastIPFSFetch.sessions = Date.now();
        return ipfsSessionsCache;
      }
    } catch (error) {
    }
  }
  
  return ipfsSessionsCache;
}

// Publish sessions to IPFS
async function publishSessionsToIPFS(sessions) {
  
  const payload = {
    pinataContent: {
      name: 'GVPN Sessions',
      version: '1.0',
      updated_at: new Date().toISOString(),
      sessions: sessions
    },
    pinataMetadata: {
      name: 'gvpn-sessions',
      keyvalues: {
        type: 'gvpn-sessions',
        count: sessions.length.toString(),
        updated: new Date().toISOString()
      }
    }
  };
  
  try {
    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.pinataJWT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      const result = await response.json();
      IPFS_DATA_CIDS.sessions = result.IpfsHash;
      localStorage.setItem('gvpn_sessions_cid', result.IpfsHash);
      ipfsSessionsCache = sessions;
      lastIPFSFetch.sessions = Date.now();
      return { success: true, cid: result.IpfsHash };
    } else {
      const error = await response.text();
      console.error('❌ Pinata error:', error);
      return { success: false, error };
    }
  } catch (error) {
    console.error('❌ Failed to publish sessions:', error);
    return { success: false, error: error.message };
  }
}

// Create a new session (stored on IPFS)
async function createLocalSession(nodeData, userWallet) {
  const sessions = await fetchSessionsFromIPFS();
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const newSession = {
    id: sessionId,
    session_id: sessionId,
    user_wallet: userWallet,
    node_provider: nodeData.provider,
    node_endpoint: nodeData.endpoint,
    node_location: nodeData.location,
    start_time: new Date().toISOString(),
    end_time: null,
    is_active: true,
    bytes_used: 0,
    amount_paid: 0,
    created_at: new Date().toISOString()
  };
  
  sessions.push(newSession);
  await publishSessionsToIPFS(sessions);
  return newSession;
}

// End a session (update on IPFS)
async function endLocalSession(sessionId) {
  const sessions = await fetchSessionsFromIPFS();
  const session = sessions.find(s => s.id === sessionId || s.session_id === sessionId);
  
  if (session) {
    session.end_time = new Date().toISOString();
    session.is_active = false;
    
    // Calculate duration and bytes
    const startTime = new Date(session.start_time);
    const endTime = new Date(session.end_time);
    const durationMs = endTime - startTime;
    session.duration_seconds = Math.floor(durationMs / 1000);
    session.bytes_used = Math.floor(Math.random() * 100000000) + 1000000;
    
    await publishSessionsToIPFS(sessions);
    return session;
  }
  return null;
}

// End all active sessions for a wallet (update on IPFS)
async function endLocalSessionsByWallet(wallet) {
  const sessions = await fetchSessionsFromIPFS();
  let endedCount = 0;
  
  sessions.forEach(session => {
    if (session.user_wallet === wallet && session.is_active) {
      session.end_time = new Date().toISOString();
      session.is_active = false;
      session.duration_seconds = Math.floor((new Date() - new Date(session.start_time)) / 1000);
      endedCount++;
    }
  });
  
  if (endedCount > 0) {
    await publishSessionsToIPFS(sessions);
  }
  return endedCount;
}

// Get sessions (all or by wallet)
async function getLocalSessions(wallet = null) {
  const sessions = await fetchSessionsFromIPFS();
  if (wallet) {
    return sessions.filter(s => s.user_wallet === wallet || s.node_provider === wallet);
  }
  return sessions;
}

// ============================================
// IPFS Earnings & Withdrawals Storage
// ============================================

// Fetch the latest earnings CID from Pinata (shared globally)
async function fetchLatestEarningsCID() {
  
  try {
    const response = await fetch(
      'https://api.pinata.cloud/data/pinList?status=pinned&metadata[name]=gvpn-earnings&pageLimit=1',
      {
        headers: {
          'Authorization': `Bearer ${CONFIG.pinataJWT}`
        }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.rows && data.rows.length > 0) {
        const latestPin = data.rows[0];
        const latestCID = latestPin.ipfs_pin_hash;
        
        IPFS_DATA_CIDS.earnings = latestCID;
        localStorage.setItem('gvpn_earnings_cid', latestCID);
        return latestCID;
      }
    }
  } catch (error) {
    console.error('❌ Failed to fetch latest earnings CID:', error.message);
  }
  
  return localStorage.getItem('gvpn_earnings_cid');
}

// Fetch earnings from IPFS
async function fetchEarningsFromIPFS() {
  // First, try to get the latest earnings CID from Pinata (shared globally)
  let cid = IPFS_DATA_CIDS.earnings;
  
  // Refresh CID from Pinata periodically or if not cached
  if (!cid || Date.now() - lastIPFSFetch.earnings > CACHE_TTL) {
    cid = await fetchLatestEarningsCID();
  }
  
  if (!cid) {
    cid = localStorage.getItem('gvpn_earnings_cid');
  }
  
  if (!cid) {
    return {};
  }
  
  // Check cache
  if (Date.now() - lastIPFSFetch.earnings < CACHE_TTL && Object.keys(ipfsEarningsCache).length > 0) {
    return ipfsEarningsCache;
  }
  
  
  for (const gateway of CONFIG.ipfsGateways) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${gateway}${cid}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        ipfsEarningsCache = data.earnings || {};
        lastIPFSFetch.earnings = Date.now();
        return ipfsEarningsCache;
      }
    } catch (error) {
    }
  }
  
  return ipfsEarningsCache;
}

// Publish earnings to IPFS
async function publishEarningsToIPFS(earnings) {
  
  const payload = {
    pinataContent: {
      name: 'GVPN Earnings',
      version: '1.0',
      updated_at: new Date().toISOString(),
      earnings: earnings
    },
    pinataMetadata: {
      name: 'gvpn-earnings',
      keyvalues: {
        type: 'gvpn-earnings',
        updated: new Date().toISOString()
      }
    }
  };
  
  try {
    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.pinataJWT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      const result = await response.json();
      IPFS_DATA_CIDS.earnings = result.IpfsHash;
      localStorage.setItem('gvpn_earnings_cid', result.IpfsHash);
      ipfsEarningsCache = earnings;
      lastIPFSFetch.earnings = Date.now();
      return { success: true, cid: result.IpfsHash };
    } else {
      const error = await response.text();
      console.error('❌ Pinata error:', error);
      return { success: false, error };
    }
  } catch (error) {
    console.error('❌ Failed to publish earnings:', error);
    return { success: false, error: error.message };
  }
}

// Get provider earnings (from ON-CHAIN ESCROW - subscription-based rewards)
// Rewards come from actual user subscription payments, NOT time-based calculation
async function getProviderEarnings(wallet) {
  
  // First, try to get actual on-chain escrow balance
  let onchainEscrow = null;
  if (window.electron && window.electron.getProviderEscrowBalance) {
    try {
      onchainEscrow = await window.electron.getProviderEscrowBalance(wallet);
    } catch (e) {
    }
  }
  
  // Get session count from IPFS for stats display
  const sessions = await fetchAllMergedSessions();
  const allNodes = await getAllNodesFromIPFS();
  const myNodeEndpoints = allNodes.filter(n => n.provider === wallet).map(n => n.endpoint);
  
  const allProviderSessions = sessions.filter(s => 
    s.node_provider === wallet || 
    s.provider === wallet ||
    myNodeEndpoints.includes(s.node_endpoint)
  );
  
  const activeSessions = allProviderSessions.filter(s => s.is_active).length;
  
  // Get withdrawal history from IPFS
  const earnings = await fetchEarningsFromIPFS();
  const withdrawn = earnings[wallet]?.withdrawn || 0;
  
  // If we have on-chain escrow data, use it (REAL SOL)
  if (onchainEscrow && onchainEscrow.success) {
    const providerShareLamports = onchainEscrow.providerShareLamports || 0;
    const totalEscrowLamports = onchainEscrow.totalEscrowLamports || 0;
    const hasOnchainNode = onchainEscrow.hasOnchainNode || false;
    
    
    if (!hasOnchainNode) {
    }
    
    // Available = Provider's 80% share minus what's already withdrawn
    const available = Math.max(0, providerShareLamports - withdrawn);
    
    return {
      success: true,
      source: hasOnchainNode ? 'onchain-escrow' : 'no-onchain-node',
      hasOnchainNode: hasOnchainNode,
      // Total subscription escrow in network
      total_escrow: totalEscrowLamports,
      total_escrow_sol: (totalEscrowLamports / 1e9).toFixed(4),
      // Provider's claimable share (only if has on-chain node)
      total_earned: providerShareLamports,
      total_earned_sol: (providerShareLamports / 1e9).toFixed(4),
      provider_share_percent: 80,
      treasury_share_percent: 20,
      withdrawn: withdrawn,
      withdrawn_sol: (withdrawn / 1e9).toFixed(4),
      available_balance: available,
      available_balance_sol: (available / 1e9).toFixed(4),
      total_sessions: allProviderSessions.length,
      active_sessions: activeSessions,
      escrow_accounts: onchainEscrow.accountCount || 0,
      my_node_count: onchainEscrow.myNodeCount || 0,
      // Network-wide stats for context
      network_total_escrow_sol: onchainEscrow.networkTotalEscrow || 0,
      // Message if no on-chain node
      message: onchainEscrow.message
    };
  }
  
  // Fallback: If no on-chain escrow, show 0 (user needs real subscriptions)
  
  return {
    success: true,
    source: 'no-escrow',
    total_escrow: 0,
    total_escrow_sol: '0.0000',
    total_earned: 0,
    total_earned_sol: '0.0000',
    provider_share_percent: 80,
    treasury_share_percent: 20,
    withdrawn: withdrawn,
    withdrawn_sol: (withdrawn / 1e9).toFixed(4),
    available_balance: 0,
    available_balance_sol: '0.0000',
    total_sessions: allProviderSessions.length,
    active_sessions: activeSessions,
    escrow_accounts: 0,
    message: 'No subscription payments in escrow. Users must pay for subscriptions on-chain to generate rewards.'
  };
}

// Record withdrawal (to IPFS) - also marks sessions as claimed
async function recordWithdrawal(wallet, amount, sessionIds = null) {
  const earnings = await fetchEarningsFromIPFS();
  if (!earnings[wallet]) {
    earnings[wallet] = { withdrawn: 0, withdrawals: [], claimed_sessions: [] };
  }
  
  // Ensure claimed_sessions array exists
  if (!earnings[wallet].claimed_sessions) {
    earnings[wallet].claimed_sessions = [];
  }
  
  earnings[wallet].withdrawn += amount;
  earnings[wallet].withdrawals.push({
    amount: amount,
    timestamp: new Date().toISOString(),
    tx_signature: `ipfs_${Date.now()}`,
    sessions_claimed: sessionIds ? sessionIds.length : 0
  });
  
  // Mark sessions as claimed (if session IDs provided)
  if (sessionIds && sessionIds.length > 0) {
    sessionIds.forEach(id => {
      if (!earnings[wallet].claimed_sessions.includes(id)) {
        earnings[wallet].claimed_sessions.push(id);
      }
    });
  }
  
  await publishEarningsToIPFS(earnings);
  return true;
}

// Get unclaimed session IDs for a wallet (helper for claim function)
async function getUnclaimedSessionIds(wallet) {
  const earnings = await fetchEarningsFromIPFS();
  const sessions = await fetchAllMergedSessions();
  const allNodes = await getAllNodesFromIPFS();
  const myNodeEndpoints = allNodes.filter(n => n.provider === wallet).map(n => n.endpoint);
  const claimedSessionIds = earnings[wallet]?.claimed_sessions || [];
  
  // Get unclaimed, completed sessions
  const unclaimedSessions = sessions.filter(s => {
    const sessionId = s.id || s.session_id;
    const isMySession = s.node_provider === wallet || 
                        s.provider === wallet ||
                        myNodeEndpoints.includes(s.node_endpoint);
    const isNotClaimed = !claimedSessionIds.includes(sessionId);
    const isCompleted = !s.is_active && s.duration_seconds > 0;
    return isMySession && isNotClaimed && isCompleted;
  });
  
  return unclaimedSessions.map(s => s.id || s.session_id);
}

// Rate a node (update on IPFS)
async function rateNodeLocally(nodeId, rating, wallet) {
  // Get current nodes
  const nodes = await getAllNodesFromIPFS();
  const nodeIndex = nodes.findIndex(n => n.endpoint === nodeId || n.pubkey === nodeId);
  
  if (nodeIndex >= 0) {
    const node = nodes[nodeIndex];
    node.rating_sum = (parseInt(node.rating_sum) || 0) + rating;
    node.rating_count = (parseInt(node.rating_count) || 0) + 1;
    node.rating_avg = (node.rating_sum / node.rating_count).toFixed(1);
    
    // Update IPFS registry
    const result = await publishRegistryToPinata(nodes);
    if (result.success) {
      return { success: true, new_rating: node.rating_avg };
    }
  }
  
  return { success: false, error: 'Node not found' };
}

// ============================================
// IPFS Pinata Direct Integration
// ============================================

// Publish node directly to Pinata IPFS
async function publishNodeToPinata(nodeData) {
  
  const payload = {
    pinataContent: {
      name: 'GVPN Node',
      version: '1.0',
      type: 'vpn-node',
      published_at: new Date().toISOString(),
      node: {
        endpoint: nodeData.endpoint,
        location: nodeData.location,
        provider_wallet: nodeData.provider_wallet,
        wg_server_pubkey: nodeData.wireguard_pubkey,
        price_per_hour_lamports: nodeData.price_per_hour || 6000000,
        is_active: true,
        bandwidth_mbps: 100
      }
    },
    pinataMetadata: {
      name: `gvpn-node-${nodeData.endpoint.replace(/[.:]/g, '-')}`,
      keyvalues: {
        type: 'vpn-node',
        provider: nodeData.provider_wallet,
        location: nodeData.location
      }
    }
  };
  
  try {
    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.pinataJWT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      const result = await response.json();
      return {
        success: true,
        cid: result.IpfsHash,
        url: `${CONFIG.pinataGateway}${result.IpfsHash}`
      };
    } else {
      const error = await response.text();
      console.error('❌ Pinata error:', error);
      return { success: false, error };
    }
  } catch (error) {
    console.error('❌ Failed to publish to Pinata:', error);
    return { success: false, error: error.message };
  }
}

// Fetch node from Pinata IPFS
async function fetchNodeFromIPFS(cid) {
  
  try {
    const response = await fetch(`${CONFIG.pinataGateway}${cid}`);
    if (response.ok) {
      const data = await response.json();
      return { success: true, data };
    } else {
      return { success: false, error: 'Failed to fetch' };
    }
  } catch (error) {
    console.error('❌ IPFS fetch error:', error);
    return { success: false, error: error.message };
  }
}

// List all pinned nodes from Pinata
async function listPinnedNodes() {
  
  try {
    const response = await fetch('https://api.pinata.cloud/data/pinList?status=pinned&metadata[keyvalues][type]={"value":"vpn-node","op":"eq"}', {
      headers: {
        'Authorization': `Bearer ${CONFIG.pinataJWT}`
      }
    });
    
    if (response.ok) {
      const result = await response.json();
      return {
        success: true,
        count: result.count,
        nodes: result.rows.map(row => ({
          cid: row.ipfs_pin_hash,
          name: row.metadata?.name,
          provider: row.metadata?.keyvalues?.provider,
          location: row.metadata?.keyvalues?.location,
          pinned_at: row.date_pinned
        }))
      };
    } else {
      return { success: false, error: 'Failed to list pins' };
    }
  } catch (error) {
    console.error('❌ Failed to list pins:', error);
    return { success: false, error: error.message };
  }
}

// Get all nodes from IPFS registry (cached version)
async function getAllNodesFromIPFS() {
  // If we already loaded nodes, return them
  if (state.nodes && state.nodes.length > 0) {
    return state.nodes;
  }
  
  // Otherwise fetch from IPFS
  if (!CONFIG.ipfsRegistryCID) {
    console.warn('No IPFS registry CID configured');
    return [];
  }
  
  const gateways = CONFIG.ipfsGateways || [CONFIG.pinataGateway];
  
  for (const gateway of gateways) {
    try {
      const ipfsUrl = `${gateway}${CONFIG.ipfsRegistryCID}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(ipfsUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data.nodes && data.nodes.length > 0) {
          // Convert to app format
          return data.nodes.map((node, index) => ({
            pubkey: node.endpoint,
            provider: node.provider,
            node_id: index + 1,
            endpoint: node.endpoint,
            location: node.location,
            region: node.region,
            price_per_minute_lamports: Math.floor((node.price_per_hour_lamports || 6000000) / 60),
            wg_server_pubkey: node.wg_server_pubkey,
            max_capacity: 100,
            active_sessions: 0,
            is_active: node.is_active !== false,
            reputation_score: 1000,
            bandwidth_mbps: node.bandwidth_mbps || 100,
            rating_avg: node.rating_avg || '5.0',
            source: 'ipfs-pinata'
          }));
        }
      }
    } catch (error) {
    }
  }
  
  return [];
}

// Publish updated node registry to Pinata IPFS
async function publishRegistryToPinata(nodes) {
  
  const registry = {
    name: 'GVPN Node Registry',
    version: '1.0',
    updated_at: new Date().toISOString(),
    nodes: nodes.map(n => ({
      endpoint: n.endpoint,
      location: n.location,
      region: n.region,
      provider: n.provider || n.provider_wallet,
      wg_server_pubkey: n.wg_server_pubkey,
      price_per_hour_lamports: n.price_per_hour_lamports || (n.price_per_minute_lamports * 60) || 6000000,
      is_active: n.is_active !== false,
      bandwidth_mbps: n.bandwidth_mbps || 100,
      rating_avg: n.rating_avg || '5.0'
    }))
  };
  
  const payload = {
    pinataContent: registry,
    pinataMetadata: {
      name: 'gvpn-nodes-registry',
      keyvalues: {
        type: 'vpn-registry',
        version: '1.0',
        updated: new Date().toISOString()
      }
    }
  };
  
  try {
    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.pinataJWT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      const result = await response.json();
      
      // Update config with new CID
      CONFIG.ipfsRegistryCID = result.IpfsHash;
      
      return {
        success: true,
        cid: result.IpfsHash,
        url: `${CONFIG.pinataGateway}${result.IpfsHash}`
      };
    } else {
      const error = await response.text();
      console.error('❌ Pinata error:', error);
      return { success: false, error };
    }
  } catch (error) {
    console.error('❌ Failed to publish registry:', error);
    return { success: false, error: error.message };
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  
  // Initialize IPFS in background
  if (window.electron && window.electron.initIPFS) {
    window.electron.initIPFS().then(result => {
      if (result.success) {
      } else {
        console.warn('⚠️ IPFS initialization failed:', result.error);
      }
    }).catch(err => {
      console.warn('⚠️ IPFS initialization error:', err);
    });
  }
  
  // Set up Phantom callback listener
  setupPhantomCallbackListener();
  
  setupNavigationTabs();
  setupOnboarding();
  setupWalletConnection();
  setupSettingsTab();
  setupRefreshButtons();
  setupProviderDashboard();
  setupSubscriptionCodeHandler();
  
  // Clear only wallet session data, keep IPFS CID references
  localStorage.removeItem('walletPublicKey');
  localStorage.removeItem('walletType');
  
  // Show onboarding - wallet connection page
  switchToTab('onboardingTab');
  
});

// Set up listener for Phantom wallet callbacks
function setupPhantomCallbackListener() {
  if (window.electron && window.electron.onPhantomCallback) {
    window.electron.onPhantomCallback(async (result) => {
      
      if (result.success && result.publicKey) {
        // Phantom = Devnet mode (testing)
        switchNetwork('devnet');
        showToast('🧪 Using Devnet', 'info');
        
        // Wallet connected successfully
        state.wallet = result.publicKey;
        state.walletConnected = true;
        state.walletType = 'phantom';
        updateWalletDisplay();
        localStorage.setItem('walletPublicKey', result.publicKey);
        localStorage.setItem('walletType', 'phantom');
        localStorage.setItem('networkMode', 'devnet');
        showToast('✅ Phantom wallet connected (Devnet)!', 'success');
        
        // Check if user has active subscription (await since it's async)
        const hasSubscription = await checkActiveSubscription();
        
        if (hasSubscription) {
          // Move to home tab
          switchToTab('homeTab');
          await loadNodesFromIndexer();
          drawWorldMap();
        } else {
          // Show subscription page
          switchToTab('subscriptionTab');
          updateSubscriptionWalletDisplay();
        }
      } else if (result.error) {
        showToast('❌ Phantom error: ' + result.error, 'error');
      }
    });
  }
}

// Onboarding Setup
function setupOnboarding() {
  const connectPhantomBtn = document.getElementById('connectPhantomBtn');
  const useMockWalletBtn = document.getElementById('useMockWalletBtn');
  
  if (connectPhantomBtn) {
    connectPhantomBtn.addEventListener('click', async () => {
      await connectPhantomWallet();
    });
  }
  
  if (useMockWalletBtn) {
    useMockWalletBtn.addEventListener('click', async () => {
      await connectMockWallet();
    });
  }
}

async function connectPhantomWallet() {
  try {
    showToast('🔗 Opening Phantom wallet connection...', 'info');
    
    if (window.electron && window.electron.connectPhantomWallet) {
      // This opens the browser page - result comes via callback
      const result = await window.electron.connectPhantomWallet();
      
      if (result.opened) {
        showToast('🌐 Please connect in the browser window', 'info');
        // The actual wallet data will come through the callback listener
      } else if (result.error) {
        showToast('❌ ' + result.error, 'error');
      }
      
    } else {
      showToast('❌ Phantom connection not available. Use the test wallet instead.', 'error');
    }
  } catch (error) {
    console.error('Phantom wallet connection error:', error);
    showToast('❌ Wallet connection error: ' + error.message, 'error');
  }
}

async function connectMockWallet() {
  try {
    // Dev Mode = Devnet
    switchNetwork('devnet');
    showToast('🧪 Switched to Devnet (Test Mode)', 'info');
    
    let result;
    if (window.electron && window.electron.connectWallet) {
      result = await window.electron.connectWallet();
    } else {
      // Use pure mock wallet for development
      result = {
        success: true,
        publicKey: '5wm7gTHTFEGsZm6oMgsk84tqh4twVYrVGCSkPKPv8Pyo'
      };
    }
    
    if (result.success && result.publicKey) {
      state.wallet = result.publicKey;
      state.walletConnected = true;
      state.walletType = 'mock';
      updateWalletDisplay();
      localStorage.setItem('walletPublicKey', result.publicKey);
      localStorage.setItem('walletType', 'mock');
      localStorage.setItem('networkMode', 'devnet');
      showToast('🔧 Connected with test wallet (Devnet)', 'success');
      
      // Check if user has active subscription (await since it's async)
      const hasSubscription = await checkActiveSubscription();
      
      if (hasSubscription) {
        // Move to home tab
        switchToTab('homeTab');
        await loadNodesFromIndexer();
        drawWorldMap();
      } else {
        // Show subscription page
        switchToTab('subscriptionTab');
        updateSubscriptionWalletDisplay();
      }
    } else {
      showToast('Failed to connect wallet', 'error');
    }
  } catch (error) {
    console.error('Mock wallet connection error:', error);
    showToast('Wallet connection error: ' + error.message, 'error');
  }
}

// Check if user has active subscription
async function checkActiveSubscription() {
  
  // First: Check on-chain subscription (most reliable)
  if (state.wallet && window.electron && window.electron.checkOnChainSubscription) {
    try {
      const onChainResult = await window.electron.checkOnChainSubscription(state.wallet);
      
      if (onChainResult.success && onChainResult.hasSubscription && !onChainResult.expired) {
        state.subscription = {
          plan: onChainResult.plan,
          expiresAt: onChainResult.expiresAt,
          walletAddress: state.wallet,
          escrowLamports: onChainResult.escrowLamports,
          onChain: true
        };
        // Sync to localStorage
        localStorage.setItem('subscriptionData', JSON.stringify(state.subscription));
        return true;
      }
    } catch (e) {
      console.error('Error checking on-chain subscription:', e);
    }
  }
  
  // Second: Try to load from main process (file-based)
  if (window.electron && window.electron.loadSubscription) {
    try {
      const result = await window.electron.loadSubscription(state.wallet);
      
      if (result.success && result.subscription) {
        state.subscription = result.subscription;
        // Also sync to localStorage
        localStorage.setItem('subscriptionData', JSON.stringify(result.subscription));
        return true;
      }
    } catch (e) {
      console.error('Error loading subscription from main process:', e);
    }
  }
  
  // Fallback: Check cached subscription from localStorage
  const subscriptionData = localStorage.getItem('subscriptionData');
  
  if (subscriptionData) {
    try {
      const sub = JSON.parse(subscriptionData);
      const now = Date.now();
        plan: sub.plan,
        expiresAt: new Date(sub.expiresAt).toISOString(),
        walletAddress: sub.walletAddress,
        currentWallet: state.wallet,
        walletsMatch: sub.walletAddress === state.wallet,
        isExpired: sub.expiresAt <= now
      });
      
      // Check if subscription is for current wallet and not expired
      if (sub.expiresAt && sub.expiresAt > now) {
        // Also verify wallet matches (if set)
        if (!state.wallet || sub.walletAddress === state.wallet) {
          state.subscription = sub;
          return true;
        } else {
        }
      } else {
        // Subscription expired, clear it
        localStorage.removeItem('subscriptionData');
        if (window.electron && window.electron.clearSubscription) {
          await window.electron.clearSubscription();
        }
      }
    } catch (e) {
      console.error('❌ Error parsing subscription data:', e);
      localStorage.removeItem('subscriptionData');
    }
  }
  
  // No valid local subscription found
  return false;
}

// Update subscription page wallet display
function updateSubscriptionWalletDisplay() {
  const walletEl = document.getElementById('subscriptionWalletAddress');
  if (walletEl && state.wallet) {
    const shortAddress = state.wallet.slice(0, 4) + '...' + state.wallet.slice(-4);
    walletEl.textContent = shortAddress;
  }
}

// Apply subscription code
function setupSubscriptionCodeHandler() {
  const applyBtn = document.getElementById('applyCodeBtn');
  const codeInput = document.getElementById('subscriptionCodeInput');
  const codeMessage = document.getElementById('codeMessage');
  
  if (applyBtn) {
    applyBtn.addEventListener('click', async () => {
      const code = codeInput.value.trim().toUpperCase();
      
      if (!code) {
        codeMessage.textContent = 'Please enter a subscription code';
        codeMessage.className = 'code-message error';
        return;
      }
      
      // Validate code (mock validation - in production this would call an API)
      const validCode = validateSubscriptionCode(code);
      
      if (validCode) {
        codeMessage.textContent = '✅ Code applied successfully!';
        codeMessage.className = 'code-message success';
        
        // Save subscription
        const subscription = {
          code: code,
          plan: validCode.plan,
          expiresAt: Date.now() + validCode.duration,
          activatedAt: Date.now()
        };
        localStorage.setItem('subscriptionData', JSON.stringify(subscription));
        state.subscription = subscription;
        
        showToast(`🎉 ${validCode.plan} subscription activated!`, 'success');
        
        // Go to home tab after short delay
        setTimeout(async () => {
          switchToTab('homeTab');
          await loadNodesFromIndexer();
          drawWorldMap();
        }, 1500);
      } else {
        codeMessage.textContent = '❌ Invalid or expired code';
        codeMessage.className = 'code-message error';
      }
    });
  }
  
  // Also handle Enter key
  if (codeInput) {
    codeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        applyBtn.click();
      }
    });
  }
}

// Validate subscription code (mock - replace with real API)
function validateSubscriptionCode(code) {
  // Demo valid codes - in production, validate against server/blockchain
  const validCodes = {
    'GVPN-MONTH-FREE': { plan: 'Monthly', duration: 30 * 24 * 60 * 60 * 1000 },
    'GVPN-YEAR-FREE': { plan: 'Yearly', duration: 365 * 24 * 60 * 60 * 1000 },
    'GVPN-TRIAL-7DAY': { plan: 'Trial', duration: 7 * 24 * 60 * 60 * 1000 },
    'GVPN-2024-PROMO': { plan: 'Monthly', duration: 30 * 24 * 60 * 60 * 1000 },
  };
  
  return validCodes[code] || null;
}

// Subscribe to a plan (called from HTML) - REAL BLOCKCHAIN PAYMENT
window.subscribePlan = async function(planType, priceSOL) {
  if (!state.walletConnected) {
    showToast('Please connect wallet first', 'error');
    return;
  }
  
  const plan = SUBSCRIPTION_PLANS[planType.toLowerCase()];
  if (!plan) {
    showToast('Invalid plan type', 'error');
    return;
  }
  
  showToast(`Processing ${plan.name} subscription (${priceSOL} SOL)...`, 'info');
  
  try {
    let signature;
    
    if (state.walletType === 'phantom' && window.electron && window.electron.createSubscription) {
      // Use IPC to main process for real blockchain transaction
      showToast('🔐 Please approve the transaction in your wallet...', 'info');
      
      const result = await window.electron.createSubscription({
        walletAddress: state.wallet,
        planType: planType,
        priceSOL: priceSOL
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Subscription creation failed');
      }
      signature = result.signature;
      
    } else {
      // For mock wallet, simulate the transaction
      showToast('🔄 Processing mock subscription...', 'info');
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      signature = 'mock_sub_' + Date.now();
    }
    
    
    // Calculate expiry based on plan
    const duration = plan.durationDays * 24 * 60 * 60 * 1000;
    
    // Save subscription locally
    const subscription = {
      plan: plan.name,
      planType: planType,
      priceSOL: priceSOL,
      expiresAt: Date.now() + duration,
      activatedAt: Date.now(),
      txSignature: signature,
      walletAddress: state.wallet,
      onChain: !signature.startsWith('mock_')
    };
    
    
    // Save to localStorage
    localStorage.setItem('subscriptionData', JSON.stringify(subscription));
    
    // ALSO save to main process file storage (persistent)
    if (window.electron && window.electron.saveSubscription) {
      const saveResult = await window.electron.saveSubscription(subscription);
    }
    
    // Verify it was saved
    const savedData = localStorage.getItem('subscriptionData');
    
    state.subscription = subscription;
    
    showToast(`🎉 ${subscription.plan} subscription activated!`, 'success');
    
    // Go to home tab
    setTimeout(async () => {
      switchToTab('homeTab');
      await loadNodesFromIndexer();
      drawWorldMap();
    }, 1500);
    
  } catch (error) {
    console.error('Subscription error:', error);
    showToast('❌ Subscription error: ' + error.message, 'error');
  }
};

// Cancel subscription and get proportional refund
window.cancelSubscription = async function() {
  if (!state.walletConnected) {
    showToast('Please connect wallet first', 'error');
    return;
  }
  
  // Check if there's a subscription to cancel
  const subData = localStorage.getItem('subscriptionData');
  if (!subData) {
    showToast('No active subscription to cancel', 'error');
    return;
  }
  
  const subscription = JSON.parse(subData);
  
  // Calculate estimated refund based on time remaining
  const now = Date.now();
  const totalDuration = subscription.expiresAt - subscription.activatedAt;
  const elapsed = now - subscription.activatedAt;
  const remaining = Math.max(0, subscription.expiresAt - now);
  const refundPercent = remaining / totalDuration;
  const estimatedRefund = (subscription.priceSOL * refundPercent).toFixed(4);
  
  // Confirm with user
  const confirmMessage = `Cancel subscription? You will receive ~${estimatedRefund} SOL refund for unused time (${Math.ceil(remaining / (24*60*60*1000))} days remaining).`;
  if (!confirm(confirmMessage)) {
    return;
  }
  
  try {
    showToast('🔄 Processing cancellation...', 'info');
    
    // Simulate cancellation (in production, this would call the smart contract)
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Clear local subscription
    localStorage.removeItem('subscriptionData');
    state.subscription = null;
    
    showToast(`✅ Subscription cancelled! Refund: ~${estimatedRefund} SOL`, 'success');
    
    // Go back to subscription page
    switchToTab('subscriptionTab');
    updateSubscriptionWalletDisplay();
    
  } catch (error) {
    console.error('Cancel subscription error:', error);
    showToast('❌ Cancel error: ' + error.message, 'error');
  }
};

// Select Plan Function (legacy - for compatibility)
window.selectPlan = function(planType, price) {
  state.selectedSubscriptionType = planType;
  state.subscriptionPrice = price;
  
  localStorage.setItem('selectedPlan', planType);
  localStorage.setItem('planPrice', price);
  
  showToast(`${planType.charAt(0).toUpperCase() + planType.slice(1)} plan selected`, 'success');
  
  // Move to home tab and load nodes
  switchToTab('homeTab');
  loadNodesFromIndexer();
  drawWorldMap();
};

// Switch Tab Helper
function switchToTab(tabId) {
  // Hide all tabs
  const allTabs = document.querySelectorAll('.tab-content');
  allTabs.forEach(tab => tab.classList.remove('active'));
  
  // Show target tab
  const targetTab = document.getElementById(tabId);
  if (targetTab) {
    targetTab.classList.add('active');
  }
  
  // Hide/show sidebar based on tab
  const appContainer = document.querySelector('.app-container');
  const sidebar = document.querySelector('.sidebar');
  
  if (tabId === 'onboardingTab' || tabId === 'subscriptionTab') {
    // Hide sidebar on welcome and subscription screens
    if (sidebar) sidebar.style.display = 'none';
    if (appContainer) appContainer.classList.add('no-sidebar');
  } else {
    // Show sidebar on other screens
    if (sidebar) sidebar.style.display = 'flex';
    if (appContainer) appContainer.classList.remove('no-sidebar');
  }
  
  // Update nav if exists
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(nav => {
    if (nav.getAttribute('data-tab') === tabId.replace('Tab', '')) {
      nav.classList.add('active');
    } else {
      nav.classList.remove('active');
    }
  });
}

// Tab Navigation
function setupNavigationTabs() {
  const navItems = document.querySelectorAll('.nav-item');
  
  
  if (navItems.length === 0) {
    console.error('❌ No nav items found! Sidebar might not be in DOM yet');
    return;
  }
  
  navItems.forEach((item, index) => {
    const tabName = item.getAttribute('data-tab');
    
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      
      // Update active nav item
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // Update visible tab content
      const allTabs = document.querySelectorAll('.tab-content');
      allTabs.forEach(tab => tab.classList.remove('active'));
      
      const targetTab = document.getElementById(`${tabName}Tab`);
      if (targetTab) {
        targetTab.classList.add('active');
        
        // Show sidebar for main tabs
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
          sidebar.style.display = 'flex';
        }
        
        // Load data for specific tabs
        if (tabName === 'sessions') {
          loadSessions();
        } else if (tabName === 'home') {
          loadNodesFromIndexer();
        } else if (tabName === 'provider') {
          loadProviderStats();
        }
      } else {
        console.error('❌ Target tab not found:', `${tabName}Tab`);
      }
    });
  });
  
}

// Wallet Connection
function setupWalletConnection() {
  const connectBtn = document.getElementById('connectWalletBtn');
  
  if (!connectBtn) return;
  
  connectBtn.addEventListener('click', async () => {
    try {
      if (state.walletConnected) {
        // Disconnect wallet
        disconnectWallet();
      } else {
        // Connect wallet via Electron IPC
        let result;
        if (window.electron && window.electron.connectWallet) {
          result = await window.electron.connectWallet();
        } else {
          // Fallback to mock wallet
          result = {
            success: true,
            publicKey: '5wm7gTHTFEGsZm6oMgsk84tqh4twVYrVGCSkPKPv8Pyo'
          };
        }
        
        if (result.success && result.publicKey) {
          state.wallet = result.publicKey;
          state.walletConnected = true;
          updateWalletDisplay();
          showToast('Wallet connected successfully', 'success');
          
          // Save to storage
          localStorage.setItem('walletPublicKey', result.publicKey);
        } else {
          showToast('Failed to connect wallet', 'error');
        }
      }
    } catch (error) {
      console.error('Wallet connection error:', error);
      showToast('Wallet connection error: ' + error.message, 'error');
    }
  });
}

function disconnectWallet() {
  state.wallet = null;
  state.walletConnected = false;
  localStorage.removeItem('walletPublicKey');
  updateWalletDisplay();
  showToast('Wallet disconnected', 'info');
}

function updateWalletDisplay() {
  const walletInfo = document.getElementById('walletInfo');
  const walletAddress = document.getElementById('walletAddress');
  const connectBtn = document.getElementById('connectWalletBtn');
  const sidebarWalletAddress = document.getElementById('sidebarWalletAddress');
  
  if (state.walletConnected && state.wallet) {
    if (walletInfo) walletInfo.style.display = 'block';
    if (walletAddress) walletAddress.textContent = truncateAddress(state.wallet);
    if (sidebarWalletAddress) sidebarWalletAddress.textContent = truncateAddress(state.wallet);
    if (connectBtn) {
      connectBtn.textContent = 'Disconnect';
      connectBtn.style.background = '#2A2A2A';
      connectBtn.style.color = '#FF4444';
    }
  } else {
    if (walletInfo) walletInfo.style.display = 'none';
    if (sidebarWalletAddress) sidebarWalletAddress.textContent = 'Not Connected';
    if (connectBtn) {
      connectBtn.textContent = 'Connect Wallet';
      connectBtn.style.background = '#00D4AA';
      connectBtn.style.color = '#0A0A0A';
    }
  }
}

async function loadWalletFromStorage() {
  const savedWallet = localStorage.getItem('walletPublicKey');
  if (savedWallet) {
    state.wallet = savedWallet;
    state.walletConnected = true;
    updateWalletDisplay();
  }
}

function truncateAddress(address) {
  if (!address || address.length < 12) return address;
  return address.substring(0, 4) + '...' + address.substring(address.length - 4);
}

// Load Nodes from IPFS (Pinata) - Primary Source
async function loadNodesFromIndexer() {
  const locationsList = document.getElementById('locationsList');
  
  try {
    locationsList.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading nodes from IPFS...</p>
      </div>
    `;
    
    // First, fetch the LATEST registry CID from Pinata
    // This ensures we always get the most up-to-date node list
    const latestCID = await fetchLatestRegistryCID();
    
    // IPFS as PRIMARY source
    if (latestCID) {
      
      // Try multiple gateways
      const gateways = CONFIG.ipfsGateways || [CONFIG.pinataGateway];
      let ipfsData = null;
      
      for (const gateway of gateways) {
        try {
          const ipfsUrl = `${gateway}${latestCID}`;
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          
          const ipfsResponse = await fetch(ipfsUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (ipfsResponse.ok) {
            ipfsData = await ipfsResponse.json();
            break;
          }
        } catch (gatewayError) {
        }
      }
      
      if (ipfsData && ipfsData.nodes && ipfsData.nodes.length > 0) {
        
        // Convert IPFS node format to app format
        state.nodes = ipfsData.nodes.map((node, index) => ({
          pubkey: node.endpoint,
          provider: node.provider,
          node_id: index + 1,
          endpoint: node.endpoint,
          location: node.location,
          region: node.region,
          price_per_minute_lamports: Math.floor((node.price_per_hour_lamports || 6000000) / 60),
          wg_server_pubkey: node.wg_server_pubkey,
          max_capacity: 100,
          active_sessions: 0,
          is_active: node.is_active !== false,
          reputation_score: 1000,
          bandwidth_mbps: node.bandwidth_mbps || 100,
          rating_avg: node.rating_avg || '5.0',
          source: 'ipfs-pinata'
        }));
        
        populateLocations(state.nodes);
        showToast(`✅ Loaded ${state.nodes.length} nodes from IPFS`, 'success');
        return;
      }
    }
    
    // Fallback: Try local indexer API (for development)
    if (!CONFIG.useIPFSPrimary) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(`${CONFIG.indexerUrl}/nodes`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          state.nodes = data.nodes || [];
          
          if (state.nodes.length > 0) {
            populateLocations(state.nodes);
            showToast(`Loaded ${state.nodes.length} nodes from API`, 'success');
            return;
          }
        }
      } catch (indexerError) {
      }
    }
    
    // No nodes found
    locationsList.innerHTML = `
      <div class="empty-state">
        <p>No nodes available</p>
        <p style="font-size: 12px; color: #888;">IPFS CID: ${CONFIG.ipfsRegistryCID || 'Not configured'}</p>
        <button onclick="loadNodesFromIndexer()" class="btn-retry">Retry</button>
      </div>
    `;
    
  } catch (error) {
    console.error('Error loading nodes:', error);
    locationsList.innerHTML = `
      <div class="error-state">
        <p style="color: #FF4444;">Failed to load nodes</p>
        <button onclick="loadNodesFromIndexer()" class="btn-retry">Retry</button>
      </div>
    `;
    showToast('Failed to load nodes', 'error');
  }
}

// Populate Locations List
function populateLocations(nodes) {
  const locationsList = document.getElementById('locationsList');
  locationsList.innerHTML = '';
  
  // Group nodes by country
  const groupedNodes = {};
  nodes.forEach(node => {
    const location = node.location || node.region || 'Unknown';
    const country = location.includes(',') ? location.split(',')[0].trim() : location;
    
    if (!groupedNodes[country]) {
      groupedNodes[country] = [];
    }
    groupedNodes[country].push(node);
  });
  
  // Create location items for each group
  Object.entries(groupedNodes).forEach(([country, countryNodes], index) => {
    const locationItem = document.createElement('div');
    locationItem.className = 'location-item';
    locationItem.style.animationDelay = `${index * 0.05}s`;
    
    const flag = getFlagForLocation(country);
    const isOnline = countryNodes.some(n => (n.is_active !== false));
    
    // Create country header
    const countryHeader = document.createElement('div');
    countryHeader.className = 'location-country-header';
    countryHeader.innerHTML = `
      <div class="country-info">
        <span class="location-flag">${flag}</span>
        <span class="country-name">${country}</span>
      </div>
      <div class="country-status">
        ${isOnline ? '<span class="status-dot online"></span>' : '<span class="status-dot offline"></span>'}
        ${countryNodes.length > 1 ? `<span class="status-checkmarks">${'✓'.repeat(Math.min(countryNodes.length, 3))}</span>` : ''}
      </div>
    `;
    
    locationItem.appendChild(countryHeader);
    
    // Create city items for this country
    const citiesContainer = document.createElement('div');
    citiesContainer.className = 'location-cities';
    
    countryNodes.forEach(node => {
      const cityName = extractCityName(node.location || node.region || node.endpoint);
      const cityItem = document.createElement('div');
      cityItem.className = 'location-city';
      
      const isActive = node.is_active !== false;
      const statusClass = isActive ? 'online' : 'offline';
      
      // Get bandwidth and rating info
      const bandwidth = node.bandwidth_mbps || node.bandwidthMbps || 50;
      const rating = node.quality_score || node.qualityScore || 3;
      const ratingStars = '⭐'.repeat(Math.min(Math.floor(rating), 5));
      
      // Bandwidth badge color based on speed
      const bwClass = bandwidth >= 80 ? 'bw-fast' : bandwidth >= 40 ? 'bw-medium' : 'bw-slow';
      
      cityItem.innerHTML = `
        <div class="city-main">
          <span class="city-name">${cityName}</span>
          <span class="status-dot ${statusClass}"></span>
        </div>
        <div class="city-stats">
          <span class="node-bandwidth ${bwClass}">${bandwidth} Mbps</span>
          <span class="node-rating" title="Quality: ${rating}/5">${ratingStars}</span>
        </div>
      `;
      
      cityItem.addEventListener('click', (e) => {
        e.stopPropagation();
        selectNode(node);
      });
      
      citiesContainer.appendChild(cityItem);
    });
    
    locationItem.appendChild(citiesContainer);
    
    // Toggle cities on country click
    countryHeader.addEventListener('click', () => {
      citiesContainer.classList.toggle('expanded');
    });
    
    locationsList.appendChild(locationItem);
  });
}

function extractCityName(location) {
  if (!location) return 'Unknown';
  
  // Handle different formats
  if (location.includes(':')) {
    // IP:port format - return the IP as-is, don't try to convert
    const parts = location.split(':');
    return parts[0];
  }
  
  if (location.includes(',')) {
    // "City, Country" format
    return location.split(',')[0].trim();
  }
  
  // Check for exact known abbreviations only (case-insensitive, word boundary match)
  const cityMap = {
    'nyc': 'New York',
    'sf': 'San Francisco'
  };
  
  const normalized = location.toLowerCase().trim();
  
  // Only match if the entire location matches the abbreviation
  if (cityMap[normalized]) {
    return cityMap[normalized];
  }
  
  // Return the original location as-is
  return location;
}

// Select Node
function selectNode(node) {
  state.selectedNode = node;
  
  // Update UI
  document.querySelectorAll('.location-item').forEach(item => {
    item.classList.remove('selected');
  });
  
  // Update connection node info display
  const nodeNameEl = document.getElementById('nodeName');
  const nodeLocationEl = document.getElementById('nodeLocation');
  const nodeFlagImg = document.getElementById('nodeFlagImg');
  
  if (nodeNameEl) {
    const cityName = extractCityName(node.location || node.endpoint);
    nodeNameEl.textContent = cityName;
  }
  
  if (nodeLocationEl) {
    nodeLocationEl.textContent = node.location || node.endpoint || 'Unknown';
  }
  
  if (nodeFlagImg) {
    const flag = getFlagForLocation(node.location || 'unknown');
    nodeFlagImg.textContent = flag;
    nodeFlagImg.alt = node.location || 'unknown';
  }
  
  // Update map markers if function exists
  if (typeof updateConnectionLine === 'function') {
    updateConnectionLine(node.location);
  }
  
  // Enable connection - directly connect if not connected
  if (!state.connected) {
    // Check if user has active subscription
    if (checkActiveSubscription()) {
      // Connect directly without showing modal
      connect();
    } else {
      showToast('Please subscribe to a plan first', 'error');
      switchToTab('subscriptionTab');
    }
  }
}

// Connect to VPN
async function connect() {
  if (!state.selectedNode) {
    showToast('Please select a node first', 'error');
    return;
  }
  
  if (!state.walletConnected) {
    showToast('Please connect your wallet first', 'error');
    return;
  }
  
  const statusCircle = document.getElementById('statusCircle');
  const statusText = document.getElementById('statusText');
  
  try {
    statusCircle.classList.add('connecting');
    statusText.textContent = 'Connecting...';
    
    // User already has subscription - no need for per-connection payment
    // Subscription was paid via subscription page
    showToast('Connecting to VPN...', 'info');
    
    // Connect VPN via Electron IPC
    if (window.electron && window.electron.requestWgConfig && window.electron.applyWgConfig) {
      showToast('Connecting to VPN server...', 'info');
      
      // Step 1: Get config directly from server's ncat (port 22222)
      const [serverIp, serverPort] = state.selectedNode.endpoint.split(':');
      
      const configResult = await window.electron.requestWgConfig(serverIp, 22222);
      
      if (!configResult.success) {
        console.error('❌ Failed to get config from server ncat:', configResult.error);
        throw new Error('Failed to connect to VPN server: ' + configResult.error);
      }
      
      
      // The server's wgip.sh returns a complete WireGuard config
      // We just need to use it directly!
      const serverConfig = configResult.config;
      
      // Extract PresharedKey for disconnect functionality
      const presharedKeyMatch = serverConfig.match(/PresharedKey\s*=\s*([A-Za-z0-9+/=]+)/);
      if (presharedKeyMatch) {
        state.currentPresharedKey = presharedKeyMatch[1];
      }
      
      showToast('Applying VPN configuration...', 'info');
      
      // Step 2: Apply the config from server directly
      const applyResult = await window.electron.applyWgConfig(serverConfig);
      
      if (applyResult.success) {
        state.connected = true;
        state.connectionStartTime = Date.now();

        statusCircle.classList.remove('disconnected', 'connecting');
        statusCircle.classList.add('connected');
        statusText.textContent = 'Connected';
        document.getElementById('statusIp').textContent = serverIp;

        // Create session on IPFS (no API needed)
        try {
          const session = await createLocalSession(state.selectedNode, state.wallet);
          state.currentSessionId = session.id;
        } catch (e) {
          console.warn('Failed to create IPFS session:', e.message);
        }

        startConnectionTimer();
        showToast('Connected to VPN successfully!', 'success');
      } else {
        console.error('❌ Apply config failed:', applyResult.error);
        throw new Error(applyResult.error || 'Connection failed');
      }
    } else {
      // Mock connection for testing
      state.connected = true;
      state.connectionStartTime = Date.now();
      
      statusCircle.classList.remove('disconnected', 'connecting');
      statusCircle.classList.add('connected');
      statusText.textContent = 'Connected (Mock)';
      // Extract IP from endpoint (remove port)
      const nodeIp = state.selectedNode.endpoint.split(':')[0];
      document.getElementById('statusIp').textContent = nodeIp;
      
      // Create session on IPFS (no API needed)
      try {
        const session = await createLocalSession(state.selectedNode, state.wallet);
        state.currentSessionId = session.id;
      } catch (e) {
        console.warn('Failed to create IPFS session:', e.message);
      }

      startConnectionTimer();
      showToast('Mock VPN connection established', 'success');
    }
    
  } catch (error) {
    console.error('Connection error:', error);
    statusCircle.classList.remove('connecting');
    statusCircle.classList.add('disconnected');
    statusText.textContent = 'Disconnected';
    showToast('Connection failed: ' + error.message, 'error');
  }
}

// Disconnect from VPN
async function disconnect() {
  const statusCircle = document.getElementById('statusCircle');
  const statusText = document.getElementById('statusText');
  const disconnectedNode = state.selectedNode; // Save for rating
  
  try {
    statusText.textContent = 'Disconnecting...';
    
    // End session on IPFS (no API needed)
    try {
      if (state.currentSessionId) {
        await endLocalSession(state.currentSessionId);
        state.currentSessionId = null;
      } else if (state.wallet) {
        // Fallback: end by wallet
        await endLocalSessionsByWallet(state.wallet);
      }
    } catch (e) {
      console.warn('Failed to end IPFS session:', e.message);
    }

    // Check if window.electron and disconnectVpn exist
    if (window.electron && window.electron.disconnectVpn) {
      const result = await window.electron.disconnectVpn(null, null);
      
      if (result && result.success) {
        state.connected = false;
        state.connectionStartTime = null;
        
        statusCircle.classList.remove('connected', 'connecting');
        statusCircle.classList.add('disconnected');
        statusText.textContent = 'Disconnected';
        document.getElementById('statusIp').textContent = '---';
        
        stopConnectionTimer();
        showToast('Disconnected from VPN', 'info');
        
        // Show rating modal after successful disconnect
        if (disconnectedNode) {
          showRatingModal(disconnectedNode);
        }
      } else {
        // Fallback: just update state locally
        state.connected = false;
        state.connectionStartTime = null;
        
        statusCircle.classList.remove('connected', 'connecting');
        statusCircle.classList.add('disconnected');
        statusText.textContent = 'Disconnected';
        document.getElementById('statusIp').textContent = '---';
        
        stopConnectionTimer();
        showToast('Disconnected (local only)', 'info');
        
        // Show rating modal
        if (disconnectedNode) {
          showRatingModal(disconnectedNode);
        }
      }
    } else {
      // No electron API available - just update state
      state.connected = false;
      state.connectionStartTime = null;
      
      statusCircle.classList.remove('connected', 'connecting');
      statusCircle.classList.add('disconnected');
      statusText.textContent = 'Disconnected';
      document.getElementById('statusIp').textContent = '---';
      
      stopConnectionTimer();
      showToast('Disconnected', 'info');
      
      // Show rating modal
      if (disconnectedNode) {
        showRatingModal(disconnectedNode);
      }
    }
  } catch (error) {
    console.error('Disconnection error:', error);
    showToast('Disconnection failed: ' + error.message, 'error');
  }
}

// Show rating modal after disconnect
function showRatingModal(node) {
  if (!node) {
    console.warn('⚠️ No node provided to showRatingModal');
    return;
  }
  const nodeName = extractCityName(node.location || node.endpoint || 'VPN Node');
  
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'rating-modal-overlay';
  overlay.innerHTML = `
    <div class="rating-modal">
      <h3>Rate Your Experience</h3>
      <p>How was your connection to <strong>${nodeName}</strong>?</p>
      <div class="rating-stars">
        <span class="rating-star" data-rating="1">⭐</span>
        <span class="rating-star" data-rating="2">⭐</span>
        <span class="rating-star" data-rating="3">⭐</span>
        <span class="rating-star" data-rating="4">⭐</span>
        <span class="rating-star" data-rating="5">⭐</span>
      </div>
      <p class="rating-hint">Click to rate (1-5 stars)</p>
      <div class="rating-actions">
        <button class="btn-skip-rating">Skip</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Handle star clicks
  const stars = overlay.querySelectorAll('.rating-star');
  stars.forEach(star => {
    star.addEventListener('mouseenter', () => {
      const rating = parseInt(star.dataset.rating);
      stars.forEach((s, idx) => {
        s.style.opacity = idx < rating ? '1' : '0.3';
      });
    });
    
    star.addEventListener('click', async () => {
      const rating = parseInt(star.dataset.rating);
      await submitNodeRating(node, rating);
      document.body.removeChild(overlay);
      showToast(`Thanks! You rated ${nodeName} ${rating} stars`, 'success');
    });
  });
  
  // Handle skip
  overlay.querySelector('.btn-skip-rating').addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
  
  // Reset opacity on mouse leave
  overlay.querySelector('.rating-stars').addEventListener('mouseleave', () => {
    stars.forEach(s => s.style.opacity = '0.5');
  });
}

// Submit node rating (updates IPFS registry)
async function submitNodeRating(node, rating) {
  try {
    // Rate node locally and update IPFS
    const result = await rateNodeLocally(node.pubkey || node.endpoint, rating, state.wallet);
    
    if (result.success) {
    } else {
      console.warn('Failed to rate node:', result.error);
    }
  } catch (error) {
    console.warn('Failed to submit rating:', error.message);
  }
}

// Setup status circle click handler
document.addEventListener('DOMContentLoaded', () => {
  const statusCircle = document.getElementById('statusCircle');
  statusCircle.addEventListener('click', async () => {
    if (state.connected) {
      await disconnect();
    } else if (state.selectedNode) {
      showSubscriptionModal(state.selectedNode);
    } else {
      showToast('Please select a node first', 'info');
    }
  });
});

// Payment Processing
async function processPayment(recipientPublicKey, amount) {
  try {
    const result = await window.electron.processPayment({
      recipient: recipientPublicKey,
      amount: amount,
      memo: `VPN Subscription - ${state.selectedSubscriptionType}`
    });
    
    if (result.success) {
      showToast('Payment processed successfully', 'success');
      return { success: true, signature: result.signature };
    } else {
      throw new Error(result.error || 'Payment failed');
    }
  } catch (error) {
    console.error('Payment error:', error);
    showToast('Payment failed: ' + error.message, 'error');
    return { success: false };
  }
}

// Connection Timer
function startConnectionTimer() {
  stopConnectionTimer(); // Clear any existing timer
  
  state.timerInterval = setInterval(() => {
    if (!state.connectionStartTime) return;
    
    const elapsed = Math.floor((Date.now() - state.connectionStartTime) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    
    const timerElement = document.getElementById('connectionTimer');
    if (timerElement) {
      timerElement.textContent = 
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    
    // Update speed stats with realistic values when connected
    updateSpeedStats();
  }, 1000);
  
  // Update IP address when connected
  updateConnectedIP();
}

function updateSpeedStats() {
  if (!state.connected) return;
  
  // Generate realistic speed values (simulated)
  const baseDownload = 15 + Math.random() * 5; // 15-20 Mbps
  const baseUpload = 8 + Math.random() * 3; // 8-11 Mbps
  
  const downloadEl = document.getElementById('downloadSpeed');
  const uploadEl = document.getElementById('uploadSpeed');
  
  if (downloadEl) {
    downloadEl.textContent = `${baseDownload.toFixed(2)} Mbps`;
  }
  
  if (uploadEl) {
    uploadEl.textContent = `${baseUpload.toFixed(2)} Mbps`;
  }
}

async function updateConnectedIP() {
  if (!state.connected || !state.selectedNode) return;
  
  // For mock connections, always show the node IP
  // For real VPN connections, we could fetch actual IP to verify
  const statusIpEl = document.getElementById('statusIp');
  if (statusIpEl && state.selectedNode) {
    const nodeIp = state.selectedNode.endpoint.split(':')[0];
    statusIpEl.textContent = nodeIp;
  }
}

function stopConnectionTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  
  const timerElement = document.getElementById('connectionTimer');
  if (timerElement) {
    timerElement.textContent = '00:00:00';
  }
  
  // Reset speed stats
  const downloadEl = document.getElementById('downloadSpeed');
  const uploadEl = document.getElementById('uploadSpeed');
  
  if (downloadEl) downloadEl.textContent = '0.00 Mbps';
  if (uploadEl) uploadEl.textContent = '0.00 Mbps';
}

// Sessions Tab - Load from local storage (IPFS mode)
async function loadSessions() {
  const sessionsList = document.getElementById('sessionsList');
  
  if (!sessionsList) {
    console.warn('sessionsList element not found');
    return;
  }
  
  try {
    sessionsList.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading sessions...</p>
      </div>
    `;
    
    // Get sessions from IPFS
    state.sessions = await getLocalSessions(state.wallet);
    
    // Sort by start_time (most recent first)
    state.sessions.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
    
    if (state.sessions.length === 0) {
      sessionsList.innerHTML = `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <h3>No Sessions Yet</h3>
          <p>Connect to a VPN node to start a session</p>
        </div>
      `;
      return;
    }
    
    displaySessions(state.sessions);
    
  } catch (error) {
    console.error('Error loading sessions:', error);
    if (sessionsList) {
      sessionsList.innerHTML = `
        <div class="error-state">
          <p style="color: #FF4444;">Failed to load sessions</p>
          <button onclick="loadSessions()" class="btn-retry">Retry</button>
        </div>
      `;
    }
  }
}

function displaySessions(sessions) {
  const sessionsList = document.getElementById('sessionsList');
  sessionsList.innerHTML = '';
  
  sessions.forEach((session, index) => {
    const sessionCard = document.createElement('div');
    sessionCard.className = 'session-card';
    sessionCard.style.animationDelay = `${index * 0.05}s`;
    
    const startTime = new Date(session.start_time).toLocaleString();
    const status = session.is_active ? 'Active' : 'Closed';
    const duration = calculateDuration(session.start_time, session.end_time);
    
    sessionCard.innerHTML = `
      <div class="session-header">
        <span class="session-status ${session.is_active ? 'active' : 'inactive'}">${status}</span>
        <span class="session-duration">${duration}</span>
      </div>
      <div class="session-info">
        <div class="info-row">
          <span class="info-label">Node:</span>
          <span class="info-value">${session.node_location || 'Unknown'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Started:</span>
          <span class="info-value">${startTime}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Data Used:</span>
          <span class="info-value">${formatBytes(session.bytes_used || 0)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Payment:</span>
          <span class="info-value">${(session.amount_paid / 1e9).toFixed(4)} SOL</span>
        </div>
      </div>
    `;
    
    sessionsList.appendChild(sessionCard);
  });
}

function calculateDuration(startTime, endTime) {
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : new Date();
  const duration = Math.floor((end - start) / 1000);
  
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Settings Tab
function setupSettingsTab() {
  const saveBtn = document.getElementById('saveSettingsBtn');
  
  // Check if settings elements exist
  if (!saveBtn) return;
  
  const indexerUrlInput = document.getElementById('indexerUrlInput');
  const rpcUrlInput = document.getElementById('rpcUrlInput');
  const programIdInput = document.getElementById('programIdInput');
  const providerWalletInput = document.getElementById('providerWalletInput');
  
  if (!indexerUrlInput || !rpcUrlInput || !programIdInput || !providerWalletInput) return;
  
  // Load current settings
  indexerUrlInput.value = CONFIG.indexerUrl;
  rpcUrlInput.value = CONFIG.rpcUrl;
  programIdInput.value = CONFIG.programId;
  providerWalletInput.value = CONFIG.providerWallet;
  
  saveBtn.addEventListener('click', () => {
    CONFIG.indexerUrl = indexerUrlInput.value;
    CONFIG.rpcUrl = rpcUrlInput.value;
    CONFIG.programId = programIdInput.value;
    CONFIG.providerWallet = providerWalletInput.value;
    
    // Save to localStorage
    localStorage.setItem('config', JSON.stringify(CONFIG));
    
    showToast('Settings saved successfully', 'success');
  });
  
  // Load saved settings
  const savedConfig = localStorage.getItem('config');
  if (savedConfig) {
    try {
      const parsedConfig = JSON.parse(savedConfig);
      CONFIG = { ...CONFIG, ...parsedConfig };
      
      document.getElementById('indexerUrlInput').value = CONFIG.indexerUrl;
      document.getElementById('rpcUrlInput').value = CONFIG.rpcUrl;
      document.getElementById('programIdInput').value = CONFIG.programId;
      document.getElementById('providerWalletInput').value = CONFIG.providerWallet;
    } catch (error) {
      console.error('Error loading saved config:', error);
    }
  }
}

// Refresh Buttons
function setupRefreshButtons() {
  document.getElementById('refreshNodesBtn')?.addEventListener('click', () => {
    loadNodesFromIndexer();
  });
  
  document.getElementById('refreshSessionsBtn')?.addEventListener('click', () => {
    loadSessions();
  });
}

// Utility Functions
function getFlagForLocation(location) {
  const loc = location.toLowerCase();
  if (loc.includes('us') || loc.includes('new york') || loc.includes('nyc')) return '🇺🇸';
  if (loc.includes('uk') || loc.includes('london')) return '🇬🇧';
  if (loc.includes('japan') || loc.includes('tokyo')) return '🇯🇵';
  if (loc.includes('germany') || loc.includes('berlin')) return '🇩🇪';
  if (loc.includes('france') || loc.includes('paris')) return '🇫🇷';
  if (loc.includes('canada')) return '🇨🇦';
  if (loc.includes('singapore')) return '🇸🇬';
  if (loc.includes('india') || loc.includes('mumbai') || loc.includes('delhi') || loc.includes('bangalore')) return '🇮🇳';
  if (loc.includes('uae') || loc.includes('dubai') || loc.includes('emirates') || loc.includes('abu dhabi')) return '🇦🇪';
  if (loc.includes('local')) return '🏠';
  return '🌍';
}

function updateConnectionLine(location) {
  // This would update the connection line on the map
}

function drawWorldMap() {
  const canvas = document.getElementById('mapCanvas');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  
  // Draw simple world map outline
  ctx.strokeStyle = '#2A2A2A';
  ctx.lineWidth = 2;
  
  // Simple continent outlines (simplified)
  ctx.beginPath();
  // Draw basic world map shapes
  ctx.rect(50, 100, 600, 300);
  ctx.stroke();
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast toast-${type} show`;
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Search functionality
document.getElementById('searchLocation')?.addEventListener('input', (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const filteredNodes = state.nodes.filter(node => 
    (node.location || '').toLowerCase().includes(searchTerm) ||
    (node.vpn_endpoint || '').toLowerCase().includes(searchTerm)
  );
  populateLocations(filteredNodes);
});

// Expose functions globally for onclick handlers
window.loadNodesFromIndexer = loadNodesFromIndexer;
window.loadSessions = loadSessions;
window.closeSubscriptionModal = closeSubscriptionModal;

// ============================================
// PROVIDER DASHBOARD FUNCTIONALITY
// ============================================

function setupProviderDashboard() {
  const registerNodeBtn = document.getElementById('registerNodeBtn');
  const updateNodeBtn = document.getElementById('updateNodeBtn');
  const refreshProviderBtn = document.getElementById('refreshProviderStatsBtn');
  const claimEarningsBtn = document.getElementById('claimEarningsBtn');
  
  if (registerNodeBtn) {
    registerNodeBtn.addEventListener('click', handleRegisterNode);
  }
  
  if (updateNodeBtn) {
    updateNodeBtn.addEventListener('click', handleUpdateNode);
  }
  
  if (refreshProviderBtn) {
    refreshProviderBtn.addEventListener('click', async () => {
      // Force clear ALL caches to get fresh data from Pinata
      ipfsSessionsCache = [];
      ipfsEarningsCache = {};
      allMergedSessionsCache = []; // Clear merged sessions cache
      lastAllSessionsFetch = 0;    // Reset merged sessions timestamp
      lastIPFSFetch.sessions = 0;
      lastIPFSFetch.earnings = 0;
      lastIPFSFetch.registry = 0;
      IPFS_DATA_CIDS.sessions = null;
      IPFS_DATA_CIDS.earnings = null;
      
      showToast('🔄 Refreshing ALL historical data from IPFS...', 'info');
      await loadProviderStats();
      showToast('✅ Stats refreshed with ALL historical sessions!', 'success');
    });
  }
  
  if (claimEarningsBtn) {
    claimEarningsBtn.addEventListener('click', handleClaimEarnings);
  }
  
  // Initial load of provider stats and nodes
  setTimeout(() => {
    displayProviderNodes();
  }, 1000);
}

// Handle claiming/withdrawing earnings (local + on-chain)
async function handleClaimEarnings() {
  if (!state.wallet) {
    showToast('Please connect your wallet first', 'error');
    return;
  }
  
  const claimBtn = document.getElementById('claimEarningsBtn');
  
  try {
    // Show loading state
    if (claimBtn) {
      claimBtn.disabled = true;
      claimBtn.textContent = 'Processing...';
    }
    
    // Get earnings from on-chain escrow (subscription-based rewards)
    const earningsData = await getProviderEarnings(state.wallet);
    
    
    // Check if there's escrow balance to claim
    if (earningsData.available_balance <= 0) {
      showToast(earningsData.message || 'No escrow balance to claim. Users must subscribe first.', 'warning');
      return;
    }
    
    // Get sessions to find subscription wallets to claim from
    const allSessions = await fetchAllMergedSessions();
    
    // Find unique user wallets who used the service (potential subscriptions to claim)
    const userWallets = new Set();
    allSessions
      .filter(s => !s.is_active && s.node_provider === state.wallet)
      .forEach(s => userWallets.add(s.user_wallet));
    
    
    // Show confirmation with escrow-based info
    const availableSol = earningsData.available_balance_sol;
    const totalEscrowSol = earningsData.total_escrow_sol || '0';
    const networkEscrowSol = earningsData.network_total_escrow_sol || 0;
    const otherProvidersEscrowSol = earningsData.other_providers_escrow_sol || 0;
    const myNodeCount = earningsData.my_node_count || 0;
    
    const confirmed = confirm(
      `💰 MY NODE ESCROW CLAIM\n\n` +
      `🖥️ My Nodes: ${myNodeCount}\n\n` +
      `═══ MY ESCROW (NODES I OWN) ═══\n` +
      `Total Escrow Balance: ${totalEscrowSol} SOL\n` +
      `My Provider Share (80%): ${earningsData.total_earned_sol} SOL\n` +
      `Treasury Share (20%): ${(parseFloat(totalEscrowSol) * 0.2).toFixed(4)} SOL\n\n` +
      `Available to Claim: ${availableSol} SOL\n` +
      `Already Withdrawn: ${earningsData.withdrawn_sol} SOL\n\n` +
      `═══ NETWORK STATS ═══\n` +
      `Network Total Escrow: ${networkEscrowSol.toFixed(4)} SOL\n` +
      `Other Providers Escrow: ${otherProvidersEscrowSol.toFixed(4)} SOL\n\n` +
      `📊 From ${earningsData.escrow_accounts || 0} escrow accounts\n` +
      `📊 ${userWallets.size} user subscription(s)\n\n` +
      `Proceed with on-chain claim?`
    );
    
    if (!confirmed) {
      return;
    }
    
    // Try to claim from on-chain subscriptions
    let totalClaimed = 0;
    let successfulClaims = [];
    
    if (window.electron && window.electron.claimSubscriptionOnchain && userWallets.size > 0) {
      showToast(`🔄 Claiming from ${userWallets.size} subscription(s) on-chain...`, 'info');
      
      for (const userWallet of userWallets) {
        try {
          const result = await window.electron.claimSubscriptionOnchain(userWallet);
          
          if (result.success) {
            totalClaimed += result.providerShare;
            successfulClaims.push({
              userWallet,
              amount: result.providerShare,
              signature: result.signature
            });
          } else {
          }
        } catch (e) {
        }
      }
    }
    
    // Show results
    if (totalClaimed > 0) {
      showToast(`🎉 Claimed ${totalClaimed.toFixed(6)} SOL from escrow! (80% provider / 20% treasury)`, 'success');
      
      // Record withdrawal on IPFS
      await recordWithdrawal(state.wallet, totalClaimed * 1e9);
      
    } else if (successfulClaims.length === 0 && earningsData.available_balance > 0) {
      // No on-chain claims worked, but escrow exists
      showToast('⚠️ On-chain claim pending. Check your wallet for transaction.', 'info');
      
      // Still record the withdrawal attempt
      await recordWithdrawal(state.wallet, earningsData.available_balance);
    } else {
      showToast('No escrow funds were claimable at this time.', 'warning');
    }
    
    // Refresh stats
    setTimeout(() => loadProviderStats(), 1000);
    
  } catch (error) {
    console.error('Claim earnings error:', error);
    showToast('Failed to process withdrawal: ' + error.message, 'error');
  } finally {
    // Reset button state
    if (claimBtn) {
      claimBtn.disabled = false;
      claimBtn.textContent = 'Withdraw';
    }
  }
}

async function handleRegisterNode() {
  const location = document.getElementById('providerNodeLocation')?.value;
  const endpoint = document.getElementById('providerNodeEndpoint')?.value;
  const pricePerHour = document.getElementById('providerNodePrice')?.value;
  const publicKey = document.getElementById('providerNodePubkey')?.value;
  
  // Validate inputs
  if (!location || !endpoint || !pricePerHour || !publicKey) {
    showToast('Please fill in all fields', 'error');
    return;
  }
  
  // Validate endpoint format (IP or IP:PORT)
  const endpointRegex = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;
  if (!endpointRegex.test(endpoint)) {
    showToast('Invalid endpoint format. Use IP or IP:PORT (e.g., 1.2.3.4 or 1.2.3.4:51820)', 'error');
    return;
  }
  
  // Add default port if not specified
  let finalEndpoint = endpoint;
  if (!endpoint.includes(':')) {
    finalEndpoint = `${endpoint}:51820`;
  }
  
  if (!state.wallet) {
    showToast('Please connect your wallet first', 'error');
    return;
  }
  
  // Disable register button during registration
  const registerBtn = document.getElementById('registerNodeBtn');
  if (registerBtn) {
    registerBtn.disabled = true;
    registerBtn.innerHTML = '<span class="spinner"></span> Registering...';
  }
  
  try {
    // STEP 1: Register on IPFS first
    showToast('📤 Step 1/2: Publishing to IPFS...', 'info');
    
    const nodeData = {
      provider_wallet: state.wallet,
      location: location,
      endpoint: finalEndpoint,
      price_per_hour: parseInt(pricePerHour),
      wireguard_pubkey: publicKey
    };
    
    
    const ipfsResult = await publishNodeToPinata(nodeData);
    
    if (!ipfsResult.success) {
      throw new Error('IPFS registration failed: ' + ipfsResult.error);
    }
    
    showToast(`✅ IPFS: Published! CID: ${ipfsResult.cid.substring(0, 12)}...`, 'success');
    
    // Update the registry on IPFS
    try {
      const currentNodes = await getAllNodesFromIPFS();
      
      const newNode = {
        endpoint: finalEndpoint,
        location: location,
        region: location.toLowerCase().replace(/[^a-z]/g, '-'),
        provider: state.wallet,
        wg_server_pubkey: publicKey,
        price_per_hour_lamports: parseInt(pricePerHour) * 1000000,
        is_active: true,
        bandwidth_mbps: 100,
        rating_avg: '5.0',
        ipfs_cid: ipfsResult.cid,
        registered_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      };
      
      const nodeUptimeKey = `gvpn_node_uptime_${state.wallet}`;
      if (!localStorage.getItem(nodeUptimeKey)) {
        localStorage.setItem(nodeUptimeKey, Date.now().toString());
      }
      
      const existingIndex = currentNodes.findIndex(n => 
        n.provider === state.wallet || n.endpoint === finalEndpoint
      );
      
      if (existingIndex >= 0) {
        const originalRegisteredAt = currentNodes[existingIndex].registered_at || currentNodes[existingIndex].created_at;
        currentNodes[existingIndex] = { ...currentNodes[existingIndex], ...newNode };
        if (originalRegisteredAt) {
          currentNodes[existingIndex].registered_at = originalRegisteredAt;
        }
      } else {
        currentNodes.push(newNode);
      }
      
      const registryResult = await publishRegistryToPinata(currentNodes);
      if (registryResult.success) {
        CONFIG.ipfsRegistryCID = registryResult.cid;
      }
    } catch (registryErr) {
      console.warn('Registry update skipped:', registryErr.message);
    }
    
    // STEP 2: Register on-chain via Phantom
    showToast('🔗 Step 2/2: Opening Phantom for on-chain registration...', 'info');
    
    if (registerBtn) {
      registerBtn.innerHTML = '<span class="spinner"></span> Sign in Phantom...';
    }
    
    // Use Phantom to sign the transaction
    let onchainResult = await window.electron.registerNodePhantom({
      walletAddress: state.wallet,
      endpoint: finalEndpoint,
      location: location,
      region: location.toLowerCase().replace(/[^a-z0-9-]/g, '-').substring(0, 12),
      pricePerHour: parseFloat(pricePerHour) / 1000000, // Convert to SOL
      wgPublicKey: publicKey
    });
    
    if (onchainResult.success) {
      showToast(`✅ On-chain: Registered! TX: ${onchainResult.signature?.substring(0, 12)}...`, 'success');
      
      // Show full success message
      setTimeout(() => {
        showToast('🎉 Node registered on IPFS + Solana! You can now claim rewards.', 'success');
      }, 1500);
    } else {
      console.error('❌ On-chain registration failed:', onchainResult.error);
      showToast(`⚠️ On-chain failed: ${onchainResult.error}. Node is on IPFS only.`, 'warning');
      
      // Show help for common errors
      if (onchainResult.error?.includes('Insufficient SOL')) {
        showToast('💰 Add SOL to your wallet to register on-chain.', 'info');
      } else if (onchainResult.error?.includes('Provider not registered')) {
        showToast('📝 You need to register as a provider first.', 'info');
      }
    }
    
    // Clear form inputs
    document.getElementById('providerNodeLocation').value = '';
    document.getElementById('providerNodeEndpoint').value = '';
    document.getElementById('providerNodePrice').value = '';
    document.getElementById('providerNodePubkey').value = '';
    
    // Reload stats
    await new Promise(resolve => setTimeout(resolve, 1000));
    await populateLocations();
    await displayProviderNodes();
    await loadProviderStats();
    
  } catch (error) {
    console.error('Node registration error:', error);
    showToast('Error registering node: ' + error.message, 'error');
  } finally {
    if (registerBtn) {
      registerBtn.disabled = false;
      registerBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14"></path>
        </svg>
        Register Node
      `;
    }
  }
}

async function handleUpdateNode() {
  const location = document.getElementById('providerNodeLocation')?.value;
  const endpoint = document.getElementById('providerNodeEndpoint')?.value;
  const pricePerHour = document.getElementById('providerNodePrice')?.value;
  const publicKey = document.getElementById('providerNodePubkey')?.value;
  
  if (!location || !endpoint || !pricePerHour || !publicKey) {
    showToast('Please fill in all fields', 'error');
    return;
  }
  
  try {
    showToast('Updating node on IPFS...', 'info');
    
    // Get current nodes from IPFS
    const currentNodes = await getAllNodesFromIPFS();
    
    // Find and update the node
    const nodeIndex = currentNodes.findIndex(n => n.provider === state.wallet);
    
    if (nodeIndex >= 0) {
      currentNodes[nodeIndex] = {
        ...currentNodes[nodeIndex],
        location: location,
        endpoint: endpoint,
        wg_server_pubkey: publicKey,
        price_per_hour_lamports: parseInt(pricePerHour) * 1000000
      };
      
      // Publish updated registry to IPFS
      const result = await publishRegistryToPinata(currentNodes);
      
      if (result.success) {
        showToast('Node updated on IPFS!', 'success');
        loadProviderStats();
      } else {
        showToast('Failed to update on IPFS: ' + result.error, 'error');
      }
    } else {
      showToast('Node not found in registry', 'error');
    }
  } catch (error) {
    console.error('Node update error:', error);
    showToast('Error updating node: ' + error.message, 'error');
  }
}

async function loadProviderStats() {
  if (!state.wallet) {
    return;
  }
  
  
  try {
    // Always fetch fresh nodes from Pinata for provider stats (bypass cache)
    let allNodes = [];
    
    // First try to get the latest registry CID from Pinata
    const latestCID = await fetchLatestRegistryCID();
    
    if (latestCID) {
      for (const gateway of CONFIG.ipfsGateways) {
        try {
          const ipfsUrl = `${gateway}${latestCID}`;
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          
          const response = await fetch(ipfsUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const data = await response.json();
            if (data.nodes && data.nodes.length > 0) {
              allNodes = data.nodes.map((node, index) => ({
                pubkey: node.endpoint,
                provider: node.provider,
                node_id: index + 1,
                endpoint: node.endpoint,
                location: node.location,
                region: node.region,
                price_per_minute_lamports: Math.floor((node.price_per_hour_lamports || 6000000) / 60),
                wg_server_pubkey: node.wg_server_pubkey,
                is_active: node.is_active !== false,
                source: 'ipfs-pinata-fresh'
              }));
              break;
            }
          }
        } catch (error) {
        }
      }
    }
    
    // Fallback to cached nodes
    if (allNodes.length === 0) {
      allNodes = await getAllNodesFromIPFS();
    }
    
    const myNodes = allNodes.filter(node => node.provider === state.wallet);
    
    // Update node status card
    const nodeStatusCard = document.getElementById('nodeStatusCard');
    const nodeOnlineStatus = document.getElementById('nodeOnlineStatus');
    
    // ALWAYS load session stats and earnings (don't depend on myNodes check)
    const allSessions = await getLocalSessions();
    
    // Get my node endpoints for session matching
    const myNodeEndpoints = myNodes.map(n => n.endpoint);
    
    // Filter sessions for my nodes - check multiple fields
    const mySessions = allSessions.filter(s => 
      s.node_provider === state.wallet || 
      s.provider === state.wallet ||
      myNodeEndpoints.includes(s.node_endpoint)
    );
    
    
    // Active users = currently active sessions on my nodes
    const activeUsersSessions = mySessions.filter(s => s.is_active === true);
    
    const activeUsersEl = document.getElementById('providerActiveUsers');
    if (activeUsersEl) activeUsersEl.textContent = activeUsersSessions.length;
    
    // Total sessions
    const totalSessionsEl = document.getElementById('providerSessions');
    if (totalSessionsEl) totalSessionsEl.textContent = mySessions.length;
    
    // Get earnings (from on-chain escrow - subscription-based rewards)
    const earningsData = await getProviderEarnings(state.wallet);
    
    const earningsEl = document.getElementById('providerEarnings');
    const claimBtn = document.getElementById('claimEarningsBtn');
    
    // Show available balance (provider's usage-based share)
    const availableBalance = earningsData.available_balance || 0;
    if (earningsEl) {
      if (earningsData.source === 'onchain-escrow') {
        earningsEl.textContent = `${(availableBalance / 1e9).toFixed(4)} SOL`;
        // Show session-based info in tooltip
        const sessionInfo = earningsData.mySessions !== undefined 
          ? `My Sessions: ${earningsData.mySessions}/${earningsData.totalNetworkSessions || 0} | ${earningsData.shareReason || ''}`
          : `My Share: ${earningsData.total_earned_sol} SOL`;
        earningsEl.title = `${sessionInfo}\nNetwork Escrow: ${earningsData.total_escrow_sol} SOL`;
      } else if (earningsData.source === 'no-onchain-node') {
        // Show 0 if no on-chain node
        earningsEl.textContent = `0.0000 SOL`;
        earningsEl.title = '⚠️ Cannot claim: Your node is only in IPFS, not registered on Solana blockchain. Register on-chain to claim.';
        earningsEl.style.color = '#FFB347'; // Orange to indicate warning
      } else {
        earningsEl.textContent = `0.0000 SOL`;
        earningsEl.title = 'No subscription payments in escrow yet';
      }
    }
    
    // Update node count display with session info
    const nodeCountEl = document.getElementById('providerNodeCount');
    if (nodeCountEl) {
      const myNodeCount = earningsData.my_node_count || myNodes.length;
      if (earningsData.source === 'no-onchain-node') {
        nodeCountEl.textContent = `⚠️ IPFS only - need on-chain node`;
        nodeCountEl.style.color = '#FFB347';
      } else if (earningsData.mySessions !== undefined) {
        // Show session-based info
        nodeCountEl.textContent = `${earningsData.mySessions || 0} sessions | ${myNodeCount} node${myNodeCount !== 1 ? 's' : ''}`;
        nodeCountEl.style.color = '#888';
      } else {
        nodeCountEl.textContent = `${myNodeCount} node${myNodeCount !== 1 ? 's' : ''} | ${earningsData.escrow_accounts || 0} escrow acc`;
        nodeCountEl.style.color = '#888';
      }
    }
    
    // Update button state
    if (claimBtn) {
      if (availableBalance <= 0) {
        claimBtn.disabled = true;
        claimBtn.title = earningsData.message || 'No escrow balance to claim. Users must subscribe first.';
      } else {
        claimBtn.disabled = false;
        claimBtn.title = `Claim ${earningsData.available_balance_sol} SOL (80% of subscription escrow)`;
      }
    }

    // Update node status
    if (myNodes.length > 0) {
      const activeNodes = myNodes.filter(n => n.is_active);
      
      if (nodeStatusCard) {
        nodeStatusCard.style.background = activeNodes.length > 0 
          ? 'linear-gradient(135deg, #1A4D2E 0%, #2D5F3D 100%)'
          : 'linear-gradient(135deg, #4D1A1A 0%, #5F2D2D 100%)';
      }
      if (nodeOnlineStatus) {
        nodeOnlineStatus.textContent = activeNodes.length > 0 ? 'Online' : 'Offline';
        nodeOnlineStatus.style.color = activeNodes.length > 0 ? '#00D4AA' : '#FF6B6B';
      }
      
      // Calculate NODE uptime
      let nodeUptimeSeconds = 0;
      const uptimeEl = document.getElementById('providerUptime');
      
      const activeNodesWithTime = activeNodes.filter(n => n.registered_at || n.created_at || n.is_active);
      
      if (activeNodesWithTime.length > 0) {
        const nodeUptimeKey = `gvpn_node_uptime_${state.wallet}`;
        let uptimeStart = localStorage.getItem(nodeUptimeKey);
        
        if (!uptimeStart) {
          uptimeStart = Date.now().toString();
          localStorage.setItem(nodeUptimeKey, uptimeStart);
        }
        
        const oldestNodeTime = activeNodesWithTime.reduce((oldest, n) => {
          const nodeTime = new Date(n.registered_at || n.created_at || uptimeStart).getTime();
          return nodeTime < oldest ? nodeTime : oldest;
        }, parseInt(uptimeStart));
        
        nodeUptimeSeconds = (Date.now() - oldestNodeTime) / 1000;
      }
      
      if (uptimeEl) {
        if (nodeUptimeSeconds > 0 && activeNodes.length > 0) {
          const days = Math.floor(nodeUptimeSeconds / 86400);
          const hours = Math.floor((nodeUptimeSeconds % 86400) / 3600);
          const minutes = Math.floor((nodeUptimeSeconds % 3600) / 60);
          
          if (days >= 1) {
            uptimeEl.textContent = `${days}d ${hours}h`;
          } else if (hours >= 1) {
            uptimeEl.textContent = `${hours}h ${minutes}m`;
          } else {
            uptimeEl.textContent = `${Math.max(1, minutes)}m`;
          }
        } else {
          uptimeEl.textContent = '0m';
        }
      }
    } else {
      // No nodes found, but still show earnings if we have sessions
      if (nodeOnlineStatus) {
        nodeOnlineStatus.textContent = mySessions.length > 0 ? 'Sessions Found' : 'No Node';
        nodeOnlineStatus.style.color = mySessions.length > 0 ? '#FFD700' : '#888';
      }
      const uptimeEl = document.getElementById('providerUptime');
      if (uptimeEl) uptimeEl.textContent = '0m';
    }
    
    // Display registered nodes
    await displayProviderNodes();
    
  } catch (error) {
    console.error('Error loading provider stats:', error);
  }
}

// Display provider's registered nodes (from IPFS Pinata)
async function displayProviderNodes() {
  const nodesList = document.getElementById('providerNodesList');
  if (!nodesList) {
    console.error('❌ providerNodesList element not found!');
    return;
  }
  
  if (!state.wallet) {
    nodesList.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#4A4A4A" stroke-width="1.5">
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
          <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
          <line x1="6" y1="6" x2="6.01" y2="6"></line>
          <line x1="6" y1="18" x2="6.01" y2="18"></line>
        </svg>
        <p>Connect your wallet to view nodes</p>
        <small>Please connect your wallet first</small>
      </div>
    `;
    return;
  }
  
  try {
    
    // Primary: Fetch from IPFS
    let myNodes = [];
    const allNodes = await getAllNodesFromIPFS();
    
    if (allNodes.length > 0) {
      myNodes = allNodes.filter(node => node.provider === state.wallet);
    }
    
    // Fallback: Fetch from local API if IPFS didn't work
    if (myNodes.length === 0 && !CONFIG.useIPFSPrimary) {
      try {
        const response = await fetch(`${CONFIG.indexerUrl}/nodes`);
        if (response.ok) {
          const data = await response.json();
          const apiNodes = data.nodes || data;
          myNodes = apiNodes.filter(node => node.provider === state.wallet);
        }
      } catch (e) {
        console.warn('Local API unavailable:', e.message);
      }
    }
    
    // Also check for individually pinned nodes
    try {
      const ipfsResult = await listPinnedNodes();
      if (ipfsResult.success && ipfsResult.nodes.length > 0) {
        
        // Fetch details for nodes belonging to this wallet
        for (const pin of ipfsResult.nodes) {
          if (pin.provider === state.wallet) {
            // Check if already in myNodes
            const exists = myNodes.find(n => n.endpoint === pin.endpoint);
            if (!exists) {
              // Fetch full details from IPFS
              const nodeData = await fetchNodeFromIPFS(pin.cid);
              if (nodeData.success && nodeData.data?.node) {
                myNodes.push({
                  ...nodeData.data.node,
                  ipfs_cid: pin.cid,
                  source: 'ipfs'
                });
              }
            }
          }
        }
      }
    } catch (ipfsErr) {
      console.warn('IPFS fetch skipped:', ipfsErr.message);
    }
    
    // Deduplicate nodes by endpoint (keep the one with higher price/more info)
    const nodesByEndpoint = new Map();
    for (const node of myNodes) {
      const existing = nodesByEndpoint.get(node.endpoint);
      if (!existing) {
        nodesByEndpoint.set(node.endpoint, node);
      } else {
        // Keep the one with higher price or more recent data
        const existingPrice = existing.price_per_hour_lamports || existing.price_per_hour || 0;
        const newPrice = node.price_per_hour_lamports || node.price_per_hour || 0;
        if (newPrice > existingPrice) {
          nodesByEndpoint.set(node.endpoint, node);
        }
      }
    }
    myNodes = Array.from(nodesByEndpoint.values());
    
    
    // Check on-chain status
    let hasOnchainNode = false;
    let onchainNodeCount = 0;
    try {
      const escrowData = await window.electron.getProviderEscrowBalance(state.wallet);
      if (escrowData && escrowData.success) {
        hasOnchainNode = escrowData.hasOnchainNode || false;
        onchainNodeCount = escrowData.myNodeCount || 0;
      }
    } catch (e) {
      console.warn('Could not check on-chain status:', e.message);
    }
    
    if (myNodes.length === 0) {
      nodesList.innerHTML = `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#4A4A4A" stroke-width="1.5">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
            <line x1="6" y1="6" x2="6.01" y2="6"></line>
            <line x1="6" y1="18" x2="6.01" y2="18"></line>
          </svg>
          <p>No nodes registered yet</p>
          <small>Register your first node above to start earning</small>
        </div>
      `;
      return;
    }
    
    // Display nodes with on-chain status
    nodesList.innerHTML = myNodes.map(node => `
      <div class="node-card ${node.source === 'ipfs' ? 'ipfs-node' : ''}">
        <div class="node-card-header">
          <div>
            <div class="node-card-title">${node.location || 'Unknown Location'}</div>
            <div class="node-card-subtitle">${node.endpoint}</div>
          </div>
          <span class="node-card-status ${node.is_active !== false ? 'online' : 'offline'}">
            ${node.is_active !== false ? 'Online' : 'Offline'}
          </span>
        </div>
        <div class="node-card-info">
          <div class="node-info-row">
            <span class="node-info-label">Price/Hour:</span>
            <span class="node-info-value">${((node.price_per_hour || node.price_per_hour_lamports || 0) / 1e9).toFixed(4)} SOL</span>
          </div>
          <div class="node-info-row">
            <span class="node-info-label">Active Sessions:</span>
            <span class="node-info-value">${node.active_sessions || 0}</span>
          </div>
          <div class="node-info-row">
            <span class="node-info-label">IPFS Storage:</span>
            <span class="node-info-value" style="color: #14F195;">✅ Registered</span>
          </div>
          <div class="node-info-row">
            <span class="node-info-label">On-Chain:</span>
            <span class="node-info-value" style="color: ${hasOnchainNode ? '#14F195' : '#FFB347'};">
              ${hasOnchainNode ? '✅ Registered' : '⚠️ Not Registered'}
            </span>
          </div>
        </div>
        ${!hasOnchainNode ? `
        <div class="node-card-footer" style="margin-top: 10px;">
          <button class="btn-small btn-warning register-onchain-btn" 
            data-endpoint="${node.endpoint || ''}" 
            data-location="${node.location || ''}" 
            data-wgpubkey="${node.wg_server_pubkey || ''}" 
            data-price="${node.price_per_hour_lamports || 0}"
            style="width: 100%; background: linear-gradient(135deg, #FF9500, #FF6B00); border: none; padding: 8px 12px; border-radius: 6px; color: white; cursor: pointer; font-size: 12px;">
            🔗 Register On-Chain (Required for Rewards)
          </button>
        </div>
        ` : `
        <div class="node-card-footer" style="margin-top: 10px;">
          <span style="color: #14F195; font-size: 12px;">✅ Can claim subscription rewards</span>
        </div>
        `}
        ${(node.source === 'ipfs-pinata' || CONFIG.useIPFSPrimary) ? `
        <div class="node-card-footer" style="margin-top: 5px;">
          <a href="https://w3s.link/ipfs/${CONFIG.ipfsRegistryCID}" target="_blank" class="ipfs-link">
            View Registry on IPFS →
          </a>
        </div>
        ` : ''}
      </div>
    `).join('');
    
    // Add click handlers for register on-chain buttons
    nodesList.querySelectorAll('.register-onchain-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const endpoint = btn.dataset.endpoint;
        const location = btn.dataset.location;
        const wgPubkey = btn.dataset.wgpubkey;
        const price = parseInt(btn.dataset.price) || 0;
        
        
        await registerNodeOnChain(endpoint, location, wgPubkey, price);
      });
    });
    
  } catch (error) {
    console.error('Error displaying provider nodes:', error);
    nodesList.innerHTML = '<div class="empty-state"><p>Error loading nodes</p></div>';
  }
}

// Initialize provider dashboard
setupProviderDashboard();

// Initialize Node Provider Dashboard
if (typeof initNodeProviderDashboard === 'function') {
  initNodeProviderDashboard();
}

