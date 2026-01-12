#!/bin/bash
# WireGuard VPN Server Setup for DVPN
# Run this on your server: 64.227.150.205
# Usage: bash setup_wireguard_server.sh

set -e

SERVER_IP="64.227.150.205"
WG_PORT="51820"
WG_INTERFACE="wg0"
SUBNET="10.10.0.0/24"
SERVER_IP_INTERNAL="10.10.0.1"

echo "═══════════════════════════════════════════════════"
echo "   DVPN WireGuard Server Setup"
echo "   Server: $SERVER_IP"
echo "═══════════════════════════════════════════════════"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "❌ Please run as root (sudo bash setup_wireguard_server.sh)"
  exit 1
fi

# Step 1: Install WireGuard
echo "📦 Step 1: Installing WireGuard..."
if command -v apt-get &> /dev/null; then
  # Ubuntu/Debian
  apt-get update
  apt-get install -y wireguard wireguard-tools
elif command -v yum &> /dev/null; then
  # CentOS/RHEL
  yum install -y epel-release
  yum install -y wireguard-tools
else
  echo "❌ Unsupported OS. Please install WireGuard manually."
  exit 1
fi
echo "✅ WireGuard installed"
echo ""

# Step 2: Generate server keys
echo "🔑 Step 2: Generating WireGuard keys..."
mkdir -p /etc/wireguard
cd /etc/wireguard

if [ ! -f "server_private.key" ]; then
  wg genkey | tee server_private.key | wg pubkey > server_public.key
  chmod 600 server_private.key
  echo "✅ Keys generated"
else
  echo "⚠️  Keys already exist, skipping generation"
fi

SERVER_PRIVATE_KEY=$(cat server_private.key)
SERVER_PUBLIC_KEY=$(cat server_public.key)

echo "   Public Key: $SERVER_PUBLIC_KEY"
echo ""

# Step 3: Enable IP forwarding
echo "🌐 Step 3: Enabling IP forwarding..."
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
echo "net.ipv6.conf.all.forwarding=1" >> /etc/sysctl.conf
sysctl -p
echo "✅ IP forwarding enabled"
echo ""

# Step 4: Configure WireGuard
echo "⚙️  Step 4: Creating WireGuard configuration..."
cat > /etc/wireguard/$WG_INTERFACE.conf << EOF
[Interface]
Address = $SERVER_IP_INTERNAL/24
ListenPort = $WG_PORT
PrivateKey = $SERVER_PRIVATE_KEY

# NAT rules
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# Clients will be added dynamically by node daemon
EOF

chmod 600 /etc/wireguard/$WG_INTERFACE.conf
echo "✅ Configuration created"
echo ""

# Step 5: Configure firewall
echo "🔥 Step 5: Configuring firewall..."
if command -v ufw &> /dev/null; then
  # UFW (Ubuntu)
  ufw allow $WG_PORT/udp
  ufw allow OpenSSH
  ufw --force enable
  echo "✅ UFW configured"
elif command -v firewall-cmd &> /dev/null; then
  # firewalld (CentOS)
  firewall-cmd --permanent --add-port=$WG_PORT/udp
  firewall-cmd --permanent --add-masquerade
  firewall-cmd --reload
  echo "✅ firewalld configured"
else
  # iptables
  iptables -A INPUT -p udp --dport $WG_PORT -j ACCEPT
  iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
  echo "✅ iptables configured"
fi
echo ""

# Step 6: Start WireGuard
echo "🚀 Step 6: Starting WireGuard..."
systemctl enable wg-quick@$WG_INTERFACE
systemctl start wg-quick@$WG_INTERFACE
systemctl status wg-quick@$WG_INTERFACE --no-pager
echo ""

# Step 7: Verify installation
echo "✅ Step 7: Verifying installation..."
if wg show | grep -q interface; then
  echo "✅ WireGuard is running"
  wg show
else
  echo "❌ WireGuard failed to start"
  exit 1
fi
echo ""

# Step 8: Install Node.js (for daemon)
echo "📦 Step 8: Installing Node.js..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  apt-get install -y nodejs
fi
echo "   Node.js version: $(node --version)"
echo "   npm version: $(npm --version)"
echo ""

# Step 9: Create daemon directory
echo "📁 Step 9: Setting up daemon directory..."
mkdir -p /opt/dvpn-node
cd /opt/dvpn-node

cat > package.json << 'EOF'
{
  "name": "dvpn-node",
  "version": "1.0.0",
  "description": "DVPN Node Daemon",
  "main": "daemon.js",
  "scripts": {
    "start": "node daemon.js",
    "dev": "NODE_ENV=development node daemon.js"
  },
  "dependencies": {
    "@coral-xyz/anchor": "^0.28.0",
    "@solana/web3.js": "^1.87.0",
    "bs58": "^5.0.0",
    "tweetnacl": "^1.0.3"
  }
}
EOF

echo "✅ Daemon directory created"
echo ""

# Step 10: Save configuration
echo "💾 Step 10: Saving configuration..."
cat > /opt/dvpn-node/config.json << EOF
{
  "server": {
    "ip": "$SERVER_IP",
    "port": $WG_PORT,
    "wg_interface": "$WG_INTERFACE",
    "wg_public_key": "$SERVER_PUBLIC_KEY",
    "subnet": "$SUBNET"
  },
  "solana": {
    "rpc_url": "https://api.devnet.solana.com",
    "program_id": "8LQKwvHJPdK6fKmopXmUwct8JjVGQhf3RFQd64nCV39i"
  },
  "node": {
    "region": "nyc",
    "price_per_minute": 1000000,
    "max_capacity": 100
  }
}
EOF

echo "✅ Configuration saved to /opt/dvpn-node/config.json"
echo ""

# Print summary
echo "═══════════════════════════════════════════════════"
echo "   ✅ Setup Complete!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "📋 Server Details:"
echo "   IP: $SERVER_IP"
echo "   Port: $WG_PORT"
echo "   WG Interface: $WG_INTERFACE"
echo "   WG Public Key: $SERVER_PUBLIC_KEY"
echo ""
echo "📁 Files Created:"
echo "   /etc/wireguard/server_private.key"
echo "   /etc/wireguard/server_public.key"
echo "   /etc/wireguard/$WG_INTERFACE.conf"
echo "   /opt/dvpn-node/config.json"
echo "   /opt/dvpn-node/package.json"
echo ""
echo "🚀 Next Steps:"
echo "   1. Copy node daemon files to /opt/dvpn-node/"
echo "   2. Install dependencies: cd /opt/dvpn-node && npm install"
echo "   3. Create provider keypair: solana-keygen new -o provider-keypair.json"
echo "   4. Register node on-chain (see register_node.sh)"
echo "   5. Start daemon: cd /opt/dvpn-node && npm start"
echo ""
echo "🔧 Test WireGuard:"
echo "   wg show"
echo "   ping $SERVER_IP_INTERNAL"
echo ""
echo "🌐 Access from outside:"
echo "   ssh root@$SERVER_IP"
echo ""
