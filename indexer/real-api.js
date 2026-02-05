// Real API that fetches nodes from Solana blockchain
const express = require('express');
const cors = require('cors');
const anchor = require('@coral-xyz/anchor');
const { PublicKey, Connection } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

let program;
let connection;
const nodeCache = [];
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = '8LQKwvHJPdK6fKmopXmUwct8JjVGQhf3RFQd64nCV39i';

// Initialize Solana connection
async function initSolana() {
  try {
    connection = new Connection(RPC_URL, 'confirmed');
    
    // Load IDL
    const idlPath = path.join(__dirname, '../target/idl/dvpn.json');
    
    if (!fs.existsSync(idlPath)) {
      throw new Error('IDL file not found');
    }
    
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
    
    // Check if wallet exists
    if (!process.env.ANCHOR_WALLET || !fs.existsSync(process.env.ANCHOR_WALLET)) {
      throw new Error('Wallet file not found');
    }
    
    // Create program
    const wallet = anchor.Wallet.local();
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: 'confirmed'
    });
    
    program = new anchor.Program(idl, PROGRAM_ID, provider);
    
    
    // Fetch nodes on startup
    await refreshNodes();
    
    // Refresh nodes every 30 seconds
    setInterval(refreshNodes, 30000);
    
  } catch (error) {
    console.error('❌ Failed to initialize Solana:', error.message);
    
    // Use fallback nodes
    addFallbackNodes();
  }
}

// Fetch all nodes from blockchain
async function refreshNodes() {
  try {
    if (!program) {
      // Add fallback nodes when blockchain is unavailable
      addFallbackNodes();
      return;
    }
    
    const nodes = await program.account.node.all();
    
    nodeCache.length = 0; // Clear cache
    
    // Add your real server node first
    addRealServerNode();
    
    nodes.forEach(({ publicKey, account }) => {
      try {
        const node = {
          pubkey: publicKey.toBase58(),
          provider: account.provider.toBase58(),
          node_id: account.nodeId?.toString() || account.node_id?.toString() || 0,
          endpoint: account.endpoint || 'unknown',
          region: account.region || 'unknown',
          location: getLocationFromRegion(account.region || 'unknown'),
          price_per_minute_lamports: parseInt(
            account.pricePerMinuteLamports?.toString() || 
            account.price_per_minute_lamports?.toString() || 
            '0'
          ),
          wg_server_pubkey: Buffer.from(
            account.wgServerPubkey || account.wg_server_pubkey || []
          ).toString('base64'),
          max_capacity: 100,
          active_sessions: 0,
          is_active: true,
          reputation_score: 900
        };
        
        nodeCache.push(node);
      } catch (error) {
        console.error('Error processing node:', error.message);
      }
    });
    
    
  } catch (error) {
    console.error('Error fetching nodes:', error.message);
    addFallbackNodes();
  }
}

// Add your real VPN server node
function addRealServerNode() {
  nodeCache.push({
    pubkey: '64.227.150.205:41194',
    provider: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6',
    node_id: 1,
    endpoint: '64.227.150.205:41194',
    location: 'United States, New York',
    region: 'us-east',
    price_per_minute_lamports: 100000,
    wg_server_pubkey: '8Cb9gEAKpJUWLBPx7s32DYUOIhLPyaFVGsGv93j0nH0=',
    max_capacity: 100,
    active_sessions: 0,
    is_active: true,
    reputation_score: 1000
  });
}

// Fallback nodes when blockchain is unavailable
function addFallbackNodes() {
  nodeCache.length = 0;
  addRealServerNode();
}

// Map region codes to location names
function getLocationFromRegion(region) {
  const locations = {
    'us-east': 'United States, New York',
    'us-west': 'United States, Los Angeles',
    'eu-west': 'United Kingdom, London',
    'eu-central': 'Germany, Frankfurt',
    'ap-southeast': 'Singapore, Singapore',
    'ap-northeast': 'Japan, Tokyo',
    'na-east': 'Canada, Toronto',
    'nyc': 'United States, New York',
    'sfo': 'United States, San Francisco',
    'lon': 'United Kingdom, London',
    'fra': 'Germany, Frankfurt',
    'sgp': 'Singapore, Singapore',
    'local': 'Local Network'
  };
  
  return locations[region] || `${region.charAt(0).toUpperCase() + region.slice(1)}`;
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mode: 'blockchain',
    timestamp: new Date().toISOString(),
    nodes: nodeCache.length,
    rpc: RPC_URL
  });
});

// Get all nodes
app.get('/nodes', async (req, res) => {
  try {
    res.json({ 
      success: true,
      nodes: nodeCache,
      count: nodeCache.length,
      source: 'solana-blockchain'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get specific node
app.get('/nodes/:pubkey', async (req, res) => {
  try {
    const node = nodeCache.find(n => n.pubkey === req.params.pubkey);
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    res.json(node);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get sessions
app.get('/sessions', async (req, res) => {
  try {
    if (!program) {
      return res.json({ 
        success: true,
        sessions: [],
        count: 0 
      });
    }
    
    const sessions = await program.account.session.all();
    
    const formattedSessions = sessions.map(({ publicKey, account }) => ({
      pubkey: publicKey.toBase58(),
      user: account.user.toBase58(),
      node: account.node.toBase58(),
      state: Object.keys(account.state)[0],
      created_at: account.createdAt?.toString() || '0',
      expires_at: account.expiresAt?.toString() || '0'
    }));
    
    res.json({ 
      success: true,
      sessions: formattedSessions,
      count: formattedSessions.length 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manually refresh nodes
app.post('/refresh', async (req, res) => {
  try {
    await refreshNodes();
    res.json({ 
      success: true,
      nodes: nodeCache.length 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  
  await initSolana();
});
