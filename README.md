# DVPN - Decentralized VPN on Solana Blockchain

[![Solana](https://img.shields.io/badge/Solana-Testnet-9945FF?style=flat&logo=solana)](https://testnet.solana.com)
[![Anchor](https://img.shields.io/badge/Anchor-0.29.0-00D9FF?style=flat)](https://www.anchor-lang.com/)
[![Rust](https://img.shields.io/badge/Rust-1.92.0-orange?style=flat&logo=rust)](https://www.rust-lang.org/)
[![WireGuard](https://img.shields.io/badge/WireGuard-Enabled-88171A?style=flat&logo=wireguard)](https://www.wireguard.com/)

A fully decentralized VPN service built on Solana blockchain with cryptographic payment proofs, WireGuard encryption, and trustless session management.

---

## 🎯 Overview

**DVPN** enables users to connect to VPN nodes and pay with cryptocurrency while providers earn rewards for operating nodes. The system uses Solana blockchain for payments, WireGuard for secure tunneling, and cryptographic proofs for trustless verification.

### Key Features

- ✅ **Blockchain-Based Payments** - All transactions on Solana blockchain
- ✅ **Pay-As-You-Go** - Usage-based billing with escrow protection
- ✅ **Cryptographic Proofs** - Hash-chain technology reduces on-chain transactions by 83%
- ✅ **Military-Grade Encryption** - WireGuard protocol integration
- ✅ **Decentralized Arbitration** - Multi-signature dispute resolution
- ✅ **Real-Time Metering** - Precise bandwidth tracking and billing
- ✅ **Multi-Token Support** - SOL and SPL tokens (USDC, etc.)
- ✅ **Reputation System** - Provider scoring (0-2000) with uptime tracking
- ✅ **Desktop Client** - Electron app with Phantom wallet integration

---

## 🏗️ Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        SOLANA BLOCKCHAIN                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │            DVPN Smart Contract (Anchor/Rust)             │  │
│  │  • Provider Registry    • Session Escrow                 │  │
│  │  • Node Management      • Payment Claims                 │  │
│  │  │  • Reputation System    • Dispute Resolution             │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↕
         ┌────────────────────┴────────────────────┐
         │                                          │
    ┌────▼────┐                              ┌─────▼──────┐
    │ INDEXER │                              │   CLIENT   │
    │ SERVICE │                              │  (Electron)│
    ├─────────┤                              ├────────────┤
    │PostgreSQL│◄─────Discovery───────────────│Phantom Wallet│
    │REST API  │                              │WireGuard   │
    └──────────┘                              └────────────┘
                                                    │
                                              VPN Connection
                                                    │
                                              ┌─────▼──────┐
                                              │ VPN NODE   │
                                              │  DAEMON    │
                                              ├────────────┤
                                              │WireGuard   │
                                              │Bandwidth   │
                                              │Tracking    │
                                              └────────────┘
```

### Core Components

| Component | Technology | Description | Location |
|-----------|-----------|-------------|----------|
| **Smart Contract** | Rust/Anchor | On-chain program handling payments, sessions, disputes | `programs/dvpn/` |
| **Desktop Client** | Electron/JavaScript | User-facing app with wallet integration | `app/` |
| **VPN Node Daemon** | Node.js/WireGuard | Provider software managing VPN connections | `scripts/node_daemon_server.js` |
| **Indexer Service** | Node.js/PostgreSQL | Discovery service with REST API | `indexer/` |
| **Test Scripts** | JavaScript/TypeScript | Comprehensive testing suite | `scripts/`, `tests/` |

---

## 📦 Project Structure

```
fixed-DVPN/
├── programs/dvpn/          # Solana smart contract (Rust/Anchor)
│   └── src/lib.rs          # Main program logic
├── app/                    # Electron desktop client
│   ├── index.html          # Main UI
│   ├── main.js             # Electron main process
│   ├── renderer.js         # UI logic
│   └── preload.js          # Bridge layer
├── indexer/                # Node discovery service
│   ├── index.js            # HTTP server
│   ├── indexer.js          # Blockchain indexer
│   ├── db.js               # PostgreSQL interface
│   └── api.js              # REST API
├── scripts/                # Testing & utilities
│   ├── test_complete.js    # Full integration test
│   ├── node_daemon_server.js    # VPN provider daemon
│   ├── node_daemon_enhanced.js  # Enhanced daemon with metrics
│   ├── hashchain_payment.js     # Cryptographic proofs
│   └── multisig_arbitration.js  # Dispute resolution
├── tests/                  # Anchor tests
├── target/                 # Compiled outputs
│   ├── deploy/             # Deployed program binary
│   └── idl/                # Interface definitions
├── migrations/             # Deployment scripts
├── Anchor.toml             # Anchor configuration
├── Cargo.toml              # Rust dependencies
└── package.json            # Node.js dependencies
```

---

## 🚀 Quick Start

### Prerequisites

Ensure you have the following installed:

| Software | Version | Installation |
|----------|---------|--------------|
| **Rust** | 1.92.0+ | https://rustup.rs/ |
| **Solana CLI** | 1.18.26+ | https://docs.solana.com/cli/install-solana-cli-tools |
| **Anchor** | 0.29.0+ | https://www.anchor-lang.com/docs/installation |
| **Node.js** | 16.0.0+ | https://nodejs.org/ |
| **WireGuard** | Latest | https://www.wireguard.com/install/ |
| **PostgreSQL** | 12.0+ | https://www.postgresql.org/download/ |

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd fixed-DVPN

# Install dependencies
yarn install

# Install indexer dependencies
cd indexer && npm install && cd ..

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
   # For testnet
   solana config set --url testnet
   solana config set --keypair wallet.json
   
   # For local development
   solana config set --url localhost
   ```

3. **Get Testnet SOL:**
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

#### 1. Start VPN Node (Provider)
```bash
# Basic daemon
node scripts/node_daemon_server.js

# Enhanced daemon with metrics
node scripts/node_daemon_enhanced.js
```

#### 2. Start Indexer Service
```bash
cd indexer
node index.js
```

#### 3. Launch Desktop Client
```bash
cd app
npm start
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

Comprehensive documentation is available in the following files:

| Document | Description |
|----------|-------------|
| [SETUP.md](SETUP.md) | Complete setup and installation guide |
| [PROJECT_OVERVIEW_AND_DATAFLOW.md](PROJECT_OVERVIEW_AND_DATAFLOW.md) | System architecture and data flow |
| [TESTING_GUIDE.md](TESTING_GUIDE.md) | Step-by-step testing instructions |
| [ARCHITECTURE_AUDIT.md](ARCHITECTURE_AUDIT.md) | Component completion matrix |
| [DEPLOY_MANUAL.md](DEPLOY_MANUAL.md) | Deployment procedures |
| [WIREGUARD_CONNECT.md](WIREGUARD_CONNECT.md) | WireGuard integration guide |
| [COMPLETE_IMPLEMENTATION_REPORT.md](COMPLETE_IMPLEMENTATION_REPORT.md) | Full implementation details |
| [FINAL_SUCCESS_REPORT.md](FINAL_SUCCESS_REPORT.md) | Project completion report |
| [scripts/HASHCHAIN_README.md](scripts/HASHCHAIN_README.md) | Hash-chain payment system |
| [scripts/ARBITRATION_README.md](scripts/ARBITRATION_README.md) | Dispute resolution system |
| [app/README.md](app/README.md) | Desktop client documentation |
| [indexer/README.md](indexer/README.md) | Indexer service documentation |

---

## 💰 How It Works

### For Users (VPN Clients)

1. **Connect Wallet** - Link your Phantom wallet with SOL
2. **Select Node** - Browse available VPN nodes from indexer
3. **Create Session** - Deposit SOL/tokens into escrow for session
4. **Generate Keys** - Client generates WireGuard keypair
5. **Connect** - Client connects to VPN node with WireGuard
6. **Use VPN** - Encrypted traffic flows through WireGuard tunnel
7. **Payment** - Provider claims payment based on usage
8. **Disconnect** - Session ends, unused funds refunded

### For Providers (VPN Node Operators)

1. **Register Provider** - Create on-chain provider account with stake
2. **Register Node** - Add VPN node with endpoint, pricing, region
3. **Run Daemon** - Start node daemon to manage connections
4. **Accept Connections** - Daemon verifies sessions and provisions peers
5. **Track Bandwidth** - Monitor and record data usage
6. **Claim Payments** - Submit proofs and claim escrowed funds
7. **Build Reputation** - Earn reputation score (0-2000) for reliability

### Payment Flow

```
User Creates Session
        ↓
   Escrow Locked
        ↓
   VPN Connection
        ↓
  Bandwidth Usage
        ↓
Provider Submits Proof
        ↓
   Payment Claimed
        ↓
 Unused Funds Refunded
```

---

## 🔒 Security Features

### Cryptographic Security
- **WireGuard Protocol** - ChaCha20 encryption, Curve25519 key exchange
- **Ed25519 Signatures** - All session authorizations signed
- **Hash-Chain Proofs** - Cryptographic payment verification

### Economic Security
- **Escrow System** - Funds locked until service delivered
- **Provider Staking** - Collateral to prevent malicious behavior
- **Slashing Mechanism** - Penalties for misconduct
- **Reputation System** - Long-term incentive for good behavior

### Dispute Resolution
- **Multi-Sig Arbitration** - Decentralized dispute handling
- **Weighted Voting** - Arbitrators vote with stakes
- **Automatic Execution** - Resolutions enforced on-chain

---

## 🌐 Deployed Addresses

### Testnet
- **Program ID**: `2CK6gCxcfaX5JuCfJRnn7ZBf6V5ZpiK69T9yeHRJP7Vq`
- **Network**: Solana Testnet
- **RPC**: `https://api.testnet.solana.com`

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

## 📊 Program Instructions

| Instruction | Description | Authority |
|------------|-------------|-----------|
| `register_provider` | Create provider account with stake | Provider |
| `register_node` | Register VPN node with endpoint | Provider |
| `update_node` | Modify node details | Provider |
| `deactivate_node` | Temporarily disable node | Provider |
| `activate_node` | Re-enable deactivated node | Provider |
| `create_session` | Open session with escrow (SOL) | User |
| `create_session_spl` | Open session with SPL tokens | User |
| `close_session` | End session, refund unused | Provider or User |
| `claim_payout` | Claim session escrow | Provider |
| `claim_chunk` | Claim partial payment with proof | Provider |
| `increase_stake` | Add stake to provider | Provider |
| `withdraw_stake` | Remove stake (with cooldown) | Provider |
| `report_issue` | File dispute against provider | User |
| `resolve_dispute` | Arbitrator resolves dispute | Arbitrator |
| `update_reputation` | Modify provider reputation | Admin |

---

## 🗃️ Account Structures

### Provider Account
```rust
pub struct Provider {
    pub authority: Pubkey,           // Owner wallet
    pub stake: u64,                  // Staked amount
    pub reputation_score: u16,       // 0-2000
    pub total_sessions: u64,         // Lifetime sessions
    pub successful_sessions: u64,    // Completed sessions
    pub total_bandwidth_gb: u64,     // Total data served
    pub active_since: i64,           // Registration timestamp
    pub last_uptime_update: i64,     // Last activity
    pub dispute_count: u16,          // Number of disputes
}
```

### Node Account (PDA)
```rust
pub struct Node {
    pub provider: Pubkey,            // Provider authority
    pub endpoint: String,            // IP:port or domain
    pub region: String,              // Geographic region
    pub wireguard_public_key: String, // WG pubkey
    pub pricing_per_gb: u64,         // Lamports per GB
    pub max_bandwidth_mbps: u32,     // Bandwidth capacity
    pub active: bool,                // Node status
    pub total_sessions: u64,         // Sessions served
    pub reputation_score: u16,       // Node-specific score
    pub created_at: i64,             // Registration time
    pub last_seen: i64,              // Last heartbeat
    pub supported_protocols: Vec<u8>, // Protocol versions
    pub metadata_uri: String,        // IPFS metadata
}
```

### Session Account (PDA)
```rust
pub struct Session {
    pub user: Pubkey,                // Client wallet
    pub provider: Pubkey,            // Provider wallet
    pub node: Pubkey,                // Node PDA
    pub escrow_amount: u64,          // Deposited amount
    pub start_time: i64,             // Session start
    pub duration_seconds: u64,       // Max duration
    pub bandwidth_used_bytes: u64,   // Data consumed
    pub pricing_per_gb: u64,         // Rate at creation
    pub is_active: bool,             // Connection status
    pub last_proof_hash: [u8; 32],   // Latest proof
    pub claimed_amount: u64,         // Amount withdrawn
    pub spl_token_mint: Option<Pubkey>, // Token mint (if SPL)
}
```

---

## 🔧 Configuration Files

### Anchor.toml
```toml
[programs.localnet]
dvpn = "2CK6gCxcfaX5JuCfJRnn7ZBf6V5ZpiK69T9yeHRJP7Vq"

[provider]
cluster = "Localnet"
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

## 📈 Performance Metrics

### Hash-Chain Payment Optimization
- **Traditional**: 1 transaction per payment claim
- **Hash-Chain**: 1 transaction per 6 claims
- **Savings**: 83% reduction in on-chain transactions
- **Gas Saved**: ~80% lower transaction fees

### Benchmarks
- **Session Creation**: ~4-6 seconds
- **Payment Claim**: ~3-5 seconds
- **Node Registration**: ~3-4 seconds
- **WireGuard Connection**: <2 seconds
- **Indexer Query**: <100ms

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

**Issue: Indexer can't connect to PostgreSQL**
```bash
# Solution: Check PostgreSQL service
sudo systemctl status postgresql
sudo systemctl start postgresql
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

**Current Version**: v1.0.0 - Production Ready  
**Last Updated**: January 12, 2026  
**Status**: ✅ Core MVP Complete

### Implemented Features
- ✅ Provider and node registration
- ✅ Session creation with escrow (SOL & SPL)
- ✅ WireGuard VPN integration
- ✅ Payment claims with cryptographic proofs
- ✅ Hash-chain payment optimization
- ✅ Reputation system (0-2000 scoring)
- ✅ Partial refunds and session closing
- ✅ Stake management (increase/withdraw)
- ✅ Dispute reporting and resolution
- ✅ Multi-signature arbitration
- ✅ Desktop Electron client
- ✅ Comprehensive test suite

### Future Roadmap
- 🔜 Enhanced arbitration automation
- 🔜 Mobile client (iOS/Android)
- 🔜 Decentralized node discovery (DHT)
- 🔜 Advanced analytics dashboard
- 🔜 Multi-hop VPN routing
- 🔜 Token incentives for early adopters

---

**Built with ❤️ on Solana**
