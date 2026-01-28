#!/bin/bash
# WireGuard NAT Fix Script
# This script detects the correct network interface and updates WireGuard config
# Run on your VPN server: sudo bash fix_wireguard_nat.sh

set -e

echo "═══════════════════════════════════════════════════"
echo "   WireGuard NAT Configuration Fix"
echo "═══════════════════════════════════════════════════"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "❌ Please run as root (sudo bash fix_wireguard_nat.sh)"
  exit 1
fi

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

# Check current WireGuard config
WG_CONF="/etc/wireguard/wg0.conf"
if [ ! -f "$WG_CONF" ]; then
  echo "❌ WireGuard config not found at $WG_CONF"
  exit 1
fi

echo "📝 Current config:"
grep -E "PostUp|PostDown" "$WG_CONF" || echo "No PostUp/PostDown rules found"
echo ""

# Backup current config
cp "$WG_CONF" "$WG_CONF.backup.$(date +%Y%m%d_%H%M%S)"
echo "✅ Backup created: $WG_CONF.backup.*"
echo ""

# Update the config
echo "🔧 Updating NAT rules with interface: $MAIN_INTERFACE"

# Remove old PostUp/PostDown lines
sed -i '/^PostUp/d' "$WG_CONF"
sed -i '/^PostDown/d' "$WG_CONF"

# Add new PostUp/PostDown rules after the PrivateKey line
sed -i "/^PrivateKey/a\\
#\\
### NAT rules for routing traffic through VPN\\
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o $MAIN_INTERFACE -j MASQUERADE\\
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o $MAIN_INTERFACE -j MASQUERADE" "$WG_CONF"

echo "✅ Config updated"
echo ""

echo "📝 New config:"
grep -E "PostUp|PostDown" "$WG_CONF"
echo ""

# Enable IP forwarding
echo "🌐 Enabling IP forwarding..."
sysctl -w net.ipv4.ip_forward=1 > /dev/null
sysctl -w net.ipv6.conf.all.forwarding=1 > /dev/null

# Make it persistent
if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
  echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi
if ! grep -q "net.ipv6.conf.all.forwarding=1" /etc/sysctl.conf; then
  echo "net.ipv6.conf.all.forwarding=1" >> /etc/sysctl.conf
fi

echo "✅ IP forwarding enabled"
echo ""

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

# Verify NAT rules
echo ""
echo "🔍 Verifying NAT rules..."
if iptables -t nat -L POSTROUTING -v -n | grep -q "MASQUERADE.*$MAIN_INTERFACE"; then
  echo "✅ NAT/MASQUERADE is configured correctly"
  echo ""
  iptables -t nat -L POSTROUTING -v -n | grep MASQUERADE
else
  echo "⚠️  NAT/MASQUERADE not found in iptables"
  echo "Current NAT rules:"
  iptables -t nat -L POSTROUTING -v -n
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "   ✅ Configuration Complete!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "Your VPN server should now properly route traffic."
echo "Test by connecting a client and checking:"
echo "  curl ifconfig.me"
echo ""
echo "If you still have issues, check:"
echo "  1. Firewall allows port 41194/udp"
echo "  2. IP forwarding is enabled: cat /proc/sys/net/ipv4/ip_forward"
echo "  3. NAT rules are active: iptables -t nat -L -v -n"
echo ""
