#!/bin/bash
# Test script to get real WireGuard config from UAE server

SERVER_IP="31.57.228.54"
SERVER_PORT="22222"

echo "Connecting to $SERVER_IP:$SERVER_PORT..."
echo "Requesting WireGuard configuration..."

# Send "start" command and capture the response (need to keep connection open)
response=$({ echo "start"; sleep 5; } | nc "$SERVER_IP" "$SERVER_PORT")

if [ -z "$response" ]; then
    echo "❌ No response from server. Make sure ncat service is running:"
    echo "   ssh root@$SERVER_IP"
    echo "   ncat -l 22222 -c '/root/wgip.sh' --keep-open"
    exit 1
fi

echo "✅ Received WireGuard configuration:"
echo "$response"

# Save to file
config_file="$HOME/.dvpn/uae-vpn.conf"
mkdir -p "$HOME/.dvpn"
echo "$response" > "$config_file"
chmod 600 "$config_file"

echo ""
echo "Configuration saved to: $config_file"
echo "To connect manually: sudo wg-quick up $config_file"
echo "To disconnect: sudo wg-quick down $config_file"
