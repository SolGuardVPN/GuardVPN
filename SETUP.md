# DVPN Solana Program - Setup Guide

## Project Overview

This is a decentralized VPN (DVPN) smart contract built on Solana using the Anchor framework. The program enables:
- VPN providers to register and manage nodes
- Users to open paid VPN sessions with escrow
- Providers to claim payments after sessions end

**Deployed Program ID (Testnet)**: `2CK6gCxcfaX5JuCfJRnn7ZBf6V5ZpiK69T9yeHRJP7Vq`

## Prerequisites

### Required Software & Versions

```bash
rustc --version
# rustc 1.92.0 (ded5c06cf 2025-12-08)

solana --version
# solana-cli 1.18.26 (src:d9f20e95; feat:3241752014, client:SolanaLabs)

anchor --version
# anchor-cli 0.32.1

node --version
# v20.19.4

yarn --version
# (any recent version)
```

### Installation Links

- **Rust**: https://rustup.rs/
- **Solana CLI**: https://docs.solana.com/cli/install-solana-cli-tools
- **Anchor**: https://www.anchor-lang.com/docs/installation
- **Node.js**: https://nodejs.org/

## Initial Setup

### 1. Generate Wallet

```bash
solana-keygen new --outfile wallet.json
```

This creates a new Solana keypair that will be used for deployment and transactions.

### 2. Configure Solana CLI for Testnet

```bash
solana config set --url testnet
solana config set --keypair wallet.json
```

Verify configuration:
```bash
solana config get
# Should show:
# RPC URL: https://api.testnet.solana.com
# Keypair Path: wallet.json
```

### 3. Get Testnet SOL

Request testnet SOL airdrop:
```bash
solana airdrop 2
```

Check balance:
```bash
solana balance
# Should show: 2 SOL (or more)
```

Note: You can request multiple airdrops if needed (up to 5 SOL total on testnet).

## Building the Project

### 1. Install Dependencies

```bash
yarn install
```

### 2. Build the Program

```bash
anchor build
```

This compiles the Rust program and generates:
- `target/deploy/dvpn.so` - The compiled program
- `target/deploy/dvpn-keypair.json` - The program keypair
- `target/idl/dvpn.json` - The Interface Definition Language file

## Deployment

### Deploy to Testnet

```bash
solana program deploy target/deploy/dvpn.so --program-id target/deploy/dvpn-keypair.json
```

Output:
```
Program Id: 2CK6gCxcfaX5JuCfJRnn7ZBf6V5ZpiK69T9yeHRJP7Vq
```

### Verify Deployment

Check the program on Solana Explorer:
```
https://explorer.solana.com/address/2CK6gCxcfaX5JuCfJRnn7ZBf6V5ZpiK69T9yeHRJP7Vq?cluster=testnet
```

## Project Structure

```
dvpn/
├── Anchor.toml              # Anchor configuration
├── Cargo.toml               # Workspace configuration
├── package.json             # Node.js dependencies
├── programs/
│   └── dvpn/
│       ├── Cargo.toml       # Program dependencies
│       └── src/
│           └── lib.rs       # Main program code
├── tests/                   # Test files
├── target/
│   ├── deploy/             # Compiled program files
│   └── idl/                # Generated IDL
└── wallet.json             # Your Solana keypair
```

## Program Features

### Instructions

1. **register_provider** - Register as a VPN provider
2. **register_node** - Register a VPN node with endpoint, region, and pricing
3. **open_session** - User opens a VPN session (pays upfront, funds held in escrow)
4. **close_session** - User closes session early
5. **claim_payout** - Provider claims payment after session ends

### Accounts

- **Provider** - Stores provider authority and node count
- **Node** - Stores node details (endpoint, region, price, WireGuard public key)
- **Session** - Stores session state (user, node, timing, escrow)

## Common Commands

### Check Wallet Address
```bash
solana address
```

### Check Balance
```bash
solana balance
```

### Rebuild After Changes
```bash
anchor build
```

### Redeploy (upgrade existing program)
```bash
solana program deploy target/deploy/dvpn.so --program-id target/deploy/dvpn-keypair.json
```

### Run Tests
```bash
anchor test
```

## Troubleshooting

### "IDL doesn't exist" Error
Ensure `idl-build` feature is in `programs/dvpn/Cargo.toml`:
```toml
[features]
idl-build = ["anchor-lang/idl-build"]
```

### Version Mismatch Warnings
Update dependencies to match CLI version:
- In `programs/dvpn/Cargo.toml`: `anchor-lang = "0.32.1"`
- In `package.json`: `"@coral-xyz/anchor": "^0.32.1"`

### "Blockhash expired" During Deployment
Use direct solana command instead:
```bash
solana program deploy target/deploy/dvpn.so --program-id target/deploy/dvpn-keypair.json
```

### Wrong Network
Make sure you're on testnet:
```bash
solana config set --url testnet
```

## Next Steps

1. **Write Tests** - Add integration tests in `tests/` folder
2. **Build Frontend** - Create a web UI to interact with the program
3. **Add Features** - Enhance the program with additional functionality
4. **Deploy to Mainnet** - When ready for production

## Resources

- Anchor Documentation: https://www.anchor-lang.com/
- Solana Documentation: https://docs.solana.com/
- Program Explorer: https://explorer.solana.com/?cluster=testnet

## Support

For issues or questions:
- Check Anchor Discord: https://discord.gg/anchor
- Solana Stack Exchange: https://solana.stackexchange.com/
