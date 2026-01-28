// Simple Mock Indexer API for Testing
// Provides node data without needing PostgreSQL

const http = require('http');
const url = require('url');

// Mock node data (from our registered node)
const mockNodes = [
  {
    pubkey: '3TXwC1yPntAHpHUSW1JRbtpvskQ87FZ1Tor6prdHcRYG',
    provider: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6',
    node_id: '1',
    endpoint: '192.168.1.1:51820',
    region: 'local',
    price_per_minute_lamports: 1000000, // 0.001 SOL per minute = 0.06 SOL/hour
    wg_server_pubkey: 'mock_wg_public_key_base64==',
    max_capacity: 100,
    active_sessions: 0,
    is_active: true,
    reputation_score: 1000 // 0-1000 scale (100%)
  },
  {
    pubkey: '64.227.150.205:41194',
    provider: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6',
    node_id: '2',
    endpoint: '64.227.150.205:41194',
    region: 'nyc',
    price_per_minute_lamports: 1000000, // 0.001 SOL per minute = 0.06 SOL/hour
    wg_server_pubkey: '8Cb9gEAKpJUWLBPx7s32DYUOIhLPyaFVGsGv93j0nH0=',
    max_capacity: 100,
    active_sessions: 0,
    is_active: true,
    reputation_score: 1000 // 0-1000 scale (100%)
  }
];

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // GET /health
  if (pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }
  
  // GET /nodes
  if (pathname === '/nodes') {
    const region = parsedUrl.query.region;
    let filteredNodes = mockNodes;
    
    if (region && region !== 'all') {
      filteredNodes = mockNodes.filter(n => n.region === region);
    }
    
    res.writeHead(200);
    res.end(JSON.stringify({ nodes: filteredNodes, count: filteredNodes.length }));
    return;
  }
  
  // GET /node (info about daemon's node)
  if (pathname === '/node') {
    res.writeHead(200);
    res.end(JSON.stringify({
      endpoint: '192.168.1.1:51820',
      region: 'local',
      wg_public_key: 'mock_wg_public_key',
      capacity: 100,
      active_sessions: 0
    }));
    return;
  }
  
  // GET /sessions
  if (pathname === '/sessions') {
    res.writeHead(200);
    res.end(JSON.stringify({ sessions: [], count: 0 }));
    return;
  }
  
  // POST /session/auth
  if (pathname === '/session/auth' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          clientIp: '10.10.0.10',
          serverWgPubkey: 'mock_wg_public_key',
          endpoint: '192.168.1.1:51820'
        }));
      } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }
  
  // 404
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log(`Mock Indexer API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Nodes: http://localhost:${PORT}/nodes`);
  console.log('');
  console.log('Mock nodes available:');
  mockNodes.forEach(n => {
    console.log(`  - ${n.region}: ${n.endpoint} (${n.pubkey.substring(0, 8)}...)`);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
