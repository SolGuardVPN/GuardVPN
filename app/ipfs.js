// IPFS Module for DVPN Client
// Handles IPFS node initialization and node discovery

let ipfs = null;
let isInitialized = false;
const NODES_TOPIC = 'dvpn-nodes';
const nodesCache = new Map();

// Try to load ipfs-core, but make it optional
let createIPFS = null;
try {
  const ipfsCore = require('ipfs-core');
  createIPFS = ipfsCore.create;
} catch (error) {
  console.warn('⚠️ IPFS-core not available, will use indexer API fallback');
}

// Initialize IPFS node
async function initIPFS() {
  if (isInitialized) return ipfs;
  
  if (!createIPFS) {
    console.log('⚠️ IPFS not available, using indexer API only');
    return null;
  }
  
  console.log('🚀 Initializing IPFS node...');
  
  try {
    ipfs = await createIPFS({
      repo: './ipfs-client-data',
      config: {
        Bootstrap: [
          '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
          '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
          '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
          '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt'
        ]
      }
    });
    
    const { id } = await ipfs.id();
    console.log(`✅ IPFS initialized - Peer ID: ${id}`);
    
    isInitialized = true;
    
    // Subscribe to node announcements
    await subscribeToNodes();
    
    return ipfs;
  } catch (error) {
    console.error('❌ Failed to initialize IPFS:', error);
    throw error;
  }
}

// Subscribe to node announcements via PubSub
async function subscribeToNodes() {
  console.log(`📡 Subscribing to ${NODES_TOPIC}...`);
  
  try {
    await ipfs.pubsub.subscribe(NODES_TOPIC, (msg) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(msg.data));
        console.log(`📨 Received node: ${data.endpoint}`);
        
        nodesCache.set(data.pubkey, {
          ...data,
          lastSeen: Date.now()
        });
        
        // Clean old nodes (5 min)
        const now = Date.now();
        for (const [key, node] of nodesCache.entries()) {
          if (now - node.lastSeen > 5 * 60 * 1000) {
            nodesCache.delete(key);
          }
        }
      } catch (err) {
        console.error('Error processing node announcement:', err);
      }
    });
    
    console.log('✅ Subscribed to node announcements');
  } catch (error) {
    console.error('❌ Failed to subscribe:', error);
  }
}

// Get nodes from IPFS
async function getNodesFromIPFS(region = null) {
  if (!isInitialized) {
    await initIPFS();
  }
  
  const nodes = Array.from(nodesCache.values());
  
  // Filter by region if specified
  if (region && region !== 'all') {
    return nodes.filter(n => n.region === region);
  }
  
  return nodes;
}

// Get file from IPFS
async function getFromIPFS(cid) {
  if (!isInitialized) {
    await initIPFS();
  }
  
  const chunks = [];
  for await (const chunk of ipfs.cat(cid)) {
    chunks.push(chunk);
  }
  
  return Buffer.concat(chunks);
}

// Add file to IPFS
async function addToIPFS(data) {
  if (!isInitialized) {
    await initIPFS();
  }
  
  const result = await ipfs.add(data);
  return result.cid.toString();
}

// Stop IPFS
async function stopIPFS() {
  if (ipfs) {
    await ipfs.stop();
    isInitialized = false;
    console.log('🛑 IPFS node stopped');
  }
}

module.exports = {
  initIPFS,
  getNodesFromIPFS,
  getFromIPFS,
  addToIPFS,
  stopIPFS,
  getIPFS: () => ipfs
};
