# GVPN - Fully Decentralized VPN on Solana

[![Solana](https://img.shields.io/badge/Solana-Devnet-9945FF?style=flat&logo=solana)](https://explorer.solana.com/?cluster=devnet)
[![Anchor](https://img.shields.io/badge/Anchor-0.30.1-00D9FF?style=flat)](https://www.anchor-lang.com/)
[![Rust](https://img.shields.io/badge/Rust-1.92.0-orange?style=flat&logo=rust)](https://www.rust-lang.org/)
[![WireGuard](https://img.shields.io/badge/WireGuard-Enabled-88171A?style=flat&logo=wireguard)](https://www.wireguard.com/)
[![IPFS](https://img.shields.io/badge/IPFS-P2P-65C2CB?style=flat&logo=ipfs)](https://ipfs.io/)

A **100% decentralized** VPN service with **zero central servers**. Node discovery via Solana blockchain + IPFS PubSub. No APIs. No indexers. No single point of failure.

---

## 🎯 Overview

**GVPN** is a trustless, permissionless VPN network where:
- **Node Discovery** happens entirely on-chain (Solana) and through IPFS PubSub
- **No central API or indexer** - all data comes from blockchain and P2P network
- **Payments** are handled via Solana smart contracts with escrow protection
- **Privacy** is maximized with zero-logging VPN servers and military-grade encryption

### Key Features

- ✅ **100% Decentralized** - No central servers, APIs, or indexers
- ✅ **On-Chain Discovery** - Nodes registered directly on Solana blockchain
- ✅ **IPFS P2P** - Real-time node announcements via PubSub
- ✅ **Zero Logging** - Complete privacy hardening on VPN servers
- ✅ **WireGuard Encryption** - ChaCha20 + Curve25519 cryptography
- ✅ **Blockchain Payments** - Escrow-protected SOL payments
- ✅ **Subscription System** - On-chain subscription PDAs
- ✅ **Desktop Client** - Electron app with Phantom wallet integration
- ✅ **Multi-RPC Fallback** - Resilient Solana connectivity

---

## 🏗️ Architecture

### Fully Decentralized Design

```
┌─────────────────────────────────────────────────────────────────┐
│                        SOLANA BLOCKCHAIN                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │            GVPN Smart Contract (Anchor/Rust)              │  │
│  │  • Node Registry (on-chain)    • Subscription PDAs       │  │
│  │  • Provider Accounts           • Session Escrow          │  │
│  │  • Payment Claims              • Reputation Scores       │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↕
                    Direct Blockchain Queries
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│                     IPFS PUBSUB NETWORK                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           P2P Node Announcements (gvpn-nodes-v1)         │  │
│  │  • Real-time node availability    • No central server    │  │
│  │  • DHT-based discovery            • Censorship resistant │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         ↕                                           ↕
    ┌────▼────┐                              ┌──────▼──────┐
    │ CLIENT  │                              │  VPN NODE   │
    │(Electron)│◄───WireGuard Tunnel────────►│   DAEMON    │
    ├─────────┤                              ├─────────────┤
    │Phantom  │                              │WireGuard    │
    │Wallet   │                              │Zero Logging │
    │IPFS Node│                              │NAT + Egress │
    └─────────┘                              └─────────────┘
```

### No Central Points of Failure

| What | Traditional VPN | GVPN |
|------|----------------|------|
| Node Discovery | Central API/Database | On-chain + IPFS PubSub |
| Payment | Credit Card / PayPal | Solana Blockchain |
| User Accounts | Central Database | Wallet PDAs |
| Server List | API Endpoint | Blockchain Query |
| Real-time Updates | WebSocket Server | IPFS PubSub P2P |

### Core Components

| Component | Technology | Description | Location |
|-----------|-----------|-------------|----------|
| **Smart Contract** | Rust/Anchor | On-chain program for nodes, subscriptions, payments | `programs/dvpn/` |
| **Desktop Client** | Electron/JavaScript | User app with embedded IPFS node | `app/` |
| **Decentralized Discovery** | Solana + IPFS | P2P node discovery module | `app/decentralized-discovery.js` |
| **VPN Node Daemon** | Node.js/WireGuard | Provider software with zero logging | `scripts/` |
| **Privacy Hardening** | Shell Scripts | Disable all logging on VPN servers | `scripts/privacy_hardening.sh` |
| **Secure Egress** | iptables/NAT | Block private IPs, rate limits | `scripts/secure_wireguard_nat.sh` |

---

## 📦 Project Structure

```
fixed-DVPN/
├── programs/dvpn/          # Solana smart contract (Rust/Anchor)
│   └── src/lib.rs          # On-chain: nodes, subscriptions, payments
├── app/                    # Electron desktop client
│   ├── index.html          # Main UI
│   ├── main.js             # Electron main process
│   ├── renderer.js         # UI logic + wallet integration
│   ├── preload.js          # Bridge layer (IPC)
│   └── decentralized-discovery.js  # Solana + IPFS node discovery
├── scripts/                # Server & security scripts
│   ├── privacy_hardening.sh     # Zero logging (kernel, WG, iptables, journald)
│   ├── secure_wireguard_nat.sh  # NAT rules, egress restrictions
│   ├── node_daemon_server.js    # VPN provider daemon
│   └── node_announcer.js        # IPFS PubSub announcer
├── tests/                  # Anchor tests
├── target/                 # Compiled outputs
│   ├── deploy/             # Deployed program binary
│   └── idl/                # Interface definitions (JSON)
├── migrations/             # Deployment scripts
├── Anchor.toml             # Anchor configuration
├── Cargo.toml              # Rust dependencies
└── package.json            # Node.js dependencies
```

---

## 🚀 Quick Start

### Prerequisites

| Software | Version | Installation |
|----------|---------|--------------|
| **Rust** | 1.92.0+ | https://rustup.rs/ |
| **Solana CLI** | 1.18.26+ | https://docs.solana.com/cli/install-solana-cli-tools |
| **Anchor** | 0.30.1+ | https://www.anchor-lang.com/docs/installation |
| **Node.js** | 16.0.0+ | https://nodejs.org/ |
| **WireGuard** | Latest | https://www.wireguard.com/install/ |

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd fixed-DVPN

# Install dependencies
yarn install

# Install app dependencies
cd app && npm install && cd ..
```

### Configuration

1. **Generate Wallet:**
   ```bash
   solana-keygen new --outfile wallet.json
   ```

2. **Configure Solana CLI:**
   ```bash
   # For devnet (recommended)
   solana config set --url devnet
   solana config set --keypair wallet.json
   
   # For local development
   solana config set --url localhost
   ```

3. **Get Devnet SOL:**
   ```bash
   solana airdrop 2
   solana balance
   ```

### Build & Deploy

```bash
# Build the program
anchor build

# Deploy to testnet
anchor deploy

# Or start local validator for development
solana-test-validator --reset
```

### Running Components

#### 1. Launch Desktop Client
```bash
cd app
npm start
```

The client automatically:
- Queries Solana blockchain for registered nodes
- Starts embedded IPFS node for P2P discovery
- Subscribes to `gvpn-nodes-v1` PubSub topic

#### 2. Start VPN Node (For Providers)
```bash
# Apply security hardening first
sudo bash scripts/privacy_hardening.sh
sudo bash scripts/secure_wireguard_nat.sh

# Start node daemon
node scripts/node_daemon_server.js
```

---

## 🧪 Testing

### Run Complete Test Suite
```bash
# Automated full integration test
node scripts/test_complete.js

# Or run bash test script
./test_all_features.sh
```

### Individual Test Scripts

```bash
# Test provider and node registration
node scripts/test_simple.js

# Test session creation and management
node scripts/test_session.js

# Test payment claims
node scripts/test_claim_chunk.js

# Test stake operations
node scripts/test_stake.js

# Test arbitration system
node scripts/multisig_arbitration.js

# Test hash-chain payments
node scripts/hashchain_payment.js
```

### Anchor Tests
```bash
# Run all Anchor tests
anchor test

# Or use package.json script
yarn test
```

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [SETUP.md](SETUP.md) | Setup and installation guide |
| [WIREGUARD_CONNECT.md](WIREGUARD_CONNECT.md) | WireGuard integration guide |
| [VPN_SERVER_SETUP.md](VPN_SERVER_SETUP.md) | VPN server configuration |
| [app/README.md](app/README.md) | Desktop client documentation |
| [indexer/README.md](indexer/README.md) | Indexer service documentation |

---

## 💰 How It Works

### For Users (VPN Clients)

1. **Connect Wallet** - Link your Phantom wallet with SOL
2. **Discover Nodes** - Client queries Solana blockchain directly (no API)
3. **Select Node** - Choose from on-chain registered nodes
4. **Subscribe** - Create on-chain subscription PDA with SOL deposit
5. **Generate Keys** - Client generates WireGuard keypair
6. **Connect** - WireGuard tunnel to VPN node
7. **Use VPN** - All traffic encrypted through tunnel
8. **Renew/Cancel** - Manage subscription on-chain

### For Providers (VPN Node Operators)

1. **Register Provider** - Create on-chain provider account
2. **Register Node** - Add VPN node with endpoint, pricing, region
3. **Apply Security** - Run privacy_hardening.sh + secure_wireguard_nat.sh
4. **Run Daemon** - Start node daemon with WireGuard
5. **Announce P2P** - Optional IPFS PubSub for real-time discovery
6. **Accept Connections** - Daemon provisions WireGuard peers
7. **Earn SOL** - Receive subscription payments on-chain

### Subscription Flow

```
User Connects Wallet
        ↓
Discovers Nodes (On-Chain Query)
        ↓
Selects VPN Node
        ↓
Creates Subscription PDA (pays SOL)
        ↓
Gets WireGuard Config
        ↓
  VPN Connected
        ↓
Subscription Expires → Renew On-Chain
```

---

## 🔒 Security Features

### Zero Logging (Privacy Hardening)
- **Kernel**: `log_martians=0`, no packet logging
- **WireGuard**: Dynamic debug disabled
- **iptables**: All LOG rules removed
- **journald**: Volatile storage, warning-only
- **rsyslog**: Completely disabled

### Secure Egress (NAT Rules)
- **Blocked**: Private IPs (10/8, 172.16/12, 192.168/16)
- **Blocked**: Link-local, multicast, loopback
- **Blocked**: SMTP ports (25, 465, 587) - prevents spam
- **Rate Limited**: 50 connections/second per IP

### Cryptographic Security
- **WireGuard Protocol** - ChaCha20 encryption, Curve25519 key exchange
- **Ed25519 Signatures** - All transactions signed
- **PDA Seeds** - Deterministic on-chain account derivation

---

## 🌐 Deployed Addresses

### Devnet (Current)
- **Program ID**: `EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq`
- **Network**: Solana Devnet
- **RPC**: `https://api.devnet.solana.com`
- **Explorer**: https://explorer.solana.com/?cluster=devnet

### Localnet (Development)
- **Program ID**: Check `target/deploy/dvpn-keypair.json`
- **RPC**: `http://localhost:8899`

---

## 🛠️ Development Commands

```bash
# Build program
anchor build

# Deploy program
anchor deploy

# Run tests
anchor test

# Run linter
yarn lint

# Fix linting issues
yarn lint:fix

# Start node daemon
yarn node-daemon

# Start enhanced node daemon
yarn node-daemon-server

# Clean build artifacts
anchor clean
cargo clean
rm -rf target/
```

---

## 📊 On-Chain Instructions

| Instruction | Description | Authority |
|------------|-------------|-----------|
| `register_provider` | Create provider account | Provider |
| `register_node` | Register VPN node with endpoint, region, pricing | Provider |
| `update_node` | Modify node details | Provider |
| `deactivate_node` | Temporarily disable node | Provider |
| `activate_node` | Re-enable deactivated node | Provider |
| `create_subscription` | Create new subscription PDA with SOL payment | User |
| `renew_subscription` | Renew expired/cancelled subscription | User |
| `cancel_subscription` | Cancel active subscription | User |

---

## 🗃️ On-Chain Account Structures

### Node Account (PDA)
Seeds: `["node", provider_pubkey, node_id]`
```rust
pub struct Node {
    pub provider: Pubkey,            // Provider authority
    pub endpoint: String,            // IP:port or domain
    pub region: String,              // Geographic region
    pub wireguard_public_key: String, // WG pubkey
    pub pricing_per_gb: u64,         // Lamports per GB
    pub max_bandwidth_mbps: u32,     // Bandwidth capacity
    pub active: bool,                // Node status
    pub created_at: i64,             // Registration time
}
```

### Subscription Account (PDA)
Seeds: `["subscription", user_pubkey, node_pubkey]`
```rust
pub struct Subscription {
    pub user: Pubkey,                // Client wallet
    pub node: Pubkey,                // Node PDA
    pub start_time: i64,             // Subscription start
    pub end_time: i64,               // Subscription end
    pub amount_paid: u64,            // SOL paid (lamports)
    pub is_active: bool,             // Active status
    pub is_cancelled: bool,          // Cancellation status
}
```

### Provider Account
```rust
pub struct Provider {
    pub authority: Pubkey,           // Owner wallet
    pub stake: u64,                  // Staked amount
    pub reputation_score: u16,       // 0-2000
    pub total_sessions: u64,         // Lifetime sessions
    pub active_since: i64,           // Registration timestamp
    pub last_uptime_update: i64,     // Last activity
}
```

---

## 🔧 Configuration Files

### Anchor.toml
```toml
[programs.devnet]
dvpn = "EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq"

[provider]
cluster = "devnet"
wallet = "wallet.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
```

### package.json Scripts
```json
{
  "scripts": {
    "lint": "prettier */*.js \"*/**/*{.js,.ts}\" --check",
    "lint:fix": "prettier */*.js \"*/**/*{.js,.ts}\" -w",
    "mvp": "ts-mocha -p ./tsconfig.json scripts/mvp.ts",
    "node-daemon": "node scripts/node_daemon.js",
    "node-daemon-server": "node scripts/node_daemon_server.js"
  }
}
```

---

## 📈 Performance

### Node Discovery
- **On-Chain Query**: ~500-800ms (Solana RPC)
- **IPFS PubSub**: Real-time (<100ms after announcement)
- **Cache**: 60 seconds for on-chain, 5 minutes for PubSub

### Transactions
- **Subscription Creation**: ~4-6 seconds
- **Subscription Renewal**: ~3-5 seconds
- **Node Registration**: ~3-4 seconds
- **WireGuard Connection**: <2 seconds

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Workflow
1. Write tests for new features
2. Run `yarn lint:fix` before committing
3. Ensure all tests pass (`anchor test`)
4. Update documentation as needed

---

## 🐛 Troubleshooting

### Common Issues

**Issue: Anchor build fails**
```bash
# Solution: Update Anchor and dependencies
cargo update
anchor build --no-idl
```

**Issue: Test validator won't start**
```bash
# Solution: Reset validator data
solana-test-validator --reset --quiet
```

**Issue: Transaction fails with "insufficient funds"**
```bash
# Solution: Airdrop more SOL
solana airdrop 2
```

**Issue: WireGuard connection fails**
```bash
# Solution: Check WireGuard installation
which wg
sudo wg show

# Restart WireGuard interface
sudo wg-quick down wg0
sudo wg-quick up wg0
```

**Issue: IPFS node won't start**
```bash
# Solution: Remove corrupted IPFS repo
rm -rf ./ipfs-dvpn-client
# App will create fresh repo on next start
```

**Issue: Can't discover nodes**
```bash
# Solution: Check Solana RPC connectivity
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
  https://api.devnet.solana.com
```

---

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## 🔗 Links

- **Solana Documentation**: https://docs.solana.com/
- **Anchor Framework**: https://www.anchor-lang.com/
- **WireGuard**: https://www.wireguard.com/
- **Phantom Wallet**: https://phantom.app/

---

## 📞 Support

For issues, questions, or contributions:
- Open an issue on GitHub
- Check existing documentation in `/docs`
- Review test scripts in `/scripts` for examples

---

## ✅ Project Status

**Current Version**: v2.0.0 - Fully Decentralized  
**Last Updated**: February 6, 2026  
**Status**: ✅ Production Ready

### Implemented Features
- ✅ **100% Decentralized** - No central servers or APIs
- ✅ **On-Chain Node Discovery** - Query Solana blockchain directly
- ✅ **IPFS PubSub** - Real-time P2P node announcements
- ✅ **Subscription System** - On-chain subscription PDAs
- ✅ **Subscription Renewal** - Renew expired subscriptions
- ✅ **Zero Logging** - Complete privacy hardening
- ✅ **Secure Egress** - Block private IPs, rate limiting
- ✅ **WireGuard VPN** - Military-grade encryption
- ✅ **Phantom Wallet** - Seamless wallet integration
- ✅ **Multi-RPC Fallback** - Resilient Solana connectivity
- ✅ **Desktop Electron Client** - Cross-platform app

### Security Scripts
- ✅ `privacy_hardening.sh` - Disable all logging
- ✅ `secure_wireguard_nat.sh` - Egress restrictions

### Future Roadmap
- 🔜 Mobile client (iOS/Android)
- 🔜 Mainnet deployment
- 🔜 Multi-hop VPN routing
- 🔜 Token incentives (GVPN token)

---

**Built with ❤️ on Solana | No APIs | No Central Servers | 100% Decentralized**
