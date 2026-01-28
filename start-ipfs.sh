#!/bin/bash
# Quick Start - DVPN with IPFS (No Database)

echo "═══════════════════════════════════════════════════"
echo "   DVPN IPFS Quick Start"
echo "   Fully Decentralized - No Database!"
echo "═══════════════════════════════════════════════════"
echo ""

# Check if IPFS is installed
if ! command -v ipfs &> /dev/null; then
  echo "📦 Installing IPFS..."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    brew install ipfs
  else
    echo "Please install IPFS manually:"
    echo "  wget https://dist.ipfs.tech/kubo/v0.24.0/kubo_v0.24.0_linux-amd64.tar.gz"
    exit 1
  fi
fi

# Initialize IPFS if needed
if [ ! -d ~/.ipfs ]; then
  echo "🔧 Initializing IPFS..."
  ipfs init
fi

# Start IPFS daemon in background
echo "🚀 Starting IPFS daemon..."
if ! pgrep -x "ipfs" > /dev/null; then
  ipfs daemon > /tmp/ipfs-daemon.log 2>&1 &
  sleep 3
  echo "✅ IPFS daemon started"
else
  echo "✅ IPFS daemon already running"
fi

# Get IPFS peer ID
PEER_ID=$(ipfs id -f='<id>')
echo "   Peer ID: $PEER_ID"
echo ""

# Start IPFS registry (optional gateway)
echo "🌐 Starting IPFS registry (optional gateway)..."
cd indexer
if [ ! -d "node_modules" ]; then
  npm install ipfs-core express cors
fi

node ipfs-registry.js > /tmp/ipfs-registry.log 2>&1 &
REGISTRY_PID=$!
echo "✅ Registry started (PID: $REGISTRY_PID)"
echo "   API: http://localhost:8080"
echo ""

# Start the app
echo "🚀 Starting DVPN app..."
cd ../app
npm start &
APP_PID=$!

echo ""
echo "═══════════════════════════════════════════════════"
echo "   ✅ Everything Running!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "   IPFS Daemon: Running"
echo "   IPFS Registry: http://localhost:8080"
echo "   DVPN App: Starting..."
echo ""
echo "   Logs:"
echo "     IPFS: tail -f /tmp/ipfs-daemon.log"
echo "     Registry: tail -f /tmp/ipfs-registry.log"
echo ""
echo "   To stop everything:"
echo "     killall ipfs node electron"
echo ""
echo "═══════════════════════════════════════════════════"
echo ""
echo "🌐 Your VPN is now fully decentralized!"
echo "   - No database required"
echo "   - Nodes discovered via IPFS PubSub"
echo "   - Censorship resistant"
echo ""
