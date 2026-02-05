const { contextBridge, ipcRenderer } = require('electron');

// Mock Phantom wallet for testing in Electron (fallback if real Phantom not available)
const mockWallet = {
  isPhantom: true,
  isMock: true, // Flag to indicate this is a mock
  publicKey: null,
  _listeners: {},
  
  connect: async () => {
    const walletAddress = '7WF4zwWvFVtg1WYcohirvb4CDTRtjFqjyF3ytSqJ7R8F';
    
    mockWallet.publicKey = {
      toString: () => walletAddress,
      toBase58: () => walletAddress
    };
    return { publicKey: mockWallet.publicKey };
  },
  
  disconnect: async () => {
    mockWallet.publicKey = null;
  },
  
  signMessage: async (message) => {
    return new Uint8Array(64).fill(1); // Mock signature
  },
  
  on: (event, callback) => {
    if (!mockWallet._listeners[event]) {
      mockWallet._listeners[event] = [];
    }
    mockWallet._listeners[event].push(callback);
  },
  
  removeListener: (event, callback) => {
    if (mockWallet._listeners[event]) {
      mockWallet._listeners[event] = mockWallet._listeners[event].filter(cb => cb !== callback);
    }
  }
};

// Check if we're in a browser context where Phantom might be available
// In Electron, we'll expose the mock wallet
// Note: Real Phantom extension won't work in Electron by default
contextBridge.exposeInMainWorld('solana', mockWallet);

// Expose test keypair (will be loaded from main process if needed)
contextBridge.exposeInMainWorld('testKeypair', null);

// Show a console message about wallet mode
window.addEventListener('DOMContentLoaded', () => {
});

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
  
  // Payment processing
  authWithNode: (nodeEndpoint, authData) => 
    ipcRenderer.invoke('auth-with-node', { nodeEndpoint, authData }),
  
  applyWgConfig: (config) => 
    ipcRenderer.invoke('apply-wg-config', { config }),
  
  connectVpn: (vpnData) =>
    ipcRenderer.invoke('apply-wg-config', { config: vpnData }),
  
  disconnectVpn: (presharedKey, serverIp) => 
    ipcRenderer.invoke('disconnect-vpn', { presharedKey, serverIp }),
  
  getVpnStatus: () => 
    ipcRenderer.invoke('get-vpn-status'),
  
  // Wallet operations - Mock/Fallback
  connectWallet: () =>
    ipcRenderer.invoke('connect-wallet'),
  
  // Phantom Wallet operations
  connectPhantomWallet: () =>
    ipcRenderer.invoke('connect-phantom-wallet'),
  
  disconnectPhantomWallet: () =>
    ipcRenderer.invoke('disconnect-phantom-wallet'),
  
  phantomSignMessage: (message) =>
    ipcRenderer.invoke('phantom-sign-message', { message }),
  
  phantomSignTransaction: (transaction) =>
    ipcRenderer.invoke('phantom-sign-transaction', { transaction }),
  
  getPhantomStatus: () =>
    ipcRenderer.invoke('get-phantom-status'),
  
  // Listen for Phantom callbacks
  onPhantomCallback: (callback) =>
    ipcRenderer.on('phantom-callback', (event, data) => callback(data)),
  
  processPayment: (paymentData) => 
    ipcRenderer.invoke('process-payment-wallet', paymentData),
  
  // Utilities
  openExternal: (url) => 
    ipcRenderer.invoke('open-external', url),
  
  // IPFS operations
  initIPFS: () =>
    ipcRenderer.invoke('init-ipfs'),
  
  getNodesFromIPFS: (region) =>
    ipcRenderer.invoke('get-nodes-from-ipfs', region),
  
  // Provider operations
  registerProvider: () =>
    ipcRenderer.invoke('register-provider'),
  
  getProviderData: (walletPubkey) =>
    ipcRenderer.invoke('get-provider-data', walletPubkey),
  
  registerNode: (nodeData) =>
    ipcRenderer.invoke('register-node', nodeData),
  
  // Register node via Phantom wallet (opens browser for signing)
  registerNodePhantom: (nodeData) =>
    ipcRenderer.invoke('register-node-phantom', nodeData),
  
  // Submit signed transaction from Phantom
  submitSignedTransaction: (signedTxBase64) =>
    ipcRenderer.invoke('submit-signed-transaction', signedTxBase64),
  
  // Save wallet keypair for on-chain operations
  saveWalletKeypair: (privateKey, walletAddress) =>
    ipcRenderer.invoke('save-wallet-keypair', { privateKey, walletAddress }),
  
  // Subscription operations
  createSubscription: (subscriptionData) =>
    ipcRenderer.invoke('create-subscription', subscriptionData),
  
  cancelSubscription: (walletAddress) =>
    ipcRenderer.invoke('cancel-subscription', walletAddress),
  
  checkSubscription: (walletAddress) =>
    ipcRenderer.invoke('check-subscription', walletAddress),
  
  // Network mode switching (devnet/mainnet)
  switchNetwork: (networkMode) =>
    ipcRenderer.invoke('switch-network', networkMode),
  
  getNetworkMode: () =>
    ipcRenderer.invoke('get-network-mode'),
  
  // Persistent subscription storage
  saveSubscription: (subscription) =>
    ipcRenderer.invoke('save-subscription', subscription),
  
  loadSubscription: (walletAddress) =>
    ipcRenderer.invoke('load-subscription', walletAddress),
  
  clearSubscription: () =>
    ipcRenderer.invoke('clear-subscription'),
  
  // On-chain claim earnings (calls smart contract)
  claimEarningsOnchain: (walletAddress, sessionPDA) =>
    ipcRenderer.invoke('claim-earnings-onchain', { walletAddress, sessionPDA }),
  
  // Get on-chain provider stats
  getOnchainProviderStats: (walletAddress) =>
    ipcRenderer.invoke('get-onchain-provider-stats', walletAddress),
  
  // Get all escrow balances for provider (subscription-based rewards)
  getProviderEscrowBalance: (walletAddress) =>
    ipcRenderer.invoke('get-provider-escrow-balance', walletAddress),
  
  // Claim subscription earnings (80% to provider, 20% to treasury)
  claimSubscriptionOnchain: (subscriptionUserWallet) =>
    ipcRenderer.invoke('claim-subscription-onchain', { subscriptionUserWallet }),
  
  // On-chain session management - for REAL SOL escrow
  createOnchainSession: (userWallet, nodeEndpoint, minutes, pricePerMinute) =>
    ipcRenderer.invoke('create-onchain-session', { userWallet, nodeEndpoint, minutes, pricePerMinute }),
  
  closeOnchainSession: (userWallet, sessionPda) =>
    ipcRenderer.invoke('close-onchain-session', { userWallet, sessionPda }),
  
  getActiveOnchainSessions: (userWallet) =>
    ipcRenderer.invoke('get-active-onchain-sessions', userWallet),
  
  // Check on-chain subscription status
  checkOnChainSubscription: (walletAddress) =>
    ipcRenderer.invoke('check-onchain-subscription', walletAddress)
});
