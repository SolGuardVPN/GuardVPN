# Fully Decentralized DVPN with IPFS (No Database)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│          FULLY DECENTRALIZED ARCHITECTURE                │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ❌ NO PostgreSQL                                        │
│  ❌ NO Centralized Indexer                               │
│  ❌ NO Single Point of Failure                           │
│                                                           │
│  ✅ IPFS for Node Discovery                              │
│  ✅ PubSub for Real-time Updates                         │
│  ✅ Solana for Payments                                  │
│  ✅ WireGuard for VPN                                    │
│                                                           │
└─────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐
│ VPN Node 1   │◄───────►│ VPN Node 2   │
│ + IPFS       │   IPFS  │ + IPFS       │
└──────┬───────┘  PubSub └───────┬──────┘
       │                          │
       │      ┌──────────────┐    │
       └─────►│ IPFS Network │◄───┘
              │  (PubSub)    │
              └──────┬───────┘
                     │
              ┌──────▼───────┐
              │ Client App   │
              │ + IPFS Node  │
              └──────────────┘
```

## How It Works

### 1. Node Discovery (No Database!)

**Traditional (Centralized):**
```
Node → PostgreSQL → Indexer API → Client
        ❌ Single point of failure
```

**IPFS (Decentralized):**
```
Node → IPFS PubSub → All Clients
       ✅ Peer-to-peer
       ✅ No central server
       ✅ Censorship resistant
```

### 2. Data Flow

1. **VPN Node Announces Itself**
   - Node publishes info to IPFS
   - Data stored across IPFS network
   - Announces via PubSub to all listeners

2. **Clients Discover Nodes**
   - Client IPFS node subscribes to `dvpn-nodes` topic
   - Receives real-time node announcements
   - Caches active nodes locally

3. **Connection**
   - Client selects node from IPFS-discovered list
   - WireGuard connection established directly
   - Payment via Solana (decentralized)

## Setup Instructions

### Step 1: Install IPFS

**On Mac:**
```bash
brew install ipfs
```

**On Linux (VPN Server):**
```bash
wget https://dist.ipfs.tech/kubo/v0.24.0/kubo_v0.24.0_linux-amd64.tar.gz
tar -xvzf kubo_v0.24.0_linux-amd64.tar.gz
cd kubo
sudo bash install.sh
```

**Initialize IPFS:**
```bash
ipfs init
```

### Step 2: Start IPFS Registry (Optional Gateway)

The registry provides a REST API fallback but uses IPFS internally:

```bash
cd indexer

# Install dependencies
npm install ipfs-core express cors

# Start IPFS-based registry
node ipfs-registry.js
```

This is **optional** - clients can discover nodes purely through IPFS PubSub!

### Step 3: Configure VPN Node with IPFS

On your VPN server (64.227.150.205):

```bash
# Configure node daemon
export NODE_ENDPOINT="64.227.150.205:41194"
export NODE_REGION="nyc"
export PRICE_PER_MINUTE="1000000"
export WG_PUBLIC_KEY="8Cb9gEAKpJUWLBPx7s32DYUOIhLPyaFVGsGv93j0nH0="

# Start IPFS daemon
ipfs daemon &

# Start node announcement daemon
chmod +x scripts/node_daemon_ipfs.sh
./scripts/node_daemon_ipfs.sh
```

The daemon will:
- ✅ Announce node every 60 seconds to IPFS
- ✅ Store node data in IPFS (content-addressed)
- ✅ Publish updates via PubSub
- ✅ No database needed!

### Step 4: Update Client App

**Install IPFS dependencies:**
```bash
cd app
npm install
```

The app now includes:
- `ipfs-core`: IPFS node in Electron
- `ipfs.js`: Module for node discovery
- Automatic IPFS initialization on startup

**The app will:**
1. Start embedded IPFS node
2. Subscribe to `dvpn-nodes` PubSub topic
3. Receive node announcements in real-time
4. Display available nodes (no API needed!)

### Step 5: Run Everything

**Terminal 1 - IPFS Registry (optional):**
```bash
cd indexer
node ipfs-registry.js
```

**Terminal 2 - Client App:**
```bash
cd app
npm start
```

**On VPN Server:**
```bash
# Start IPFS
ipfs daemon &

# Announce node
./scripts/node_daemon_ipfs.sh
```

## Benefits of IPFS Architecture

### 🌐 Truly Decentralized
- No central database
- No single point of failure
- Nodes discover each other peer-to-peer

### 🔒 Censorship Resistant
- Can't shut down the network
- Data replicated across nodes
- Works even if some nodes go down

### 🚀 Scalable
- More nodes = more discovery points
- No database bottleneck
- P2P load distribution

### 💰 Cost Effective
- No database hosting fees
- No centralized infrastructure
- Pay only for VPN server

### 🔐 Privacy
- No centralized logging
- Node data distributed
- Client data never centralized

## Data Storage

### What's Stored Where

**IPFS (Distributed):**
- ✅ Node announcements
- ✅ Node metadata
- ✅ Public keys
- ✅ Pricing info
- ✅ Availability status

**Solana Blockchain:**
- ✅ Payments
- ✅ Node registration (optional)
- ✅ Session records
- ✅ Reputation scores

**Local Only:**
- ✅ User wallet keys
- ✅ Connection history
- ✅ Settings
- ✅ Cached node list

**NOT Stored Anywhere:**
- ❌ User browsing data
- ❌ Traffic logs
- ❌ Personal information
- ❌ IP addresses (beyond connection needs)

## Testing

### 1. Check IPFS is Running

```bash
ipfs id
```

Should show your peer ID.

### 2. Test Node Announcement

```bash
# Manually announce a test node
cat <<EOF | ipfs pubsub pub dvpn-nodes
{
  "endpoint": "test.example.com:51820",
  "region": "test",
  "price_per_minute_lamports": 1000000,
  "timestamp": $(date +%s)
}
EOF
```

### 3. Listen for Announcements

```bash
ipfs pubsub sub dvpn-nodes
```

Should see node announcements in real-time!

### 4. Check Client Discovery

Open the app and check the console - you should see:
```
✅ IPFS initialized - Peer ID: Qm...
📡 Subscribing to dvpn-nodes...
📨 Received node: 64.227.150.205:41194
```

## Troubleshooting

### Nodes Not Showing

1. **Check IPFS is running:**
   ```bash
   ipfs id
   ```

2. **Check PubSub is working:**
   ```bash
   ipfs pubsub sub dvpn-nodes
   ```

3. **Check node is announcing:**
   ```bash
   # On server
   ps aux | grep node_daemon_ipfs
   ```

### IPFS Connection Issues

1. **Check bootstrappers:**
   ```bash
   ipfs bootstrap list
   ```

2. **Check peers:**
   ```bash
   ipfs swarm peers
   ```

3. **Try different bootstrappers:**
   ```bash
   ipfs bootstrap add /ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ
   ```

### Slow Node Discovery

- Wait 30-60 seconds for IPFS to connect to network
- First announcement takes longer
- Subsequent updates are instant

## Migration from Database

If you were using the old PostgreSQL indexer:

1. **Keep both running temporarily**
   - Old clients use database
   - New clients use IPFS
   - Gradually migrate

2. **Export nodes from database**
   ```bash
   # Convert to IPFS announcements
   psql dvpn -c "SELECT * FROM nodes" | ./convert-to-ipfs.sh
   ```

3. **Shut down database when all clients updated**

## Advanced: IPFS Cluster

For better reliability, run IPFS cluster across multiple servers:

```bash
# Install IPFS cluster
ipfs-cluster-service init
ipfs-cluster-service daemon
```

Nodes sync automatically - even better decentralization!

## Performance

### IPFS vs Database

| Metric | PostgreSQL | IPFS |
|--------|------------|------|
| **Latency** | 50-100ms | 100-500ms |
| **Reliability** | Single point | Distributed |
| **Scalability** | Limited | Unlimited |
| **Cost** | $10-50/mo | Free |
| **Censorship** | Possible | Resistant |
| **Setup** | Complex | Simple |

## Security

### Data Integrity
- Content-addressed (CID = hash of data)
- Tamper-proof
- Verifiable

### Privacy
- No central logging
- P2P connections
- Optional private IPFS network

### DDoS Protection
- Distributed architecture
- No single target
- Self-healing network

## Conclusion

You now have a **fully decentralized VPN** using:
- ✅ **IPFS** for node discovery (no database)
- ✅ **Solana** for payments
- ✅ **WireGuard** for VPN
- ✅ **PubSub** for real-time updates

No centralized components = true Web3 infrastructure! 🌐
