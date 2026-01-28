#!/bin/bash
# VPN Node Daemon with IPFS Integration
# This runs on each VPN server to announce itself to the IPFS network

IPFS_API="http://localhost:5001"
REGISTRY_URL="http://localhost:8080"  # Optional fallback
ANNOUNCE_INTERVAL=60  # seconds

# Node configuration
NODE_PUBKEY="${NODE_PUBKEY:-your-node-pubkey-here}"
NODE_ENDPOINT="${NODE_ENDPOINT:-64.227.150.205:41194}"
NODE_REGION="${NODE_REGION:-nyc}"
PRICE_PER_MINUTE="${PRICE_PER_MINUTE:-1000000}"
WG_PUBLIC_KEY="${WG_PUBLIC_KEY:-your-wg-pubkey-here}"

echo "═══════════════════════════════════════════════"
echo "   DVPN Node Daemon (IPFS Mode)"
echo "═══════════════════════════════════════════════"
echo "   Endpoint: $NODE_ENDPOINT"
echo "   Region: $NODE_REGION"
echo "═══════════════════════════════════════════════"
echo ""

# Check if IPFS is installed
if ! command -v ipfs &> /dev/null; then
  echo "❌ IPFS not installed. Installing..."
  
  if [[ "$OSTYPE" == "darwin"* ]]; then
    brew install ipfs
  else
    wget https://dist.ipfs.tech/kubo/v0.24.0/kubo_v0.24.0_linux-amd64.tar.gz
    tar -xvzf kubo_v0.24.0_linux-amd64.tar.gz
    cd kubo
    sudo bash install.sh
    cd ..
    rm -rf kubo*
  fi
fi

# Initialize IPFS if not done
if [ ! -d ~/.ipfs ]; then
  echo "🔧 Initializing IPFS..."
  ipfs init --profile server
fi

# Start IPFS daemon if not running
if ! pgrep -x "ipfs" > /dev/null; then
  echo "🚀 Starting IPFS daemon..."
  ipfs daemon &
  IPFS_PID=$!
  sleep 5
else
  echo "✅ IPFS daemon already running"
fi

# Get IPFS peer ID
IPFS_PEER_ID=$(ipfs id -f='<id>')
echo "   IPFS Peer ID: $IPFS_PEER_ID"
echo ""

# Function to announce node to IPFS network
announce_node() {
  # Get current stats
  ACTIVE_SESSIONS=$(wg show wg0 peers 2>/dev/null | wc -l || echo 0)
  
  # Create node data JSON
  NODE_DATA=$(cat <<EOF
{
  "pubkey": "$NODE_PUBKEY",
  "provider": "$(cat ~/.dvpn/provider-pubkey.txt 2>/dev/null || echo 'unknown')",
  "node_id": "$(hostname)",
  "endpoint": "$NODE_ENDPOINT",
  "region": "$NODE_REGION",
  "price_per_minute_lamports": $PRICE_PER_MINUTE,
  "wg_server_pubkey": "$WG_PUBLIC_KEY",
  "max_capacity": 100,
  "active_sessions": $ACTIVE_SESSIONS,
  "is_active": true,
  "reputation_score": 1000,
  "ipfs_peer_id": "$IPFS_PEER_ID",
  "timestamp": $(date +%s)
}
EOF
)

  # Store in IPFS
  CID=$(echo "$NODE_DATA" | ipfs add --quiet)
  
  if [ $? -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Published to IPFS: $CID"
    
    # Publish to IPNS for mutable address (optional)
    ipfs name publish --key=dvpn-node $CID 2>/dev/null || true
    
    # Also announce via PubSub
    echo "$NODE_DATA" | ipfs pubsub pub dvpn-nodes
    
  else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Failed to publish to IPFS"
  fi
}

# Announce immediately on startup
echo "📢 Announcing node to IPFS network..."
announce_node

# Keep announcing periodically
echo ""
echo "🔄 Will announce every $ANNOUNCE_INTERVAL seconds"
echo "   Press Ctrl+C to stop"
echo ""

while true; do
  sleep $ANNOUNCE_INTERVAL
  announce_node
done
