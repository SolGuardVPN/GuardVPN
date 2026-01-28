# Fix VPN IP Not Changing Issue

## Problem
Your VPN connects successfully but your public IP doesn't change. This means traffic isn't being routed through the VPN server.

## Root Cause
The WireGuard server configuration has NAT/masquerading rules that reference `eth0`, but your actual network interface is likely named differently (e.g., `ens3`, `ens5`, `eth1`).

## Solution

### Step 1: Upload Fix Script to Server
```bash
# From your local machine, upload the fix script
scp scripts/fix_wireguard_nat.sh root@64.227.150.205:/root/
```

### Step 2: Run Fix Script on Server
```bash
# SSH to your server
ssh root@64.227.150.205

# Make script executable
chmod +x /root/fix_wireguard_nat.sh

# Run the script
sudo bash /root/fix_wireguard_nat.sh
```

The script will:
- ✅ Auto-detect your network interface
- ✅ Backup your current config
- ✅ Update PostUp/PostDown rules with correct interface
- ✅ Enable IP forwarding
- ✅ Restart WireGuard
- ✅ Verify NAT is working

### Step 3: Add Your Client to Server

You need to add your client's public key to the server's wg0.conf:

```bash
# On server, edit the config
nano /etc/wireguard/wg0.conf

# Add this peer block at the end:
[Peer]
PublicKey = 8Q2UPjHUPY4Iv2AQlaLfFif39+bCkhfHYo0lF3DWfgE=
AllowedIPs = 10.0.1.17/32
PresharedKey = wkpx2DcEDB4/gPUVEEjEa/lbQIl0dcTZUL72+tsBixY=

# Restart WireGuard
systemctl restart wg-quick@wg0
```

### Step 4: Test the Connection

1. **Connect VPN from your app**

2. **Check your public IP:**
   ```bash
   curl ifconfig.me
   ```
   
   Should show: `64.227.150.205` (your server IP)

3. **Verify WireGuard connection:**
   ```bash
   # On client (Mac)
   sudo wg show
   
   # On server
   sudo wg show
   ```

4. **Check routing:**
   ```bash
   # On client
   netstat -rn | grep 0.0.0.0
   ```

## Manual Fix (Alternative)

If the script doesn't work, manually fix it:

1. **Find your network interface:**
   ```bash
   ip route | grep default
   # Or
   ip link show
   ```

2. **Edit WireGuard config:**
   ```bash
   nano /etc/wireguard/wg0.conf
   ```

3. **Replace `eth0` with your interface** (e.g., `ens3`, `ens5`):
   ```
   PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o YOUR_INTERFACE -j MASQUERADE
   PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o YOUR_INTERFACE -j MASQUERADE
   ```

4. **Restart:**
   ```bash
   systemctl restart wg-quick@wg0
   ```

## Verification Commands

```bash
# Check IP forwarding is enabled
cat /proc/sys/net/ipv4/ip_forward  # Should be 1

# Check NAT rules
iptables -t nat -L POSTROUTING -v -n | grep MASQUERADE

# Check WireGuard status
systemctl status wg-quick@wg0

# Check active connections
wg show

# Test from client
ping 10.0.1.1  # Server internal IP
curl ifconfig.me  # Should show server public IP
```

## Common Network Interface Names

| Cloud Provider | Common Interface Names |
|---------------|------------------------|
| DigitalOcean  | eth0, eth1            |
| AWS EC2       | eth0, ens5            |
| Google Cloud  | ens4, ens5            |
| Azure         | eth0                  |
| Vultr         | ens3                  |
| Linode        | eth0                  |

## Troubleshooting

### Issue: Can ping server but no internet
- NAT rules not applied
- Check: `iptables -t nat -L -v -n`

### Issue: Can't connect at all
- Firewall blocking port 41194
- Check: `ufw status` or `iptables -L -v -n`

### Issue: Connected but DNS not working
- Add DNS servers in client config
- Already set to 8.8.8.8 in app

### Issue: Route not added
- Check routing table: `netstat -rn`
- May need: `sudo route add -net 0.0.0.0 -interface utun3`

## Current Configuration

- **Server IP:** 64.227.150.205
- **WireGuard Port:** 41194
- **VPN Subnet:** 10.0.1.0/24
- **Server Internal IP:** 10.0.1.1
- **Client IP:** 10.0.1.17
- **Server Private Key:** 8Cb9gEAKpJUWLBPx7s32DYUOIhLPyaFVGsGv93j0nH0=
- **Client Private Key:** WE3ursrx1mFfhimFWqsj+Mvs2fqeFBdpvdfHGNStuH0=
