#!/bin/bash
# DVPN Quick Test - Step by Step
# Run this script to test all components

set -e  # Exit on error

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   DVPN STEP-BY-STEP TESTING${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""

# Step 1: Check prerequisites
echo -e "${YELLOW}STEP 1: Checking Prerequisites...${NC}"
echo -e "${BLUE}▶ Solana CLI:${NC} $(solana --version)"
echo -e "${BLUE}▶ Anchor CLI:${NC} $(anchor --version)"
echo -e "${BLUE}▶ Node.js:${NC} $(node --version)"
echo -e "${GREEN}✅ All prerequisites installed${NC}"
echo ""

# Step 2: Check files
echo -e "${YELLOW}STEP 2: Checking Files...${NC}"
files=(
  "programs/dvpn/src/lib.rs"
  "target/deploy/dvpn.so"
  "target/idl/dvpn.json"
  "wallet.json"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo -e "${GREEN}✅${NC} $file"
  else
    echo -e "${RED}❌${NC} $file - NOT FOUND"
    exit 1
  fi
done
echo ""

# Step 3: Check validator
echo -e "${YELLOW}STEP 3: Checking Validator...${NC}"
if lsof -ti:8899 > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Validator is running on port 8899${NC}"
  solana cluster-version 2>/dev/null || echo -e "${YELLOW}⚠️  Validator starting up, please wait...${NC}"
else
  echo -e "${RED}❌ Validator NOT running${NC}"
  echo -e "${YELLOW}📌 ACTION REQUIRED:${NC}"
  echo -e "   Open a new terminal and run:"
  echo -e "   ${BLUE}solana-test-validator --reset${NC}"
  echo -e ""
  echo -e "   Then run this script again."
  exit 1
fi
echo ""

# Step 4: Check wallet balance
echo -e "${YELLOW}STEP 4: Checking Wallet...${NC}"
export ANCHOR_WALLET=wallet.json
BALANCE=$(solana balance --keypair wallet.json 2>&1 || echo "0")
echo -e "${BLUE}▶ Wallet:${NC} $(solana address --keypair wallet.json)"
echo -e "${BLUE}▶ Balance:${NC} $BALANCE"

if [[ "$BALANCE" == *"0 SOL"* ]] || [[ "$BALANCE" == "0" ]]; then
  echo -e "${YELLOW}⚠️  Low balance, airdropping...${NC}"
  solana airdrop 10 --keypair wallet.json || true
  sleep 2
fi
echo ""

# Step 5: Check program
echo -e "${YELLOW}STEP 5: Checking Program Deployment...${NC}"
PROGRAM_ID=$(cat target/idl/dvpn.json | grep -A1 '"metadata"' | grep '"address"' | cut -d'"' -f4)
echo -e "${BLUE}▶ Program ID:${NC} $PROGRAM_ID"

PROGRAM_INFO=$(solana account $PROGRAM_ID 2>&1 || echo "NOT FOUND")
if [[ "$PROGRAM_INFO" == *"NOT FOUND"* ]]; then
  echo -e "${RED}❌ Program not deployed${NC}"
  echo -e "${YELLOW}📌 ACTION REQUIRED:${NC}"
  echo -e "   Run: ${BLUE}anchor deploy${NC}"
  exit 1
else
  echo -e "${GREEN}✅ Program deployed and found on-chain${NC}"
fi
echo ""

# Step 6: Run basic tests
echo -e "${YELLOW}STEP 6: Running Basic Tests...${NC}"
echo ""

# Test 6.1: Provider registration
if [ -f "scripts/test_simple.js" ]; then
  echo -e "${BLUE}Test 6.1: Provider & Node Registration${NC}"
  node scripts/test_simple.js || echo -e "${RED}❌ Test failed${NC}"
  echo ""
fi

# Test 6.2: Session creation
if [ -f "scripts/test_session.js" ]; then
  echo -e "${BLUE}Test 6.2: Session Creation${NC}"
  node scripts/test_session.js || echo -e "${RED}❌ Test failed${NC}"
  echo ""
fi

# Summary
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Basic tests completed!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo -e "   1. Test node daemon: ${BLUE}node scripts/node_daemon_server.js${NC}"
echo -e "   2. Test indexer: ${BLUE}cd indexer && npm start${NC}"
echo -e "   3. Test client app: ${BLUE}cd app && npm start${NC}"
echo ""
echo -e "${BLUE}📖 Full testing guide: TESTING_GUIDE.md${NC}"
echo ""
