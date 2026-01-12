# Manual WireGuard Server Deployment Guide
**Target Server**: 64.227.150.205

## Prerequisites
1. SSH access to the server: `ssh root@64.227.150.205`
2. Ubuntu/Debian server (or CentOS/RHEL)

---

## Step 1: Setup SSH Access

If SSH is timing out, check with your hosting provider:
- Enable SSH access (port 22)
- Add firewall rule for SSH
- Get root password or add SSH key

Test connection:
```bash
ssh root@64.227.150.205
```

---

## Step 2: Upload Setup Script

Once SSH works, upload the setup script:

```bash
cd /Users/sheikhhamza/BBTProjects/VPN/fix/fixed-DVPN
scp scripts/setup_wireguard_server.sh root@64.227.150.205:/tmp/
```

---

## Step 3: Run Setup on Server

SSH to the server and run:

```bash
ssh root@64.227.150.205
cd /tmp
chmod +x setup_wireguard_server.sh
bash setup_wireguard_server.sh
```

This will:
- ✅ Install WireGuard
- ✅ Generate server keys
- ✅ Configure firewall (UDP 51820)
- ✅ Enable IP forwarding
- ✅ Setup systemd service
- ✅ Install Node.js for daemon

**Save the WireGuard public key shown at the end!**

---

## Step 4: Get WireGuard Public Key

```bash
ssh root@64.227.150.205 "cat /etc/wireguard/server_public.key"
```

Copy this key - you'll need it for registration.

---

## Step 5: Upload Node Daemon

Create a simple node daemon on the server:

```bash
ssh root@64.227.150.205
cd /opt/dvpn-node
```

Create `daemon.js`:

```javascript
const http = require('http');
const { exec } = require('child_process');

const PORT = 3000;
const WG_INTERFACE = 'wg0';
const activeSessions = new Map();

// Helper to execute commands
function execCmd(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

// Allocate IP for client
function allocateIp() {
  const base = 4;
  const used = new Set([...activeSessions.values()].map(s => s.clientIp));
  for (let i = base; i < 254; i++) {
    const ip = `10.10.0.${i}`;
    if (!used.has(ip)) return ip;
  }
  throw new Error('No available IPs');
}

// Add WireGuard peer
async function addPeer(clientPubkey, clientIp) {
  await execCmd(`wg set ${WG_INTERFACE} peer ${clientPubkey} allowed-ips ${clientIp}/32`);
  console.log(`Added peer: ${clientPubkey} -> ${clientIp}`);
}

// Remove peer
async function removePeer(clientPubkey) {
  await execCmd(`wg set ${WG_INTERFACE} peer ${clientPubkey} remove`);
  console.log(`Removed peer: ${clientPubkey}`);
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // GET /health
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', sessions: activeSessions.size }));
    return;
  }
  
  // GET /node
  if (url.pathname === '/node') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      endpoint: '64.227.150.205:51820',
      region: 'nyc',
      wg_public_key: 'SERVER_WG_PUBLIC_KEY_HERE',
      capacity: 100,
      active_sessions: activeSessions.size
    }));
    return;
  }
  
  // POST /session/auth
  if (url.pathname === '/session/auth' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { sessionPda, clientWgPubkey } = JSON.parse(body);
        const clientIp = allocateIp();
        await addPeer(clientWgPubkey, clientIp);
        
        activeSessions.set(sessionPda, {
          clientWgPubkey,
          clientIp,
          startTime: Date.now()
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          clientIp,
          serverWgPubkey: 'SERVER_WG_PUBLIC_KEY_HERE',
          endpoint: '64.227.150.205:51820'
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }
  
  // DELETE /session/:pda
  if (url.pathname.startsWith('/session/') && req.method === 'DELETE') {
    const sessionPda = url.pathname.split('/')[2];
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
  
  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`DVPN Node Daemon running on port ${PORT}`);
  console.log(`Server: 64.227.150.205:51820`);
});
```

**Important**: Replace `SERVER_WG_PUBLIC_KEY_HERE` with your actual WireGuard public key!

Install dependencies:
```bash
npm init -y
npm install
```

---

## Step 6: Create Systemd Service

```bash
cat > /etc/systemd/system/dvpn-node.service << 'EOF'
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

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable dvpn-node
systemctl start dvpn-node
```

---

## Step 7: Verify Everything Works

```bash
# Check WireGuard
wg show

# Check daemon
systemctl status dvpn-node
curl http://localhost:3000/health

# Check firewall
ufw status
```

---

## Step 8: Update Local App

Update the mock indexer to use real server:

Edit: `/Users/sheikhhamza/BBTProjects/VPN/fix/fixed-DVPN/scripts/mock_indexer.js`

Replace the NYC node with real WireGuard public key:

```javascript
{
  pubkey: '64.227.150.205:51820',
  provider: 'HHec6TGxWMq9MwuMMUNCMU79hbkieGqQi2aeouYznhMd',
  node_id: '2',
  endpoint: '64.227.150.205:51820',
  region: 'nyc',
  price_per_minute_lamports: 1000000,
  wg_server_pubkey: 'YOUR_REAL_WG_PUBLIC_KEY',  // <-- Put real key here
  max_capacity: 100,
  active_sessions: 0,
  is_active: true,
  reputation_score: 1000
}
```

---

## Step 9: Test Real Connection

1. Restart mock indexer: `pkill mock_indexer && PORT=8080 node scripts/mock_indexer.js &`
2. Restart Electron app
3. Select NYC node
4. Click "Connect to VPN"
5. Check your IP at whatismyipaddress.com
6. Should show: 64.227.150.205 (New York)

---

## Troubleshooting

### SSH Not Working
- Check with hosting provider (DigitalOcean, AWS, etc.)
- Ensure port 22 is open in firewall
- Try password auth: `ssh root@64.227.150.205` (enter password)

### WireGuard Not Starting
```bash
journalctl -u wg-quick@wg0 -f
systemctl restart wg-quick@wg0
```

### Daemon Not Working
```bash
journalctl -u dvpn-node -f
cd /opt/dvpn-node && node daemon.js
```

### Port 51820 Blocked
Open UDP port 51820:
```bash
ufw allow 51820/udp
# OR for firewalld:
firewall-cmd --permanent --add-port=51820/udp
firewall-cmd --reload
```

### Can't Connect from Client
- Check server firewall allows UDP 51820
- Check daemon running: `curl http://64.227.150.205:3000/health`
- Check WireGuard running: `wg show`

---

## Quick Deploy (If SSH Works)

If you get SSH working, use the automated script:

```bash
cd /Users/sheikhhamza/BBTProjects/VPN/fix/fixed-DVPN
./scripts/deploy_node.sh
```

This will do all steps automatically!

---

## After Deployment

Your VPN will be fully functional:
- ✅ Real IP change (Pakistan → New York)
- ✅ Encrypted tunnel via WireGuard
- ✅ On-chain session management
- ✅ Usage-based billing ready

**Your IP will actually change to 64.227.150.205 when connected!**
