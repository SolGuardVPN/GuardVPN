# IPFS Integration for DVPN

## Overview

Integrate IPFS (InterPlanetary File System) with the DVPN to create a decentralized storage and content delivery network.

## Features

### 1. Decentralized Storage
- Files are distributed across multiple VPN nodes
- No single point of failure
- Content-addressable (files accessed by hash, not location)

### 2. Node Benefits
- **VPN providers** earn extra rewards for hosting IPFS data
- **Users** get storage space included with VPN subscription
- **Network** becomes more valuable with combined services

### 3. Use Cases
- Secure file sharing between VPN users
- Decentralized CDN for websites/apps
- Private file backup across trusted nodes
- Censorship-resistant content hosting

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    DVPN + IPFS                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Client (App)                                       │
│  ├── VPN Connection (WireGuard)                    │
│  ├── IPFS Node (js-ipfs or go-ipfs)               │
│  └── File Manager UI                               │
│                                                      │
│  VPN Node (Server)                                  │
│  ├── WireGuard Server                              │
│  ├── IPFS Node (go-ipfs)                           │
│  ├── Pin Service (paid pinning)                    │
│  └── Gateway (HTTP access)                         │
│                                                      │
│  Smart Contract (Solana)                            │
│  ├── Storage pricing                               │
│  ├── Payment for pinning                           │
│  └── Storage proof verification                    │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Basic IPFS Integration
1. Add IPFS node to Electron app
2. Add IPFS daemon to server nodes
3. Create file upload/download UI
4. Connect IPFS nodes through VPN tunnel

### Phase 2: Monetization
1. Smart contract for storage payments
2. Pinning service (nodes paid to store files)
3. Storage proof system
4. Bandwidth metering

### Phase 3: Advanced Features
1. Encrypted private files (only VPN users can access)
2. IPNS (mutable content)
3. PubSub messaging between users
4. Decentralized video streaming

## Technical Stack

### Client Side
- **js-ipfs** or **Helia** (IPFS JavaScript implementation)
- Embedded in Electron app
- Local IPFS repo in `~/.dvpn/ipfs`

### Server Side
- **go-ipfs** (Kubo) - official IPFS implementation
- IPFS Gateway for HTTP access
- IPFS Cluster for coordination

### Solana Integration
- Storage contract
- Payment tokens for pinning
- Proof of storage verification

## Quick Start

### Install IPFS on Client (Mac)
```bash
# Install IPFS
brew install ipfs

# Initialize IPFS
ipfs init

# Start daemon
ipfs daemon
```

### Install IPFS on Server
```bash
# Ubuntu/Debian
wget https://dist.ipfs.tech/kubo/v0.24.0/kubo_v0.24.0_linux-amd64.tar.gz
tar -xvzf kubo_v0.24.0_linux-amd64.tar.gz
cd kubo
sudo bash install.sh

# Initialize
ipfs init --profile server

# Configure
ipfs config Addresses.Gateway /ip4/0.0.0.0/tcp/8080
ipfs config Addresses.API /ip4/127.0.0.1/tcp/5001

# Start as service
sudo systemctl enable ipfs
sudo systemctl start ipfs
```

## Business Model

### Storage Tiers (included with VPN)

| Tier | VPN Price | Storage | Bandwidth |
|------|-----------|---------|-----------|
| Hourly | 0.06 SOL/hour | 1 GB | Unlimited |
| Monthly | 1 SOL/month | 100 GB | Unlimited |
| Yearly | 10 SOL/year | 1 TB | Unlimited |

### Additional Storage
- 10 GB: 0.1 SOL/month
- 100 GB: 0.8 SOL/month
- 1 TB: 6 SOL/month

### Node Earnings
- Storage: 0.05 SOL per 100 GB/month
- Pinning: 0.1 SOL per pin/month
- Bandwidth: 0.01 SOL per 100 GB transferred

## Security

### Encryption
```javascript
// Files encrypted before upload
const encrypted = await encrypt(fileData, userKey);
const cid = await ipfs.add(encrypted);

// Only VPN users with key can decrypt
const decrypted = await decrypt(encryptedData, userKey);
```

### Access Control
- Files pinned only on trusted VPN nodes
- Private network using Swarm Key
- Authentication via Solana wallet signature

### Privacy
- No metadata leakage
- Files only accessible through VPN
- Optional Tor integration

## API Examples

### Upload File
```javascript
// Add file to IPFS
const result = await ipfs.add(file);
console.log(`File uploaded: ${result.cid}`);

// Pin on network (pay providers)
await dvpn.pinFile(result.cid, {
  replicas: 3,
  duration: 30 * 24 * 60 * 60, // 30 days
  payment: 0.3 // 0.3 SOL total
});
```

### Download File
```javascript
// Get file from IPFS
const chunks = [];
for await (const chunk of ipfs.cat(cid)) {
  chunks.push(chunk);
}
const file = Buffer.concat(chunks);
```

### List Pinned Files
```javascript
const pins = await dvpn.listPins();
pins.forEach(pin => {
  console.log(`${pin.cid} - ${pin.replicas} replicas - ${pin.size} bytes`);
});
```

## Integration with Existing DVPN

### Add to Node Registration
```rust
pub struct NodeAccount {
    pub provider: Pubkey,
    pub node_id: String,
    pub endpoint: String,
    pub region: String,
    pub price_per_minute: u64,
    pub wg_public_key: String,
    
    // NEW: IPFS fields
    pub ipfs_peer_id: String,      // IPFS peer ID
    pub storage_capacity: u64,     // GB available
    pub storage_price: u64,        // lamports per GB/month
    pub bandwidth_price: u64,      // lamports per GB
    pub ipfs_gateway: String,      // Optional HTTP gateway
}
```

### Smart Contract Methods
```rust
// Pin file (client pays node to store)
pub fn pin_file(
    ctx: Context<PinFile>,
    cid: String,
    size: u64,
    duration: i64,
    replicas: u8,
) -> Result<()>

// Prove storage (node proves it has file)
pub fn submit_storage_proof(
    ctx: Context<StorageProof>,
    cid: String,
    merkle_root: [u8; 32],
) -> Result<()>

// Claim storage rewards
pub fn claim_storage_rewards(
    ctx: Context<ClaimRewards>,
    cid: String,
) -> Result<()>
```

## Roadmap

### v1.0 - Basic Integration ✅ (Next)
- [ ] Add js-ipfs to Electron app
- [ ] Install go-ipfs on server nodes
- [ ] File upload/download UI
- [ ] Connect nodes through VPN

### v2.0 - Monetization
- [ ] Storage payment contract
- [ ] Pinning service
- [ ] Storage proof system
- [ ] Node earnings dashboard

### v3.0 - Advanced
- [ ] End-to-end encryption
- [ ] Video streaming
- [ ] Decentralized website hosting
- [ ] IPFS gateway integration

## Benefits

### For Users
- ✅ Secure, private file storage
- ✅ Censorship-resistant
- ✅ Access files from anywhere on VPN
- ✅ No third-party storage providers

### For Node Operators
- ✅ Additional revenue stream
- ✅ Better hardware utilization
- ✅ More competitive service

### For Network
- ✅ Increased value proposition
- ✅ Network effects (more nodes = more storage)
- ✅ Differentiation from competitors
- ✅ True Web3 infrastructure

## Next Steps

1. **Install IPFS** on client and server
2. **Create UI** for file management in app
3. **Deploy smart contract** for storage payments
4. **Test** file sharing between nodes
5. **Launch** beta with early users

Would you like me to start implementing IPFS integration into the app?
