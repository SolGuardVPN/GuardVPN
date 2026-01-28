// IPFS-based Node Registry (replaces PostgreSQL indexer)
// Nodes publish their info to IPFS, no centralized database needed

const IPFS = require('ipfs-core');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

let ipfs;
const NODES_TOPIC = 'dvpn-nodes';
const nodesCache = new Map(); // Local cache of active nodes

// Initialize IPFS node
async function initIPFS() {
  console.log('🚀 Starting IPFS node...');
  
  ipfs = await IPFS.create({
    repo: './ipfs-data',
    config: {
      Bootstrap: [
        '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
        '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
        '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
        '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt'
      ]
    }
  });
  
  const { id, agentVersion, protocolVersion } = await ipfs.id();
  console.log('✅ IPFS node started');
  console.log(`   Peer ID: ${id}`);
  console.log(`   Version: ${agentVersion}`);
  
  // Subscribe to nodes topic
  await subscribeToNodes();
  
  return ipfs;
}

// Subscribe to node announcements via PubSub
async function subscribeToNodes() {
  console.log(`📡 Subscribing to topic: ${NODES_TOPIC}`);
  
  await ipfs.pubsub.subscribe(NODES_TOPIC, (msg) => {
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.data));
      console.log(`📨 Received node announcement from ${data.endpoint}`);
      
      // Update cache
      nodesCache.set(data.pubkey, {
        ...data,
        lastSeen: Date.now(),
        ipfsPeerId: msg.from
      });
      
      // Remove stale nodes (not seen in 5 minutes)
      for (const [key, node] of nodesCache.entries()) {
        if (Date.now() - node.lastSeen > 5 * 60 * 1000) {
          nodesCache.delete(key);
        }
      }
    } catch (err) {
      console.error('Error processing node announcement:', err);
    }
  });
}

// Publish node info to IPFS
async function publishNodeInfo(nodeData) {
  // Store node data in IPFS
  const { cid } = await ipfs.add(JSON.stringify(nodeData, null, 2));
  console.log(`📝 Node info stored in IPFS: ${cid}`);
  
  // Announce via PubSub
  const announcement = {
    ...nodeData,
    cid: cid.toString(),
    timestamp: Date.now()
  };
  
  await ipfs.pubsub.publish(
    NODES_TOPIC,
    new TextEncoder().encode(JSON.stringify(announcement))
  );
  
  console.log(`📢 Announced node to network: ${nodeData.endpoint}`);
  
  return cid.toString();
}

// Get all active nodes from IPFS network
async function getActiveNodes(region = null) {
  const nodes = Array.from(nodesCache.values());
  
  // Filter by region if specified
  if (region && region !== 'all') {
    return nodes.filter(n => n.region === region);
  }
  
  return nodes;
}

// REST API for backward compatibility
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    mode: 'ipfs',
    activeNodes: nodesCache.size,
    ipfsPeerId: ipfs ? ipfs.peerId?.toString() : null
  });
});

app.get('/nodes', async (req, res) => {
  try {
    const region = req.query.region;
    const nodes = await getActiveNodes(region);
    
    res.json({
      success: true,
      count: nodes.length,
      nodes: nodes,
      source: 'ipfs-pubsub'
    });
  } catch (error) {
    console.error('Error fetching nodes:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.get('/node/:pubkey', async (req, res) => {
  try {
    const node = nodesCache.get(req.params.pubkey);
    
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

// Publish node (called by VPN servers)
app.post('/announce', async (req, res) => {
  try {
    const nodeData = req.body;
    
    // Validate required fields
    const required = ['pubkey', 'endpoint', 'region', 'price_per_minute_lamports'];
    for (const field of required) {
      if (!nodeData[field]) {
        return res.status(400).json({ 
          success: false, 
          error: `Missing required field: ${field}` 
        });
      }
    }
    
    const cid = await publishNodeInfo(nodeData);
    
    res.json({ 
      success: true, 
      cid,
      message: 'Node announced to IPFS network' 
    });
  } catch (error) {
    console.error('Error announcing node:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get file from IPFS by CID
app.get('/ipfs/:cid', async (req, res) => {
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

// Start server
async function start() {
  await initIPFS();
  
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => {
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('   DVPN IPFS Registry Running');
    console.log('═══════════════════════════════════════════════');
    console.log(`   API: http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   Nodes: http://localhost:${PORT}/nodes`);
    console.log('');
    console.log('   🌐 Fully decentralized - no database!');
    console.log('   📡 Node discovery via IPFS PubSub');
    console.log('   🔒 Censorship resistant');
    console.log('═══════════════════════════════════════════════');
  });
}

// Publish demo nodes on startup for testing
setTimeout(async () => {
  if (!ipfs) return;
  
  console.log('📢 Publishing demo nodes...');
  
  // Demo node 1
  await publishNodeInfo({
    pubkey: '3TXwC1yPntAHpHUSW1JRbtpvskQ87FZ1Tor6prdHcRYG',
    provider: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6',
    node_id: '1',
    endpoint: '192.168.1.1:51820',
    region: 'local',
    price_per_minute_lamports: 1000000,
    wg_server_pubkey: 'mock_wg_public_key_base64==',
    max_capacity: 100,
    active_sessions: 0,
    is_active: true,
    reputation_score: 1000
  });
  
  // Demo node 2 (your real server)
  await publishNodeInfo({
    pubkey: '64.227.150.205:41194',
    provider: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6',
    node_id: '2',
    endpoint: '64.227.150.205:41194',
    region: 'nyc',
    price_per_minute_lamports: 1000000,
    wg_server_pubkey: '8Cb9gEAKpJUWLBPx7s32DYUOIhLPyaFVGsGv93j0nH0=',
    max_capacity: 100,
    active_sessions: 0,
    is_active: true,
    reputation_score: 1000
  });
  
  console.log('✅ Demo nodes published to IPFS network');
}, 5000);

start().catch(console.error);

module.exports = { publishNodeInfo, getActiveNodes };
