# Solana Mainnet Deployment Guide - DVPN Smart Contract

## 📦 Files Required for Mainnet Deployment

Send these files to the person deploying on mainnet:

### **Required Files (ZIP and Send)**

```
📁 DEPLOYMENT_PACKAGE/
│
├── 📁 programs/
│   └── 📁 dvpn/
│       ├── Cargo.toml           # Rust dependencies
│       ├── Xargo.toml           # Cross-compilation config
│       └── 📁 src/
│           └── lib.rs           # Main smart contract code (1455 lines)
│
├── Cargo.toml                    # Workspace configuration
├── Anchor.toml                   # Anchor framework config (NEEDS UPDATE)
├── wallet.json                   # Deployer wallet keypair (GENERATE NEW FOR MAINNET)
│
└── 📁 target/deploy/             # Pre-compiled (optional)
    ├── dvpn.so                   # Compiled program binary
    └── dvpn-keypair.json         # Program keypair (address)
```

---

## 🔑 Current Contract Details

| Property | Value |
|----------|-------|
| **Program ID (Devnet)** | `EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq` |
| **Anchor Version** | 0.32.0 |
| **Rust Edition** | 2021 |
| **Revenue Split** | 80% Provider / 20% Treasury |

---

## 📋 Deployment Instructions for Mainnet

### Step 1: Install Dependencies

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.30.1
avm use 0.30.1
```

### Step 2: Configure for Mainnet

Edit `Anchor.toml`:

```toml
[toolchain]
anchor_version = "0.32.0"

[features]
resolution = true
skip-lint = false

[programs.mainnet]
dvpn = "NEW_MAINNET_PROGRAM_ID"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "mainnet"
wallet = "mainnet-deployer-wallet.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
```

### Step 3: Generate New Program Keypair for Mainnet

```bash
# Generate new keypair for mainnet program
solana-keygen new -o target/deploy/dvpn-keypair.json

# Get the program ID
solana address -k target/deploy/dvpn-keypair.json
# Example output: HxyzABC123... (this becomes your mainnet program ID)
```

### Step 4: Update Program ID in lib.rs

Edit `programs/dvpn/src/lib.rs` line 4:

```rust
// Change from:
declare_id!("EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq");

// To your new mainnet program ID:
declare_id!("YOUR_NEW_MAINNET_PROGRAM_ID");
```

### Step 5: Build for Mainnet

```bash
# Set Solana to mainnet
solana config set --url https://api.mainnet-beta.solana.com

# Build the program
anchor build

# Verify build output
ls -la target/deploy/
# Should see: dvpn.so (compiled program)
```

### Step 6: Deploy to Mainnet

```bash
# Check deployer wallet balance (needs ~3-5 SOL for deployment)
solana balance mainnet-deployer-wallet.json

# Deploy
anchor deploy --provider.cluster mainnet

# Or using solana CLI directly
solana program deploy target/deploy/dvpn.so --keypair mainnet-deployer-wallet.json
```

### Step 7: Initialize Treasury

After deployment, initialize the treasury PDA:

```bash
# Run initialization script
node scripts/initialize_treasury_mainnet.js
```

---

## ⚠️ Important Notes for Mainnet Deployment

1. **SOL Required**: ~3-5 SOL for program deployment + transaction fees
2. **Program Size**: ~400KB compiled
3. **Upgrade Authority**: The deployer wallet becomes the upgrade authority
4. **Treasury Setup**: Treasury PDA must be initialized after deployment
5. **Test First**: Deploy to devnet first, verify everything works

---

## 📁 Quick Copy Commands

To create the deployment package:

```bash
cd /Users/sheikhhamza/BBTProjects/VPN/fix/fixed-DVPN

# Create deployment package
mkdir -p DEPLOYMENT_PACKAGE/programs/dvpn/src
mkdir -p DEPLOYMENT_PACKAGE/target/deploy

# Copy required files
cp -r programs/dvpn/src/lib.rs DEPLOYMENT_PACKAGE/programs/dvpn/src/
cp programs/dvpn/Cargo.toml DEPLOYMENT_PACKAGE/programs/dvpn/
cp programs/dvpn/Xargo.toml DEPLOYMENT_PACKAGE/programs/dvpn/
cp Cargo.toml DEPLOYMENT_PACKAGE/
cp Anchor.toml DEPLOYMENT_PACKAGE/
cp target/deploy/dvpn.so DEPLOYMENT_PACKAGE/target/deploy/
cp target/deploy/dvpn-keypair.json DEPLOYMENT_PACKAGE/target/deploy/

# Create ZIP
zip -r DVPN_MAINNET_DEPLOYMENT.zip DEPLOYMENT_PACKAGE/
```

---

## 🔄 After Mainnet Deployment

Once deployed, update these files in the app:

### 1. Update `app/renderer.js`

```javascript
const NETWORK_CONFIG = {
  mainnet: {
    name: 'Mainnet',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    programId: 'YOUR_NEW_MAINNET_PROGRAM_ID', // ← UPDATE THIS
    isTestMode: false
  }
};
```

### 2. Update `app/main.js`

```javascript
const NETWORK_CONFIG = {
  mainnet: {
    name: 'Mainnet',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    programId: 'YOUR_NEW_MAINNET_PROGRAM_ID', // ← UPDATE THIS
    isTestMode: false
  }
};
```

---

## 📊 Contract Functions Reference

| Function | Description |
|----------|-------------|
| `register_provider` | Register as VPN provider |
| `stake_provider` | Stake SOL as provider |
| `register_node` | Register a VPN node |
| `open_session` | User opens VPN session (SOL escrow) |
| `open_session_spl` | User opens session (USDC) |
| `close_session` | Close session, get refund for unused time |
| `claim_payout` | Provider claims 80% of session fees |
| `create_subscription` | Create weekly/monthly/yearly subscription |
| `cancel_subscription` | Cancel and get proportional refund |
| `initialize_treasury` | One-time treasury setup |

---

## 📞 Contact

After deployment, provide:
1. New Mainnet Program ID
2. Treasury PDA address
3. Transaction signature of deployment
