#!/bin/bash
# Setup passwordless VPN connection for Guard VPN
# Run this script ONCE with: sudo bash setup-passwordless.sh

echo "========================================="
echo "Guard VPN - Passwordless Setup"
echo "========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "❌ Please run with sudo: sudo bash setup-passwordless.sh"
  exit 1
fi

# Get the current username
CURRENT_USER=$(who am i | awk '{print $1}')
if [ -z "$CURRENT_USER" ]; then
  CURRENT_USER=$SUDO_USER
fi

echo "Setting up passwordless VPN for user: $CURRENT_USER"
echo ""

# Find wg-quick location
WG_QUICK_PATH=$(which wg-quick 2>/dev/null)
if [ -z "$WG_QUICK_PATH" ]; then
  # Try common locations
  if [ -f "/opt/homebrew/bin/wg-quick" ]; then
    WG_QUICK_PATH="/opt/homebrew/bin/wg-quick"
  elif [ -f "/usr/local/bin/wg-quick" ]; then
    WG_QUICK_PATH="/usr/local/bin/wg-quick"
  else
    echo "❌ wg-quick not found. Please install wireguard-tools first:"
    echo "   brew install wireguard-tools"
    exit 1
  fi
fi

echo "Found wg-quick at: $WG_QUICK_PATH"

# Create sudoers entry
SUDOERS_FILE="/etc/sudoers.d/guard-vpn"
DVPN_CONF_PATH="$HOME/.dvpn/dvpn.conf"

echo "Creating sudoers entry..."

# Create the sudoers file
cat > "$SUDOERS_FILE" << EOF
# Guard VPN - Allow wg-quick without password
$CURRENT_USER ALL=(ALL) NOPASSWD: $WG_QUICK_PATH up *
$CURRENT_USER ALL=(ALL) NOPASSWD: $WG_QUICK_PATH down *
$CURRENT_USER ALL=(ALL) NOPASSWD: /usr/sbin/networksetup -setv6off *
$CURRENT_USER ALL=(ALL) NOPASSWD: /usr/sbin/networksetup -setv6automatic *
$CURRENT_USER ALL=(ALL) NOPASSWD: /usr/bin/pkill -f wireguard-go
$CURRENT_USER ALL=(ALL) NOPASSWD: /sbin/route *
EOF

# Set correct permissions
chmod 440 "$SUDOERS_FILE"

# Validate sudoers file
visudo -c -f "$SUDOERS_FILE"
if [ $? -ne 0 ]; then
  echo "❌ Error in sudoers file. Removing..."
  rm -f "$SUDOERS_FILE"
  exit 1
fi

# Create .dvpn directory if it doesn't exist
DVPN_DIR="/Users/$CURRENT_USER/.dvpn"
mkdir -p "$DVPN_DIR"
chown "$CURRENT_USER" "$DVPN_DIR"

echo ""
echo "========================================="
echo "✅ Setup Complete!"
echo "========================================="
echo ""
echo "You can now connect to VPN without entering"
echo "your password each time."
echo ""
echo "To undo this, run:"
echo "  sudo rm /etc/sudoers.d/guard-vpn"
echo ""
