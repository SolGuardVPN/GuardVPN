#!/bin/bash
# Universal WireGuard NAT Fix Script
# Auto-detects whether to use iptables or nftables
# Run on your VPN server: sudo bash fix_wireguard_nat_auto.sh

set -e

echo "═══════════════════════════════════════════════════"
echo "   WireGuard NAT Auto-Configuration"
echo "═══════════════════════════════════════════════════"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "❌ Please run as root (sudo bash fix_wireguard_nat_auto.sh)"
  exit 1
fi

# Detect firewall system
echo "🔍 Detecting firewall system..."
USE_NFTABLES=false

if command -v nft &> /dev/null; then
  if nft list tables 2>/dev/null | grep -q .; then
    USE_NFTABLES=true
    echo "✅ Detected: nftables"
  fi
fi

if [ "$USE_NFTABLES" = false ] && command -v iptables &> /dev/null; then
  echo "✅ Detected: iptables"
else
  if [ "$USE_NFTABLES" = false ]; then
    echo "❌ No firewall system detected"
    exit 1
  fi
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

if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf 2>/dev/null; then
  echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi
if ! grep -q "net.ipv6.conf.all.forwarding=1" /etc/sysctl.conf 2>/dev/null; then
  echo "net.ipv6.conf.all.forwarding=1" >> /etc/sysctl.conf
fi

echo "✅ IP forwarding enabled"
echo ""

WG_CONF="/etc/wireguard/wg0.conf"

if [ "$USE_NFTABLES" = true ]; then
  echo "🔧 Configuring with nftables..."
  
  # Create nftables configuration
  cat > /etc/nftables.conf << EOF
#!/usr/sbin/nft -f

flush ruleset

table inet filter {
  chain input {
    type filter hook input priority 0; policy accept;
    ct state established,related accept
    iif lo accept
    tcp dport 22 accept
    udp dport 41194 accept
  }
  
  chain forward {
    type filter hook forward priority 0; policy drop;
    iif "wg0" accept
    oif "wg0" accept
    ct state established,related accept
  }
  
  chain output {
    type filter hook output priority 0; policy accept;
  }
}

table inet nat {
  chain postrouting {
    type nat hook postrouting priority 100; policy accept;
    oif "$MAIN_INTERFACE" masquerade
  }
}
EOF

  nft -f /etc/nftables.conf
  systemctl enable nftables 2>/dev/null || true
  
  # Remove PostUp/PostDown from WireGuard config
  if [ -f "$WG_CONF" ]; then
    cp "$WG_CONF" "$WG_CONF.backup.$(date +%Y%m%d_%H%M%S)"
    sed -i '/^PostUp/d' "$WG_CONF"
    sed -i '/^PostDown/d' "$WG_CONF"
  fi
  
  echo "✅ nftables configured"
  
else
  echo "🔧 Configuring with iptables..."
  
  # Update WireGuard config with PostUp/PostDown
  if [ -f "$WG_CONF" ]; then
    cp "$WG_CONF" "$WG_CONF.backup.$(date +%Y%m%d_%H%M%S)"
    
    sed -i '/^PostUp/d' "$WG_CONF"
    sed -i '/^PostDown/d' "$WG_CONF"
    
    sed -i "/^PrivateKey/a\\
#\\
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o $MAIN_INTERFACE -j MASQUERADE\\
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o $MAIN_INTERFACE -j MASQUERADE" "$WG_CONF"
  fi
  
  echo "✅ iptables rules added to WireGuard config"
fi

echo ""

# Restart WireGuard
echo "🔄 Restarting WireGuard..."
systemctl restart wg-quick@wg0

sleep 2

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

# Verify NAT
echo "🔍 Verifying NAT configuration..."
if [ "$USE_NFTABLES" = true ]; then
  nft list table inet nat 2>/dev/null | grep masquerade && echo "✅ NAT (masquerade) is active"
else
  iptables -t nat -L POSTROUTING -v -n | grep MASQUERADE && echo "✅ NAT (MASQUERADE) is active"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "   ✅ Configuration Complete!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "Firewall: $([ "$USE_NFTABLES" = true ] && echo "nftables" || echo "iptables")"
echo "Interface: $MAIN_INTERFACE"
echo ""
echo "Test by connecting and running: curl ifconfig.me"
echo ""
