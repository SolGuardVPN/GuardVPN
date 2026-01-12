# DVPN Testing Guide - Step by Step

Complete guide to testing all DVPN components systematically.

## Prerequisites

Before testing, ensure you have:
- ✅ Solana CLI installed
- ✅ Anchor CLI installed
- ✅ Node.js 16+ installed
- ✅ Rust/Cargo installed
- ✅ WireGuard installed (for VPN testing)
- ✅ PostgreSQL installed (for indexer testing)

## Quick Start

```bash
# Run automated test
node scripts/test_complete.js
```

---

## Step-by-Step Testing

### STEP 1: Environment Setup

#### 1.1 Start Local Validator
```bash
# Terminal 1 - Keep this running
solana-test-validator --reset
```

**Expected Output:**
```
Ledger location: test-ledger
Listening on 127.0.0.1:8899
```

#### 1.2 Check Connection
```bash
# New terminal
solana config get
solana cluster-version
solana balance
```

**Expected Output:**
```
Config File: ~/.config/solana/cli/config.yml
RPC URL: http://localhost:8899
WebSocket URL: ws://localhost:8900/
Keypair Path: ~/.config/solana/id.json
Commitment: confirmed

127.0.0.1:8899 running solana-core: 1.18.x

500 SOL (or airdrop if 0: solana airdrop 2)
```

#### 1.3 Install Dependencies
```bash
# Root dependencies
npm install

# Indexer dependencies
cd indexer && npm install && cd ..

# App dependencies
cd app && npm install && cd ..
```

---

### STEP 2: Program Deployment Test

#### 2.1 Check Program Build
```bash
# Verify binary exists
ls -lh target/deploy/dvpn.so

# Should show: ~260KB file
```

#### 2.2 Check Program Deployment
```bash
# Get program ID from IDL
cat target/idl/dvpn.json | grep -A 1 "metadata"

# Check program account
solana account 8LQKwvHJPdK6fKmopXmUwct8JjVGQhf3RFQd64nCV39i
```

**Expected Output:**
```
Public Key: 8LQKwvHJPdK6fKmopXmUwct8JjVGQhf3RFQd64nCV39i
Balance: 2.xxx SOL
Owner: BPFLoaderUpgradeab1e11111111111111111111111
Executable: true
```

#### 2.3 Rebuild if Needed
```bash
# If program not deployed or outdated
anchor build
anchor deploy

# Or manually
cargo build-sbf --manifest-path=programs/dvpn/Cargo.toml
solana program deploy target/deploy/dvpn.so \
  --keypair wallet.json \
  --program-id target/deploy/dvpn-keypair.json
```

---

### STEP 3: Provider & Node Registration Test

#### 3.1 Test Provider Registration
```bash
node scripts/test_simple.js
```

**Expected Output:**
```
🧪 Testing DVPN Basic Functionality

1️⃣ Register Provider
✅ Provider registered: HHec...
   Authority: 5wm7...
   Stake: 0 lamports
   Reputation: 1000

2️⃣ Register Node
✅ Node registered: 3TXw...
   Endpoint: 192.168.1.100:51820
   Region: us-east
   Price: 1000000 lamports/min
   WG Pubkey: AbCd...

✅ All tests passed!
```

#### 3.2 Verify Accounts Created
```bash
# Check provider PDA
solana account <provider_pda_from_output>

# Check node PDA
solana account <node_pda_from_output>
```

#### 3.3 Test Staking (Optional)
```bash
# Create test script for staking
cat > scripts/test_stake.js << 'EOF'
const anchor = require('@coral-xyz/anchor');
const { PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');
const idl = require('../target/idl/dvpn.json');

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, provider);
  
  const [providerPda] = await PublicKey.findProgramAddress(
    [Buffer.from('provider'), provider.wallet.publicKey.toBuffer()],
    program.programId
  );
  
  console.log('💰 Staking 0.1 SOL...');
  await program.methods
    .stakeProvider(new anchor.BN(0.1 * 1e9))
    .accounts({
      provider: providerPda,
      authority: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId
    })
    .rpc();
  
  const account = await program.account.provider.fetch(providerPda);
  console.log('✅ Stake:', account.stakeLamports.toString(), 'lamports');
}

main().then(() => process.exit(0)).catch(console.error);
EOF

node scripts/test_stake.js
```

---

### STEP 4: Session Management Test

#### 4.1 Test Session Creation
```bash
node scripts/test_session.js
```

**Expected Output:**
```
🔐 Testing Session Creation

✅ Session created: 3sv9...
   User: 5wm7...
   Node: 3TXw...
   Escrow: 0.01 SOL
   Duration: 60 minutes
   State: Active

✅ Session account verified (186 bytes)
```

#### 4.2 Test Session Close
```bash
node scripts/test_close_session.js
```

**Expected Output:**
```
🔒 Testing Session Close

✅ Session closed: 3sv9...
   Refund: 0.008 SOL (80% unused)
   Provider earned: 0.002 SOL
   State: Closed

✅ User received refund
```

#### 4.3 Test Usage Billing
```bash
node scripts/test_claim_chunk.js
```

**Expected Output:**
```
📊 Testing Usage-Based Billing

✅ Chunk claimed: 100MB
   Amount: 0.001 SOL
   Bytes used: 104,857,600
   Remaining balance: 0.009 SOL

✅ Provider balance increased
```

---

### STEP 5: Node Daemon Test

#### 5.1 Start Node Daemon (HTTP Server)
```bash
# Terminal 2 - Keep running
export WG_INTERFACE=wg0
export DRY_RUN=1  # Don't actually configure WireGuard
node scripts/node_daemon_server.js
```

**Expected Output:**
```
✅ Node daemon server started
   Port: 3000
   Node: EG4d3Y7r...
   Provider: 43y5RPke...

📡 Listening for session auth requests...
```

#### 5.2 Test API Endpoints
```bash
# New terminal - Test node info endpoint
curl http://localhost:3000/node

# Expected: Node metadata JSON
```

#### 5.3 Test Session Auth (Simulated)
```bash
cat > test_auth.json << 'EOF'
{
  "sessionPda": "SESSION_PDA_HERE",
  "clientWgPubkey": "TEST_WG_PUBKEY",
  "signature": "TEST_SIGNATURE"
}
EOF

curl -X POST http://localhost:3000/session/auth \
  -H "Content-Type: application/json" \
  -d @test_auth.json

# Expected: Auth response or error (expected in dry-run mode)
```

#### 5.4 Start Enhanced Daemon (Receipts & Claims)
```bash
# Terminal 3 - Keep running
export PROVIDER_KEYPAIR=./wallet.json
node scripts/node_daemon_enhanced.js
```

**Expected Output:**
```
✅ Loaded provider keypair: 5wm7...

📊 Starting receipt submitter (every 5 min)
💰 Starting payout claimer (every 10 min)

⏳ Waiting for sessions...
```

---

### STEP 6: Indexer Service Test

#### 6.1 Setup Database
```bash
# Check if PostgreSQL is running
pg_isready

# Create database
createdb dvpn_test

# Set environment variables
export DB_NAME=dvpn_test
export DB_USER=postgres
export DB_PASSWORD=postgres
export ANCHOR_PROVIDER_URL=http://localhost:8899
```

#### 6.2 Start Indexer
```bash
# Terminal 4 - Keep running
cd indexer
npm start
```

**Expected Output:**
```
🗄️  Database connected
📊 Tables created/verified
🔄 Starting blockchain sync (every 5s)
🚀 API server listening on :8080

✅ Indexed 1 provider(s)
✅ Indexed 2 node(s)
✅ Indexed 3 session(s)
```

#### 6.3 Test API Endpoints
```bash
# Test nodes endpoint
curl http://localhost:8080/nodes | jq

# Test with filters
curl "http://localhost:8080/nodes?region=us-east&min_reputation=500" | jq

# Test sessions endpoint
curl http://localhost:8080/sessions | jq

# Test stats endpoint
curl http://localhost:8080/stats | jq
```

**Expected Output:**
```json
[
  {
    "pubkey": "3TXw...",
    "endpoint": "192.168.1.100:51820",
    "region": "us-east",
    "reputation_score": 1000,
    "active_sessions": 0,
    "max_capacity": 100
  }
]
```

---

### STEP 7: Electron Client Test

#### 7.1 Install App Dependencies
```bash
cd app
npm install
```

#### 7.2 Check Phantom Wallet
```bash
# Ensure Phantom wallet extension is installed
# If not, install from: https://phantom.app
```

#### 7.3 Start Electron App
```bash
npm start
```

**Expected UI:**
```
✅ Window opens with DVPN client
✅ "Connect Wallet" button visible
✅ Nodes section shows loading state
✅ Settings tab has indexer/RPC URLs
```

#### 7.4 Test UI Flow (Manual)
1. Click "Connect Wallet" → Phantom popup appears
2. Approve connection → Wallet address displays
3. Browse nodes → Should load from indexer
4. Select a node → Card highlights
5. Click "Connect to VPN" → Transaction flow starts
6. Check settings tab → URLs are configurable

#### 7.5 Test Without Wallet (Dev Mode)
```bash
# Set dev mode
NODE_ENV=development npm start
```

This opens DevTools for debugging.

---

### STEP 8: Advanced Features Test

#### 8.1 Test Hash-Chain Payments
```bash
node scripts/hashchain_payment.js
```

**Expected Output:**
```
✅ Hash chain generated:
   Length: 60
   Commitment: a1b2c3d4...

📝 Creating session with hash-chain:
   Session PDA: SESSION_PDA
   Chain length: 60

🔓 Preimage revealed [0/60]
🔓 Preimage revealed [1/60]
...

✅ Hash chain verified: 30 links
💰 Claiming payment with hash-chain proof
```

#### 8.2 Test Multi-Sig Arbitration
```bash
node scripts/multisig_arbitration.js
```

**Expected Output:**
```
✅ Council initialized: COUNCIL_PDA
   Arbitrators: 5
   Threshold: 3

📋 Dispute proposal created: PROPOSAL_PDA
   Session: SESSION_PDA
   Reason: No connection established

🗳️  Vote cast by arbitrator1...
   Decision: refund_user
   Votes: 1 / 3

🗳️  Vote cast by arbitrator2...
   Decision: refund_user
   Votes: 2 / 3

🗳️  Vote cast by arbitrator3...
   Decision: refund_user
   Votes: 3 / 3

✅ Dispute resolved:
   Decision: refund_user
   Refund: 100 %
   Slash: 12 %
   Consensus: 3 / 3

🔗 Resolution executed on-chain
```

#### 8.3 Test Complete Features Script
```bash
node scripts/test_all_features.js
```

This tests all 12 instructions in sequence.

---

### STEP 9: Integration Test (Full Flow)

Run a complete end-to-end test:

```bash
# 1. Ensure all services running:
#    - Terminal 1: solana-test-validator
#    - Terminal 2: node scripts/node_daemon_server.js
#    - Terminal 3: node scripts/node_daemon_enhanced.js
#    - Terminal 4: cd indexer && npm start

# 2. Create provider and node
node scripts/mvp.ts

# 3. Wait for indexer to sync (5 seconds)
sleep 5

# 4. Start client app
cd app && npm start

# 5. In app UI:
#    - Connect wallet
#    - Select node
#    - Create session
#    - Monitor connection
#    - Disconnect

# 6. Check logs in all terminals for activity
```

---

### STEP 10: Load Testing (Optional)

#### 10.1 Create Multiple Sessions
```bash
# Test concurrent sessions
for i in {1..10}; do
  node scripts/test_session.js &
done
wait

echo "✅ Created 10 concurrent sessions"
```

#### 10.2 Monitor Performance
```bash
# Check validator performance
solana-test-validator --log

# Check indexer performance
tail -f indexer/logs/indexer.log

# Check node daemon performance
curl http://localhost:3000/stats
```

---

## Troubleshooting

### Issue: "Program not found"
```bash
# Solution: Redeploy program
anchor build
anchor deploy
```

### Issue: "Validator not running"
```bash
# Solution: Start validator
solana-test-validator --reset
```

### Issue: "Database connection failed"
```bash
# Solution: Start PostgreSQL
brew services start postgresql@14
createdb dvpn_test
```

### Issue: "WireGuard not found"
```bash
# Solution: Install WireGuard
brew install wireguard-tools  # macOS
sudo apt install wireguard-tools  # Linux
```

### Issue: "Phantom wallet not detected"
```bash
# Solution: Install extension
# Visit: https://phantom.app
# Or test without wallet in dev mode
```

---

## Test Checklist

Use this checklist to track your testing progress:

- [ ] Prerequisites installed
- [ ] Validator running
- [ ] Program deployed
- [ ] Provider registered
- [ ] Node registered
- [ ] Session created
- [ ] Session closed
- [ ] Usage billing tested
- [ ] Node daemon running
- [ ] Indexer syncing
- [ ] API endpoints working
- [ ] Electron app starts
- [ ] Wallet connects
- [ ] Hash-chains work
- [ ] Multi-sig arbitration works
- [ ] Full integration test passed

---

## Next Steps After Testing

1. **If all tests pass:**
   - Deploy to devnet
   - Test with real users
   - Conduct security audit
   - Prepare for mainnet

2. **If tests fail:**
   - Check logs in all terminals
   - Review error messages
   - Check prerequisite versions
   - Consult troubleshooting section
   - Report issues with full error logs

---

## Automated Test Suite

Run the complete automated test:

```bash
npm test
```

This will:
1. Check all prerequisites
2. Verify file structure
3. Test program deployment
4. Run all feature tests
5. Generate test report

---

## Test Reports

After testing, reports are generated in:
- `test-results/` - Detailed test logs
- `coverage/` - Code coverage reports
- `benchmarks/` - Performance metrics

---

**Testing completed?** Check [COMPLETE_IMPLEMENTATION_REPORT.md](COMPLETE_IMPLEMENTATION_REPORT.md) for deployment guide.
