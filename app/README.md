# DVPN Electron Client

Desktop application for connecting to the decentralized VPN network.

## Features

- 🔐 Phantom wallet integration
- 🌍 Node discovery from indexer API
- 🔒 Automatic WireGuard configuration
- 💰 On-chain session management
- 📊 Real-time connection status
- ⏱️ Session timer and usage tracking

## Prerequisites

- Node.js 16+
- WireGuard installed (`wireguard-tools`)
- Phantom wallet browser extension

### Install WireGuard

**macOS:**
```bash
brew install wireguard-tools
```

**Linux:**
```bash
sudo apt install wireguard-tools
# or
sudo yum install wireguard-tools
```

**Windows:**
Download from [wireguard.com](https://www.wireguard.com/install/)

## Setup

1. Install dependencies:
```bash
cd app
npm install
```

2. Configure settings (first run):
   - Indexer URL: `http://localhost:8080`
   - RPC URL: `http://localhost:8899`
   - Program ID: `8LQKwvHJPdK6fKmopXmUwct8JjVGQhf3RFQd64nCV39i`

## Running

### Development Mode
```bash
npm start
```

### Build for Production

**macOS:**
```bash
npm run build:mac
```

**Windows:**
```bash
npm run build:win
```

**Linux:**
```bash
npm run build:linux
```

Built applications will be in the `dist/` folder.

## Usage

1. **Connect Wallet**
   - Click "Connect Wallet" in the header
   - Approve Phantom wallet connection

2. **Select Node**
   - Browse available nodes in the main screen
   - Filter by region if needed
   - Click on a node to select it

3. **Connect to VPN**
   - Click "Connect to VPN" button
   - Approve transactions in Phantom wallet
   - Wait for connection to establish

4. **Monitor Session**
   - View connection details and timer
   - Check data usage and remaining time

5. **Disconnect**
   - Click "Disconnect" button
   - Session will be closed on-chain (refund unused time)

## File Structure

```
app/
├── main.js         - Electron main process (IPC handlers)
├── preload.js      - Context bridge for security
├── renderer.js     - UI logic and blockchain integration
├── index.html      - Main UI layout
├── styles.css      - Styling
├── package.json    - Dependencies and build config
└── README.md       - This file
```

## Permissions

The app requires:
- **Network Access**: To connect to Solana RPC and indexer API
- **File System**: To store WireGuard keys and config
- **Sudo/Admin**: To configure WireGuard (on connection/disconnection)

## Configuration Files

- **Settings**: Stored in localStorage
- **WireGuard Keys**: `~/.dvpn/client_private.key` and `~/.dvpn/client_public.key`
- **WireGuard Config**: `~/.dvpn/dvpn.conf`
- **Session Data**: Stored in localStorage (auto-restore on app restart)

## Troubleshooting

### "WireGuard not installed"
Install WireGuard tools for your OS (see Prerequisites)

### "Permission denied" when connecting
Run the app with sudo/admin privileges, or configure sudoers:
```bash
# Add to /etc/sudoers (Linux/macOS)
your_username ALL=(ALL) NOPASSWD: /usr/bin/wg-quick
```

### "Failed to connect wallet"
- Ensure Phantom extension is installed
- Refresh the page/app
- Check browser console for errors

### "No nodes available"
- Ensure indexer service is running
- Check indexer URL in settings
- Verify nodes are registered on-chain

### "Transaction failed"
- Ensure you have enough SOL for the session
- Check that the node is active and has capacity
- Verify RPC URL is correct in settings

## Security Notes

1. **Private Keys**: WireGuard keys are stored locally, never shared
2. **Wallet**: Uses Phantom's secure signing, private keys stay in extension
3. **Signatures**: Each session requires user approval
4. **Root Access**: Needed only for WireGuard config (standard for VPN apps)

## Development

### Debug Mode
```bash
NODE_ENV=development npm start
```

This opens DevTools automatically.

### IPC Communication

The app uses Electron's IPC for secure communication:
- `renderer.js` → UI logic (runs in sandboxed browser)
- `preload.js` → Exposes safe APIs to renderer
- `main.js` → System operations (file system, WireGuard)

## Roadmap

- [ ] Multiple wallet support (Solflare, Ledger)
- [ ] Auto-reconnect on disconnect
- [ ] Connection quality metrics
- [ ] Speed test integration
- [ ] Favorite nodes
- [ ] Session history export
- [ ] Dark/light theme toggle
- [ ] Multi-language support
- [ ] Mobile app (React Native)

## License

MIT
