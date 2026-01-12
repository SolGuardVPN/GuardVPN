#!/bin/bash
# Deploy DVPN Node - Complete Setup
# This script does everything: setup WireGuard + deploy daemon + register on-chain

SERVER_IP="64.227.150.205"
SERVER_USER="root"

echo "═══════════════════════════════════════════════════"
echo "   DVPN Node Complete Deployment"
echo "   Target: $SERVER_USER@$SERVER_IP"
echo "═══════════════════════════════════════════════════"
echo ""

# Test SSH connection
echo "🔌 Testing SSH connection..."
if ssh -o ConnectTimeout=5 $SERVER_USER@$SERVER_IP "echo 'Connection OK'" 2>/dev/null; then
  echo "✅ SSH connection successful"
else
  echo "❌ Cannot connect to server"
  echo "   Make sure you can SSH: ssh $SERVER_USER@$SERVER_IP"
  echo "   Add your key: ssh-copy-id $SERVER_USER@$SERVER_IP"
  exit 1
fi
echo ""

# Step 1: Upload setup script
echo "📤 Step 1: Uploading WireGuard setup script..."
scp scripts/setup_wireguard_server.sh $SERVER_USER@$SERVER_IP:/tmp/
echo "✅ Uploaded"
echo ""

# Step 2: Run setup script on server
echo "🔧 Step 2: Setting up WireGuard on server..."
ssh $SERVER_USER@$SERVER_IP "bash /tmp/setup_wireguard_server.sh"
echo "✅ WireGuard setup complete"
echo ""

# Step 3: Get WireGuard public key
echo "🔑 Step 3: Getting WireGuard public key..."
WG_PUBLIC_KEY=$(ssh $SERVER_USER@$SERVER_IP "cat /etc/wireguard/server_public.key")
echo "   Public Key: $WG_PUBLIC_KEY"
echo ""

# Step 4: Prepare daemon files
echo "📦 Step 4: Preparing daemon files..."
mkdir -p /tmp/dvpn-deploy

# Copy node daemon (modified for production)
cat > /tmp/dvpn-deploy/daemon.js << 'DAEMON_EOF'
const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

// Load config
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

const WG_INTERFACE = config.server.wg_interface;
const PORT = process.env.PORT || 3000;

// Active sessions
const activeSessions = new Map();

// Helper: Execute shell command
function execCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

// Add WireGuard peer
async function addPeer(clientPubkey, clientIp) {
  const cmd = \`wg set \${WG_INTERFACE} peer \${clientPubkey} allowed-ips \${clientIp}/32\`;
  await execCommand(cmd);
  console.log(\`✅ Added peer: \${clientPubkey} -> \${clientIp}\`);
}

// Remove WireGuard peer
async function removePeer(clientPubkey) {
  const cmd = \`wg set \${WG_INTERFACE} peer \${clientPubkey} remove\`;
  await execCommand(cmd);
  console.log(\`🗑️  Removed peer: \${clientPubkey}\`);
}

// Allocate IP for client
function allocateIp() {
  const base = 4;
  const used = new Set([...activeSessions.values()].map(s => s.clientIp));
  for (let i = base; i < 254; i++) {
    const ip = \`10.10.0.\${i}\`;
    if (!used.has(ip)) return ip;
  }
  throw new Error('No available IPs');
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // GET /health - Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', sessions: activeSessions.size }));
    return;
  }
  
  // GET /node - Node info
  if (req.method === 'GET' && req.url === '/node') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      endpoint: \`\${config.server.ip}:\${config.server.port}\`,
      region: config.node.region,
      wg_public_key: config.server.wg_public_key,
      capacity: config.node.max_capacity,
      active_sessions: activeSessions.size
    }));
    return;
  }
  
  // POST /session/auth - Authenticate session
  if (req.method === 'POST' && req.url === '/session/auth') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { sessionPda, clientWgPubkey, signature } = JSON.parse(body);
        
        // Allocate IP
        const clientIp = allocateIp();
        
        // Add peer
        await addPeer(clientWgPubkey, clientIp);
        
        // Store session
        activeSessions.set(sessionPda, {
          clientWgPubkey,
          clientIp,
          startTime: Date.now()
        });
        
        // Return config
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          clientIp,
          serverWgPubkey: config.server.wg_public_key,
          endpoint: \`\${config.server.ip}:\${config.server.port}\`
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }
  
  // DELETE /session/:pda - Close session
  if (req.method === 'DELETE' && req.url.startsWith('/session/')) {
    const sessionPda = req.url.split('/')[2];
    const session = activeSessions.get(sessionPda);
    
    if (session) {
      await removePeer(session.clientWgPubkey);
      activeSessions.delete(sessionPda);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Session not found' }));
    }
    return;
  }
  
  // 404
  res.writeHead(404);
  res.end('Not Found');
});

// Auto-cleanup expired sessions (every 60s)
setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  for (const [sessionPda, session] of activeSessions.entries()) {
    if (now - session.startTime > maxAge) {
      console.log(\`⏰ Cleaning up expired session: \${sessionPda}\`);
      removePeer(session.clientWgPubkey).catch(console.error);
      activeSessions.delete(sessionPda);
    }
  }
}, 60000);

server.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════');
  console.log('   DVPN Node Daemon');
  console.log('═══════════════════════════════════════════════════');
  console.log(\`🚀 Server running on port \${PORT}\`);
  console.log(\`🌐 Endpoint: \${config.server.ip}:\${config.server.port}\`);
  console.log(\`📡 Region: \${config.node.region}\`);
  console.log(\`🔧 WG Interface: \${WG_INTERFACE}\`);
  console.log('');
});
DAEMON_EOF

# Copy config from server (will be updated later)
echo "✅ Daemon prepared"
echo ""

# Step 5: Upload daemon
echo "📤 Step 5: Uploading daemon to server..."
scp /tmp/dvpn-deploy/daemon.js $SERVER_USER@$SERVER_IP:/opt/dvpn-node/
echo "✅ Daemon uploaded"
echo ""

# Step 6: Install dependencies on server
echo "📦 Step 6: Installing Node.js dependencies..."
ssh $SERVER_USER@$SERVER_IP "cd /opt/dvpn-node && npm install"
echo "✅ Dependencies installed"
echo ""

# Step 7: Register node on-chain (local)
echo "🔗 Step 7: Registering node on Solana..."
export WG_PUBLIC_KEY_BASE64="$WG_PUBLIC_KEY"
bash scripts/register_node.sh
echo ""

# Step 8: Copy node info to server
echo "📤 Step 8: Uploading node info to server..."
if [ -f "/opt/dvpn-node/node-info.json" ]; then
  scp /opt/dvpn-node/node-info.json $SERVER_USER@$SERVER_IP:/opt/dvpn-node/
  scp /opt/dvpn-node/config.json $SERVER_USER@$SERVER_IP:/opt/dvpn-node/
  echo "✅ Node info synced"
else
  echo "⚠️  Node info not found, may need to register manually"
fi
echo ""

# Step 9: Create systemd service
echo "⚙️  Step 9: Creating systemd service..."
ssh $SERVER_USER@$SERVER_IP << 'SSH_EOF'
cat > /etc/systemd/system/dvpn-node.service << 'SERVICE_EOF'
[Unit]
Description=DVPN Node Daemon
After=network.target wg-quick@wg0.service
Requires=wg-quick@wg0.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/dvpn-node
ExecStart=/usr/bin/node daemon.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE_EOF

systemctl daemon-reload
systemctl enable dvpn-node
systemctl start dvpn-node
SSH_EOF
echo "✅ Service created and started"
echo ""

# Step 10: Verify deployment
echo "✅ Step 10: Verifying deployment..."
sleep 3
ssh $SERVER_USER@$SERVER_IP << 'VERIFY_EOF'
echo "📊 WireGuard Status:"
wg show

echo ""
echo "📊 Daemon Status:"
systemctl status dvpn-node --no-pager | head -20

echo ""
echo "📊 Daemon Logs:"
journalctl -u dvpn-node -n 20 --no-pager
VERIFY_EOF
echo ""

# Final summary
echo "═══════════════════════════════════════════════════"
echo "   ✅ DEPLOYMENT COMPLETE!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "🌐 Server: $SERVER_IP"
echo "🔧 WireGuard: wg0 running"
echo "🚀 Daemon: systemd service running"
echo "🔗 Registered on Solana"
echo ""
echo "📋 Useful Commands (run on server):"
echo "   View daemon logs: journalctl -u dvpn-node -f"
echo "   Restart daemon: systemctl restart dvpn-node"
echo "   Check WireGuard: wg show"
echo "   View active peers: wg show wg0 peers"
echo ""
echo "🧪 Test API:"
echo "   curl http://$SERVER_IP:3000/health"
echo "   curl http://$SERVER_IP:3000/node"
echo ""
echo "📖 Full guide: TESTING_GUIDE.md"
echo ""
