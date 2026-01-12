const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f23'
  });

  mainWindow.loadFile('index.html');

  // Open DevTools for debugging
  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers

// Fetch nodes from indexer
ipcMain.handle('fetch-nodes', async (event, { indexerUrl, filters }) => {
  try {
    const axios = require('axios');
    const params = new URLSearchParams();
    if (filters.region) params.append('region', filters.region);
    if (filters.minReputation) params.append('min_reputation', filters.minReputation);
    if (filters.limit) params.append('limit', filters.limit);
    
    const response = await axios.get(`${indexerUrl}/nodes?${params}`);
    return { success: true, nodes: response.data.nodes || [] };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Create session on-chain
ipcMain.handle('create-session', async (event, { sessionData }) => {
  try {
    // This will be called from renderer with wallet signature
    return { success: true, sessionPda: sessionData.sessionPda };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Generate WireGuard keypair
ipcMain.handle('generate-wg-keys', async () => {
  try {
    const configDir = path.join(os.homedir(), '.dvpn');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const privateKeyPath = path.join(configDir, 'client_private.key');
    const publicKeyPath = path.join(configDir, 'client_public.key');

    // Check if keys already exist
    if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
      const privateKey = fs.readFileSync(privateKeyPath, 'utf8').trim();
      const publicKey = fs.readFileSync(publicKeyPath, 'utf8').trim();
      
      return {
        success: true,
        privateKey,
        publicKey,
        privateKeyPath,
        publicKeyPath,
        existing: true
      };
    }

    // Check if WireGuard is installed
    const wgCheck = await new Promise((resolve) => {
      exec('which wg', (error) => {
        resolve(!error);
      });
    });

    if (!wgCheck) {
      return { 
        success: false, 
        error: 'WireGuard not installed. Please install wireguard-tools.' 
      };
    }

    // Generate new keys
    return new Promise((resolve) => {
      exec(`wg genkey | tee ${privateKeyPath} | wg pubkey > ${publicKeyPath}`, (error) => {
        if (error) {
          resolve({ success: false, error: error.message });
          return;
        }

        const privateKey = fs.readFileSync(privateKeyPath, 'utf8').trim();
        const publicKey = fs.readFileSync(publicKeyPath, 'utf8').trim();

        resolve({ 
          success: true, 
          privateKey, 
          publicKey,
          privateKeyPath,
          publicKeyPath,
          existing: false
        });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Request WireGuard config from server's ncat API
ipcMain.handle('request-wg-config', async (event, { serverIp, port }) => {
  try {
    const net = require('net');
    
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      let configData = '';
      
      const timeout = setTimeout(() => {
        client.destroy();
        reject(new Error('Connection timeout'));
      }, 10000);
      
      client.connect(port, serverIp, () => {
        client.write('start\n');
      });
      
      client.on('data', (data) => {
        configData += data.toString();
      });
      
      client.on('end', () => {
        clearTimeout(timeout);
        resolve({ success: true, config: configData });
      });
      
      client.on('error', (error) => {
        clearTimeout(timeout);
        resolve({ success: false, error: error.message });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Authenticate with node
ipcMain.handle('auth-with-node', async (event, { nodeEndpoint, authData }) => {
  try {
    const axios = require('axios');
    const response = await axios.post(`${nodeEndpoint}/session/auth`, authData, {
      timeout: 10000
    });
    return { success: true, config: response.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Apply WireGuard config and connect
ipcMain.handle('apply-wg-config', async (event, { config }) => {
  try {
    const configDir = path.join(os.homedir(), '.dvpn');
    const configPath = path.join(configDir, 'dvpn.conf');

    // Clean the config - extract only valid WireGuard config lines
    const lines = config.split('\n');
    const cleanLines = [];
    let inInterface = false;
    let inPeer = false;
    let seenInterface = false;
    let seenPeer = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines initially
      if (!trimmed) continue;
      
      // Start of sections (only take first occurrence)
      if (trimmed === '[Interface]') {
        if (seenInterface) continue; // Skip duplicate
        inInterface = true;
        inPeer = false;
        seenInterface = true;
        cleanLines.push('[Interface]');
        continue;
      }
      if (trimmed === '[Peer]') {
        if (seenPeer) continue; // Skip duplicate
        inInterface = false;
        inPeer = true;
        seenPeer = true;
        cleanLines.push('');
        cleanLines.push('[Peer]');
        continue;
      }
      
      // Valid config keys
      if (inInterface || inPeer) {
        const match = trimmed.match(/^(PrivateKey|Address|DNS|PublicKey|Endpoint|AllowedIPs|PersistentKeepalive|PresharedKey)\s*=\s*(.+)/);
        if (match) {
          cleanLines.push(`${match[1]} = ${match[2]}`);
        }
      }
    }
    
    const cleanConfig = cleanLines.join('\n') + '\n';
    
    console.log('=== CONFIG CLEANING ===');
    console.log('Original length:', config.length);
    console.log('Cleaned length:', cleanConfig.length);
    console.log('Cleaned config:\n', cleanConfig);

    // Write config file
    fs.writeFileSync(configPath, cleanConfig);
    fs.chmodSync(configPath, 0o600);

    // Auto-connect using osascript for sudo prompt on Mac
    if (process.platform === 'darwin') {
      const script = `do shell script "wg-quick up ${configPath}" with administrator privileges`;
      
      return new Promise((resolve) => {
        exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
          if (error) {
            console.error('Connection error:', stderr || error.message);
            resolve({ 
              success: false, 
              error: stderr || error.message,
              configPath: configPath 
            });
            return;
          }
          console.log('Connection success:', stdout);
          resolve({ 
            success: true, 
            message: 'VPN connected successfully!',
            configPath: configPath,
            output: stdout
          });
        });
      });
    } else {
      return {
        success: true,
        configPath: configPath,
        message: 'Config created. Run: sudo wg-quick up ' + configPath
      };
    }
  } catch (error) {
    console.error('Config error:', error);
    return { success: false, error: error.message };
  }
});

// Disconnect VPN
ipcMain.handle('disconnect-vpn', async (event, { presharedKey, serverIp }) => {
  try {
    const configPath = path.join(os.homedir(), '.dvpn', 'dvpn.conf');

    // Step 1: Send stop command to server to remove peer
    if (presharedKey && serverIp) {
      const net = require('net');
      await new Promise((resolve) => {
        const client = new net.Socket();
        client.connect(22222, serverIp, () => {
          client.write(`stop\n${presharedKey}\n`);
          client.end();
        });
        client.on('close', () => resolve());
        client.on('error', () => resolve()); // Continue even if server fails
        setTimeout(() => {
          client.destroy();
          resolve();
        }, 3000);
      });
    }

    // Step 2: Disconnect locally using osascript for sudo on Mac
    if (process.platform === 'darwin') {
      const script = `do shell script "wg-quick down ${configPath}" with administrator privileges`;
      
      return new Promise((resolve) => {
        exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
          if (error) {
            // Try alternative method
            exec(`osascript -e 'do shell script "pkill -f wireguard-go" with administrator privileges'`, () => {
              resolve({ success: true, message: 'VPN disconnected' });
            });
            return;
          }
          resolve({ success: true, message: 'VPN disconnected', output: stdout });
        });
      });
    } else {
      return {
        success: false,
        error: 'Manual disconnect required. Run: sudo wg-quick down ' + configPath
      };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get VPN status
ipcMain.handle('get-vpn-status', async () => {
  try {
    const command = process.platform === 'win32' ? 'wg show' : 'sudo wg show';
    
    return new Promise((resolve) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: true, connected: false });
          return;
        }
        
        const connected = stdout.includes('interface:');
        const output = stdout.trim();
        
        resolve({ success: true, connected, output });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Open external link
ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
