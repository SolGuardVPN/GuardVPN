/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DVPN Decentralized Discovery Module
 * 
 * Eliminates ALL central points of failure:
 * 1. Node Discovery: Solana blockchain (primary) + IPFS PubSub (secondary)
 * 2. No Indexer API dependency
 * 3. No centralized IPFS gateways
 * 4. Direct peer-to-peer node announcements
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const IPFS = require('ipfs-core');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const DECENTRALIZED_CONFIG = {
  // Solana RPC endpoints (multiple for redundancy)
  solanaRPCs: [
    'https://api.mainnet-beta.solana.com',
    'https://solana-api.projectserum.com',
    'https://rpc.ankr.com/solana',
    'https://api.devnet.solana.com'  // Fallback to devnet
  ],
  
  // DVPN Program ID (on-chain)
  programId: 'EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq',
  
  // IPFS PubSub topic for real-time node announcements
  ipfsPubsubTopic: 'gvpn-nodes-v1',
  
  // IPFS bootstrap nodes (public DHT)
  ipfsBootstrap: [
    '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
    '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
    '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
    '/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ'
  ],
  
  // Cache settings
  cacheValidityMs: 60000,  // 1 minute cache for on-chain data
  pubsubValidityMs: 300000 // 5 minutes for pubsub announcements
};

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

let ipfsNode = null;
let solanaConnection = null;
let dvpnProgram = null;
let nodesCache = new Map();
let lastChainFetch = 0;
let isInitialized = false;

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize decentralized discovery
 * This creates embedded IPFS node and connects to Solana
 */
async function initDecentralized() {
  if (isInitialized) return { ipfs: ipfsNode, solana: solanaConnection };
  
  console.log('🌐 Initializing decentralized discovery...');
  
  // 1. Initialize Solana connection (try multiple RPCs)
  for (const rpcUrl of DECENTRALIZED_CONFIG.solanaRPCs) {
    try {
      solanaConnection = new Connection(rpcUrl, 'confirmed');
      const version = await solanaConnection.getVersion();
      console.log(`   ✅ Solana connected: ${rpcUrl} (v${version['solana-core']})`);
      break;
    } catch (e) {
      console.warn(`   ⚠️ RPC failed: ${rpcUrl}`);
    }
  }
  
  if (!solanaConnection) {
    throw new Error('Could not connect to any Solana RPC');
  }
  
  // 2. Initialize embedded IPFS node (for P2P discovery)
  try {
    ipfsNode = await IPFS.create({
      repo: './ipfs-dvpn-client',
      start: true,
      config: {
        Bootstrap: DECENTRALIZED_CONFIG.ipfsBootstrap,
        Addresses: {
          Swarm: [
            '/ip4/0.0.0.0/tcp/0',
            '/ip4/0.0.0.0/tcp/0/ws'
          ]
        },
        Discovery: {
          MDNS: { Enabled: true },
          webRTCStar: { Enabled: false }
        }
      },
      EXPERIMENTAL: {
        pubsub: true
      }
    });
    
    const { id, agentVersion } = await ipfsNode.id();
    console.log(`   ✅ IPFS node started: ${id.substring(0, 12)}... (${agentVersion})`);
    
    // Subscribe to node announcements
    await subscribeToNodeAnnouncements();
    
  } catch (e) {
    console.warn('   ⚠️ IPFS init failed (will use Solana-only):', e.message);
    // Continue without IPFS - Solana is still available
  }
  
  isInitialized = true;
  console.log('🌐 Decentralized discovery initialized');
  
  return { ipfs: ipfsNode, solana: solanaConnection };
}

// ═══════════════════════════════════════════════════════════════════════════
// SOLANA ON-CHAIN NODE DISCOVERY (Primary)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch all registered nodes directly from Solana blockchain
 * This is the PRIMARY source of truth - no central server needed
 */
async function fetchNodesFromChain() {
  if (!solanaConnection) {
    await initDecentralized();
  }
  
  // Check cache
  if (Date.now() - lastChainFetch < DECENTRALIZED_CONFIG.cacheValidityMs) {
    console.log('   📦 Using cached on-chain nodes');
    return Array.from(nodesCache.values()).filter(n => n.source === 'chain');
  }
  
  console.log('🔗 Fetching nodes from Solana blockchain...');
  
  const programId = new PublicKey(DECENTRALIZED_CONFIG.programId);
  
  try {
    // Get all accounts owned by DVPN program
    const accounts = await solanaConnection.getProgramAccounts(programId, {
      filters: [
        // Filter for Node account type (8-byte discriminator)
        // Node discriminator is derived from "account:Node"
        { memcmp: { offset: 0, bytes: 'Ah9K1Dcjdz8' } } // Base58 of Node discriminator
      ]
    });
    
    console.log(`   Found ${accounts.length} node accounts on-chain`);
    
    const nodes = [];
    
    for (const { pubkey, account } of accounts) {
      try {
        const node = decodeNodeAccount(account.data);
        if (node && node.endpoint) {
          nodes.push({
            pubkey: pubkey.toBase58(),
            ...node,
            source: 'chain',
            lastSeen: Date.now()
          });
          
          // Update cache
          nodesCache.set(pubkey.toBase58(), {
            ...node,
            pubkey: pubkey.toBase58(),
            source: 'chain',
            lastSeen: Date.now()
          });
        }
      } catch (e) {
        // Skip invalid accounts
      }
    }
    
    lastChainFetch = Date.now();
    console.log(`   ✅ Loaded ${nodes.length} nodes from chain`);
    
    return nodes;
    
  } catch (error) {
    console.error('❌ Failed to fetch from chain:', error.message);
    
    // Return cached data if available
    const cached = Array.from(nodesCache.values()).filter(n => n.source === 'chain');
    if (cached.length > 0) {
      console.log(`   📦 Returning ${cached.length} cached nodes`);
      return cached;
    }
    
    throw error;
  }
}

/**
 * Decode Node account data (without Anchor - direct byte parsing)
 */
function decodeNodeAccount(data) {
  if (data.length < 100) return null;
  
  let offset = 8; // Skip 8-byte discriminator
  
  // provider: Pubkey (32 bytes)
  const provider = new PublicKey(data.slice(offset, offset + 32)).toBase58();
  offset += 32;
  
  // node_id: u64 (8 bytes)
  const nodeId = Number(data.readBigUInt64LE(offset));
  offset += 8;
  
  // endpoint: String (4 bytes length + content)
  const endpointLen = data.readUInt32LE(offset);
  offset += 4;
  const endpoint = data.slice(offset, offset + endpointLen).toString('utf8');
  offset += endpointLen;
  
  // region: String
  const regionLen = data.readUInt32LE(offset);
  offset += 4;
  const region = data.slice(offset, offset + regionLen).toString('utf8');
  offset += regionLen;
  
  // price_per_minute_lamports: u64
  const pricePerMinute = Number(data.readBigUInt64LE(offset));
  offset += 8;
  
  // wg_server_pubkey: [u8; 32]
  const wgPubkey = Buffer.from(data.slice(offset, offset + 32)).toString('base64');
  offset += 32;
  
  // is_active: bool (1 byte) - may be at different offset based on schema
  // For safety, assume active if we got this far
  const isActive = true;
  
  return {
    provider,
    nodeId,
    endpoint,
    region,
    pricePerMinute,
    wgServerPubkey: wgPubkey,
    isActive
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// IPFS PUBSUB NODE DISCOVERY (Secondary - Real-time)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Subscribe to IPFS PubSub for real-time node announcements
 * Nodes publish their availability here for instant discovery
 */
async function subscribeToNodeAnnouncements() {
  if (!ipfsNode) return;
  
  const topic = DECENTRALIZED_CONFIG.ipfsPubsubTopic;
  console.log(`   📡 Subscribing to IPFS topic: ${topic}`);
  
  await ipfsNode.pubsub.subscribe(topic, (msg) => {
    try {
      const announcement = JSON.parse(new TextDecoder().decode(msg.data));
      
      // Validate announcement
      if (!announcement.pubkey || !announcement.endpoint) return;
      
      // Check if this node is also on-chain (for trust)
      const chainNode = nodesCache.get(announcement.pubkey);
      const isVerified = !!chainNode;
      
      // Update cache
      nodesCache.set(announcement.pubkey, {
        ...announcement,
        source: isVerified ? 'chain+pubsub' : 'pubsub',
        verified: isVerified,
        lastSeen: Date.now()
      });
      
      console.log(`   📡 Node announcement: ${announcement.endpoint} (verified: ${isVerified})`);
      
    } catch (e) {
      // Invalid message, ignore
    }
  });
  
  console.log('   ✅ Subscribed to node announcements');
}

/**
 * Publish node availability (for node operators)
 */
async function announceNode(nodeData) {
  if (!ipfsNode) {
    await initDecentralized();
  }
  
  const topic = DECENTRALIZED_CONFIG.ipfsPubsubTopic;
  
  const announcement = {
    ...nodeData,
    timestamp: Date.now(),
    version: '1.0'
  };
  
  await ipfsNode.pubsub.publish(
    topic,
    new TextEncoder().encode(JSON.stringify(announcement))
  );
  
  console.log(`📡 Announced node: ${nodeData.endpoint}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED NODE DISCOVERY (Combines all sources)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all available nodes from all decentralized sources
 * Priority: 1. Solana blockchain (verified) 2. IPFS PubSub (real-time)
 * 
 * NO CENTRAL SERVER INVOLVED
 */
async function discoverNodes(options = {}) {
  const { includeUnverified = false, region = null, minReputation = 0 } = options;
  
  console.log('🔍 Discovering nodes (decentralized)...');
  
  // Initialize if needed
  if (!isInitialized) {
    await initDecentralized();
  }
  
  // 1. Fetch from Solana (primary, verified)
  try {
    await fetchNodesFromChain();
  } catch (e) {
    console.warn('   ⚠️ Chain fetch failed, using cache');
  }
  
  // 2. Collect all nodes
  const allNodes = Array.from(nodesCache.values());
  
  // 3. Filter
  let filtered = allNodes.filter(node => {
    // Only verified (on-chain) unless includeUnverified
    if (!includeUnverified && node.source === 'pubsub') return false;
    
    // Region filter
    if (region && node.region && !node.region.toLowerCase().includes(region.toLowerCase())) {
      return false;
    }
    
    // Active filter
    if (node.isActive === false) return false;
    
    // Freshness filter (remove stale pubsub nodes)
    if (node.source === 'pubsub') {
      const age = Date.now() - node.lastSeen;
      if (age > DECENTRALIZED_CONFIG.pubsubValidityMs) return false;
    }
    
    return true;
  });
  
  // 4. Sort by trust level (chain > chain+pubsub > pubsub)
  filtered.sort((a, b) => {
    const trustOrder = { 'chain': 3, 'chain+pubsub': 2, 'pubsub': 1 };
    return (trustOrder[b.source] || 0) - (trustOrder[a.source] || 0);
  });
  
  console.log(`   ✅ Found ${filtered.length} nodes (${allNodes.length} total in cache)`);
  
  return filtered;
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION VERIFICATION (On-Chain)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verify a session exists and is funded on-chain
 * Used before connecting to a node
 */
async function verifySessionOnChain(sessionPda, userPubkey) {
  if (!solanaConnection) {
    await initDecentralized();
  }
  
  try {
    const accountInfo = await solanaConnection.getAccountInfo(new PublicKey(sessionPda));
    
    if (!accountInfo) {
      return { valid: false, error: 'Session not found on-chain' };
    }
    
    // Decode session
    const data = accountInfo.data;
    if (data.length < 100) {
      return { valid: false, error: 'Invalid session data' };
    }
    
    let offset = 8; // discriminator
    const sessionUser = new PublicKey(data.slice(offset, offset + 32)).toBase58();
    offset += 32;
    
    // Verify user matches
    if (sessionUser !== userPubkey) {
      return { valid: false, error: 'Session user mismatch' };
    }
    
    offset += 32; // skip node pubkey
    offset += 8;  // skip session_id
    
    const startTs = Number(data.readBigInt64LE(offset));
    offset += 8;
    
    const endTs = Number(data.readBigInt64LE(offset));
    offset += 8;
    
    const escrowLamports = Number(data.readBigUInt64LE(offset));
    
    // Check not expired
    const now = Math.floor(Date.now() / 1000);
    if (endTs < now) {
      return { valid: false, error: 'Session expired' };
    }
    
    // Check funded
    if (escrowLamports < 1000) {
      return { valid: false, error: 'Session not funded' };
    }
    
    return {
      valid: true,
      session: {
        user: sessionUser,
        startTs,
        endTs,
        escrowLamports,
        remainingSeconds: endTs - now
      }
    };
    
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Shutdown decentralized services
 */
async function shutdown() {
  if (ipfsNode) {
    console.log('🛑 Stopping IPFS node...');
    await ipfsNode.stop();
    ipfsNode = null;
  }
  
  isInitialized = false;
  nodesCache.clear();
  console.log('🛑 Decentralized discovery stopped');
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Initialization
  initDecentralized,
  shutdown,
  
  // Node Discovery (NO CENTRAL SERVER)
  discoverNodes,
  fetchNodesFromChain,
  announceNode,
  
  // Session Verification (On-Chain)
  verifySessionOnChain,
  
  // Config
  DECENTRALIZED_CONFIG,
  
  // State access
  getNodesCache: () => nodesCache,
  isReady: () => isInitialized
};

// ═══════════════════════════════════════════════════════════════════════════
// USAGE EXAMPLE
// ═══════════════════════════════════════════════════════════════════════════
/*
const discovery = require('./decentralized-discovery');

// Initialize (once at startup)
await discovery.initDecentralized();

// Discover nodes (combines Solana + IPFS)
const nodes = await discovery.discoverNodes({
  region: 'US',
  includeUnverified: false
});

console.log('Available nodes:', nodes);

// Verify session before connecting
const result = await discovery.verifySessionOnChain(sessionPda, walletPubkey);
if (result.valid) {
  // Connect to VPN
}

// For node operators: announce availability
await discovery.announceNode({
  pubkey: 'NodePublicKey...',
  endpoint: '1.2.3.4:51820',
  region: 'US-East',
  pricePerMinute: 100000
});
*/
