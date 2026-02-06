# 🛡️ Guard VPN - Fully Decentralized VPN Documentation

> **A Zero-Trust, Zero-Logging, Fully Decentralized VPN built on Solana Blockchain**

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Security Features](#security-features)
   - [Zero Logging](#1-zero-logging-privacy-hardening)
   - [Secure Egress](#2-secure-egress-firewall-rules)
   - [Decentralization](#3-full-decentralization)
4. [On-Chain Components](#on-chain-components)
5. [API Reference](#api-reference)
6. [Node Discovery](#node-discovery)
7. [Deployment Guide](#deployment-guide)
8. [Technical Specifications](#technical-specifications)

---

## Overview

Guard VPN (GVPN) is a **fully decentralized VPN network** that eliminates all central points of failure. Unlike traditional VPNs that rely on centralized servers for user management, billing, and node discovery, GVPN uses:

- **Solana Blockchain** for payments, subscriptions, and node registry
- **IPFS PubSub** for real-time peer-to-peer node announcements
- **WireGuard** for secure, high-performance VPN tunneling
- **Zero-Knowledge Architecture** - no logs, no tracking, no central database

### Key Differentiators

| Feature | Traditional VPN | Guard VPN |
|---------|----------------|-----------|
| Payment Processing | Central server | Solana blockchain |
| User Database | SQL/NoSQL | None (on-chain PDAs) |
| Node Discovery | Central API | Blockchain + IPFS P2P |
| Logging | Server logs | Zero logging |
| Single Point of Failure | Yes | No |
| Censorship Resistance | Low | High |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        GUARD VPN ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐         ┌──────────────────┐        ┌──────────────┐    │
│   │   Desktop    │         │  Solana Blockchain│        │  VPN Nodes   │    │
│   │   Client     │◄───────►│     (Devnet/      │◄──────►│  (Providers) │    │
│   │   (Electron) │         │      Mainnet)     │        │              │    │
│   └──────────────┘         └──────────────────┘        └──────────────┘    │
│          │                         │                          │             │
│          │                         │                          │             │
│          ▼                         ▼                          ▼             │
│   ┌──────────────┐         ┌──────────────────┐        ┌──────────────┐    │
│   │   Phantom    │         │   On-Chain       │        │  WireGuard   │    │
│   │   Wallet     │         │   - Subscriptions│        │  Interface   │    │
│   │              │         │   - Providers    │        │  (wg0)       │    │
│   └──────────────┘         │   - Nodes        │        └──────────────┘    │
│                            │   - Sessions     │                             │
│                            │   - Treasury     │                             │
│                            └──────────────────┘                             │
│                                    │                                        │
│                                    ▼                                        │
│                            ┌──────────────────┐                             │
│                            │   IPFS PubSub    │                             │
│                            │   (P2P Discovery)│                             │
│                            └──────────────────┘                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User connects wallet** → Phantom/Solflare via deep link
2. **User subscribes** → Creates on-chain subscription PDA
3. **Client discovers nodes** → Queries Solana + IPFS PubSub
4. **Client connects to VPN** → WireGuard tunnel to provider node
5. **Session tracking** → On-chain (no central database)
6. **Provider earns** → SOL distributed via smart contract

---

## Security Features

### 1. Zero Logging (Privacy Hardening)

**Script:** `scripts/privacy_hardening.sh`

Guard VPN nodes run with **all logging disabled** at every level:

#### Kernel Level
```bash
# Disable martian packet logging
net.ipv4.conf.all.log_martians = 0
net.ipv4.conf.default.log_martians = 0

# Disable ICMP error logging
net.ipv4.icmp_ignore_bogus_error_responses = 1

# Disable rp_filter logging
net.ipv4.conf.all.rp_filter = 0
```

#### WireGuard Level
```bash
# Disable WireGuard dynamic debug
echo 0 > /sys/module/wireguard/parameters/dyndbg

# Modprobe config
options wireguard dyndbg=-p
```

#### Firewall Level
```bash
# Remove ALL iptables LOG rules
iptables -F LOG
iptables -X LOG

# Remove LOG targets from all chains
for chain in INPUT OUTPUT FORWARD; do
  iptables -L "$chain" -n --line-numbers | grep -i "LOG" | ...
done
```

#### System Level (journald)
```ini
[Journal]
Storage=volatile           # RAM only, cleared on reboot
MaxLevelStore=warning      # No info/debug logs
MaxLevelSyslog=warning
ForwardToSyslog=no         # Don't forward anywhere
ForwardToKMsg=no
ForwardToConsole=no
```

#### Syslog Disabled
```bash
systemctl stop rsyslog
systemctl disable rsyslog
systemctl stop syslog-ng
systemctl disable syslog-ng
```

**Result:** Zero persistent logs. Even volatile logs are warning-only. No IP addresses, no connection times, no data volumes recorded.

---

### 2. Secure Egress (Firewall Rules)

**Script:** `scripts/secure_wireguard_nat.sh`

While allowing full internet access (AllowedIPs = 0.0.0.0/0), the VPN blocks abuse:

#### Blocked Destinations (from VPN clients)

| Range | Purpose | Why Blocked |
|-------|---------|-------------|
| `10.0.0.0/8` | Private Class A | Prevent LAN scanning |
| `172.16.0.0/12` | Private Class B | Prevent internal attacks |
| `192.168.0.0/16` | Private Class C | Prevent home network access |
| `169.254.0.0/16` | Link-local | Prevent metadata attacks |
| `224.0.0.0/4` | Multicast | Prevent discovery abuse |
| `240.0.0.0/4` | Reserved | Prevent experimental abuse |

#### Blocked Ports

| Port | Protocol | Why Blocked |
|------|----------|-------------|
| 25 | SMTP | Prevent spam relay |
| 465 | SMTPS | Prevent spam relay |
| 587 | Submission | Prevent spam relay |

#### Rate Limiting
```bash
# 50 new connections/second per client (burst 100)
iptables -A FORWARD -i wg0 -m state --state NEW \
  -m limit --limit 50/sec --limit-burst 100 -j ACCEPT
iptables -A FORWARD -i wg0 -m state --state NEW -j DROP
```

#### iptables Rules Summary
```bash
# NAT for full tunnel
iptables -t nat -A POSTROUTING -s 10.10.0.0/24 -o eth0 -j MASQUERADE

# Allow forwarding
iptables -A FORWARD -i wg0 -o eth0 -j ACCEPT
iptables -A FORWARD -i eth0 -o wg0 -m state --state RELATED,ESTABLISHED -j ACCEPT

# Block private ranges (inserted at top, higher priority)
iptables -I FORWARD 1 -i wg0 -d 10.0.0.0/8 ! -d 10.10.0.0/24 -j REJECT
iptables -I FORWARD 2 -i wg0 -d 172.16.0.0/12 -j REJECT
iptables -I FORWARD 3 -i wg0 -d 192.168.0.0/16 -j REJECT
# ... more rules
```

**Result:** Users can access the entire public internet but cannot:
- Scan/attack internal networks
- Send spam emails
- Flood connections

---

### 3. Full Decentralization

**Module:** `app/decentralized-discovery.js`

Guard VPN has **NO central server**. All components are decentralized:

#### Node Discovery Sources

| Source | Type | Latency | Reliability |
|--------|------|---------|-------------|
| Solana Blockchain | Primary | ~400ms | 99.9% |
| IPFS PubSub | Secondary | ~100ms | 95% |
| Local Cache | Tertiary | 0ms | N/A |

#### Solana RPC Fallbacks
```javascript
const solanaRPCs = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-api.projectserum.com',
  'https://rpc.ankr.com/solana',
  'https://api.devnet.solana.com'  // Fallback
];
```

#### IPFS PubSub Topic
```javascript
const PUBSUB_TOPIC = 'gvpn-nodes-v1';

// Nodes announce themselves
await ipfs.pubsub.publish(PUBSUB_TOPIC, JSON.stringify({
  peerId: ipfsNode.id,
  nodeAddress: solanaNodePDA,
  endpoint: 'vpn.example.com:51820',
  publicKey: wgPublicKey,
  country: 'US',
  timestamp: Date.now()
}));
```

#### No Central Points of Failure

| Component | Traditional | Guard VPN |
|-----------|-------------|-----------|
| User DB | Central MySQL | Solana PDAs |
| Billing | Stripe/PayPal | On-chain SOL |
| Node List | REST API | Blockchain query |
| Auth | JWT tokens | Wallet signatures |
| Sessions | Redis | On-chain accounts |

---

## On-Chain Components

### Program ID
```
Devnet:  EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq
Mainnet: EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq (same)
```

### PDA Seeds

| Account Type | Seed | Description |
|--------------|------|-------------|
| Subscription | `["subscription", user_pubkey]` | User subscription state |
| Provider | `["provider", authority_pubkey]` | VPN provider registration |
| Node | `["node", provider_pubkey, node_id]` | Individual VPN node |
| Session | `["session", user_pubkey, node_pubkey]` | Active VPN session |
| Treasury | `["treasury"]` | Protocol fee collection |

### Account Structures

#### Subscription (67 bytes)
```rust
pub struct Subscription {
    pub user: Pubkey,           // 32 bytes
    pub plan: SubscriptionPlan, // 1 byte (0=Weekly, 1=Monthly, 2=Yearly)
    pub escrow_lamports: u64,   // 8 bytes
    pub start_ts: i64,          // 8 bytes
    pub end_ts: i64,            // 8 bytes
    pub state: SubscriptionState, // 1 byte (0=Active, 1=Claimed, 2=Cancelled)
    pub bump: u8,               // 1 byte
}
```

#### Node (variable)
```rust
pub struct Node {
    pub provider: Pubkey,       // 32 bytes
    pub node_id: String,        // variable
    pub endpoint: String,       // e.g., "vpn.example.com:51820"
    pub wg_pubkey: String,      // WireGuard public key
    pub country: String,        // ISO country code
    pub is_active: bool,
    pub total_sessions: u64,
    pub rating: u64,
    pub bump: u8,
}
```

---

## API Reference

### On-Chain Instructions

#### `create_subscription(plan: SubscriptionPlan)`
Creates a new subscription, transferring SOL to escrow.

**Accounts:**
- `user` (signer, writable) - Payer
- `subscription` (writable) - PDA to create
- `system_program` - System program

**Pricing:**
| Plan | Price | Duration |
|------|-------|----------|
| Weekly | 0.03 SOL | 7 days |
| Monthly | 0.1 SOL | 30 days |
| Yearly | 0.6 SOL | 365 days |

---

#### `renew_subscription(plan: SubscriptionPlan)`
Renews an expired or cancelled subscription.

**Accounts:**
- `user` (signer, writable)
- `subscription` (writable) - Existing PDA
- `system_program`

---

#### `cancel_subscription()`
Cancels subscription, refunds unused portion.

**Accounts:**
- `user` (signer, writable)
- `subscription` (writable)
- `treasury` (writable)

---

#### `register_provider(name: String)`
Registers as a VPN provider.

**Accounts:**
- `authority` (signer, writable)
- `provider` (writable) - PDA
- `system_program`

---

#### `register_node(...)`
Registers a VPN node.

**Accounts:**
- `authority` (signer, writable)
- `provider` (writable)
- `node` (writable) - PDA
- `system_program`

---

### Client API (Electron IPC)

#### Wallet Connection
```javascript
// Connect Phantom wallet
const result = await window.electron.connectPhantomWallet();
// Returns: { success: true, publicKey: "..." }

// Disconnect
await window.electron.disconnectWallet();
```

#### Subscription Management
```javascript
// Check on-chain subscription
const sub = await window.electron.checkOnChainSubscription(walletAddress);
// Returns: { success, hasSubscription, plan, expiresAt, expired }

// Load from file (fallback)
const sub = await window.electron.loadSubscription(walletAddress);
```

#### Node Discovery
```javascript
// Load nodes from Solana (decentralized)
const nodes = await window.electron.getNodesFromChain();

// Load with IPFS fallback
const nodes = await window.electron.loadNodesDecentralized();
```

#### VPN Connection
```javascript
// Connect to node
const result = await window.electron.connectToNode({
  endpoint: "vpn.example.com:51820",
  publicKey: "wg_public_key",
  allowedIPs: "0.0.0.0/0"
});

// Disconnect
await window.electron.disconnectVPN();

// Get status
const status = await window.electron.getVPNStatus();
```

---

## Node Discovery

### Primary: Solana Blockchain Query

```javascript
async function getNodesFromChain() {
  const connection = new Connection(SOLANA_RPC, 'confirmed');
  const programId = new PublicKey(PROGRAM_ID);
  
  // Get all node accounts (size = 214 bytes for Node struct)
  const accounts = await connection.getProgramAccounts(programId, {
    filters: [{ dataSize: 214 }]
  });
  
  return accounts.map(acc => parseNodeAccount(acc.account.data));
}
```

### Secondary: IPFS PubSub

```javascript
// Subscribe to node announcements
await ipfs.pubsub.subscribe('gvpn-nodes-v1', (msg) => {
  const node = JSON.parse(msg.data.toString());
  if (verifyNodeSignature(node)) {
    nodesCache.set(node.nodeAddress, node);
  }
});

// Nodes publish every 5 minutes
setInterval(() => {
  ipfs.pubsub.publish('gvpn-nodes-v1', JSON.stringify({
    peerId: myPeerId,
    nodeAddress: myNodePDA,
    endpoint: myEndpoint,
    publicKey: myWgPubkey,
    country: myCountry,
    timestamp: Date.now(),
    signature: sign(mySecretKey, message)
  }));
}, 300000);
```

### Tertiary: Local Cache

```javascript
// Cache valid for 60 seconds
const CACHE_VALIDITY = 60000;

function getCachedNodes() {
  if (Date.now() - lastFetch < CACHE_VALIDITY) {
    return Array.from(nodesCache.values());
  }
  return null;
}
```

---

## Deployment Guide

### For VPN Node Providers

#### 1. Server Requirements
- Ubuntu 20.04+ / Debian 11+
- 1+ vCPU, 1GB+ RAM
- Public IPv4 address
- Port 51820/UDP open

#### 2. Install WireGuard
```bash
apt update && apt install -y wireguard
```

#### 3. Run Security Scripts
```bash
# Download scripts
git clone https://github.com/your-repo/gvpn-scripts.git
cd gvpn-scripts

# Run privacy hardening (disables all logging)
sudo bash scripts/privacy_hardening.sh

# Run secure NAT setup (egress restrictions)
sudo bash scripts/secure_wireguard_nat.sh
```

#### 4. Register On-Chain
```bash
# Register as provider (needs SOL for tx fees)
node scripts/register_provider.js --name "MyVPN" --stake 1

# Register your node
node scripts/register_node.js \
  --endpoint "vpn.myserver.com:51820" \
  --wg-pubkey "$(cat /etc/wireguard/publickey)" \
  --country "US"
```

#### 5. Start Node Daemon
```bash
npm install
node node_daemon_server.js
```

### For Desktop Client Users

#### 1. Download App
- macOS: `GVPN-darwin-x64.dmg`
- Windows: `GVPN-win32-x64.exe`
- Linux: `GVPN-linux-x64.AppImage`

#### 2. Connect Wallet
- Click "Connect Phantom Wallet"
- Approve connection in Phantom
- Ensure Phantom is on **Devnet** (for testing) or **Mainnet**

#### 3. Subscribe
- Select plan (Weekly/Monthly/Yearly)
- Approve transaction in Phantom
- Subscription is stored on-chain

#### 4. Connect to VPN
- Select a node from the map
- Click "Connect"
- Traffic now routes through VPN

---

## Technical Specifications

### Cryptography

| Component | Algorithm | Key Size |
|-----------|-----------|----------|
| VPN Tunnel | WireGuard (ChaCha20-Poly1305) | 256-bit |
| Key Exchange | Curve25519 | 256-bit |
| Wallet Signatures | Ed25519 | 256-bit |
| Hash Functions | BLAKE2s (WG), SHA-256 (Solana) | 256-bit |

### Network

| Parameter | Value |
|-----------|-------|
| VPN Protocol | WireGuard |
| Default Port | 51820/UDP |
| MTU | 1420 |
| Keepalive | 25 seconds |
| Handshake Timeout | 5 seconds |

### Performance

| Metric | Target |
|--------|--------|
| Connection Time | < 2 seconds |
| Throughput | 500+ Mbps |
| Latency Overhead | < 5ms |
| Max Concurrent Clients | 1000+ per node |

---

## Summary

Guard VPN provides a truly decentralized VPN solution with three core security pillars:

### 🔒 Zero Logging
- No kernel logs, no firewall logs, no system logs
- WireGuard debug disabled
- Volatile-only journald (cleared on reboot)
- rsyslog completely disabled

### 🛡️ Secure Egress
- Private IP ranges blocked (10/8, 172.16/12, 192.168/16)
- SMTP ports blocked (anti-spam)
- Rate limiting (50 conn/sec)
- Full internet access maintained

### 🌐 Fully Decentralized
- Solana blockchain for all state
- IPFS PubSub for P2P discovery
- No central API server
- No single point of failure
- Censorship resistant

---

## License

MIT License - See LICENSE file

## Contributing

PRs welcome! See CONTRIBUTING.md

## Security

Report vulnerabilities to: security@guardvpn.io

---

**Built with ❤️ on Solana**
