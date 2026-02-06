#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# DVPN Privacy Hardening Script
# Disables all logging: IPsec, firewall, systemd, WireGuard kernel module
# Run on VPN server: sudo bash privacy_hardening.sh
# ═══════════════════════════════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════════════════════════════"
echo "   DVPN Privacy Hardening - Disable ALL Logging"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then 
  echo "❌ Please run as root (sudo bash privacy_hardening.sh)"
  exit 1
fi

# ───────────────────────────────────────────────────────────────────────────
# 1. DISABLE KERNEL/NETWORK LOGGING
# ───────────────────────────────────────────────────────────────────────────
echo "🔒 [1/6] Disabling kernel network logging..."

# Disable martian packet logging
sysctl -w net.ipv4.conf.all.log_martians=0 >/dev/null 2>&1 || true
sysctl -w net.ipv4.conf.default.log_martians=0 >/dev/null 2>&1 || true

# Disable ICMP error logging
sysctl -w net.ipv4.icmp_ignore_bogus_error_responses=1 >/dev/null 2>&1 || true

# Disable rp_filter logging
sysctl -w net.ipv4.conf.all.rp_filter=0 >/dev/null 2>&1 || true

# Make persistent
cat > /etc/sysctl.d/99-dvpn-privacy.conf << 'EOF'
# DVPN Privacy Hardening - Disable network logging
net.ipv4.conf.all.log_martians = 0
net.ipv4.conf.default.log_martians = 0
net.ipv4.icmp_ignore_bogus_error_responses = 1
net.ipv4.conf.all.rp_filter = 0
net.ipv4.conf.default.rp_filter = 0

# Also ensure IP forwarding is enabled
net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
EOF

sysctl -p /etc/sysctl.d/99-dvpn-privacy.conf >/dev/null 2>&1 || true
echo "   ✅ Kernel network logging disabled"

# ───────────────────────────────────────────────────────────────────────────
# 2. DISABLE WIREGUARD KERNEL MODULE LOGGING
# ───────────────────────────────────────────────────────────────────────────
echo "🔒 [2/6] Disabling WireGuard kernel debug logging..."

# Disable WireGuard dynamic debug
echo 0 > /sys/module/wireguard/parameters/dyndbg 2>/dev/null || true

# Create modprobe config to disable WireGuard debug on load
cat > /etc/modprobe.d/wireguard-nodebug.conf << 'EOF'
# Disable WireGuard debug logging
options wireguard dyndbg=-p
EOF

echo "   ✅ WireGuard kernel logging disabled"

# ───────────────────────────────────────────────────────────────────────────
# 3. DISABLE IPTABLES/NETFILTER LOGGING
# ───────────────────────────────────────────────────────────────────────────
echo "🔒 [3/6] Removing iptables LOG rules..."

# Remove any existing LOG rules
iptables -F LOG 2>/dev/null || true
iptables -X LOG 2>/dev/null || true
ip6tables -F LOG 2>/dev/null || true
ip6tables -X LOG 2>/dev/null || true

# Remove LOG target rules from all chains
for chain in INPUT OUTPUT FORWARD; do
  iptables -L "$chain" -n --line-numbers 2>/dev/null | grep -i "LOG" | awk '{print $1}' | sort -rn | while read -r line; do
    iptables -D "$chain" "$line" 2>/dev/null || true
  done
done

# Same for nat table
for chain in PREROUTING POSTROUTING OUTPUT; do
  iptables -t nat -L "$chain" -n --line-numbers 2>/dev/null | grep -i "LOG" | awk '{print $1}' | sort -rn | while read -r line; do
    iptables -t nat -D "$chain" "$line" 2>/dev/null || true
  done
done

echo "   ✅ iptables LOG rules removed"

# ───────────────────────────────────────────────────────────────────────────
# 4. CONFIGURE SYSTEMD JOURNALD FOR MINIMAL LOGGING
# ───────────────────────────────────────────────────────────────────────────
echo "🔒 [4/6] Configuring systemd journald for privacy..."

# Backup existing config
cp /etc/systemd/journald.conf /etc/systemd/journald.conf.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true

# Create privacy-focused journald config
cat > /etc/systemd/journald.conf << 'EOF'
[Journal]
# Store logs only in memory (volatile) - cleared on reboot
Storage=volatile

# Maximum log levels (warning and above only)
MaxLevelStore=warning
MaxLevelSyslog=warning
MaxLevelKMsg=warning
MaxLevelConsole=warning
MaxLevelWall=warning

# Limit journal size
RuntimeMaxUse=50M
RuntimeMaxFileSize=10M
RuntimeKeepFree=100M

# Compress logs
Compress=yes

# Don't forward to syslog
ForwardToSyslog=no
ForwardToKMsg=no
ForwardToConsole=no
ForwardToWall=no

# Rate limiting
RateLimitIntervalSec=30s
RateLimitBurst=1000
EOF

# Restart journald
systemctl restart systemd-journald 2>/dev/null || true

echo "   ✅ systemd journald configured (volatile, warning-only)"

# ───────────────────────────────────────────────────────────────────────────
# 5. DISABLE RSYSLOG/SYSLOG LOGGING
# ───────────────────────────────────────────────────────────────────────────
echo "🔒 [5/6] Disabling rsyslog..."

# Stop and disable rsyslog if present
systemctl stop rsyslog 2>/dev/null || true
systemctl disable rsyslog 2>/dev/null || true

# Same for syslog-ng
systemctl stop syslog-ng 2>/dev/null || true
systemctl disable syslog-ng 2>/dev/null || true

# Clear existing logs
rm -rf /var/log/syslog* 2>/dev/null || true
rm -rf /var/log/messages* 2>/dev/null || true
rm -rf /var/log/auth.log* 2>/dev/null || true
rm -rf /var/log/kern.log* 2>/dev/null || true

echo "   ✅ rsyslog disabled and logs cleared"

# ───────────────────────────────────────────────────────────────────────────
# 6. CONFIGURE DVPN NODE DAEMON FOR MINIMAL LOGGING
# ───────────────────────────────────────────────────────────────────────────
echo "🔒 [6/6] Configuring DVPN node daemon..."

# Create/update systemd service with LOG_LEVEL=error
cat > /etc/systemd/system/dvpn-node.service << 'EOF'
[Unit]
Description=DVPN Node Daemon (Privacy Hardened)
After=network.target wg-quick@wg0.service
Wants=wg-quick@wg0.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/dvpn
ExecStart=/usr/bin/node /opt/dvpn/scripts/node_daemon_server.js

# Privacy: Only log errors, nothing else
Environment="LOG_LEVEL=error"
Environment="NODE_ENV=production"

# Don't log stdout/stderr to journal
StandardOutput=null
StandardError=null

# Auto restart
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Also create ncat config server with no logging
cat > /etc/systemd/system/dvpn-config-server.service << 'EOF'
[Unit]
Description=DVPN Configuration Server (Privacy Hardened)
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/ncat -l 22222 -c '/root/wgip.sh' --keep-open

# Privacy: No logging
StandardOutput=null
StandardError=null

Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
echo "   ✅ DVPN services configured (no logging)"

# ───────────────────────────────────────────────────────────────────────────
# SUMMARY
# ───────────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "   ✅ PRIVACY HARDENING COMPLETE"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "   Disabled:"
echo "   • Kernel network logging (martians, ICMP, rp_filter)"
echo "   • WireGuard kernel debug (dyndbg=0)"
echo "   • iptables LOG rules (all chains)"
echo "   • systemd journald (volatile, warning-only)"
echo "   • rsyslog/syslog-ng"
echo "   • DVPN node daemon logging (LOG_LEVEL=error)"
echo ""
echo "   ⚠️  Note: Reboot recommended for all changes to take effect"
echo ""
echo "   To verify:"
echo "   • dmesg | tail -20                 # Should be minimal"
echo "   • journalctl -n 20                 # Should show warnings only"
echo "   • iptables -L -v | grep -i log     # Should be empty"
echo ""
