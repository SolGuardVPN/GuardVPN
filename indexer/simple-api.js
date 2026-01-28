// Simple API serving only real VPN nodes with IPFS integration
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// IPFS Node Registry
const ipfsNodes = require('./ipfs-nodes');

const app = express();
app.use(cors());
app.use(express.json());

// Config file paths
const CONFIG_FILE = path.join(__dirname, 'vpn-nodes-config.json');
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');

// Sessions storage
let activeSessions = [];

// Load sessions from file
function loadSessionsFromFile() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
      console.log(`📂 Loaded ${data.sessions.length} sessions from file`);
      return data.sessions || [];
    }
  } catch (error) {
    console.error('Error loading sessions file:', error.message);
  }
  return [];
}

// Save sessions to file
function saveSessionsToFile() {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify({ 
      sessions: activeSessions,
      updated_at: new Date().toISOString()
    }, null, 2));
    console.log(`💾 Saved ${activeSessions.length} sessions to file`);
  } catch (error) {
    console.error('Error saving sessions file:', error.message);
  }
}

// Initialize sessions from file
activeSessions = loadSessionsFromFile();

// Load nodes from config file
function loadNodesFromConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      console.log(`📁 Loaded ${config.nodes.length} nodes from config file`);
      return config.nodes.map((node, index) => ({
        pubkey: node.endpoint,
        provider: node.provider_wallet,
        node_id: index + 1,
        endpoint: node.endpoint,
        location: node.location,
        region: node.region,
        price_per_minute_lamports: Math.floor((node.price_per_hour_lamports || 6000000) / 60),
        wg_server_pubkey: node.wg_server_pubkey,
        max_capacity: 100,
        active_sessions: 0,
        total_earnings: node.total_earnings || 0,
        total_uptime_seconds: node.total_uptime_seconds || 0,
        is_active: node.is_active !== false,
        reputation_score: 1000
      }));
    }
  } catch (error) {
    console.error('Error loading config file:', error.message);
  }
  return null;
}

// IPFS setup
let ipfs = null;
let ipfsReady = false;
const NODES_TOPIC = 'dvpn-nodes-registry';

// Initialize IPFS
async function initIPFS() {
  try {
    console.log('🚀 Starting IPFS node...');
    const { create } = await import('ipfs-core');
    ipfs = await create({
      repo: './ipfs-data',
      config: {
        Bootstrap: [
          '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
          '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa'
        ]
      }
    });
    
    const { id } = await ipfs.id();
    console.log(`✅ IPFS ready - Peer ID: ${id}`);
    ipfsReady = true;
    
    // Subscribe to nodes topic
    await ipfs.pubsub.subscribe(NODES_TOPIC, (msg) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(msg.data));
        console.log(`📨 Received node from IPFS: ${data.endpoint}`);
        
        // Check if node exists, if not add it
        const exists = realNodes.find(n => n.provider === data.provider || n.endpoint === data.endpoint);
        if (!exists && data.provider && data.endpoint) {
          realNodes.push(data);
        }
      } catch (err) {
        console.error('Error processing IPFS message:', err.message);
      }
    });
    
  } catch (error) {
    console.error('⚠️  IPFS initialization failed (API will work without IPFS):', error.message);
    console.log('   To enable IPFS, upgrade to Node.js 22+ or use Helia instead of ipfs-core');
    ipfsReady = false;
  }
}

// Save node to IPFS
async function saveToIPFS(nodeData) {
  if (!ipfsReady || !ipfs) {
    console.log('⚠️  IPFS not ready, skipping IPFS storage');
    return null;
  }
  
  try {
    // Add to IPFS
    const { cid } = await ipfs.add(JSON.stringify(nodeData, null, 2));
    console.log(`📝 Node saved to IPFS: ${cid}`);
    
    // Publish to PubSub
    await ipfs.pubsub.publish(
      NODES_TOPIC,
      new TextEncoder().encode(JSON.stringify({
        ...nodeData,
        cid: cid.toString(),
        timestamp: Date.now()
      }))
    );
    
    console.log(`📢 Node announced to IPFS network`);
    return cid.toString();
  } catch (error) {
    console.error('Error saving to IPFS:', error.message);
    return null;
  }
}

// Load nodes from IPFS
async function loadFromIPFS(cid) {
  if (!ipfsReady || !ipfs) return null;
  
  try {
    const chunks = [];
    for await (const chunk of ipfs.cat(cid)) {
      chunks.push(chunk);
    }
    const data = Buffer.concat(chunks).toString();
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading from IPFS:', error.message);
    return null;
  }
}

// Default nodes (used if config file doesn't exist or has issues)
const defaultNodes = [
  {
    pubkey: '31.57.228.54:51820',
    provider: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6',
    node_id: 1,
    endpoint: '31.57.228.54:51820',
    location: 'UAE, Dubai',
    region: 'me-dubai',
    price_per_minute_lamports: 100000,
    wg_server_pubkey: 'kLbGQCqJdSwMzN5Y0mHj2VxrT7eXp9iFvOuLqK8tRWc=',
    max_capacity: 100,
    active_sessions: 0,
    is_active: true,
    reputation_score: 1000
  },
  {
    pubkey: '64.227.150.205:41194',
    provider: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6',
    node_id: 2,
    endpoint: '64.227.150.205:41194',
    location: 'INDIA, Bangalore',
    region: 'as-south',
    price_per_minute_lamports: 100000,
    wg_server_pubkey: '8Cb9gEAKpJUWLBPx7s32DYUOIhLPyaFVGsGv93j0nH0=',
    max_capacity: 100,
    active_sessions: 0,
    is_active: true,
    reputation_score: 1000
  }
];

// Load from config file or use defaults
let realNodes = loadNodesFromConfig() || defaultNodes;
console.log(`📡 Loaded ${realNodes.length} VPN nodes`);

// API to reload config without restarting
app.post('/reload-config', (req, res) => {
  const newNodes = loadNodesFromConfig();
  if (newNodes) {
    realNodes = newNodes;
    res.json({ success: true, message: `Reloaded ${realNodes.length} nodes from config` });
  } else {
    res.status(500).json({ error: 'Failed to reload config' });
  }
});

// API to update a node's WireGuard key
app.put('/nodes/:endpoint/key', (req, res) => {
  const { wg_server_pubkey } = req.body;
  const endpoint = req.params.endpoint;
  
  if (!wg_server_pubkey || wg_server_pubkey.length !== 44 || !wg_server_pubkey.endsWith('=')) {
    return res.status(400).json({ error: 'Invalid WireGuard public key format. Must be 44 characters ending with =' });
  }
  
  const node = realNodes.find(n => n.endpoint === endpoint);
  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }
  
  node.wg_server_pubkey = wg_server_pubkey;
  
  // Also update config file
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      const configNode = config.nodes.find(n => n.endpoint === endpoint);
      if (configNode) {
        configNode.wg_server_pubkey = wg_server_pubkey;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
      }
    }
  } catch (err) {
    console.error('Error updating config file:', err);
  }
  
  res.json({ success: true, message: 'WireGuard key updated', node });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mode: 'real-servers',
    timestamp: new Date().toISOString(),
    nodes: realNodes.length
  });
});

// Get all nodes
app.get('/nodes', async (req, res) => {
  try {
    res.json({ 
      success: true,
      nodes: realNodes,
      count: realNodes.length,
      source: 'real-vpn-servers'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get specific node by pubkey/endpoint/wallet
app.get('/nodes/:identifier', async (req, res) => {
  try {
    const id = req.params.identifier;
    const node = realNodes.find(n => 
      n.pubkey === id || 
      n.endpoint === id || 
      n.provider === id
    );
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    res.json(node);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rate a node (after VPN disconnect)
app.post('/nodes/:id/rate', async (req, res) => {
  try {
    const nodeId = req.params.id;
    const { rating, wallet } = req.body;
    
    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    
    console.log(`⭐ Node ${nodeId} rated ${rating} stars by ${wallet || 'anonymous'}`);
    
    // Find the node
    const node = realNodes.find(n => 
      n.pubkey === nodeId || 
      n.endpoint === nodeId || 
      n.endpoint.includes(nodeId)
    );
    
    if (node) {
      // Initialize rating fields if not present
      if (!node.rating_sum) node.rating_sum = 0;
      if (!node.rating_count) node.rating_count = 0;
      
      // Update rating
      node.rating_sum += rating;
      node.rating_count += 1;
      
      const avgRating = (node.rating_sum / node.rating_count).toFixed(1);
      console.log(`✅ Updated node rating: ${avgRating} (${node.rating_count} ratings)`);
      
      // Persist to config file
      try {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        const configNode = config.nodes.find(n => n.endpoint === node.endpoint);
        if (configNode) {
          configNode.rating_sum = node.rating_sum;
          configNode.rating_count = node.rating_count;
          fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        }
      } catch (e) {
        console.warn('Could not save rating to config:', e.message);
      }
      
      return res.json({ 
        success: true, 
        average_rating: parseFloat(avgRating),
        total_ratings: node.rating_count
      });
    }
    
    // Node not found but still acknowledge
    res.json({ 
      success: true, 
      message: 'Rating recorded',
      rating: rating
    });
    
  } catch (err) {
    console.error('Rate node error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get VPN config for a node - connects to server's ncat to get real config
app.post('/nodes/:endpoint/config', async (req, res) => {
  try {
    const { clientPublicKey, wallet } = req.body;
    const endpoint = req.params.endpoint;
    
    const node = realNodes.find(n => n.endpoint === endpoint || n.pubkey === endpoint);
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    // Extract server IP from endpoint (format: ip:port)
    const [serverIp] = node.endpoint.split(':');
    const ncatPort = 22222;
    
    console.log(`🔌 Connecting to ncat at ${serverIp}:${ncatPort} to get WireGuard config...`);
    
    // Connect to server's ncat to get real WireGuard config
    const net = require('net');
    
    const getConfigFromServer = () => {
      return new Promise((resolve, reject) => {
        const client = new net.Socket();
        let responseData = '';
        
        client.setTimeout(10000); // 10 second timeout
        
        client.connect(ncatPort, serverIp, () => {
          console.log(`✅ Connected to ncat at ${serverIp}:${ncatPort}`);
          client.write('start\n');
        });
        
        client.on('data', (data) => {
          responseData += data.toString();
        });
        
        client.on('close', () => {
          console.log(`📝 Received config from server (${responseData.length} bytes)`);
          resolve(responseData);
        });
        
        client.on('timeout', () => {
          client.destroy();
          reject(new Error('Connection timeout'));
        });
        
        client.on('error', (err) => {
          reject(err);
        });
      });
    };
    
    try {
      const serverConfig = await getConfigFromServer();
      
      // Parse the WireGuard config from server
      // Extract client IP (Address line)
      const addressMatch = serverConfig.match(/Address\s*=\s*(\d+\.\d+\.\d+\.\d+\/\d+)/);
      const clientIP = addressMatch ? addressMatch[1] : null;
      
      // Extract private key
      const privateKeyMatch = serverConfig.match(/PrivateKey\s*=\s*([A-Za-z0-9+/=]+)/);
      const clientPrivateKey = privateKeyMatch ? privateKeyMatch[1] : null;
      
      // Extract server public key from [Peer] section
      const serverPubKeyMatch = serverConfig.match(/\[Peer\][\s\S]*?PublicKey\s*=\s*([A-Za-z0-9+/=]+)/);
      const serverPublicKey = serverPubKeyMatch ? serverPubKeyMatch[1] : node.wg_server_pubkey;
      
      // Extract PresharedKey
      const presharedKeyMatch = serverConfig.match(/PresharedKey\s*=\s*([A-Za-z0-9+/=]+)/);
      const presharedKey = presharedKeyMatch ? presharedKeyMatch[1] : null;
      
      // Extract DNS
      const dnsMatch = serverConfig.match(/DNS\s*=\s*([^\n]+)/);
      const dns = dnsMatch ? dnsMatch[1].trim() : '8.8.8.8,8.8.4.4';
      
      console.log(`✅ Parsed config - Client IP: ${clientIP}, Server PubKey: ${serverPublicKey?.substring(0, 10)}...`);
      
      res.json({
        success: true,
        clientIP: clientIP,
        clientPrivateKey: clientPrivateKey, // Include the private key from server
        serverPublicKey: serverPublicKey,
        presharedKey: presharedKey,
        dns: dns,
        endpoint: node.endpoint,
        rawConfig: serverConfig, // Include raw config for debugging
        message: 'Config generated from server ncat'
      });
      
    } catch (ncatError) {
      console.error(`⚠️ Failed to get config from ncat: ${ncatError.message}`);
      console.log('   Falling back to generated config with correct subnet');
      
      // Fallback: Generate config with CORRECT subnet (10.0.1.x to match server)
      const clientIP = `10.0.1.${Math.floor(Math.random() * 200) + 10}/24`;
      
      res.json({
        success: true,
        clientIP: clientIP,
        serverPublicKey: node.wg_server_pubkey,
        endpoint: node.endpoint,
        message: 'Config generated (fallback - ncat unavailable)',
        warning: 'Could not connect to server ncat, using fallback config'
      });
    }
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register new node
app.post('/nodes', async (req, res) => {
  try {
    const { provider_wallet, location, vpn_endpoint, price_per_hour, wireguard_pubkey, is_active } = req.body;
    
    if (!provider_wallet || !location || !vpn_endpoint || !wireguard_pubkey) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check if node already exists
    const existingByWallet = realNodes.find(n => n.provider === provider_wallet);
    const existingByEndpoint = realNodes.find(n => n.endpoint === vpn_endpoint);
    
    if (existingByWallet) {
      return res.status(409).json({ 
        error: 'Node already registered',
        message: 'This wallet already has a registered node',
        existing_endpoint: existingByWallet.endpoint
      });
    }
    
    if (existingByEndpoint) {
      return res.status(409).json({ 
        error: 'Node already registered',
        message: 'This endpoint is already in use',
        existing_wallet: existingByEndpoint.provider
      });
    }
    
    // Create new node
    const newNode = {
      pubkey: vpn_endpoint,
      provider: provider_wallet,
      node_id: realNodes.length + 1,
      endpoint: vpn_endpoint,
      location: location,
      region: location.toLowerCase().replace(/\s+/g, '-'),
      price_per_minute_lamports: Math.floor(price_per_hour / 60),
      price_per_hour: price_per_hour,
      wg_server_pubkey: wireguard_pubkey,
      max_capacity: 100,
      active_sessions: 0,
      is_active: is_active !== false,
      reputation_score: 1000,
      registered_at: new Date().toISOString()
    };
    
    realNodes.push(newNode);
    
    // Save to config file for persistence
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      config.nodes.push({
        name: location,
        endpoint: vpn_endpoint,
        location: location,
        region: location.toLowerCase().replace(/\s+/g, '-'),
        wg_server_pubkey: wireguard_pubkey,
        provider_wallet: provider_wallet,
        price_per_hour_lamports: price_per_hour || 6000000,
        total_earnings: 0,
        total_uptime_seconds: 0,
        is_active: is_active !== false
      });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
      console.log(`💾 Node saved to config file: ${vpn_endpoint}`);
    } catch (configErr) {
      console.error('Error saving node to config:', configErr.message);
    }
    
    // Publish updated registry to IPFS via Pinata
    let ipfsCid = null;
    try {
      ipfsCid = await ipfsNodes.publishNodesToIPFS(realNodes);
      if (ipfsCid) {
        console.log(`📡 Registry updated on IPFS: ${ipfsCid}`);
        newNode.ipfs_cid = ipfsCid;
      }
    } catch (ipfsErr) {
      console.warn('IPFS publish failed (node still saved locally):', ipfsErr.message);
    }
    
    res.json({ 
      success: true,
      message: 'Node registered successfully',
      node: newNode,
      ipfs_cid: ipfsCid,
      ipfs_url: ipfsCid ? `https://gateway.pinata.cloud/ipfs/${ipfsCid}` : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update node
app.put('/nodes/:wallet', async (req, res) => {
  try {
    const { location, vpn_endpoint, price_per_hour, wireguard_pubkey } = req.body;
    const wallet = req.params.wallet;
    
    const nodeIndex = realNodes.findIndex(n => n.provider === wallet);
    if (nodeIndex === -1) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    // Update node
    if (location) realNodes[nodeIndex].location = location;
    if (vpn_endpoint) {
      realNodes[nodeIndex].endpoint = vpn_endpoint;
      realNodes[nodeIndex].pubkey = vpn_endpoint;
    }
    if (price_per_hour) {
      realNodes[nodeIndex].price_per_minute_lamports = Math.floor(price_per_hour / 60);
      realNodes[nodeIndex].price_per_hour = price_per_hour;
    }
    if (wireguard_pubkey) realNodes[nodeIndex].wg_server_pubkey = wireguard_pubkey;
    
    realNodes[nodeIndex].updated_at = new Date().toISOString();
    
    // Update in IPFS
    const ipfsCid = await saveToIPFS(realNodes[nodeIndex]);
    if (ipfsCid) {
      realNodes[nodeIndex].ipfs_cid = ipfsCid;
    }
    
    res.json({ 
      success: true,
      message: 'Node updated successfully',
      node: realNodes[nodeIndex],
      ipfs_cid: ipfsCid
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get sessions
app.get('/sessions', async (req, res) => {
  try {
    const { wallet, node, active } = req.query;
    
    let filteredSessions = [...activeSessions];
    
    // Filter by wallet if provided
    if (wallet) {
      filteredSessions = filteredSessions.filter(s => s.user_wallet === wallet);
    }
    
    // Filter by node if provided
    if (node) {
      filteredSessions = filteredSessions.filter(s => s.node_endpoint === node);
    }
    
    // Filter by active status if provided
    if (active !== undefined) {
      const isActive = active === 'true';
      filteredSessions = filteredSessions.filter(s => s.is_active === isActive);
    }
    
    res.json({ 
      success: true,
      sessions: filteredSessions,
      count: filteredSessions.length 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new session
app.post('/sessions', async (req, res) => {
  try {
    const { 
      user_wallet,
      node_endpoint,
      node_location,
      subscription_type 
    } = req.body;
    
    if (!user_wallet || !node_endpoint) {
      return res.status(400).json({ error: 'user_wallet and node_endpoint are required' });
    }
    
    // Find the node
    const node = realNodes.find(n => n.endpoint === node_endpoint);
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    // Create session
    const session = {
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user_wallet,
      node_endpoint,
      node_location: node_location || node.location,
      node_provider: node.provider,
      start_time: new Date().toISOString(),
      end_time: null,
      is_active: true,
      bytes_used: 0,
      amount_paid: 0,
      subscription_type: subscription_type || 'unknown',
      price_per_minute_lamports: node.price_per_minute_lamports
    };
    
    activeSessions.push(session);
    
    // Update node's active sessions count
    node.active_sessions = (node.active_sessions || 0) + 1;
    
    // Save to file
    saveSessionsToFile();
    
    console.log(`✅ Session created: ${session.id} for wallet ${user_wallet}`);
    
    res.json({ 
      success: true,
      session,
      message: 'Session created successfully'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// End a session
app.put('/sessions/:id/end', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { bytes_used } = req.body;
    
    const sessionIndex = activeSessions.findIndex(s => s.id === sessionId);
    if (sessionIndex === -1) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const session = activeSessions[sessionIndex];
    
    // Calculate duration and cost
    const endTime = new Date();
    const startTime = new Date(session.start_time);
    const durationMinutes = Math.ceil((endTime - startTime) / 60000);
    const cost = durationMinutes * session.price_per_minute_lamports;
    
    // Update session
    session.end_time = endTime.toISOString();
    session.is_active = false;
    session.bytes_used = bytes_used || session.bytes_used;
    session.amount_paid = cost;
    session.duration_minutes = durationMinutes;
    
    // Update node's active sessions count
    const node = realNodes.find(n => n.endpoint === session.node_endpoint);
    if (node) {
      node.active_sessions = Math.max(0, (node.active_sessions || 1) - 1);
      node.total_earnings = (node.total_earnings || 0) + cost;
    }
    
    // Save to file
    saveSessionsToFile();
    
    console.log(`🔚 Session ended: ${sessionId}, duration: ${durationMinutes} min, cost: ${cost / 1e9} SOL`);
    
    res.json({ 
      success: true,
      session,
      message: 'Session ended successfully'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// End session by wallet (useful when we don't have session ID)
app.put('/sessions/end-by-wallet/:wallet', async (req, res) => {
  try {
    const wallet = req.params.wallet;
    const { bytes_used } = req.body;
    
    // Find active session for this wallet
    const sessionIndex = activeSessions.findIndex(s => s.user_wallet === wallet && s.is_active);
    if (sessionIndex === -1) {
      return res.status(404).json({ error: 'No active session found for this wallet' });
    }
    
    const session = activeSessions[sessionIndex];
    
    // Calculate duration and cost
    const endTime = new Date();
    const startTime = new Date(session.start_time);
    const durationMinutes = Math.ceil((endTime - startTime) / 60000);
    const cost = durationMinutes * session.price_per_minute_lamports;
    
    // Update session
    session.end_time = endTime.toISOString();
    session.is_active = false;
    session.bytes_used = bytes_used || session.bytes_used;
    session.amount_paid = cost;
    session.duration_minutes = durationMinutes;
    
    // Update node's active sessions count
    const node = realNodes.find(n => n.endpoint === session.node_endpoint);
    if (node) {
      node.active_sessions = Math.max(0, (node.active_sessions || 1) - 1);
      node.total_earnings = (node.total_earnings || 0) + cost;
    }
    
    // Save to file
    saveSessionsToFile();
    
    console.log(`🔚 Session ended for wallet ${wallet}: duration: ${durationMinutes} min`);
    
    res.json({ 
      success: true,
      session,
      message: 'Session ended successfully'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Withdrawals storage
const WITHDRAWALS_FILE = path.join(__dirname, 'withdrawals.json');
let withdrawals = [];

// Load withdrawals from file
function loadWithdrawalsFromFile() {
  try {
    if (fs.existsSync(WITHDRAWALS_FILE)) {
      const data = JSON.parse(fs.readFileSync(WITHDRAWALS_FILE, 'utf8'));
      return data.withdrawals || [];
    }
  } catch (error) {
    console.error('Error loading withdrawals file:', error.message);
  }
  return [];
}

// Save withdrawals to file
function saveWithdrawalsToFile() {
  try {
    fs.writeFileSync(WITHDRAWALS_FILE, JSON.stringify({ 
      withdrawals,
      updated_at: new Date().toISOString()
    }, null, 2));
  } catch (error) {
    console.error('Error saving withdrawals file:', error.message);
  }
}

// Initialize withdrawals
withdrawals = loadWithdrawalsFromFile();

// Get provider earnings summary
app.get('/providers/:wallet/earnings', async (req, res) => {
  try {
    const wallet = req.params.wallet;
    
    // Find provider's nodes
    const providerNodes = realNodes.filter(n => n.provider === wallet);
    
    if (providerNodes.length === 0) {
      return res.json({
        success: true,
        wallet,
        total_earnings: 0,
        withdrawn_amount: 0,
        available_balance: 0,
        nodes_count: 0
      });
    }
    
    // Calculate total earnings from all nodes
    const totalEarnings = providerNodes.reduce((sum, n) => sum + (n.total_earnings || 0), 0);
    
    // Calculate total withdrawn
    const providerWithdrawals = withdrawals.filter(w => w.wallet === wallet && w.status === 'completed');
    const withdrawnAmount = providerWithdrawals.reduce((sum, w) => sum + w.amount, 0);
    
    // Available balance
    const availableBalance = Math.max(0, totalEarnings - withdrawnAmount);
    
    res.json({
      success: true,
      wallet,
      total_earnings: totalEarnings,
      total_earnings_sol: (totalEarnings / 1e9).toFixed(6),
      withdrawn_amount: withdrawnAmount,
      withdrawn_amount_sol: (withdrawnAmount / 1e9).toFixed(6),
      available_balance: availableBalance,
      available_balance_sol: (availableBalance / 1e9).toFixed(6),
      nodes_count: providerNodes.length,
      nodes: providerNodes.map(n => ({
        endpoint: n.endpoint,
        location: n.location,
        earnings: n.total_earnings || 0,
        earnings_sol: ((n.total_earnings || 0) / 1e9).toFixed(6)
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Withdraw/Claim earnings
app.post('/providers/:wallet/withdraw', async (req, res) => {
  try {
    const wallet = req.params.wallet;
    const { amount } = req.body; // Optional: specific amount, otherwise withdraw all available
    
    // Find provider's nodes
    const providerNodes = realNodes.filter(n => n.provider === wallet);
    
    if (providerNodes.length === 0) {
      return res.status(404).json({ error: 'No nodes found for this wallet' });
    }
    
    // Calculate total earnings
    const totalEarnings = providerNodes.reduce((sum, n) => sum + (n.total_earnings || 0), 0);
    
    // Calculate total already withdrawn
    const providerWithdrawals = withdrawals.filter(w => w.wallet === wallet && w.status === 'completed');
    const withdrawnAmount = providerWithdrawals.reduce((sum, w) => sum + w.amount, 0);
    
    // Available balance
    const availableBalance = Math.max(0, totalEarnings - withdrawnAmount);
    
    // Determine withdrawal amount
    const withdrawAmount = amount ? Math.min(amount, availableBalance) : availableBalance;
    
    if (withdrawAmount <= 0) {
      return res.status(400).json({ 
        error: 'No earnings available to withdraw',
        total_earnings: totalEarnings,
        withdrawn_amount: withdrawnAmount,
        available_balance: availableBalance
      });
    }
    
    // Create withdrawal record
    const withdrawal = {
      id: `withdrawal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      wallet,
      amount: withdrawAmount,
      amount_sol: (withdrawAmount / 1e9).toFixed(6),
      status: 'pending', // pending -> processing -> completed/failed
      created_at: new Date().toISOString(),
      completed_at: null,
      tx_signature: null
    };
    
    withdrawals.push(withdrawal);
    saveWithdrawalsToFile();
    
    console.log(`💸 Withdrawal initiated: ${withdrawal.id} for ${withdrawal.amount_sol} SOL to ${wallet}`);
    
    // In a real system, this would:
    // 1. Call the Solana program's claim_payout instruction
    // 2. Wait for confirmation
    // 3. Update the withdrawal status
    
    // For now, we'll simulate instant completion
    setTimeout(() => {
      withdrawal.status = 'completed';
      withdrawal.completed_at = new Date().toISOString();
      withdrawal.tx_signature = `simulated_${Date.now()}`;
      saveWithdrawalsToFile();
      console.log(`✅ Withdrawal completed: ${withdrawal.id}`);
    }, 2000);
    
    res.json({
      success: true,
      message: `Withdrawal of ${withdrawal.amount_sol} SOL initiated`,
      withdrawal,
      remaining_balance: availableBalance - withdrawAmount,
      remaining_balance_sol: ((availableBalance - withdrawAmount) / 1e9).toFixed(6)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get withdrawal history
app.get('/providers/:wallet/withdrawals', async (req, res) => {
  try {
    const wallet = req.params.wallet;
    const providerWithdrawals = withdrawals.filter(w => w.wallet === wallet);
    
    res.json({
      success: true,
      withdrawals: providerWithdrawals,
      count: providerWithdrawals.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// IPFS Node Registry Endpoints
// ============================================

// Publish all nodes to IPFS (permanent storage via Pinata)
app.post('/ipfs/publish', async (req, res) => {
  try {
    console.log('📤 Publishing nodes to IPFS via Pinata...');
    
    const cid = await ipfsNodes.publishNodesToIPFS(realNodes);
    
    if (cid) {
      res.json({
        success: true,
        message: 'Nodes published to IPFS permanently via Pinata!',
        cid: cid,
        node_count: realNodes.length,
        view_urls: [
          `https://gateway.pinata.cloud/ipfs/${cid}`,
          `https://ipfs.io/ipfs/${cid}`,
          `https://cloudflare-ipfs.com/ipfs/${cid}`
        ],
        api_url: `http://localhost:${PORT}/ipfs/fetch/${cid}`
      });
    } else {
      res.status(500).json({ error: 'Failed to publish to IPFS' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List all pinned files on Pinata
app.get('/ipfs/pins', async (req, res) => {
  try {
    const pins = await ipfsNodes.listPinnedFiles();
    res.json({
      success: true,
      count: pins.length,
      pins: pins.map(p => ({
        cid: p.ipfs_pin_hash,
        name: p.metadata?.name,
        size: p.size,
        date: p.date_pinned
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch nodes from IPFS by CID
app.get('/ipfs/fetch/:cid', async (req, res) => {
  try {
    const cid = req.params.cid;
    console.log(`📥 Fetching nodes from IPFS: ${cid}`);
    
    const data = await ipfsNodes.fetchFromIPFS(cid);
    res.json({
      success: true,
      cid: cid,
      ...data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync nodes from IPFS registry
app.post('/ipfs/sync', async (req, res) => {
  try {
    const registryCid = req.body.cid;
    const beforeCount = realNodes.length;
    
    realNodes = await ipfsNodes.syncNodesFromIPFS(realNodes, registryCid);
    const added = realNodes.length - beforeCount;
    
    res.json({
      success: true,
      message: `Synced from IPFS`,
      nodes_before: beforeCount,
      nodes_after: realNodes.length,
      nodes_added: added
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get IPFS registry info
app.get('/ipfs/registry', (req, res) => {
  const registry = ipfsNodes.loadRegistry();
  res.json({
    ...registry,
    current_nodes: realNodes.length,
    gateways: ipfsNodes.IPFS_GATEWAYS,
    known_registries: ipfsNodes.KNOWN_REGISTRIES
  });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('   DVPN API - Real Nodes + IPFS Registry');
  console.log('═══════════════════════════════════════════════');
  console.log(`   🌐 API: http://localhost:${PORT}`);
  console.log(`   ✅ Health: http://localhost:${PORT}/health`);
  console.log(`   📍 Nodes: http://localhost:${PORT}/nodes`);
  console.log('');
  console.log(`   ✅ Serving ${realNodes.length} real VPN node(s)`);
  console.log('');
  console.log('   📦 IPFS Endpoints:');
  console.log(`      POST /ipfs/publish - Publish nodes to IPFS`);
  console.log(`      GET  /ipfs/fetch/:cid - Fetch nodes from IPFS`);
  console.log(`      POST /ipfs/sync - Sync nodes from IPFS registry`);
  console.log(`      GET  /ipfs/registry - Get registry info`);
  console.log('═══════════════════════════════════════════════');
  
  // Auto-sync from known registries on startup
  const registry = ipfsNodes.loadRegistry();
  if (registry.registryCid) {
    console.log(`\n📥 Syncing from IPFS registry: ${registry.registryCid}`);
    realNodes = await ipfsNodes.syncNodesFromIPFS(realNodes, registry.registryCid);
    console.log(`   Total nodes: ${realNodes.length}`);
  }
});
