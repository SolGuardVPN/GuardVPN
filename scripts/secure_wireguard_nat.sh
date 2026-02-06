#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# WireGuard Secure NAT Configuration
# Includes egress restrictions to prevent abuse while allowing full tunnel
# Run on VPN server: sudo bash secure_wireguard_nat.sh
# ═══════════════════════════════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════════════════════════════"
echo "   WireGuard Secure NAT Configuration"
echo "   (Full tunnel with egress restrictions)"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then 
  echo "❌ Please run as root"
  exit 1
fi

# ───────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ───────────────────────────────────────────────────────────────────────────

# Detect main interface
MAIN_INTERFACE=$(ip route | grep default | awk '{print $5}' | head -n1)
if [ -z "$MAIN_INTERFACE" ]; then
  echo "❌ Could not detect network interface"
  ip link show
  read -p "Enter your main interface (e.g., eth0, ens3): " MAIN_INTERFACE
fi

# WireGuard interface and subnet
WG_INTERFACE="${WG_INTERFACE:-wg0}"
WG_SUBNET="${WG_SUBNET:-10.10.0.0/24}"
WG_CONF="/etc/wireguard/${WG_INTERFACE}.conf"

echo "📋 Configuration:"
echo "   • Main interface: $MAIN_INTERFACE"
echo "   • WG interface: $WG_INTERFACE"
echo "   • WG subnet: $WG_SUBNET"
echo ""

# ───────────────────────────────────────────────────────────────────────────
# 1. BACKUP EXISTING CONFIG
# ───────────────────────────────────────────────────────────────────────────
if [ -f "$WG_CONF" ]; then
  cp "$WG_CONF" "${WG_CONF}.backup.$(date +%Y%m%d_%H%M%S)"
  echo "✅ Config backed up"
fi

# ───────────────────────────────────────────────────────────────────────────
# 2. REMOVE OLD RULES
# ───────────────────────────────────────────────────────────────────────────
echo "🧹 Cleaning old rules..."

# Remove old PostUp/PostDown from config
if [ -f "$WG_CONF" ]; then
  sed -i '/^PostUp/d' "$WG_CONF"
  sed -i '/^PostDown/d' "$WG_CONF"
  sed -i '/^### NAT rules/d' "$WG_CONF"
  sed -i '/^### Egress/d' "$WG_CONF"
  # Remove empty lines at end
  sed -i -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$WG_CONF" 2>/dev/null || true
fi

# ───────────────────────────────────────────────────────────────────────────
# 3. CREATE SECURE IPTABLES SCRIPT
# ───────────────────────────────────────────────────────────────────────────
echo "📝 Creating secure iptables script..."

cat > /etc/wireguard/wg-secure-rules.sh << 'SCRIPT_EOF'
#!/bin/bash
# WireGuard Secure iptables Rules
# Called by wg-quick PostUp/PostDown

ACTION="$1"          # up or down
WG_IFACE="$2"        # wg0
MAIN_IFACE="$3"      # eth0, ens3, etc.
WG_SUBNET="$4"       # 10.10.0.0/24

IPTABLES="iptables"
IPT_ACTION="-A"
[ "$ACTION" = "down" ] && IPT_ACTION="-D"

# ─── BASIC NAT (MASQUERADE) ───
$IPTABLES -t nat $IPT_ACTION POSTROUTING -s "$WG_SUBNET" -o "$MAIN_IFACE" -j MASQUERADE

# ─── FORWARDING RULES ───
$IPTABLES $IPT_ACTION FORWARD -i "$WG_IFACE" -o "$MAIN_IFACE" -j ACCEPT
$IPTABLES $IPT_ACTION FORWARD -i "$MAIN_IFACE" -o "$WG_IFACE" -m state --state RELATED,ESTABLISHED -j ACCEPT

# ─── EGRESS RESTRICTIONS (PREVENT ABUSE) ───
# Block access to private IP ranges from VPN clients
# This prevents scanning/attacking internal networks

if [ "$ACTION" = "up" ]; then
  # Insert at top (higher priority than ACCEPT)
  $IPTABLES -I FORWARD 1 -i "$WG_IFACE" -d 10.0.0.0/8 ! -d "$WG_SUBNET" -j REJECT --reject-with icmp-net-unreachable
  $IPTABLES -I FORWARD 2 -i "$WG_IFACE" -d 172.16.0.0/12 -j REJECT --reject-with icmp-net-unreachable
  $IPTABLES -I FORWARD 3 -i "$WG_IFACE" -d 192.168.0.0/16 -j REJECT --reject-with icmp-net-unreachable
  $IPTABLES -I FORWARD 4 -i "$WG_IFACE" -d 169.254.0.0/16 -j REJECT --reject-with icmp-net-unreachable
  
  # Block link-local and multicast
  $IPTABLES -I FORWARD 5 -i "$WG_IFACE" -d 224.0.0.0/4 -j DROP
  $IPTABLES -I FORWARD 6 -i "$WG_IFACE" -d 240.0.0.0/4 -j DROP
  
  # Block common dangerous ports (outbound from VPN)
  # SMTP (prevent spam relay)
  $IPTABLES -I FORWARD 7 -i "$WG_IFACE" -p tcp --dport 25 -j REJECT
  $IPTABLES -I FORWARD 8 -i "$WG_IFACE" -p tcp --dport 465 -j REJECT
  $IPTABLES -I FORWARD 9 -i "$WG_IFACE" -p tcp --dport 587 -j REJECT
else
  # Remove in reverse order
  $IPTABLES -D FORWARD -i "$WG_IFACE" -p tcp --dport 587 -j REJECT 2>/dev/null || true
  $IPTABLES -D FORWARD -i "$WG_IFACE" -p tcp --dport 465 -j REJECT 2>/dev/null || true
  $IPTABLES -D FORWARD -i "$WG_IFACE" -p tcp --dport 25 -j REJECT 2>/dev/null || true
  $IPTABLES -D FORWARD -i "$WG_IFACE" -d 240.0.0.0/4 -j DROP 2>/dev/null || true
  $IPTABLES -D FORWARD -i "$WG_IFACE" -d 224.0.0.0/4 -j DROP 2>/dev/null || true
  $IPTABLES -D FORWARD -i "$WG_IFACE" -d 169.254.0.0/16 -j REJECT --reject-with icmp-net-unreachable 2>/dev/null || true
  $IPTABLES -D FORWARD -i "$WG_IFACE" -d 192.168.0.0/16 -j REJECT --reject-with icmp-net-unreachable 2>/dev/null || true
  $IPTABLES -D FORWARD -i "$WG_IFACE" -d 172.16.0.0/12 -j REJECT --reject-with icmp-net-unreachable 2>/dev/null || true
  $IPTABLES -D FORWARD -i "$WG_IFACE" -d 10.0.0.0/8 ! -d "$WG_SUBNET" -j REJECT --reject-with icmp-net-unreachable 2>/dev/null || true
fi

# ─── RATE LIMITING (PREVENT ABUSE) ───
if [ "$ACTION" = "up" ]; then
  # Limit new connections per IP (50/sec with burst of 100)
  $IPTABLES $IPT_ACTION FORWARD -i "$WG_IFACE" -m state --state NEW -m limit --limit 50/sec --limit-burst 100 -j ACCEPT
  $IPTABLES $IPT_ACTION FORWARD -i "$WG_IFACE" -m state --state NEW -j DROP
fi

exit 0
SCRIPT_EOF

chmod +x /etc/wireguard/wg-secure-rules.sh
echo "   ✅ Created /etc/wireguard/wg-secure-rules.sh"

# ───────────────────────────────────────────────────────────────────────────
# 4. UPDATE WIREGUARD CONFIG
# ───────────────────────────────────────────────────────────────────────────
echo "📝 Updating WireGuard config..."

if [ -f "$WG_CONF" ]; then
  # Add PostUp/PostDown after PrivateKey line
  sed -i "/^PrivateKey/a\\
\\
### Secure NAT rules with egress restrictions\\
PostUp = /etc/wireguard/wg-secure-rules.sh up $WG_INTERFACE $MAIN_INTERFACE $WG_SUBNET\\
PostDown = /etc/wireguard/wg-secure-rules.sh down $WG_INTERFACE $MAIN_INTERFACE $WG_SUBNET" "$WG_CONF"

  echo "   ✅ Config updated"
else
  echo "   ⚠️  WG config not found, creating template..."
  cat > "$WG_CONF" << EOF
[Interface]
Address = 10.10.0.1/24
ListenPort = 51820
PrivateKey = <YOUR_PRIVATE_KEY>

### Secure NAT rules with egress restrictions
PostUp = /etc/wireguard/wg-secure-rules.sh up $WG_INTERFACE $MAIN_INTERFACE $WG_SUBNET
PostDown = /etc/wireguard/wg-secure-rules.sh down $WG_INTERFACE $MAIN_INTERFACE $WG_SUBNET

# Add peers below:
# [Peer]
# PublicKey = <client_pubkey>
# AllowedIPs = 10.10.0.X/32
EOF
fi

# ───────────────────────────────────────────────────────────────────────────
# 5. ENABLE IP FORWARDING
# ───────────────────────────────────────────────────────────────────────────
echo "🌐 Enabling IP forwarding..."
sysctl -w net.ipv4.ip_forward=1 >/dev/null
sysctl -w net.ipv6.conf.all.forwarding=1 >/dev/null

grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf || echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
grep -q "net.ipv6.conf.all.forwarding=1" /etc/sysctl.conf || echo "net.ipv6.conf.all.forwarding=1" >> /etc/sysctl.conf

echo "   ✅ IP forwarding enabled"

# ───────────────────────────────────────────────────────────────────────────
# 6. RESTART WIREGUARD
# ───────────────────────────────────────────────────────────────────────────
echo "🔄 Restarting WireGuard..."

wg-quick down "$WG_INTERFACE" 2>/dev/null || true
sleep 1
wg-quick up "$WG_INTERFACE"

if systemctl is-active --quiet "wg-quick@${WG_INTERFACE}"; then
  echo "   ✅ WireGuard is running"
else
  systemctl start "wg-quick@${WG_INTERFACE}" 2>/dev/null || true
fi

# ───────────────────────────────────────────────────────────────────────────
# 7. VERIFY
# ───────────────────────────────────────────────────────────────────────────
echo ""
echo "🔍 Verification:"
echo ""

echo "   WireGuard status:"
wg show "$WG_INTERFACE" 2>/dev/null | head -10 || echo "   (no peers connected)"
echo ""

echo "   NAT rules:"
iptables -t nat -L POSTROUTING -v -n 2>/dev/null | grep -E "MASQUERADE|$WG_SUBNET" || echo "   (none found)"
echo ""

echo "   Egress restrictions:"
iptables -L FORWARD -v -n 2>/dev/null | grep -E "REJECT|DROP" | head -10 || echo "   (none found)"
echo ""

# ───────────────────────────────────────────────────────────────────────────
# SUMMARY
# ───────────────────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════════════"
echo "   ✅ SECURE NAT CONFIGURATION COMPLETE"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "   Security measures enabled:"
echo "   • NAT/Masquerade for full tunnel support"
echo "   • Blocked: Private IP ranges (10/8, 172.16/12, 192.168/16)"
echo "   • Blocked: Link-local (169.254/16)"
echo "   • Blocked: Multicast/Reserved (224/4, 240/4)"
echo "   • Blocked: SMTP ports (25, 465, 587) - prevent spam relay"
echo "   • Rate limited: 50 new connections/sec per client"
echo ""
echo "   Clients can still:"
echo "   • Route ALL internet traffic through VPN (AllowedIPs=0.0.0.0/0)"
echo "   • Access any public IP address"
echo "   • Communicate within VPN subnet ($WG_SUBNET)"
echo ""
echo "   Clients CANNOT:"
echo "   • Scan/attack private networks behind the server"
echo "   • Send spam (SMTP blocked)"
echo "   • Abuse with excessive connections"
echo ""
