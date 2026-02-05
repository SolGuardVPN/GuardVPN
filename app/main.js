const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const { exec, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const axios = require('axios');
const { AnchorProvider, Program, web3 } = require('@coral-xyz/anchor');
const ipfsModule = require('./ipfs');
const PhantomConnect = require('./phantom-connect');

// Subscription storage file path
const SUBSCRIPTION_FILE = path.join(app.getPath('userData'), 'subscription.json');

// WireGuard download URL for Windows (64-bit MSI)
const WIREGUARD_WIN_URL = 'https://download.wireguard.com/windows-client/wireguard-installer.exe';

// Helper function to download a file
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {}); // Delete partial file
      reject(err);
    });
  });
}

// Helper function to install WireGuard on Windows
async function installWireGuardWindows() {
  const tempDir = app.getPath('temp');
  const installerPath = path.join(tempDir, 'wireguard-installer.exe');
  
  
  try {
    // Download the installer
    await downloadFile(WIREGUARD_WIN_URL, installerPath);
    
    // Run the installer silently
    
    return new Promise((resolve, reject) => {
      // Run installer with /S for silent install (NSIS flag)
      exec(`"${installerPath}"`, { timeout: 120000 }, (error, stdout, stderr) => {
        // Clean up installer file
        fs.unlink(installerPath, () => {});
        
        if (error) {
          // Even if there's an error, check if WireGuard was installed
          const wgPath = 'C:\\Program Files\\WireGuard\\wireguard.exe';
          if (fs.existsSync(wgPath)) {
            resolve(wgPath);
          } else {
            console.error('❌ WireGuard installation failed:', stderr || error.message);
            reject(new Error('WireGuard installation failed. Please install manually from https://www.wireguard.com/install/'));
          }
        } else {
          // Wait a moment for installation to complete
          setTimeout(() => {
            const wgPath = 'C:\\Program Files\\WireGuard\\wireguard.exe';
            if (fs.existsSync(wgPath)) {
              resolve(wgPath);
            } else {
              reject(new Error('WireGuard installation may have failed. Please check and try again.'));
            }
          }, 3000);
        }
      });
    });
  } catch (error) {
    console.error('❌ Failed to download WireGuard:', error.message);
    throw error;
  }
}

// Load/Save subscription to file (more reliable than localStorage)
function loadSubscriptionFromFile() {
  try {
    if (fs.existsSync(SUBSCRIPTION_FILE)) {
      const data = fs.readFileSync(SUBSCRIPTION_FILE, 'utf8');
      const sub = JSON.parse(data);
      return sub;
    }
  } catch (e) {
    console.error('Failed to load subscription file:', e);
  }
  return null;
}

function saveSubscriptionToFile(subscription) {
  try {
    fs.writeFileSync(SUBSCRIPTION_FILE, JSON.stringify(subscription, null, 2));
    return true;
  } catch (e) {
    console.error('Failed to save subscription file:', e);
    return false;
  }
}

function clearSubscriptionFile() {
  try {
    if (fs.existsSync(SUBSCRIPTION_FILE)) {
      fs.unlinkSync(SUBSCRIPTION_FILE);
    }
    return true;
  } catch (e) {
    console.error('Failed to clear subscription file:', e);
    return false;
  }
}

// Network Configuration - Dual Mode Support
const NETWORK_CONFIG = {
  devnet: {
    name: 'Devnet (Test)',
    rpcUrl: 'https://api.devnet.solana.com',
    programId: 'EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq',
    isTestMode: true
  },
  mainnet: {
    name: 'Mainnet',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    // TODO: Deploy program to mainnet and update
    programId: 'EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq',
    isTestMode: false
  }
};

// Current network mode (defaults to devnet)
let currentNetworkMode = 'devnet';

// Solana Configuration (dynamic based on network mode)
let SOLANA_RPC = NETWORK_CONFIG.devnet.rpcUrl;
let PROGRAM_ID = NETWORK_CONFIG.devnet.programId;
const INDEXER_URL = 'http://localhost:3001';
let connection = new Connection(SOLANA_RPC, 'confirmed');
const crypto = require('crypto');

// Function to switch network
function switchNetworkMode(mode) {
  if (!NETWORK_CONFIG[mode]) {
    console.error('Invalid network mode:', mode);
    return;
  }
  
  currentNetworkMode = mode;
  SOLANA_RPC = NETWORK_CONFIG[mode].rpcUrl;
  PROGRAM_ID = NETWORK_CONFIG[mode].programId;
  connection = new Connection(SOLANA_RPC, 'confirmed');
  
  
  return NETWORK_CONFIG[mode];
}

// On-chain PDA seeds
const TREASURY_SEED = Buffer.from('treasury');
const PROVIDER_SEED = Buffer.from('provider');
const SESSION_SEED = Buffer.from('session');
const NODE_SEED = Buffer.from('node');

// Generate Anchor instruction discriminator
function getDiscriminator(instructionName) {
  const preimage = `global:${instructionName}`;
  const hash = crypto.createHash('sha256').update(preimage).digest();
  return hash.slice(0, 8);
}

let mainWindow;
let ipfsInitialized = false;
let phantomConnect = new PhantomConnect();

// ======= SINGLE INSTANCE LOCK (must be early!) =======
// Handle protocol URL on Windows/Linux (second instance)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  // Another instance is running - quit this one
  // But first check if we have a URL to pass
  const url = process.argv.find(arg => arg.startsWith('gvpn://'));
  if (url) {
  }
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus the window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.show();
    }
    // Handle the protocol URL on Windows/Linux
    const url = commandLine.find(arg => arg.startsWith('gvpn://'));
    if (url) {
      handlePhantomCallback(url);
    }
  });
}

// Register custom protocol for Phantom deeplink callbacks
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('gvpn', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('gvpn');
}

// Handle protocol URL on macOS (this works even on first instance)
app.on('open-url', (event, url) => {
  event.preventDefault();
  handlePhantomCallback(url);
});

// Handle Phantom callback
function handlePhantomCallback(url) {
  if (!url || !url.startsWith('gvpn://')) return;
  
  try {
    const result = phantomConnect.handleCallback(url);
    
    // Focus the main window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.show();
    }
    
    // Send result to renderer
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('phantom-callback', result);
    }
  } catch (error) {
    console.error('[Main] Error handling Phantom callback:', error);
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('phantom-callback', { success: false, error: error.message });
    }
  }
}

// Mock IPFS nodes for development
const mockIPFSNodes = [
  {
    pubkey: 'VPNNode1AAA111',
    endpoint: '45.79.123.45:51820',
    region: 'USA, New York',
    location: 'USA, New York',
    bandwidth: 1000,
    latency: 25,
    is_active: true,
    price_per_gb: 100000,
    hourly_rate: 50000,
    weekly_rate: 300000,
    monthly_rate: 1000000
  },
  {
    pubkey: 'VPNNode2BBB222',
    endpoint: '139.162.234.56:51820',
    region: 'UK, London',
    location: 'UK, London',
    bandwidth: 800,
    latency: 35,
    is_active: true,
    price_per_gb: 90000,
    hourly_rate: 45000,
    weekly_rate: 280000,
    monthly_rate: 950000
  },
  {
    pubkey: 'VPNNode3CCC333',
    endpoint: '172.104.156.78:51820',
    region: 'Germany, Frankfurt',
    location: 'Germany, Frankfurt',
    bandwidth: 1200,
    latency: 20,
    is_active: true,
    price_per_gb: 95000,
    hourly_rate: 48000,
    weekly_rate: 290000,
    monthly_rate: 980000
  },
  {
    pubkey: 'VPNNode4DDD444',
    endpoint: '143.42.67.89:51820',
    region: 'Singapore',
    location: 'Singapore',
    bandwidth: 900,
    latency: 45,
    is_active: true,
    price_per_gb: 110000,
    hourly_rate: 55000,
    weekly_rate: 320000,
    monthly_rate: 1100000
  },
  {
    pubkey: 'VPNNode5EEE555',
    endpoint: '198.58.99.123:51820',
    region: 'Canada, Toronto',
    location: 'Canada, Toronto',
    bandwidth: 850,
    latency: 30,
    is_active: true,
    price_per_gb: 88000,
    hourly_rate: 44000,
    weekly_rate: 270000,
    monthly_rate: 920000
  }
];

function createWindow() {
  // Set dock icon on macOS
  if (process.platform === 'darwin') {
    const iconPath = path.join(__dirname, 'assets', 'icons', 'icon.png');
    if (require('fs').existsSync(iconPath)) {
      app.dock.setIcon(iconPath);
    }
  }

  // Build window options - titleBarStyle differs per platform
  const windowOptions = {
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, 'assets', 'icons', 'icon.png'),
    autoHideMenuBar: true,  // Hide menu bar (show with Alt on Windows)
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#0A0A0A'
  };

  // Remove menu bar completely on Windows/Linux
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }

  // hiddenInset is macOS-only, use default frame on other platforms
  if (process.platform === 'darwin') {
    windowOptions.titleBarStyle = 'hiddenInset';
  }

  mainWindow = new BrowserWindow(windowOptions);

  // Disable cache to always load fresh files
  mainWindow.webContents.session.clearCache();
  
  mainWindow.loadFile('index.html');

  // DevTools disabled for production
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  
  // Set up callback for Phantom wallet connection
  phantomConnect.setOnConnectCallback((result) => {
    
    // Focus the main window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.show();
    }
    
    // Send result to renderer
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('phantom-callback', result);
    }
  });
  
  // Start the Phantom server early so it's ready
  phantomConnect.startServer();
});

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

// Handle real Solana payment
ipcMain.handle('process-payment', async (event, { fromKeypair, toAddress, amountLamports }) => {
  try {
    
    // Convert base58 private key to Keypair
    const secretKey = Uint8Array.from(fromKeypair);
    const keypair = Keypair.fromSecretKey(secretKey);
    
    // Connect to Solana testnet
    const connection = new Connection('https://api.testnet.solana.com', 'confirmed');
    
    // Check balance
    const balance = await connection.getBalance(keypair.publicKey);
    
    if (balance < amountLamports) {
      return { success: false, error: `Insufficient balance. Need ${amountLamports / LAMPORTS_PER_SOL} SOL` };
    }
    
    // Create transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: new PublicKey(toAddress),
        lamports: amountLamports,
      })
    );
    
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;
    
    // Sign and send
    transaction.sign(keypair);
    const signature = await connection.sendRawTransaction(transaction.serialize());
    
    // Wait for confirmation
    await connection.confirmTransaction(signature);
    
    return { success: true, signature };
  } catch (error) {
    console.error('[Main] Payment error:', error);
    return { success: false, error: error.message };
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
    const configDir = path.join(os.homedir(), '.gvpn');
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
      let dataReceiveTimeout = null;
      
      const timeout = setTimeout(() => {
        client.destroy();
        resolve({ success: false, error: 'Connection timeout - make sure ncat is running on server' });
      }, 15000);
      
      client.connect(port, serverIp, () => {
        client.write('start\n');
        // Keep connection alive to receive response
        client.setKeepAlive(true, 1000);
      });
      
      client.on('data', (data) => {
        configData += data.toString();
        
        // Reset the data receive timeout - wait for more data or resolve after 500ms of no data
        if (dataReceiveTimeout) clearTimeout(dataReceiveTimeout);
        dataReceiveTimeout = setTimeout(() => {
          client.end();
        }, 500);
      });
      
      client.on('close', () => {
        clearTimeout(timeout);
        if (dataReceiveTimeout) clearTimeout(dataReceiveTimeout);
        if (configData.length > 0) {
          resolve({ success: true, config: configData });
        } else {
          resolve({ success: false, error: 'No data received from server' });
        }
      });
      
      client.on('end', () => {
        // Connection ended by server, wait for close
      });
      
      client.on('error', (error) => {
        clearTimeout(timeout);
        if (dataReceiveTimeout) clearTimeout(dataReceiveTimeout);
        console.error('ncat connection error:', error.message);
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
    const configDir = path.join(os.homedir(), '.gvpn');
    const configPath = path.join(configDir, 'gvpn.conf');

    // Ensure the .gvpn directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Clean the config - extract only valid WireGuard config lines
    const lines = config.split('\n');
    const cleanLines = [];
    let inInterface = false;
    let inPeer = false;
    let seenInterface = false;
    let seenPeer = false;
    const interfaceKeys = new Set();
    const peerKeys = new Set();
    
    // Define which keys belong to which section
    const interfaceOnlyKeys = ['PrivateKey', 'Address', 'DNS', 'ListenPort', 'MTU', 'Table', 'PreUp', 'PostUp', 'PreDown', 'PostDown'];
    const peerOnlyKeys = ['PublicKey', 'Endpoint', 'AllowedIPs', 'PersistentKeepalive', 'PresharedKey'];
    
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
        interfaceKeys.clear();
        cleanLines.push('[Interface]');
        continue;
      }
      if (trimmed === '[Peer]') {
        if (seenPeer) continue; // Skip duplicate
        inInterface = false;
        inPeer = true;
        seenPeer = true;
        peerKeys.clear();
        cleanLines.push('');
        cleanLines.push('[Peer]');
        continue;
      }
      
      // Valid config keys
      if (inInterface || inPeer) {
        const match = trimmed.match(/^([A-Za-z]+)\s*=\s*(.+)/);
        if (match) {
          const key = match[1];
          let value = match[2];
          
          // Keep AllowedIPs as-is (don't add ::/0 - server doesn't support IPv6)
          // IPv6 is disabled separately on the client to prevent leaks
          
          // Check if this key belongs to the current section
          if (inInterface && interfaceOnlyKeys.includes(key)) {
            if (!interfaceKeys.has(key)) {
              interfaceKeys.add(key);
              cleanLines.push(`${key} = ${value}`);
            }
          } else if (inPeer && peerOnlyKeys.includes(key)) {
            if (!peerKeys.has(key)) {
              peerKeys.add(key);
              cleanLines.push(`${key} = ${value}`);
            }
          }
        }
      }
    }
    
    const cleanConfig = cleanLines.join('\n') + '\n';
    

    // Write config file
    fs.writeFileSync(configPath, cleanConfig);
    fs.chmodSync(configPath, 0o600);

    // Connect using osascript (always uses admin prompt on macOS)
    if (process.platform === 'darwin') {
      return new Promise((resolve) => {
        // Use osascript for macOS - it shows a native password dialog
        const vpnScript = `do shell script "networksetup -setv6off Wi-Fi 2>/dev/null; networksetup -setv6off Ethernet 2>/dev/null; wg-quick up ${configPath}" with administrator privileges`;
        
        
        exec(`osascript -e '${vpnScript}'`, { timeout: 60000 }, (error, stdout, stderr) => {
          if (error) {
            console.error('Connection error:', stderr || error.message);
            resolve({ 
              success: false, 
              error: stderr || error.message,
              configPath: configPath 
            });
            return;
          }
          
          resolve({ 
            success: true, 
            message: 'VPN connected successfully!',
            configPath: configPath,
            output: stdout
          });
        });
      });
    } else if (process.platform === 'win32') {
      // Windows - Use WireGuard Windows service
      return new Promise(async (resolve) => {
        // Check common install locations for WireGuard
        const checkPaths = [
          'C:\\Program Files\\WireGuard\\wireguard.exe',
          'C:\\Program Files (x86)\\WireGuard\\wireguard.exe',
          path.join(process.env.LOCALAPPDATA || '', 'WireGuard', 'wireguard.exe'),
          path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'WireGuard', 'wireguard.exe'),
          path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'WireGuard', 'wireguard.exe'),
          path.join(process.env.USERPROFILE || '', 'scoop', 'apps', 'wireguard', 'current', 'wireguard.exe'),
          'wireguard.exe' // Check if in PATH
        ];
        
        let foundWireguard = null;
        
        // First check file paths
        for (const p of checkPaths.slice(0, -1)) {
          try {
            if (p && fs.existsSync(p)) {
              foundWireguard = p;
              break;
            }
          } catch (e) {
            // Path check failed, continue
          }
        }
        
        // If not found, check if wireguard.exe is in PATH using 'where' command
        if (!foundWireguard) {
          try {
            const whereResult = await new Promise((res) => {
              exec('where wireguard.exe', { timeout: 5000 }, (err, stdout) => {
                if (!err && stdout.trim()) {
                  res(stdout.trim().split('\n')[0].trim());
                } else {
                  res(null);
                }
              });
            });
            if (whereResult) {
              foundWireguard = whereResult;
            }
          } catch (e) {
            // where command failed
          }
        }
        
        if (!foundWireguard) {
          // Try to auto-install WireGuard on Windows
          
          // Send progress to renderer
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('vpn-status', { 
              status: 'installing', 
              message: 'WireGuard not found. Installing automatically...' 
            });
          }
          
          try {
            const installResult = await installWireGuardWindows();
            
            if (installResult.success) {
              
              // Re-check for WireGuard after installation
              for (const p of checkPaths.slice(0, -1)) {
                try {
                  if (p && fs.existsSync(p)) {
                    foundWireguard = p;
                    break;
                  }
                } catch (e) {
                  // Path check failed
                }
              }
              
              if (!foundWireguard) {
                // Still not found, ask user to restart
                resolve({ 
                  success: false, 
                  error: 'WireGuard was installed. Please restart the application and try again.',
                  configPath 
                });
                return;
              }
            } else {
              // Install failed, open download page as fallback
              const { shell } = require('electron');
              shell.openExternal('https://www.wireguard.com/install/');
              
              resolve({ 
                success: false, 
                error: installResult.error || 'WireGuard installation failed. Opening download page... Please install manually and try again.',
                configPath 
              });
              return;
            }
          } catch (installError) {
            console.error('WireGuard auto-install error:', installError);
            
            // Fallback to opening download page
            const { shell } = require('electron');
            shell.openExternal('https://www.wireguard.com/install/');
            
            resolve({ 
              success: false, 
              error: 'Could not auto-install WireGuard. Opening download page... Please install manually and try again.',
              configPath 
            });
            return;
          }
        }
        
        // Use WireGuard tunnel service
        const tunnelName = path.basename(configPath, '.conf');
        
        // On Windows, we need to run with admin privileges using PowerShell
        // First try to uninstall any existing tunnel, then install fresh
        const psScript = `
          Start-Process -FilePath '${foundWireguard.replace(/'/g, "''")}' -ArgumentList '/uninstalltunnelservice','${tunnelName}' -Verb RunAs -Wait -WindowStyle Hidden 2>$null;
          Start-Sleep -Seconds 1;
          Start-Process -FilePath '${foundWireguard.replace(/'/g, "''")}' -ArgumentList '/installtunnelservice','${configPath.replace(/'/g, "''")}' -Verb RunAs -Wait -WindowStyle Hidden;
          exit $LASTEXITCODE
        `.trim().replace(/\n\s+/g, ' ');
        
        exec(`powershell -Command "${psScript}"`, { timeout: 60000 }, (error, stdout, stderr) => {
          if (error) {
            // Check if user cancelled UAC
            if (stderr && stderr.includes('canceled by the user')) {
              resolve({ success: false, error: 'Administrator access was denied. Please allow the UAC prompt to connect.', configPath });
            } else {
              resolve({ success: false, error: stderr || error.message, configPath });
            }
            return;
          }
          resolve({ success: true, message: 'VPN connected!', configPath, output: stdout });
        });
      });
    } else {
      // Linux - try pkexec first for graphical password prompt, fallback to sudo
      return new Promise((resolve) => {
        // First try pkexec (graphical password prompt)
        exec(`pkexec wg-quick up ${configPath}`, (error, stdout, stderr) => {
          if (error) {
            // If pkexec fails, try sudo
            exec(`sudo wg-quick up ${configPath}`, (err2, out2, stderr2) => {
              if (err2) {
                resolve({ success: false, error: stderr2 || err2.message + '. Please run app with sudo or configure passwordless sudo for wg-quick.', configPath });
                return;
              }
              resolve({ success: true, message: 'VPN connected!', configPath, output: out2 });
            });
            return;
          }
          resolve({ success: true, message: 'VPN connected!', configPath, output: stdout });
        });
      });
    }
  } catch (error) {
    console.error('Config error:', error);
    return { success: false, error: error.message };
  }
});

// Disconnect VPN
ipcMain.handle('disconnect-vpn', async (event, { presharedKey, serverIp }) => {
  try {
    const configPath = path.join(os.homedir(), '.gvpn', 'gvpn.conf');

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

    // Step 2: Disconnect locally
    if (process.platform === 'darwin') {
      return new Promise((resolve) => {
        const vpnScript = `do shell script "wg-quick down ${configPath}; networksetup -setv6automatic Wi-Fi 2>/dev/null; networksetup -setv6automatic Ethernet 2>/dev/null" with administrator privileges`;
        
        exec(`osascript -e '${vpnScript}'`, { timeout: 30000 }, (error, stdout, stderr) => {
          if (error) {
            // Try to kill wireguard-go process as fallback
            exec(`osascript -e 'do shell script "pkill -f wireguard-go" with administrator privileges'`, { timeout: 10000 }, () => {
              resolve({ success: true, message: 'VPN disconnected' });
            });
            return;
          }
          
          resolve({ success: true, message: 'VPN disconnected', output: stdout });
        });
      });
    } else if (process.platform === 'win32') {
      // Windows - Uninstall tunnel service
      return new Promise((resolve) => {
        const wireguardPath = 'C:\\Program Files\\WireGuard\\wireguard.exe';
        const tunnelName = path.basename(configPath, '.conf');
        
        // Check common install locations
        const checkPaths = [
          wireguardPath,
          'C:\\Program Files (x86)\\WireGuard\\wireguard.exe',
          path.join(process.env.LOCALAPPDATA || '', 'WireGuard', 'wireguard.exe')
        ];
        
        let foundWireguard = null;
        for (const p of checkPaths) {
          if (fs.existsSync(p)) {
            foundWireguard = p;
            break;
          }
        }
        
        if (!foundWireguard) {
          resolve({ success: true, message: 'VPN disconnected (WireGuard not found)' });
          return;
        }
        
        // Use PowerShell with elevation to uninstall tunnel
        const psScript = `Start-Process -FilePath '${foundWireguard.replace(/'/g, "''")}' -ArgumentList '/uninstalltunnelservice','${tunnelName}' -Verb RunAs -Wait -WindowStyle Hidden`;
        
        exec(`powershell -Command "${psScript}"`, { timeout: 30000 }, (error, stdout, stderr) => {
          // Always report success for disconnect
          resolve({ success: true, message: 'VPN disconnected', output: stdout });
        });
      });
    } else {
      // Linux - try pkexec first for graphical password prompt, fallback to sudo
      return new Promise((resolve) => {
        exec(`pkexec wg-quick down ${configPath}`, (error, stdout, stderr) => {
          if (error) {
            // If pkexec fails, try sudo
            exec(`sudo wg-quick down ${configPath}`, (err2, out2, stderr2) => {
              resolve({ success: true, message: 'VPN disconnected', output: out2 });
            });
            return;
          }
          resolve({ success: true, message: 'VPN disconnected', output: stdout });
        });
      });
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get VPN status
ipcMain.handle('get-vpn-status', async () => {
  try {
    let command;
    if (process.platform === 'win32') {
      // Windows - use full path to wg.exe
      const wgPath = 'C:\\Program Files\\WireGuard\\wg.exe';
      if (fs.existsSync(wgPath)) {
        command = `"${wgPath}" show`;
      } else {
        // WireGuard not installed
        return { success: true, connected: false };
      }
    } else if (process.platform === 'darwin') {
      // macOS - needs sudo but use osascript for privilege escalation
      command = 'sudo wg show';
    } else {
      // Linux - wg show doesn't need sudo to check status
      command = 'wg show';
    }
    
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

// Connect Wallet via Phantom - Opens browser page
ipcMain.handle('connect-phantom-wallet', async () => {
  try {
    
    // Start the server and open browser - don't await the promise
    // The actual result comes via callback (gvpn:// protocol)
    phantomConnect.connect().catch(err => {
      console.error('[Main] Phantom connect error:', err);
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('phantom-callback', { 
          success: false, 
          error: err.message 
        });
      }
    });
    
    // Return immediately - tell renderer we opened the browser
    return { success: true, opened: true, message: 'Opening Phantom connection page...' };
  } catch (error) {
    console.error('[Main] Phantom connection error:', error);
    return { success: false, error: error.message };
  }
});

// Sign message with Phantom
ipcMain.handle('phantom-sign-message', async (event, { message }) => {
  try {
    if (!phantomConnect.isConnected()) {
      return { success: false, error: 'Phantom wallet not connected' };
    }
    
    const result = await phantomConnect.signMessage(message);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Sign and send transaction with Phantom
ipcMain.handle('phantom-sign-transaction', async (event, { transaction }) => {
  try {
    if (!phantomConnect.isConnected()) {
      return { success: false, error: 'Phantom wallet not connected' };
    }
    
    const result = await phantomConnect.signAndSendTransaction(transaction);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Disconnect Phantom wallet
ipcMain.handle('disconnect-phantom-wallet', async () => {
  try {
    const result = await phantomConnect.disconnect();
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get Phantom wallet status
ipcMain.handle('get-phantom-status', async () => {
  return {
    connected: phantomConnect.isConnected(),
    publicKey: phantomConnect.getPublicKey()
  };
});

// Connect Wallet (load from wallet.json or generate new) - Fallback/Mock wallet
ipcMain.handle('connect-wallet', async () => {
  try {
    const walletPath = path.join(__dirname, '..', 'wallet.json');
    
    if (fs.existsSync(walletPath)) {
      const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
      const keypair = Keypair.fromSecretKey(Uint8Array.from(walletData));
      return { 
        success: true, 
        publicKey: keypair.publicKey.toString(),
        secretKey: Array.from(keypair.secretKey)
      };
    } else {
      // Generate new wallet
      const keypair = Keypair.generate();
      fs.writeFileSync(walletPath, JSON.stringify(Array.from(keypair.secretKey)));
      return { 
        success: true, 
        publicKey: keypair.publicKey.toString(),
        secretKey: Array.from(keypair.secretKey)
      };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Process Payment with wallet
ipcMain.handle('process-payment-wallet', async (event, { recipient, amount, memo }) => {
  try {
    const walletPath = path.join(__dirname, '..', 'wallet.json');
    
    if (!fs.existsSync(walletPath)) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
    const keypair = Keypair.fromSecretKey(Uint8Array.from(walletData));
    
    // Connect to Solana testnet
    const connection = new Connection('https://api.testnet.solana.com', 'confirmed');
    
    // Check balance
    const balance = await connection.getBalance(keypair.publicKey);
    
    if (balance < amount) {
      return { success: false, error: `Insufficient balance. Need ${amount / LAMPORTS_PER_SOL} SOL, have ${balance / LAMPORTS_PER_SOL} SOL` };
    }
    
    // Create transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: new PublicKey(recipient),
        lamports: amount,
      })
    );
    
    // Send transaction
    const signature = await connection.sendTransaction(transaction, [keypair]);
    await connection.confirmTransaction(signature);
    
    return { 
      success: true, 
      signature,
      message: `Payment of ${amount / LAMPORTS_PER_SOL} SOL sent successfully`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPFS handlers
ipcMain.handle('init-ipfs', async () => {
  try {
    await ipfsModule.initIPFS();
    ipfsInitialized = true;
    return { success: true };
  } catch (error) {
    console.error('❌ IPFS init error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-nodes-from-ipfs', async (event, region) => {
  
  try {
    // Try to get nodes from IPFS first
    let nodes = await ipfsModule.getNodesFromIPFS(region);
    
    // If no nodes from IPFS, fallback to indexer API
    if (!nodes || nodes.length === 0) {
      const response = await axios.get(`${INDEXER_URL}/nodes`);
      
      if (response.data.success) {
        nodes = response.data.nodes || [];
        
        // Filter by region if specified
        if (region && region !== 'all') {
          nodes = nodes.filter(node => 
            (node.region || '').toLowerCase().includes(region.toLowerCase()) ||
            (node.location || '').toLowerCase().includes(region.toLowerCase())
          );
        }
      }
    }
    
    return { success: true, nodes };
  } catch (error) {
    console.error('❌ Error getting nodes:', error);
    return { success: false, error: error.message, nodes: [] };
  }
});

// ===== SAVE WALLET KEYPAIR =====
// Allows importing Phantom wallet private key for on-chain operations
ipcMain.handle('save-wallet-keypair', async (event, { privateKey, walletAddress }) => {
  
  try {
    const bs58 = require('bs58');
    
    // Decode the private key (Phantom exports as base58)
    let secretKey;
    try {
      secretKey = bs58.decode(privateKey);
    } catch (e) {
      // Try as JSON array
      try {
        secretKey = new Uint8Array(JSON.parse(privateKey));
      } catch (e2) {
        throw new Error('Invalid private key format. Use Base58 or JSON array.');
      }
    }
    
    if (secretKey.length !== 64) {
      throw new Error('Invalid private key length. Expected 64 bytes.');
    }
    
    // Verify the keypair matches the expected wallet address
    const keypair = Keypair.fromSecretKey(secretKey);
    if (keypair.publicKey.toBase58() !== walletAddress) {
      throw new Error(`Private key does not match wallet ${walletAddress}. Got ${keypair.publicKey.toBase58()}`);
    }
    
    // Save to wallet.json
    const walletPath = path.join(__dirname, '..', 'wallet.json');
    fs.writeFileSync(walletPath, JSON.stringify({
      publicKey: walletAddress,
      secretKey: Array.from(secretKey)
    }, null, 2));
    
    
    return { success: true, message: 'Wallet keypair saved successfully!' };
    
  } catch (error) {
    console.error('❌ Error saving wallet keypair:', error);
    return { success: false, error: error.message };
  }
});

// ===== PROVIDER REGISTRATION HANDLERS =====
ipcMain.handle('register-provider', async (event) => {
  try {
    // Load wallet keypair
    const walletPath = path.join(__dirname, '..', 'test-wallet-keypair.json');
    if (!fs.existsSync(walletPath)) {
      throw new Error('Wallet keypair not found. Please create test-wallet-keypair.json');
    }
    
    const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
    // Handle both formats: array of bytes or {publicKey, secretKey}
    const secretKey = walletData.secretKey || walletData;
    const wallet = Keypair.fromSecretKey(new Uint8Array(secretKey));
    
    
    // Load IDL
    const idlPath = path.join(__dirname, '..', 'target', 'idl', 'dvpn.json');
    if (!fs.existsSync(idlPath)) {
      throw new Error('Program IDL not found. Please build the program first.');
    }
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
    
    // Create provider
    const provider = new AnchorProvider(
      connection,
      { publicKey: wallet.publicKey, signTransaction: async (tx) => tx, signAllTransactions: async (txs) => txs },
      { commitment: 'confirmed' }
    );
    
    // Initialize program
    const program = new Program(idl, PROGRAM_ID, provider);
    
    // Derive provider PDA
    const [providerPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('provider'), wallet.publicKey.toBuffer()],
      new PublicKey(PROGRAM_ID)
    );
    
    
    // Register provider
    const tx = await program.methods
      .registerProvider()
      .accounts({
        provider: providerPda,
        authority: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([wallet])
      .rpc();
    
    
    return { 
      success: true, 
      message: 'Provider registered successfully on testnet',
      providerPubkey: providerPda.toString(),
      signature: tx
    };
  } catch (error) {
    console.error('❌ Error registering provider:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-provider-data', async (event, walletPubkey) => {
  try {
    // Load IDL
    const idlPath = path.join(__dirname, '..', 'target', 'idl', 'dvpn.json');
    if (!fs.existsSync(idlPath)) {
      throw new Error('Program IDL not found');
    }
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
    
    // Create provider
    const provider = new AnchorProvider(
      connection,
      { publicKey: new PublicKey(walletPubkey), signTransaction: async (tx) => tx, signAllTransactions: async (txs) => txs },
      { commitment: 'confirmed' }
    );
    
    const program = new Program(idl, PROGRAM_ID, provider);
    
    // Derive provider PDA
    const [providerPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('provider'), new PublicKey(walletPubkey).toBuffer()],
      new PublicKey(PROGRAM_ID)
    );
    
    // Fetch provider account
    const providerAccount = await program.account.provider.fetch(providerPda);
    
    // Fetch all nodes for this provider
    const allNodes = await program.account.node.all([
      {
        memcmp: {
          offset: 8, // After discriminator
          bytes: providerPda.toBase58()
        }
      }
    ]);
    
    const nodes = allNodes.map(node => ({
      pubkey: node.publicKey.toString(),
      location: node.account.region || 'Unknown',
      pricePerHour: (node.account.pricePerMinuteLamports || 0) * 60 / LAMPORTS_PER_SOL,
      capacity: node.account.maxCapacity || 0,
      activeUsers: node.account.activeSessions || 0,
      status: node.account.isActive ? 'active' : 'inactive',
      earnings: (node.account.totalEarnings || 0) / LAMPORTS_PER_SOL,
      total_earnings: node.account.totalEarnings || 0,
      uptime: 99.5 // TODO: Calculate from session history
    }));
    
    const providerData = {
      isProvider: true,
      authority: providerAccount.authority.toString(),
      totalEarnings: (providerAccount.totalEarnings || 0) / LAMPORTS_PER_SOL,
      total_earnings: providerAccount.totalEarnings || 0,
      totalSessions: providerAccount.totalSessions || 0,
      nodes
    };
    
    return { success: true, data: providerData };
  } catch (error) {
    console.error('❌ Error fetching provider data:', error);
    // If account doesn't exist, user is not a provider yet
    if (error.message.includes('Account does not exist')) {
      return { success: true, data: { isProvider: false, nodes: [] } };
    }
    return { success: false, error: error.message };
  }
});

// ==================== REGISTER NODE VIA PHANTOM ====================
ipcMain.handle('register-node-phantom', async (event, nodeData) => {
  
  try {
    // Open the Phantom signing page
    const result = await phantomConnect.openNodeRegistrationPage({
      endpoint: nodeData.endpoint,
      location: nodeData.location,
      region: nodeData.region,
      pricePerHour: nodeData.pricePerHour,
      wgPublicKey: nodeData.wgPublicKey,
      walletAddress: nodeData.walletAddress,
      programId: PROGRAM_ID,
      rpcUrl: SOLANA_RPC
    });
    
    
    return result;
    
  } catch (error) {
    console.error('❌ Phantom node registration error:', error);
    return { success: false, error: error.message };
  }
});

// ==================== REGISTER NODE ON-CHAIN (KEYPAIR) ====================
ipcMain.handle('register-node', async (event, nodeData) => {
  
  try {
    // Try to find a matching wallet keypair
    let wallet = null;
    const targetWallet = nodeData.walletAddress;
    
    // Check multiple possible keypair files
    const keypairFiles = [
      path.join(__dirname, '..', 'wallet.json'),
      path.join(__dirname, '..', 'user-keypair.json'),
      path.join(__dirname, '..', 'test-wallet-keypair.json'),
      path.join(__dirname, '..', `${targetWallet}.json`),
      path.join(require('os').homedir(), '.config', 'solana', 'id.json')
    ];
    
    for (const walletPath of keypairFiles) {
      if (fs.existsSync(walletPath)) {
        try {
          const walletDataFile = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
          const secretKey = walletDataFile.secretKey || walletDataFile;
          const kp = Keypair.fromSecretKey(new Uint8Array(secretKey));
          
          if (kp.publicKey.toBase58() === targetWallet) {
            wallet = kp;
            break;
          }
        } catch (e) {
          // Try next file
        }
      }
    }
    
    if (!wallet) {
      
      return {
        success: false,
        error: `Keypair not found for wallet ${targetWallet}. Please export your Phantom wallet private key and save it as wallet.json in the project root.`,
        needsPrivateKey: true
      };
    }
    
    
    // Check balance
    const balance = await connection.getBalance(wallet.publicKey);
    
    if (balance < 0.005 * LAMPORTS_PER_SOL) {
      throw new Error('Insufficient SOL balance. Need at least 0.005 SOL for registration.');
    }
    
    const programId = new PublicKey(PROGRAM_ID);
    
    // Derive Provider PDA
    const [providerPda] = PublicKey.findProgramAddressSync(
      [PROVIDER_SEED, wallet.publicKey.toBuffer()],
      programId
    );
    
    // Check if provider exists
    const providerAccount = await connection.getAccountInfo(providerPda);
    if (!providerAccount) {
      throw new Error('Provider not registered on-chain. Please register as provider first.');
    }
    
    // Generate unique node ID using timestamp
    const nodeId = BigInt(Date.now());
    
    // Derive Node PDA
    const nodeIdBuffer = Buffer.alloc(8);
    nodeIdBuffer.writeBigUInt64LE(nodeId);
    
    const NODE_SEED = Buffer.from('node');
    const [nodePda] = PublicKey.findProgramAddressSync(
      [NODE_SEED, providerPda.toBuffer(), nodeIdBuffer],
      programId
    );
    
    // Parse node parameters
    const endpoint = (nodeData.endpoint || '').substring(0, 80);
    const region = (nodeData.region || 'unknown').substring(0, 12);
    const pricePerHour = parseFloat(nodeData.pricePerHour) || 0.001;
    const pricePerMinuteLamports = BigInt(Math.floor(pricePerHour * LAMPORTS_PER_SOL / 60));
    const maxCapacity = parseInt(nodeData.capacity) || 100;
    const bandwidthMbps = parseInt(nodeData.bandwidthMbps) || 100;
    
    // WireGuard public key (32 bytes)
    let wgPubkeyBytes = Buffer.alloc(32);
    if (nodeData.wgPublicKey) {
      try {
        const decoded = Buffer.from(nodeData.wgPublicKey, 'base64');
        if (decoded.length === 32) {
          wgPubkeyBytes = decoded;
        }
      } catch (e) {
      }
    }
    
    
    // Build instruction data for register_node
    // Anchor discriminator for register_node
    const discriminator = Buffer.from([178, 100, 167, 106, 183, 36, 109, 61]);
    
    // Encode parameters
    const endpointBuffer = Buffer.alloc(4 + endpoint.length);
    endpointBuffer.writeUInt32LE(endpoint.length, 0);
    endpointBuffer.write(endpoint, 4);
    
    const regionBuffer = Buffer.alloc(4 + region.length);
    regionBuffer.writeUInt32LE(region.length, 0);
    regionBuffer.write(region, 4);
    
    const priceBuffer = Buffer.alloc(8);
    priceBuffer.writeBigUInt64LE(pricePerMinuteLamports);
    
    const capacityBuffer = Buffer.alloc(4);
    capacityBuffer.writeUInt32LE(maxCapacity);
    
    const bandwidthBuffer = Buffer.alloc(4);
    bandwidthBuffer.writeUInt32LE(bandwidthMbps);
    
    const instructionData = Buffer.concat([
      discriminator,
      nodeIdBuffer,
      endpointBuffer,
      regionBuffer,
      priceBuffer,
      wgPubkeyBytes,
      capacityBuffer,
      bandwidthBuffer
    ]);
    
    // Create instruction
    const { Transaction, TransactionInstruction } = require('@solana/web3.js');
    
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: providerPda, isSigner: false, isWritable: true },
        { pubkey: nodePda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ],
      programId: programId,
      data: instructionData
    });
    
    // Create and send transaction
    const transaction = new Transaction();
    transaction.add(instruction);
    
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;
    transaction.sign(wallet);
    
    
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });
    
    
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight
    }, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error('Transaction failed: ' + JSON.stringify(confirmation.value.err));
    }
    
    
    return {
      success: true,
      message: 'Node registered on-chain successfully!',
      nodePda: nodePda.toBase58(),
      signature: signature,
      nodeId: nodeId.toString()
    };
    
  } catch (error) {
    console.error('❌ Error registering node on-chain:', error);
    
    // Check for specific errors
    if (error.logs) {
    }
    
    return { success: false, error: error.message };
  }
});

// Submit signed transaction from Phantom
ipcMain.handle('submit-signed-transaction', async (event, signedTxBase64) => {
  try {
    const { Transaction } = require('@solana/web3.js');
    const signedTx = Transaction.from(Buffer.from(signedTxBase64, 'base64'));
    
    const signature = await connection.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });
    
    
    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error('Transaction failed: ' + JSON.stringify(confirmation.value.err));
    }
    
    
    return {
      success: true,
      signature: signature,
      message: 'Node registered on-chain successfully!'
    };
    
  } catch (error) {
    console.error('❌ Error submitting transaction:', error);
    return { success: false, error: error.message };
  }
});

// ==================== SUBSCRIPTION HANDLERS ====================

// Subscription plans configuration
const SUBSCRIPTION_PLANS = {
  weekly: { priceSOL: 0.03, priceLamports: 30000000, durationDays: 7 },
  monthly: { priceSOL: 0.1, priceLamports: 100000000, durationDays: 30 },
  yearly: { priceSOL: 0.6, priceLamports: 600000000, durationDays: 365 }
};

const SUBSCRIPTION_SEED = Buffer.from('subscription');

// Create subscription - opens Phantom to sign transaction from USER's wallet
ipcMain.handle('create-subscription', async (event, { walletAddress, planType, priceSOL }) => {
  
  try {
    const plan = SUBSCRIPTION_PLANS[planType.toLowerCase()];
    if (!plan) {
      throw new Error('Invalid plan type: ' + planType);
    }
    
    const userPubkey = new PublicKey(walletAddress);
    
    // Derive subscription PDA (escrow address)
    const [subscriptionPDA] = PublicKey.findProgramAddressSync(
      [SUBSCRIPTION_SEED, userPubkey.toBuffer()],
      new PublicKey(PROGRAM_ID)
    );
    
    
    // Open browser to sign transaction with Phantom
    // This will transfer SOL from USER's wallet to the escrow PDA
    const txParams = {
      plan: planType,
      priceSOL: plan.priceSOL,
      priceLamports: plan.priceLamports,
      durationDays: plan.durationDays,
      escrowPDA: subscriptionPDA.toBase58(),
      walletAddress: walletAddress
    };
    
    const result = await phantomConnect.openTransactionPage(txParams);
    
    if (result.success) {
      
      return {
        success: true,
        signature: result.signature,
        subscriptionPDA: subscriptionPDA.toBase58(),
        plan: planType,
        priceSOL: plan.priceSOL,
        expiresAt: Date.now() + (plan.durationDays * 24 * 60 * 60 * 1000)
      };
    } else {
      throw new Error(result.error || 'Transaction failed or was cancelled');
    }
    
  } catch (error) {
    console.error('❌ Subscription error:', error);
    return { success: false, error: error.message };
  }
});

// Switch network mode (devnet/mainnet)
ipcMain.handle('switch-network', async (event, networkMode) => {
  const config = switchNetworkMode(networkMode);
  return {
    success: true,
    network: networkMode,
    config: config
  };
});

// Get current network mode
ipcMain.handle('get-network-mode', async () => {
  return {
    network: currentNetworkMode,
    config: NETWORK_CONFIG[currentNetworkMode]
  };
});

// Check subscription status
ipcMain.handle('check-subscription', async (event, walletAddress) => {
  
  try {
    const userPubkey = new PublicKey(walletAddress);
    
    // Derive subscription PDA
    const [subscriptionPDA] = PublicKey.findProgramAddressSync(
      [SUBSCRIPTION_SEED, userPubkey.toBuffer()],
      new PublicKey(PROGRAM_ID)
    );
    
    // Check PDA balance
    const balance = await connection.getBalance(subscriptionPDA);
    
    
    // If there's a balance, there's likely an active subscription
    const hasSubscription = balance > 0;
    
    return {
      success: true,
      hasSubscription: hasSubscription,
      subscriptionPDA: subscriptionPDA.toBase58(),
      escrowBalance: balance / LAMPORTS_PER_SOL
    };
    
  } catch (error) {
    console.error('❌ Check subscription error:', error);
    return { success: false, error: error.message };
  }
});

// Cancel subscription (would need program instruction in production)
ipcMain.handle('cancel-subscription', async (event, walletAddress) => {
  
  // Clear the subscription file
  clearSubscriptionFile();
  
  // Note: In production, this would call the program's cancel_subscription instruction
  // which would calculate proportional refund and transfer back to user
  
  return {
    success: true,
    message: 'Subscription cancelled (simulation - full contract needed for refund)'
  };
});

// Save subscription to persistent file storage
ipcMain.handle('save-subscription', async (event, subscription) => {
  const success = saveSubscriptionToFile(subscription);
  return { success };
});

// Load subscription from persistent file storage
ipcMain.handle('load-subscription', async (event, walletAddress) => {
  const subscription = loadSubscriptionFromFile();
  
  if (subscription) {
    // Check if subscription is for this wallet and not expired
    const now = Date.now();
    if (subscription.expiresAt > now) {
      if (!walletAddress || subscription.walletAddress === walletAddress) {
        return { success: true, subscription };
      } else {
      }
    } else {
      clearSubscriptionFile();
    }
  }
  
  return { success: false, subscription: null };
});

// Clear subscription
ipcMain.handle('clear-subscription', async (event) => {
  const success = clearSubscriptionFile();
  return { success };
});

// ============= CHECK ON-CHAIN SUBSCRIPTION =============
// Check if user has active subscription on Solana blockchain
ipcMain.handle('check-onchain-subscription', async (event, walletAddress) => {
  
  try {
    const programId = new PublicKey(PROGRAM_ID);
    const userPubkey = new PublicKey(walletAddress);
    
    // Derive subscription PDA
    const [subscriptionPda] = PublicKey.findProgramAddressSync(
      [SUBSCRIPTION_SEED, userPubkey.toBuffer()],
      programId
    );
    
    
    // Fetch account info
    const accountInfo = await connection.getAccountInfo(subscriptionPda);
    
    if (!accountInfo) {
      return { success: true, hasSubscription: false };
    }
    
    // Parse subscription data (skip 8-byte discriminator)
    const data = accountInfo.data;
    if (data.length < 67) {
      return { success: true, hasSubscription: false };
    }
    
    // Subscription struct layout:
    // - user: Pubkey (32 bytes) at offset 8
    // - plan: u8 (1 byte) at offset 40
    // - escrow_lamports: u64 (8 bytes) at offset 41
    // - start_time: i64 (8 bytes) at offset 49
    // - end_time: i64 (8 bytes) at offset 57
    // - state: u8 (1 byte) at offset 65
    
    const plan = data[40];
    const escrowLamports = Number(data.readBigUInt64LE(41));
    const startTime = Number(data.readBigInt64LE(49)) * 1000; // Convert to ms
    const endTime = Number(data.readBigInt64LE(57)) * 1000;   // Convert to ms
    const state = data[65];
    
    const planNames = ['Weekly', 'Monthly', 'Yearly'];
    const planName = planNames[plan] || 'Unknown';
    
    const now = Date.now();
    const expired = now >= endTime;
    
    
    return {
      success: true,
      hasSubscription: true,
      plan: planName,
      escrowLamports,
      startTime,
      expiresAt: endTime,
      expired,
      state: state === 0 ? 'Active' : state === 1 ? 'Claimed' : 'Cancelled',
      pda: subscriptionPda.toBase58()
    };
    
  } catch (error) {
    console.error('❌ Error checking on-chain subscription:', error.message);
    return { success: false, error: error.message };
  }
});

// ============= ON-CHAIN CLAIM EARNINGS =============
// Claim earnings from on-chain session (calls claim_payout instruction)
ipcMain.handle('claim-earnings-onchain', async (event, { walletAddress, sessionPDA }) => {
  
  try {
    // Load provider wallet (for signing)
    const walletPath = path.join(__dirname, '..', 'wallet.json');
    if (!fs.existsSync(walletPath)) {
      throw new Error('Provider wallet not found. Please set up wallet.json');
    }
    
    const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
    const providerWallet = Keypair.fromSecretKey(Uint8Array.from(walletData));
    
    const programId = new PublicKey(PROGRAM_ID);
    
    // Derive PDAs
    const [providerPda] = PublicKey.findProgramAddressSync(
      [PROVIDER_SEED, providerWallet.publicKey.toBuffer()],
      programId
    );
    
    const [treasuryPda] = PublicKey.findProgramAddressSync(
      [TREASURY_SEED],
      programId
    );
    
    // Get node PDA (node ID 1)
    const nodeId = BigInt(1);
    const nodeIdBuffer = Buffer.alloc(8);
    nodeIdBuffer.writeBigUInt64LE(nodeId);
    
    const [nodePda] = PublicKey.findProgramAddressSync(
      [NODE_SEED, providerPda.toBuffer(), nodeIdBuffer],
      programId
    );
    
    // If sessionPDA is provided, claim that specific session
    // Otherwise, we need to find active sessions
    if (!sessionPDA) {
      
      // For now, just return simulated success
      // In production, you'd query the program for claimable sessions
      return {
        success: true,
        simulated: true,
        message: 'On-chain claim requires active sessions with escrowed SOL. Currently using off-chain tracking.',
        providerPda: providerPda.toBase58(),
        nodePda: nodePda.toBase58(),
        treasuryPda: treasuryPda.toBase58()
      };
    }
    
    // Build claim_payout instruction
    const data = getDiscriminator('claim_payout');
    
    const { TransactionInstruction, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
    
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: providerWallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: providerPda, isSigner: false, isWritable: true },
        { pubkey: nodePda, isSigner: false, isWritable: true },
        { pubkey: new PublicKey(sessionPDA), isSigner: false, isWritable: true },
        { pubkey: treasuryPda, isSigner: false, isWritable: true },
      ],
      programId: programId,
      data: data,
    });
    
    const tx = new Transaction().add(instruction);
    const sig = await sendAndConfirmTransaction(connection, tx, [providerWallet]);
    
    
    return {
      success: true,
      signature: sig,
      message: 'Earnings claimed! 80% to provider, 20% to treasury.',
      providerPda: providerPda.toBase58()
    };
    
  } catch (error) {
    console.error('❌ Claim error:', error);
    return { success: false, error: error.message };
  }
});

// Get on-chain provider stats
ipcMain.handle('get-onchain-provider-stats', async (event, walletAddress) => {
  
  try {
    const programId = new PublicKey(PROGRAM_ID);
    const walletPubkey = new PublicKey(walletAddress);
    
    // Derive provider PDA
    const [providerPda] = PublicKey.findProgramAddressSync(
      [PROVIDER_SEED, walletPubkey.toBuffer()],
      programId
    );
    
    // Get provider account data
    const providerAccount = await connection.getAccountInfo(providerPda);
    
    if (!providerAccount) {
      return {
        success: false,
        error: 'Provider not registered on-chain',
        providerPda: providerPda.toBase58()
      };
    }
    
    // Parse provider data (simplified - would need proper deserialization)
    // For now, just return that it exists
    const balance = await connection.getBalance(providerPda);
    
    return {
      success: true,
      providerPda: providerPda.toBase58(),
      escrowBalance: balance / LAMPORTS_PER_SOL,
      dataLength: providerAccount.data.length
    };
    
  } catch (error) {
    console.error('❌ Get stats error:', error);
    return { success: false, error: error.message };
  }
});

// ============= GET ALL ESCROW BALANCES FOR PROVIDER =============
// Fetch escrow accounts - subscriptions that can be claimed by providers
ipcMain.handle('get-provider-escrow-balance', async (event, walletAddress) => {
  
  try {
    const programId = new PublicKey(PROGRAM_ID);
    const providerPubkey = new PublicKey(walletAddress);
    
    // Derive provider PDA
    const [providerPda] = PublicKey.findProgramAddressSync(
      [PROVIDER_SEED, providerPubkey.toBuffer()],
      programId
    );
    
    // Get ALL program accounts
    const allAccounts = await connection.getProgramAccounts(programId);
    
    // Find provider account and check if they have nodes
    let hasProvider = false;
    let hasNode = false;
    let myNodeCount = 0;
    let myNodePubkeys = []; // Track our node pubkeys
    let myNodeEndpoints = []; // Track our node endpoints
    let subscriptionAccounts = [];
    let totalSubscriptionEscrow = 0;
    
    // Discriminators
    const SUBSCRIPTION_DISCRIMINATOR = '40071a8766846221';
    
    // First pass: find provider and nodes
    for (const account of allAccounts) {
      const data = account.account.data;
      const size = data.length;
      
      // Check if this is the provider account (has our wallet as authority)
      if (size >= 40 && size < 100) {
        try {
          const authorityKey = new PublicKey(data.slice(8, 40)).toBase58();
          if (authorityKey === walletAddress) {
            hasProvider = true;
          }
        } catch (e) {}
      }
      
      // Check if this is a Node account owned by our provider PDA
      if (size >= 100 && size < 500) {
        try {
          const nodeProviderKey = new PublicKey(data.slice(8, 40)).toBase58();
          if (nodeProviderKey === providerPda.toBase58()) {
            hasNode = true;
            myNodeCount++;
            myNodePubkeys.push(account.pubkey.toBase58());
            
            // Try to extract endpoint from node data
            // Node structure: 8 disc + 32 provider + 8 node_id + string endpoint...
            try {
              const endpointLen = data.readUInt32LE(48);
              if (endpointLen > 0 && endpointLen < 100) {
                const endpoint = data.slice(52, 52 + endpointLen).toString('utf8');
                myNodeEndpoints.push(endpoint);
              }
            } catch (e) {
            }
          }
        } catch (e) {}
      }
      
      // Count subscriptions
      const discriminator = data.slice(0, 8).toString('hex');
      const balance = account.account.lamports;
      if (discriminator === SUBSCRIPTION_DISCRIMINATOR && balance > 1000000) {
        subscriptionAccounts.push({
          pubkey: account.pubkey.toBase58(),
          balance: balance / LAMPORTS_PER_SOL,
          balanceLamports: balance
        });
        totalSubscriptionEscrow += balance;
      }
    }
    
    // ========================================
    // USAGE-BASED REWARD CALCULATION
    // Get sessions from IPFS to calculate fair share
    // ========================================
    let mySessions = 0;
    let totalNetworkSessions = 0;
    let myUsageSeconds = 0;
    let totalNetworkUsageSeconds = 0;
    
    try {
      // Fetch sessions from IPFS
      const fetch = require('node-fetch');
      const IPFS_GATEWAYS = [
        'https://w3s.link/ipfs/',
        'https://gateway.pinata.cloud/ipfs/',
        'https://cf-ipfs.com/ipfs/'
      ];
      
      // Get sessions CID from registry or use known CID
      const SESSIONS_CID = 'bafkreic7h5i4qijwkxjxq6q7j6q4xqxqxq7j6q4x'; // Will try to fetch dynamically
      
      // Try to get sessions from IPFS registry
      let sessions = [];
      for (const gateway of IPFS_GATEWAYS) {
        try {
          // First try to get the sessions registry
          const registryResponse = await fetch(`${gateway}QmWshwhqU236FVSmEA1aKgDeEHZuFebUF7ibJ5an9hn7My`, { timeout: 5000 });
          if (registryResponse.ok) {
            const registry = await registryResponse.json();
            // Get nodes and their providers
            const allNodes = registry.nodes || [];
            
            // Match nodes to this provider by wallet
            const myIPFSNodes = allNodes.filter(n => n.provider === walletAddress);
            myIPFSNodes.forEach(n => {
              if (n.endpoint && !myNodeEndpoints.includes(n.endpoint)) {
                myNodeEndpoints.push(n.endpoint);
              }
            });
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      // Fetch sessions from local indexer if available
      try {
        const indexerResponse = await fetch('http://localhost:3001/api/sessions', { timeout: 3000 });
        if (indexerResponse.ok) {
          sessions = await indexerResponse.json();
        }
      } catch (e) {
      }
      
      // If no sessions from indexer, fetch from IPFS
      if (!sessions || sessions.length === 0) {
        try {
          // First get the latest sessions CID from Pinata
          const pinataResponse = await fetch(
            'https://api.pinata.cloud/data/pinList?status=pinned&metadata[name]=gvpn-sessions&pageLimit=1',
            {
              headers: {
                'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI0ODkyYjA3YS05MWZhLTQxYTYtOWNkYS1kZWY3MWM4ZTAzOTciLCJlbWFpbCI6ImJlc3R0ZWNob25jaGFpbkBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiYzllYjAyODFhODllNjBiY2YwYjgiLCJzY29wZWRLZXlTZWNyZXQiOiJjYTg2ZGQxYmM5OTYxYzIwNDk1Zjg5NDg5OTgzMTk1OTljM2FmYjZmMWEwNDU3MjZjYjE5Y2VlYjM5Yzg1OTQzIiwiZXhwIjoxODAwNjI5ODQ0fQ.av5ETqtwPQE-XyzLFsTXN06qwi6IPn0Ic-YIzwW3Rr0'
              },
              timeout: 5000
            }
          );
          
          if (pinataResponse.ok) {
            const pinData = await pinataResponse.json();
            if (pinData.rows && pinData.rows.length > 0) {
              const latestCID = pinData.rows[0].ipfs_pin_hash;
              
              // Fetch sessions from IPFS gateway
              for (const gateway of IPFS_GATEWAYS) {
                try {
                  const sessionsResponse = await fetch(`${gateway}${latestCID}`, { timeout: 10000 });
                  if (sessionsResponse.ok) {
                    const sessionsData = await sessionsResponse.json();
                    sessions = sessionsData.sessions || [];
                    break;
                  }
                } catch (err) {
                  continue;
                }
              }
            }
          }
        } catch (ipfsErr) {
        }
      }
      
      // Count sessions per node
      if (sessions && sessions.length > 0) {
        totalNetworkSessions = sessions.length;
        
        for (const session of sessions) {
          // Check if session belongs to this provider
          const sessionEndpoint = session.node_endpoint || session.endpoint || '';
          const sessionProvider = session.node_provider || session.provider || '';
          const sessionDuration = session.duration_seconds || session.durationSeconds || 0;
          
          const isMySession = 
            sessionProvider === walletAddress ||
            myNodeEndpoints.some(ep => sessionEndpoint.includes(ep) || ep.includes(sessionEndpoint));
          
          totalNetworkUsageSeconds += sessionDuration;
          
          if (isMySession) {
            mySessions++;
            myUsageSeconds += sessionDuration;
          }
        }
      }
    } catch (e) {
    }
    
    // ========================================
    // CALCULATE FAIR SHARE BASED ON USAGE
    // ========================================
    const treasuryShare = totalSubscriptionEscrow * 0.2;
    const totalProviderPool = totalSubscriptionEscrow * 0.8;
    
    let myShare = 0;
    let shareReason = '';
    
    if (!hasNode) {
      // No on-chain node = no rewards
      myShare = 0;
      shareReason = 'No on-chain node registered';
    } else if (totalNetworkSessions > 0 && mySessions > 0) {
      // Usage-based: your sessions / total sessions
      myShare = totalProviderPool * (mySessions / totalNetworkSessions);
      shareReason = `${mySessions}/${totalNetworkSessions} sessions (${((mySessions/totalNetworkSessions)*100).toFixed(1)}%)`;
    } else if (mySessions === 0 && totalNetworkSessions > 0) {
      // You have node but no sessions = no rewards
      myShare = 0;
      shareReason = '0 sessions served (other nodes served all users)';
    } else {
      // No session data available, fallback to node-based split
      const networkNodeCount = allAccounts.filter(a => a.account.data.length >= 100 && a.account.data.length < 500).length;
      myShare = networkNodeCount > 0 ? (totalProviderPool * myNodeCount / networkNodeCount) : totalProviderPool;
      shareReason = `${myNodeCount}/${networkNodeCount} nodes (no session data)`;
    }
    
    
    return {
      success: true,
      hasProvider: hasProvider,
      hasOnchainNode: hasNode,
      myNodeCount: myNodeCount,
      // Session-based stats
      mySessions: mySessions,
      totalNetworkSessions: totalNetworkSessions,
      myUsageSeconds: myUsageSeconds,
      shareReason: shareReason,
      // Total network subscription escrow
      totalEscrowLamports: totalSubscriptionEscrow,
      totalEscrowSol: totalSubscriptionEscrow / LAMPORTS_PER_SOL,
      // Provider's usage-based share
      providerShareLamports: Math.floor(myShare),
      providerShareSol: myShare / LAMPORTS_PER_SOL,
      treasuryShareLamports: treasuryShare,
      treasuryShareSol: treasuryShare / LAMPORTS_PER_SOL,
      accountCount: subscriptionAccounts.length,
      accounts: subscriptionAccounts,
      networkTotalEscrow: totalSubscriptionEscrow / LAMPORTS_PER_SOL,
      // Important message if no on-chain node
      message: !hasNode 
        ? 'You need to register a node ON-CHAIN (not just IPFS) to claim subscription rewards. Use the Solana program to register your node.'
        : null
    };
    
  } catch (error) {
    console.error('❌ Get escrow balance error:', error);
    return { success: false, error: error.message };
  }
});

// ============= CLAIM SUBSCRIPTION EARNINGS (On-chain) =============
// Provider claims their 80% share from a subscription
ipcMain.handle('claim-subscription-onchain', async (event, { subscriptionUserWallet }) => {
  
  try {
    const { TransactionInstruction, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
    
    // Load provider wallet (for signing)
    const walletPath = path.join(__dirname, '..', 'wallet.json');
    if (!fs.existsSync(walletPath)) {
      throw new Error('Provider wallet not found. Please set up wallet.json');
    }
    
    const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
    const providerWallet = Keypair.fromSecretKey(Uint8Array.from(walletData));
    
    const programId = new PublicKey(PROGRAM_ID);
    
    // Load on-chain config
    const configPath = path.join(__dirname, '..', 'onchain-config.json');
    if (!fs.existsSync(configPath)) {
      throw new Error('On-chain config not found. Run init_onchain.js first.');
    }
    const onchainConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    const providerPda = new PublicKey(onchainConfig.providerPda);
    const nodePda = new PublicKey(onchainConfig.nodePda);
    const treasuryPda = new PublicKey(onchainConfig.treasuryPda);
    
    // Derive subscription PDA for the user
    const userPubkey = new PublicKey(subscriptionUserWallet);
    const [subscriptionPda] = PublicKey.findProgramAddressSync(
      [SUBSCRIPTION_SEED, userPubkey.toBuffer()],
      programId
    );
    
    // Check subscription balance
    const subBalance = await connection.getBalance(subscriptionPda);
    
    if (subBalance === 0) {
      return {
        success: false,
        error: 'No funds in subscription escrow to claim'
      };
    }
    
    // Build claim_subscription instruction
    const discriminator = getDiscriminator('claim_subscription');
    
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: providerWallet.publicKey, isSigner: true, isWritable: true },  // authority
        { pubkey: providerPda, isSigner: false, isWritable: true },               // provider
        { pubkey: nodePda, isSigner: false, isWritable: true },                   // node
        { pubkey: subscriptionPda, isSigner: false, isWritable: true },           // subscription
        { pubkey: treasuryPda, isSigner: false, isWritable: true },               // treasury
      ],
      programId: programId,
      data: discriminator,
    });
    
    const tx = new Transaction().add(instruction);
    const sig = await sendAndConfirmTransaction(connection, tx, [providerWallet]);
    
    const providerShare = (subBalance * 0.8) / LAMPORTS_PER_SOL;
    const treasuryShare = (subBalance * 0.2) / LAMPORTS_PER_SOL;
    
    
    return {
      success: true,
      signature: sig,
      providerShare: providerShare,
      treasuryShare: treasuryShare,
      message: `Claimed! You received ${providerShare.toFixed(6)} SOL (80%)`
    };
    
  } catch (error) {
    console.error('❌ Claim subscription error:', error);
    return { success: false, error: error.message };
  }
});

// ============= ON-CHAIN SESSION MANAGEMENT =============
// Storage for active on-chain sessions
const activeOnchainSessions = new Map();

// Create on-chain session (open_session instruction) - user pays SOL to escrow
ipcMain.handle('create-onchain-session', async (event, { userWallet, nodeEndpoint, minutes, pricePerMinute }) => {
  
  try {
    const { TransactionInstruction, Transaction } = require('@solana/web3.js');
    
    const programId = new PublicKey(PROGRAM_ID);
    const userPubkey = new PublicKey(userWallet);
    
    // Load the on-chain config to get provider/node PDAs
    const configPath = path.join(__dirname, '..', 'onchain-config.json');
    if (!fs.existsSync(configPath)) {
      throw new Error('On-chain config not found. Run init_onchain.js first.');
    }
    const onchainConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    const providerPda = new PublicKey(onchainConfig.providerPda);
    const nodePda = new PublicKey(onchainConfig.nodePda);
    
    // Generate unique session ID
    const sessionId = BigInt(Date.now());
    const sessionIdBuffer = Buffer.alloc(8);
    sessionIdBuffer.writeBigUInt64LE(sessionId);
    
    // Derive session PDA
    const [sessionPda] = PublicKey.findProgramAddressSync(
      [SESSION_SEED, nodePda.toBuffer(), sessionIdBuffer],
      programId
    );
    
    
    // Calculate cost in lamports
    const cost = BigInt(minutes) * BigInt(pricePerMinute);
    
    // Build open_session instruction data
    // Discriminator (8 bytes) + session_id (u64, 8 bytes) + minutes (u32, 4 bytes)
    const discriminator = getDiscriminator('open_session');
    const data = Buffer.alloc(8 + 8 + 4);
    discriminator.copy(data, 0);
    data.writeBigUInt64LE(sessionId, 8);
    data.writeUInt32LE(minutes, 16);
    
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: userPubkey, isSigner: true, isWritable: true },   // user (payer)
        { pubkey: providerPda, isSigner: false, isWritable: true }, // provider
        { pubkey: nodePda, isSigner: false, isWritable: true },     // node
        { pubkey: sessionPda, isSigner: false, isWritable: true },  // session (to create)
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      ],
      programId: programId,
      data: data,
    });
    
    // Create transaction
    const tx = new Transaction().add(instruction);
    tx.feePayer = userPubkey;
    
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    
    // Serialize for signing by Phantom wallet
    const serializedTx = tx.serialize({ requireAllSignatures: false }).toString('base64');
    
    // Store session info for later claiming
    activeOnchainSessions.set(sessionPda.toBase58(), {
      sessionId: sessionId.toString(),
      userWallet,
      nodeEndpoint,
      minutes,
      cost: cost.toString(),
      createdAt: Date.now(),
      nodePda: nodePda.toBase58(),
      providerPda: providerPda.toBase58()
    });
    
    return {
      success: true,
      sessionPda: sessionPda.toBase58(),
      sessionId: sessionId.toString(),
      cost: Number(cost),
      costSol: (Number(cost) / 1e9).toFixed(6),
      serializedTransaction: serializedTx,
      message: `This will escrow ${(Number(cost) / 1e9).toFixed(6)} SOL on-chain for ${minutes} minutes of VPN access`
    };
    
  } catch (error) {
    console.error('❌ Create on-chain session error:', error);
    return { success: false, error: error.message };
  }
});

// Close on-chain session (close_session instruction) - refunds unused time
ipcMain.handle('close-onchain-session', async (event, { userWallet, sessionPda }) => {
  
  try {
    const { TransactionInstruction, Transaction } = require('@solana/web3.js');
    
    const programId = new PublicKey(PROGRAM_ID);
    const userPubkey = new PublicKey(userWallet);
    const sessionPdaPubkey = new PublicKey(sessionPda);
    
    // Load on-chain config
    const configPath = path.join(__dirname, '..', 'onchain-config.json');
    if (!fs.existsSync(configPath)) {
      throw new Error('On-chain config not found');
    }
    const onchainConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const nodePda = new PublicKey(onchainConfig.nodePda);
    
    // Build close_session instruction
    const discriminator = getDiscriminator('close_session');
    
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: userPubkey, isSigner: true, isWritable: true },        // user
        { pubkey: sessionPdaPubkey, isSigner: false, isWritable: true }, // session
        { pubkey: nodePda, isSigner: false, isWritable: true },          // node
      ],
      programId: programId,
      data: discriminator,
    });
    
    // Create transaction
    const tx = new Transaction().add(instruction);
    tx.feePayer = userPubkey;
    
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    
    // Serialize for signing by Phantom wallet
    const serializedTx = tx.serialize({ requireAllSignatures: false }).toString('base64');
    
    // Remove from active sessions
    activeOnchainSessions.delete(sessionPda);
    
    return {
      success: true,
      sessionPda,
      serializedTransaction: serializedTx,
      message: 'Close session to receive refund for unused time'
    };
    
  } catch (error) {
    console.error('❌ Close session error:', error);
    return { success: false, error: error.message };
  }
});

// Get active on-chain sessions for a user
ipcMain.handle('get-active-onchain-sessions', async (event, userWallet) => {
  const userSessions = [];
  for (const [pda, session] of activeOnchainSessions.entries()) {
    if (session.userWallet === userWallet) {
      userSessions.push({ pda, ...session });
    }
  }
  return { success: true, sessions: userSessions };
});