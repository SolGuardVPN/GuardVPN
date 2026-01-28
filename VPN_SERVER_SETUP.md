# VPN Server Setup Instructions

## Current Issue
The app shows "Connected (Mock)" because the VPN servers need to be running an ncat service to provide WireGuard configurations.

## Setup on UAE Server (31.57.228.54)

1. **SSH into your server:**
```bash
ssh root@31.57.228.54
```

2. **Create the WireGuard config generator script:**
```bash
cat > /root/wgip.sh << 'EOF'
#!/bin/bash
# Generate WireGuard configuration for new client

# Generate client keys
CLIENT_PRIVATE=$(wg genkey)
CLIENT_PUBLIC=$(echo "$CLIENT_PRIVATE" | wg pubkey)

# Assign next available IP (you should track this properly)
CLIENT_IP="10.8.0.$(( ( RANDOM % 250 ) + 2 ))/32"

# Your server's WireGuard public key
SERVER_PUBLIC=$(cat /etc/wireguard/publickey)
SERVER_ENDPOINT="31.57.228.54:51820"

# Output complete WireGuard client config
cat <<CONFIG
[Interface]
PrivateKey = $CLIENT_PRIVATE
Address = $CLIENT_IP
DNS = 1.1.1.1, 8.8.8.8

[Peer]
PublicKey = $SERVER_PUBLIC
Endpoint = $SERVER_ENDPOINT
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
CONFIG

# Add client to server (optional - for allowing connection)
# wg set wg0 peer "$CLIENT_PUBLIC" allowed-ips "$CLIENT_IP"
EOF

chmod +x /root/wgip.sh
```

3. **Start ncat listener:**
```bash
nohup ncat -l 22222 -c '/root/wgip.sh' --keep-open &
```

4. **Make it persistent (systemd service):**
```bash
cat > /etc/systemd/system/dvpn-config-server.service << 'EOF'
[Unit]
Description=DVPN Configuration Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/ncat -l 22222 -c '/root/wgip.sh' --keep-open
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable dvpn-config-server
systemctl start dvpn-config-server
```

## Setup on India Server (64.227.150.205)

Repeat the same steps but adjust:
- SERVER_ENDPOINT to `64.227.150.205:41194`
- CLIENT_IP subnet if needed (e.g., 10.9.0.x)

## Testing

Test the server locally:
```bash
echo "start" | nc 31.57.228.54 22222
```

You should receive a valid WireGuard configuration.

## Firewall Rules

Make sure ports are open:
```bash
# Allow WireGuard UDP port
ufw allow 51820/udp

# Allow config server TCP port  
ufw allow 22222/tcp

# Or for India server
ufw allow 41194/udp
```

## Alternative: Use Pre-generated Config

If you don't want dynamic configs, you can create a static config and serve it:

```bash
cat > /root/static-config.conf << 'EOF'
[Interface]
PrivateKey = XXXXXX
Address = 10.8.0.2/32
DNS = 1.1.1.1

[Peer]
PublicKey = YOUR_SERVER_PUBLIC_KEY
Endpoint = 31.57.228.54:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF

nohup ncat -l 22222 -c 'cat /root/static-config.conf' --keep-open &
```
