# IPFS Decentralized Node Discovery Setup

## Overview

This setup enables fully decentralized VPN node discovery using IPFS (InterPlanetary File System). Nodes can announce themselves to the IPFS network, and clients discover them without relying on a centralized server.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  IPFS Network                       │
│            (Decentralized P2P Layer)               │
└─────────────────────────────────────────────────────┘
         ↑                    ↑                ↑
         │                    │                │
    ┌────┴─────┐        ┌────┴─────┐    ┌────┴─────┐
    │  VPN     │        │  VPN     │    │  Client  │
    │  Node 1  │        │  Node 2  │    │   App    │
    │ (Pub)    │        │ (Pub)    │    │  (Sub)   │
    └──────────┘        └──────────┘    └──────────┘
     Germany             UAE              User
```

## Your VPN Nodes

### Node 1: Germany (Frankfurt)
- **IP**: `31.57.228.54`
- **Port**: `51820` (WireGuard default)
- **Location**: Germany, Frankfurt
- **Region Code**: `eu-central`

### Node 2: UAE (Dubai)  
- **IP**: `64.227.150.205`
- **Port**: `41194` (Custom WireGuard port)
- **Location**: UAE, Dubai
- **Region Code**: `me-dubai`

## Setup Options

### Option 1: Hybrid Indexer (Recommended)
Combines traditional API with IPFS for best reliability:
- Fast initial node loading (bootstrap nodes)
- Discovers additional nodes from IPFS network
- Falls back gracefully if IPFS unavailable

### Option 2: Pure IPFS (Fully Decentralized)
Relies entirely on IPFS PubSub:
- No centralized server needed
- Censorship resistant
- May take longer for initial discovery

### Option 3: Traditional API (Current)
Current setup with centralized indexer:
- Fast and reliable
- Single point of failure
- Easy to block/censor

## Quick Start

### 1. Install Dependencies

```bash
cd /Users/sheikhhamza/BBTProjects/VPN/fix/fixed-DVPN
npm install ipfs-core --save
```

### 2. Start Hybrid Indexer (Recommended)

```bash
# Stop current indexer
pkill -f simple-api.js

# Start hybrid indexer
cd indexer
node ipfs-indexer.js
```

This will:
- Start API server on port 3001
- Initialize IPFS node in background
- Serve bootstrap nodes immediately
- Discover additional nodes from IPFS
- Publish your nodes to IPFS network

### 3. Publish Nodes to IPFS (Standalone)

For running a dedicated publisher (optional):

```bash
cd scripts
node publish_nodes_to_ipfs.js
```

This will:
- Initialize IPFS node
- Publish both nodes to IPFS
- Re-announce every 5 minutes
- Monitor network for peer nodes

## Configuration

### Update WireGuard Public Keys

Edit the node configurations to include actual WireGuard public keys:

**For Node 1 (31.57.228.54):**
```bash
ssh root@31.57.228.54
cat /etc/wireguard/wg0.conf | grep PrivateKey
# Use corresponding public key
```

**For Node 2 (64.227.150.205):**
Already configured: `8Cb9gEAKpJUWLBPx7s32DYUOIhLPyaFVGsGv93j0nH0=`

Update in:
- `indexer/ipfs-indexer.js` (line 14)
- `scripts/publish_nodes_to_ipfs.js` (line 26)

### Network Settings

**IPFS Configuration:**
- Swarm Port: `4001` (TCP)
- WebSocket Port: `4002` (WS)
- Topic: `dvpn-nodes`

**Firewall Rules:**
```bash
# Allow IPFS swarm
sudo ufw allow 4001/tcp
sudo ufw allow 4002/tcp

# Allow WireGuard
sudo ufw allow 51820/udp  # Node 1
sudo ufw allow 41194/udp  # Node 2
```

## Client Integration

### Update App to Use IPFS Discovery

The app can discover nodes in two ways:

1. **HTTP API** (current):
```javascript
fetch('http://localhost:3001/nodes')
```

2. **Direct IPFS** (future):
```javascript
// Initialize IPFS in app
const ipfs = await IPFS.create();
await ipfs.pubsub.subscribe('dvpn-nodes', handleNodeAnnouncement);
```

For now, hybrid indexer provides both methods.

## Monitoring

### Check Indexer Status

```bash
curl http://localhost:3001/health | jq
```

Response:
```json
{
  "status": "ok",
  "mode": "hybrid",
  "nodes": {
    "known": 2,
    "ipfs": 0,
    "total": 2
  },
  "ipfs": {
    "enabled": true,
    "peers": 12,
    "peerId": "Qm..."
  }
}
```

### Check IPFS Stats

```bash
curl http://localhost:3001/ipfs/stats | jq
```

### Get All Nodes

```bash
curl http://localhost:3001/nodes | jq
```

Expected output:
```json
{
  "success": true,
  "count": 2,
  "nodes": [
    {
      "pubkey": "31.57.228.54:51820",
      "endpoint": "31.57.228.54:51820",
      "location": "Germany, Frankfurt",
      "region": "eu-central",
      "source": "bootstrap"
    },
    {
      "pubkey": "64.227.150.205:41194",
      "endpoint": "64.227.150.205:41194",
      "location": "UAE, Dubai",
      "region": "me-dubai",
      "source": "bootstrap"
    }
  ],
  "ipfs_enabled": true
}
```

## Deployment

### On VPN Servers

Run node publisher on each VPN server to announce availability:

```bash
# Install IPFS
wget https://dist.ipfs.io/go-ipfs/v0.17.0/go-ipfs_v0.17.0_linux-amd64.tar.gz
tar -xvzf go-ipfs_v0.17.0_linux-amd64.tar.gz
cd go-ipfs
sudo bash install.sh

# Initialize
ipfs init

# Configure
ipfs config Addresses.Gateway /ip4/0.0.0.0/tcp/8080
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'

# Start daemon
ipfs daemon &

# Run publisher (using your script)
cd /path/to/dvpn
node scripts/publish_nodes_to_ipfs.js
```

### As Systemd Service

Create `/etc/systemd/system/dvpn-ipfs-publisher.service`:

```ini
[Unit]
Description=DVPN IPFS Node Publisher
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/dvpn
ExecStart=/usr/bin/node scripts/publish_nodes_to_ipfs.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable dvpn-ipfs-publisher
sudo systemctl start dvpn-ipfs-publisher
sudo systemctl status dvpn-ipfs-publisher
```

## Testing

### 1. Test Hybrid Indexer

```bash
# Start indexer
cd indexer
node ipfs-indexer.js

# In another terminal, test endpoints
curl http://localhost:3001/health
curl http://localhost:3001/nodes
curl http://localhost:3001/ipfs/stats
```

### 2. Test Node Publisher

```bash
# Start publisher
cd scripts  
node publish_nodes_to_ipfs.js

# Watch for announcements
# Should see: "Published 2/2 nodes"
```

### 3. Test End-to-End

```bash
# Start indexer
node indexer/ipfs-indexer.js &

# Start publisher
node scripts/publish_nodes_to_ipfs.js &

# Wait 10 seconds for IPFS to sync

# Check nodes discovered
curl http://localhost:3001/nodes | jq '.nodes | length'
# Should be >= 2
```

### 4. Test in App

```bash
# Restart app
cd app
npm start

# Click "Dev Mode" wallet
# Click "🔄 Refresh" in locations
# Should see both nodes listed
```

## Troubleshooting

### IPFS Not Starting

```bash
# Check IPFS installation
npm list ipfs-core

# Reinstall if needed
npm install ipfs-core@latest

# Clear IPFS data
rm -rf ipfs-indexer-data
rm -rf ipfs-publisher-data
```

### Nodes Not Appearing

1. Check indexer is running:
```bash
lsof -ti:3001
curl http://localhost:3001/health
```

2. Check IPFS is initialized:
```bash
curl http://localhost:3001/ipfs/stats
```

3. Check logs for errors:
```bash
# Should see "IPFS ready" and "Subscribed to dvpn-nodes"
```

### Slow Discovery

IPFS discovery can take 30-60 seconds initially:
- Bootstrap nodes load immediately
- IPFS peers connect in background
- PubSub messages propagate gradually

Use hybrid mode for best UX.

### Firewall Blocking IPFS

```bash
# Check connectivity
telnet 31.57.228.54 4001
telnet 64.227.150.205 4001

# Open ports
sudo ufw allow 4001/tcp
sudo ufw allow 4002/tcp
```

## Production Recommendations

1. **Use Hybrid Indexer**: Best balance of speed and decentralization
2. **Run Publisher on VPN Servers**: Each node announces itself
3. **Monitor IPFS Health**: Track peer count and discovery rate
4. **Implement Reputation**: Track node uptime and quality
5. **Add Geographic Discovery**: Use IPFS DHT for location-based discovery
6. **Cache Nodes Client-Side**: Store last known nodes for offline start

## Next Steps

1. ✅ Configure WireGuard public keys
2. ✅ Test hybrid indexer locally
3. ✅ Deploy publisher to VPN servers
4. ✅ Update app to use new indexer
5. ⏭️ Add client-side IPFS discovery
6. ⏭️ Implement smart contract node registry
7. ⏭️ Add reputation scoring system

## Benefits of IPFS Integration

✅ **Decentralized**: No single point of failure
✅ **Censorship Resistant**: Hard to block P2P network
✅ **Global**: Works anywhere IPFS network exists
✅ **Scalable**: More nodes = stronger network
✅ **Content Addressed**: Nodes verified by cryptographic hash
✅ **Fallback Ready**: Hybrid mode ensures reliability

## Resources

- [IPFS Documentation](https://docs.ipfs.io/)
- [js-ipfs-core](https://github.com/ipfs/js-ipfs)
- [IPFS PubSub](https://docs.ipfs.io/concepts/pubsub/)
- [go-ipfs](https://github.com/ipfs/go-ipfs)
