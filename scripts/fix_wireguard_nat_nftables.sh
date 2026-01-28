#!/bin/bash
# WireGuard NAT Fix Script (nftables version)
# This script configures WireGuard routing using nftables instead of iptables
# Run on your VPN server: sudo bash fix_wireguard_nat_nftables.sh

set -e

echo "═══════════════════════════════════════════════════"
echo "   WireGuard NAT Configuration Fix (nftables)"
echo "═══════════════════════════════════════════════════"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "❌ Please run as root (sudo bash fix_wireguard_nat_nftables.sh)"
  exit 1
fi

# Detect if nftables or iptables is being used
echo "🔍 Detecting firewall system..."
if command -v nft &> /dev/null && nft list tables 2>/dev/null | grep -q .; then
  FIREWALL="nftables"
  echo "✅ Detected: nftables"
elif command -v iptables &> /dev/null; then
  FIREWALL="iptables"
  echo "✅ Detected: iptables (will use that script instead)"
  echo "⚠️  Use fix_wireguard_nat.sh for iptables systems"
else
  echo "❌ No firewall system detected"
  exit 1
fi
echo ""

# Detect the main network interface
echo "🔍 Detecting network interface..."
MAIN_INTERFACE=$(ip route | grep default | awk '{print $5}' | head -n1)

if [ -z "$MAIN_INTERFACE" ]; then
  echo "❌ Could not detect network interface automatically"
  echo "Available interfaces:"
  ip link show
  echo ""
  read -p "Enter your main network interface name (e.g., eth0, ens3, ens5): " MAIN_INTERFACE
fi

echo "✅ Detected interface: $MAIN_INTERFACE"
echo ""

# Enable IP forwarding
echo "🌐 Enabling IP forwarding..."
sysctl -w net.ipv4.ip_forward=1 > /dev/null
sysctl -w net.ipv6.conf.all.forwarding=1 > /dev/null

# Make it persistent
if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf 2>/dev/null; then
  echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi
if ! grep -q "net.ipv6.conf.all.forwarding=1" /etc/sysctl.conf 2>/dev/null; then
  echo "net.ipv6.conf.all.forwarding=1" >> /etc/sysctl.conf
fi

echo "✅ IP forwarding enabled"
echo ""

if [ "$FIREWALL" = "nftables" ]; then
  echo "🔧 Configuring nftables rules..."
  
  # Create nftables configuration
  cat > /etc/nftables.conf << EOF
#!/usr/sbin/nft -f

flush ruleset

table inet filter {
  chain input {
    type filter hook input priority 0; policy accept;
    
    # Allow established/related connections
    ct state established,related accept
    
    # Allow loopback
    iif lo accept
    
    # Allow SSH
    tcp dport 22 accept
    
    # Allow WireGuard
    udp dport 41194 accept
  }
  
  chain forward {
    type filter hook forward priority 0; policy drop;
    
    # Allow WireGuard traffic
    iif "wg0" accept
    oif "wg0" accept
    
    # Allow established/related
    ct state established,related accept
  }
  
  chain output {
    type filter hook output priority 0; policy accept;
  }
}

table inet nat {
  chain postrouting {
    type nat hook postrouting priority 100; policy accept;
    
    # Masquerade traffic from WireGuard to internet
    oif "$MAIN_INTERFACE" masquerade
  }
}
EOF

  echo "✅ nftables config created: /etc/nftables.conf"
  echo ""
  
  # Apply nftables rules
  echo "🔄 Applying nftables rules..."
  nft -f /etc/nftables.conf
  
  # Enable nftables service
  systemctl enable nftables
  
  echo "✅ nftables rules applied"
  echo ""
  
  # Update WireGuard config to NOT use PostUp/PostDown
  WG_CONF="/etc/wireguard/wg0.conf"
  if [ -f "$WG_CONF" ]; then
    echo "📝 Updating WireGuard config..."
    
    # Backup
    cp "$WG_CONF" "$WG_CONF.backup.$(date +%Y%m%d_%H%M%S)"
    
    # Remove PostUp/PostDown (nftables handles it)
    sed -i '/^PostUp/d' "$WG_CONF"
    sed -i '/^PostDown/d' "$WG_CONF"
    
    echo "✅ WireGuard config updated (removed PostUp/PostDown)"
    echo "   NAT is now handled by nftables"
    echo ""
  fi
  
else
  echo "⚠️  Using iptables instead. Use fix_wireguard_nat.sh"
  exit 1
fi

# Restart WireGuard
echo "🔄 Restarting WireGuard..."
systemctl restart wg-quick@wg0

sleep 2

# Check status
if systemctl is-active --quiet wg-quick@wg0; then
  echo "✅ WireGuard is running"
  echo ""
  wg show
  echo ""
else
  echo "❌ WireGuard failed to start"
  systemctl status wg-quick@wg0 --no-pager
  exit 1
fi

# Verify nftables rules
echo ""
echo "🔍 Verifying nftables rules..."
echo ""
echo "=== NAT Table ==="
nft list table inet nat
echo ""
echo "=== Filter Table ==="
nft list table inet filter
echo ""

# Test routing
echo "🔍 Testing routing..."
if ip route | grep -q "10.0.1.0/24"; then
  echo "✅ WireGuard subnet is routable"
else
  echo "⚠️  WireGuard subnet not in routing table yet (will appear when clients connect)"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "   ✅ Configuration Complete (nftables)!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "Your VPN server is now configured with nftables."
echo ""
echo "Test by connecting a client and checking:"
echo "  curl ifconfig.me"
echo ""
echo "Verify nftables rules anytime with:"
echo "  nft list ruleset"
echo ""
echo "Check active connections:"
echo "  wg show"
echo ""
