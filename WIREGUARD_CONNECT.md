# WireGuard VPN Setup Guide
**Server**: 64.227.150.205  
**Client**: Your Mac

---

## ✅ Client Keys Generated!

**Your Client Public Key** (share this with server):
```
g1Zxv7LBFNIRuom0CHDc1bt0Pbku/qvlodFz2I7yLxc=
```

**Client Private Key** (keep secret!):
```
SMJA8t3IaaZgs4yXdW5q4gXlEiLx2BUB6+9N2Ma+H1s=
```

**Client Config Created**: `~/.dvpn/dvpn.conf`

---

## 📋 STEP 1: Get Server's WireGuard Public Key

You need to get the WireGuard public key from your server. If you have access to the server, run:

```bash
# Option 1: Via SSH (if you can access it somehow)
ssh root@64.227.150.205 "cat /etc/wireguard/server_public.key"

# Option 2: Via server console/terminal
cat /etc/wireguard/server_public.key

# Option 3: Check WireGuard config
cat /etc/wireguard/wg0.conf
```

The public key looks like: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx=`

---

## 📋 STEP 2: Add Your Client to Server

On the server (64.227.150.205), add your client as a peer:

### Method A: Via wg command (temporary, until reboot)
```bash
wg set wg0 peer g1Zxv7LBFNIRuom0CHDc1bt0Pbku/qvlodFz2I7yLxc= allowed-ips 10.10.0.10/32
```

### Method B: Edit config file (permanent)
```bash
nano /etc/wireguard/wg0.conf
```

Add this at the end:
```ini
[Peer]
# Mac Client
PublicKey = g1Zxv7LBFNIRuom0CHDc1bt0Pbku/qvlodFz2I7yLxc=
AllowedIPs = 10.10.0.10/32
```

Then restart WireGuard:
```bash
systemctl restart wg-quick@wg0
# or
wg-quick down wg0 && wg-quick up wg0
```

---

## 📋 STEP 3: Update Client Config

Once you have the server's public key, update your config:

```bash
nano ~/.dvpn/dvpn.conf
```

Replace `SERVER_PUBLIC_KEY_HERE` with the actual server public key.

Example:
```ini
[Interface]
PrivateKey = SMJA8t3IaaZgs4yXdW5q4gXlEiLx2BUB6+9N2Ma+H1s=
Address = 10.10.0.10/32
DNS = 1.1.1.1, 8.8.8.8

[Peer]
PublicKey = [SERVER_PUBLIC_KEY_FROM_STEP_1]
Endpoint = 64.227.150.205:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
```

---

## 📋 STEP 4: Connect!

### On Mac (your machine):

```bash
# Option 1: Using wg-quick
sudo wg-quick up ~/.dvpn/dvpn.conf

# Option 2: Using WireGuard app (if installed)
# Import the config file in the WireGuard GUI app
```

---

## 🧪 STEP 5: Test Connection

Once connected:

```bash
# Check WireGuard status
sudo wg

# Check your IP (should show 64.227.150.205)
curl ifconfig.me

# Ping server internal IP
ping 10.10.0.1

# Test internet
curl https://google.com
```

---

## 🛑 Disconnect

```bash
# Stop VPN
sudo wg-quick down ~/.dvpn/dvpn.conf

# Check your real IP is back
curl ifconfig.me
```

---

## 🔧 Troubleshooting

### Can't Connect
1. **Check server WireGuard is running**:
   ```bash
   ssh root@64.227.150.205 "systemctl status wg-quick@wg0"
   ```

2. **Check firewall allows UDP 51820**:
   ```bash
   ssh root@64.227.150.205 "ufw status | grep 51820"
   ```

3. **Check server has your peer**:
   ```bash
   ssh root@64.227.150.205 "wg show"
   ```

### Connected but No Internet
1. **Check IP forwarding on server**:
   ```bash
   cat /proc/sys/net/ipv4/ip_forward  # should be 1
   ```

2. **Check NAT/masquerade rules**:
   ```bash
   iptables -t nat -L POSTROUTING -v
   ```

### DNS Not Working
Edit `~/.dvpn/dvpn.conf` and try different DNS:
```ini
DNS = 8.8.8.8, 1.1.1.1
```

---

## 📱 Alternative: WireGuard GUI App

1. Download WireGuard from App Store or https://www.wireguard.com/install/
2. Open WireGuard app
3. Click "Import tunnel(s) from file"
4. Select `~/.dvpn/dvpn.conf`
5. Click "Activate"

---

## ⚡ Quick Commands Reference

```bash
# Connect
sudo wg-quick up ~/.dvpn/dvpn.conf

# Disconnect  
sudo wg-quick down ~/.dvpn/dvpn.conf

# Status
sudo wg show

# Your current IP
curl ifconfig.me

# Server logs (if you have access)
journalctl -u wg-quick@wg0 -f
```

---

## 🎯 What You Need From Server

To complete setup, you need:

1. ✅ Server's WireGuard public key
2. ✅ Confirmation that UDP port 51820 is open
3. ✅ Your client peer added to server config

If you can't SSH, use your hosting provider's web console or terminal to run the server commands.

---

## 🚀 Expected Result

After successful connection:
- ✅ Your IP: 64.227.150.205 (New York)
- ✅ All traffic encrypted via WireGuard
- ✅ Can browse internet through VPN
- ✅ DNS queries go through VPN

Check at: https://whatismyipaddress.com
