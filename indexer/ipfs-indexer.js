#!/usr/bin/env node

/**
 * IPFS-Based Indexer for DVPN
 * Combines traditional API with IPFS for decentralized node discovery
 * Can work in hybrid mode: serve known nodes + discover from IPFS
 */

const IPFS = require('ipfs-core');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// File to persist dynamically added nodes
const DYNAMIC_NODES_FILE = path.join(__dirname, 'vpn-nodes-dynamic.json');

// Load persisted dynamic nodes
function loadDynamicNodes() {
  try {
    if (fs.existsSync(DYNAMIC_NODES_FILE)) {
      const data = fs.readFileSync(DYNAMIC_NODES_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('⚠️  Error loading dynamic nodes:', err.message);
  }
  return [];
}

// Save dynamic nodes to file
function saveDynamicNodes(nodes) {
  try {
    fs.writeFileSync(DYNAMIC_NODES_FILE, JSON.stringify(nodes, null, 2));
  } catch (err) {
    console.error('⚠️  Error saving dynamic nodes:', err.message);
  }
}

// Known VPN nodes (bootstrap/fallback)
const KNOWN_NODES = [
  {
    pubkey: '31.57.228.54:51820',
    provider: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6',
    node_id: 1,
    endpoint: '31.57.228.54:51820',
    location: 'UAE, Dubai',
    region: 'me-dubai',
    price_per_minute_lamports: 100000,
    wg_server_pubkey: 'YOUR_WG_PUBLIC_KEY_1=',
    max_capacity: 100,
    active_sessions: 0,
    total_earnings: 0,
    total_uptime_seconds: 0,
    is_active: true,
    reputation_score: 1000,
    source: 'bootstrap'
  }
];

// Load persisted dynamic nodes and add to KNOWN_NODES
const dynamicNodes = loadDynamicNodes();
if (dynamicNodes.length > 0) {
  dynamicNodes.forEach(node => {
    if (!KNOWN_NODES.some(n => n.pubkey === node.pubkey)) {
      KNOWN_NODES.push(node);
    }
  });
}

let ipfs = null;
let ipfsEnabled = false;
const NODES_TOPIC = 'dvpn-nodes';
const ipfsNodesCache = new Map();

// Initialize IPFS (non-blocking)
async function initIPFS() {
  try {
    
    ipfs = await IPFS.create({
      repo: './ipfs-indexer-data',
      start: true,
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
    
    ipfsEnabled = true;
    
    // Subscribe to node announcements
    await subscribeToNodes();
    
    // Publish known nodes to IPFS
    setTimeout(() => publishKnownNodes(), 5000);
    
  } catch (error) {
    console.error('⚠️  IPFS initialization failed (will use fallback):', error.message);
    ipfsEnabled = false;
  }
}

// Subscribe to IPFS PubSub for node discovery
async function subscribeToNodes() {
  if (!ipfs) return;
  
  
  await ipfs.pubsub.subscribe(NODES_TOPIC, (msg) => {
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.data));
      
      ipfsNodesCache.set(data.pubkey, {
        ...data,
        lastSeen: Date.now(),
        source: 'ipfs'
      });
      
      
      // Clean old nodes (>60 minutes) - increased from 10 minutes to prevent premature removal
      // Only clean IPFS-discovered nodes, not bootstrap/dynamic nodes
      const now = Date.now();
      for (const [key, node] of ipfsNodesCache.entries()) {
        const isKnownNode = KNOWN_NODES.some(n => n.pubkey === key);
        if (!isKnownNode && now - node.lastSeen > 60 * 60 * 1000) {
          ipfsNodesCache.delete(key);
        }
      }
    } catch (err) {
      console.error('Error processing IPFS message:', err.message);
    }
  });
  
}

// Publish known nodes to IPFS network
async function publishKnownNodes() {
  if (!ipfs) return;
  
  
  for (const node of KNOWN_NODES) {
    try {
      const announcement = {
        ...node,
        timestamp: Date.now(),
        published_at: new Date().toISOString()
      };
      
      // Store in IPFS
      const { cid } = await ipfs.add(JSON.stringify(announcement, null, 2));
      
      // Announce via PubSub
      const pubsubData = {
        ...announcement,
        cid: cid.toString()
      };
      
      await ipfs.pubsub.publish(
        NODES_TOPIC,
        new TextEncoder().encode(JSON.stringify(pubsubData))
      );
      
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`   ✗ Failed to publish ${node.endpoint}:`, error.message);
    }
  }
  
}

// Get all nodes (hybrid: known + IPFS discovered)
function getAllNodes() {
  const allNodes = new Map();
  
  // Add known nodes
  KNOWN_NODES.forEach(node => {
    allNodes.set(node.pubkey, { ...node, source: 'bootstrap' });
  });
  
  // Merge with IPFS discovered nodes
  if (ipfsEnabled) {
    ipfsNodesCache.forEach((node, key) => {
      allNodes.set(key, node);
    });
  }
  
  return Array.from(allNodes.values());
}

// REST API Endpoints

app.get('/health', async (req, res) => {
  let ipfsStats = null;
  
  if (ipfs && ipfsEnabled) {
    try {
      const peers = await ipfs.swarm.peers();
      ipfsStats = {
        enabled: true,
        peers: peers.length,
        peerId: (await ipfs.id()).id.toString()
      };
    } catch (err) {
      ipfsStats = { enabled: false, error: err.message };
    }
  }
  
  res.json({
    status: 'ok',
    mode: 'hybrid',
    timestamp: new Date().toISOString(),
    nodes: {
      known: KNOWN_NODES.length,
      ipfs: ipfsNodesCache.size,
      total: getAllNodes().length
    },
    ipfs: ipfsStats
  });
});

app.get('/nodes', (req, res) => {
  try {
    const nodes = getAllNodes();
    const region = req.query.region;
    
    let filtered = nodes;
    if (region && region !== 'all') {
      filtered = nodes.filter(n => n.region === region);
    }
    
    res.json({
      success: true,
      count: filtered.length,
      nodes: filtered,
      sources: {
        bootstrap: nodes.filter(n => n.source === 'bootstrap').length,
        ipfs: nodes.filter(n => n.source === 'ipfs').length
      },
      ipfs_enabled: ipfsEnabled
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/node/:pubkey', (req, res) => {
  try {
    const nodes = getAllNodes();
    const node = nodes.find(n => n.pubkey === req.params.pubkey);
    
    if (!node) {
      return res.status(404).json({
        success: false,
        error: 'Node not found'
      });
    }
    
    res.json({ success: true, node });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Announce a node (for VPN servers to register)
app.post('/announce', async (req, res) => {
  try {
    const nodeData = req.body;
    
    // Validate
    if (!nodeData.pubkey || !nodeData.endpoint) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: pubkey, endpoint'
      });
    }
    
    // Add to known nodes if not exists
    const existingIndex = KNOWN_NODES.findIndex(n => n.pubkey === nodeData.pubkey);
    const newNode = {
      ...nodeData,
      source: 'dynamic',
      registered_at: new Date().toISOString(),
      lastSeen: Date.now()
    };
    
    if (existingIndex === -1) {
      KNOWN_NODES.push(newNode);
    } else {
      // Update existing node's lastSeen
      KNOWN_NODES[existingIndex] = { ...KNOWN_NODES[existingIndex], lastSeen: Date.now() };
    }
    
    // Persist dynamic nodes to file
    const dynamicNodesToSave = KNOWN_NODES.filter(n => n.source === 'dynamic');
    saveDynamicNodes(dynamicNodesToSave);
    
    // Publish to IPFS if enabled
    let cid = null;
    if (ipfs && ipfsEnabled) {
      try {
        const result = await ipfs.add(JSON.stringify(nodeData, null, 2));
        cid = result.cid.toString();
        
        await ipfs.pubsub.publish(
          NODES_TOPIC,
          new TextEncoder().encode(JSON.stringify({
            ...nodeData,
            cid,
            timestamp: Date.now()
          }))
        );
      } catch (err) {
        console.error('IPFS publish error:', err.message);
      }
    }
    
    res.json({
      success: true,
      message: 'Node announced and persisted',
      cid,
      ipfs_enabled: ipfsEnabled
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get file from IPFS
app.get('/ipfs/:cid', async (req, res) => {
  if (!ipfs || !ipfsEnabled) {
    return res.status(503).json({
      success: false,
      error: 'IPFS not available'
    });
  }
  
  try {
    const chunks = [];
    for await (const chunk of ipfs.cat(req.params.cid)) {
      chunks.push(chunk);
    }
    const data = Buffer.concat(chunks);
    res.send(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// IPFS Stats endpoint
app.get('/ipfs/stats', async (req, res) => {
  if (!ipfs || !ipfsEnabled) {
    return res.json({
      enabled: false,
      message: 'IPFS not initialized'
    });
  }
  
  try {
    const peers = await ipfs.swarm.peers();
    const { id } = await ipfs.id();
    const topics = await ipfs.pubsub.ls();
    
    res.json({
      enabled: true,
      peer_id: id.toString(),
      connected_peers: peers.length,
      subscribed_topics: topics,
      discovered_nodes: ipfsNodesCache.size
    });
  } catch (error) {
    res.status(500).json({
      enabled: true,
      error: error.message
    });
  }
});

// Start server
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
});

// Initialize IPFS in background (non-blocking)
initIPFS().catch(err => {
  console.error('⚠️  IPFS initialization error:', err.message);
});

// Re-publish nodes periodically
setInterval(() => {
  if (ipfs && ipfsEnabled) {
    publishKnownNodes().catch(console.error);
  }
}, 5 * 60 * 1000); // Every 5 minutes

// Graceful shutdown
process.on('SIGINT', async () => {
  if (ipfs) {
    await ipfs.stop();
  }
  process.exit(0);
});
