const { contextBridge, ipcRenderer } = require('electron');

// Mock Phantom wallet for testing in Electron
const mockWallet = {
  isPhantom: true,
  publicKey: null,
  connect: async () => {
    // Use the actual wallet address from testing
    mockWallet.publicKey = {
      toString: () => '5wm7gTHTFEGsZm6oMgsk84tqh4twVYrVGCSkPKPv8Pyo',
      toBase58: () => '5wm7gTHTFEGsZm6oMgsk84tqh4twVYrVGCSkPKPv8Pyo'
    };
    return { publicKey: mockWallet.publicKey };
  },
  disconnect: async () => {
    mockWallet.publicKey = null;
  },
  signMessage: async (message) => {
    return new Uint8Array(64).fill(1); // Mock signature
  }
};

// Expose mock Phantom wallet
contextBridge.exposeInMainWorld('solana', mockWallet);

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  // Node discovery
  fetchNodes: (indexerUrl, filters) => 
    ipcRenderer.invoke('fetch-nodes', { indexerUrl, filters }),
  
  // Session management
  createSession: (sessionData) => 
    ipcRenderer.invoke('create-session', { sessionData }),
  
  // WireGuard operations
  generateWgKeys: () => 
    ipcRenderer.invoke('generate-wg-keys'),
  
  requestWgConfig: (serverIp, port) =>
    ipcRenderer.invoke('request-wg-config', { serverIp, port }),
  
  authWithNode: (nodeEndpoint, authData) => 
    ipcRenderer.invoke('auth-with-node', { nodeEndpoint, authData }),
  
  applyWgConfig: (config) => 
    ipcRenderer.invoke('apply-wg-config', { config }),
  
  disconnectVpn: (presharedKey, serverIp) => 
    ipcRenderer.invoke('disconnect-vpn', { presharedKey, serverIp }),
  
  getVpnStatus: () => 
    ipcRenderer.invoke('get-vpn-status'),
  
  // Utilities
  openExternal: (url) => 
    ipcRenderer.invoke('open-external', url)
});
