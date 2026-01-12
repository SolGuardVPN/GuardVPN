// DVPN Client - Renderer Process
// This file handles UI logic and communicates with the main process

// Import Solana libraries (loaded via CDN in index.html)
// const { Connection, PublicKey, Keypair, SystemProgram, Transaction } = window.solanaWeb3;
// const { AnchorProvider, Program, BN } = window.anchor;

// State
let state = {
  wallet: null,
  walletAddress: null,
  connection: null,
  program: null,
  selectedNode: null,
  currentSession: null,
  wgKeys: null,
  connected: false,
  paymentTimer: null,
  balanceCheckTimer: null,
  settings: {
    indexerUrl: 'http://localhost:8080',
    rpcUrl: 'https://api.testnet.solana.com',
    programId: '8LQKwvHJPdK6fKmopXmUwct8JjVGQhf3RFQd64nCV39i',
    providerWallet: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6' // Provider wallet to receive payments
  }
};

// Load settings from localStorage
function loadSettings() {
  const saved = localStorage.getItem('dvpn_settings');
  if (saved) {
    state.settings = { ...state.settings, ...JSON.parse(saved) };
    document.getElementById('indexerUrl').value = state.settings.indexerUrl;
    document.getElementById('rpcUrl').value = state.settings.rpcUrl;
    document.getElementById('programId').value = state.settings.programId;
  }
}

// Save settings to localStorage
function saveSettings() {
  state.settings = {
    indexerUrl: document.getElementById('indexerUrl').value,
    rpcUrl: document.getElementById('rpcUrl').value,
    programId: document.getElementById('programId').value
  };
  localStorage.setItem('dvpn_settings', JSON.stringify(state.settings));
  showToast('Settings saved', 'success');
}

// Initialize app
async function init() {
  loadSettings();
  setupEventListeners();
  await loadNodes();
  await checkVpnStatus();
  setInterval(checkVpnStatus, 5000); // Check VPN status every 5 seconds
}

// Setup event listeners
function setupEventListeners() {
  // Wallet connection
  document.getElementById('connectWalletBtn').addEventListener('click', connectWallet);
  
  // VPN connection
  document.getElementById('connectBtn').addEventListener('click', toggleVpnConnection);
  
  // Node refresh
  document.getElementById('refreshNodesBtn').addEventListener('click', loadNodes);
  
  // Region filter
  document.getElementById('regionFilter').addEventListener('change', loadNodes);
  
  // Settings
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  
  // Navigation
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.currentTarget.dataset.tab;
      switchTab(tab);
    });
  });
  
  // Modal
  document.querySelector('.modal-close').addEventListener('click', closeModal);
  document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
}

// Switch tabs
function switchTab(tab) {
  // Update nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  
  // Show section
  document.querySelector('.nodes-section').style.display = tab === 'nodes' ? 'block' : 'none';
  document.querySelector('.sessions-section').style.display = tab === 'sessions' ? 'block' : 'none';
  document.querySelector('.settings-section').style.display = tab === 'settings' ? 'block' : 'none';
  
  if (tab === 'sessions') {
    loadSessions();
  }
}

// Connect Wallet (Phantom detection)
async function connectWallet() {
  try {
    // Check if Phantom is installed
    if (!window.solana || !window.solana.isPhantom) {
      showModal('Install Phantom Wallet', 
        'Please install Phantom wallet extension from <a href="https://phantom.app" target="_blank">phantom.app</a>',
        false
      );
      return;
    }
    
    // Connect
    const resp = await window.solana.connect();
    state.walletAddress = resp.publicKey.toString();
    
    // Update UI
    document.getElementById('connectWalletBtn').style.display = 'none';
    document.getElementById('walletInfo').style.display = 'flex';
    document.getElementById('walletAddress').textContent = 
      state.walletAddress.slice(0, 4) + '...' + state.walletAddress.slice(-4);
    
    // Enable connect button
    document.getElementById('connectBtn').disabled = false;
    
    // Get balance
    await updateBalance();
    
    showToast('Wallet connected', 'success');
  } catch (error) {
    console.error('Wallet connection failed:', error);
    showToast('Failed to connect wallet', 'error');
  }
}

// Update wallet balance
async function updateBalance() {
  try {
    const response = await fetch(`${state.settings.rpcUrl}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [state.walletAddress]
      })
    });
    
    const data = await response.json();
    const balanceLamports = data.result.value;
    const balance = (balanceLamports / 1e9).toFixed(4);
    document.getElementById('walletBalance').textContent = `${balance} SOL`;
    return balanceLamports;
  } catch (error) {
    console.error('Failed to fetch balance:', error);
    return 0;
  }
}

// Check if user has sufficient balance for 1 hour
async function checkSufficientBalance(node) {
  const balanceLamports = await updateBalance();
  const pricePerHour = node.price_per_minute_lamports * 60; // Price for 1 hour
  const requiredBalance = pricePerHour + 5000; // Add 5000 lamports for transaction fees
  
  if (balanceLamports < requiredBalance) {
    const balanceSOL = (balanceLamports / 1e9).toFixed(4);
    const requiredSOL = (requiredBalance / 1e9).toFixed(4);
    throw new Error(`Insufficient balance. You have ${balanceSOL} SOL but need ${requiredSOL} SOL for 1 hour`);
  }
  
  return true;
}

// Load nodes from indexer
async function loadNodes() {
  const container = document.getElementById('nodesContainer');
  container.innerHTML = '<div class="loading">Loading nodes...</div>';
  
  try {
    const region = document.getElementById('regionFilter').value;
    const result = await window.electron.fetchNodes(state.settings.indexerUrl, {
      region: region || undefined,
      minReputation: 500,
      limit: 50
    });
    
    if (!result.success) {
      throw new Error(result.error);
    }
    
    const nodes = result.nodes;
    
    if (nodes.length === 0) {
      container.innerHTML = '<div class="loading">No nodes available</div>';
      return;
    }
    
    container.innerHTML = '';
    nodes.forEach(node => {
      const card = createNodeCard(node);
      container.appendChild(card);
    });
  } catch (error) {
    console.error('Failed to load nodes:', error);
    container.innerHTML = `<div class="loading">Error: ${error.message}</div>`;
  }
}

// Create node card element
function createNodeCard(node) {
  const card = document.createElement('div');
  card.className = 'node-card';
  card.dataset.nodeId = node.pubkey;
  
  const reputation = (node.reputation_score || 1000) / 10; // 0-100 scale
  const pricePerHour = (node.price_per_minute_lamports * 60 / 1e9).toFixed(4);
  
  card.innerHTML = `
    <div class="node-header">
      <div>
        <div class="node-endpoint">${node.endpoint || 'N/A'}</div>
      </div>
      <div class="node-region">${node.region || 'Unknown'}</div>
    </div>
    <div class="reputation">
      <div class="reputation-bar">
        <div class="reputation-fill" style="width: ${reputation}%"></div>
      </div>
      <span>${reputation.toFixed(0)}%</span>
    </div>
    <div class="node-stats">
      <div class="stat">
        <span class="stat-label">Price/Hour</span>
        <span class="stat-value">${pricePerHour} SOL</span>
      </div>
      <div class="stat">
        <span class="stat-label">Capacity</span>
        <span class="stat-value">${node.active_sessions}/${node.max_capacity || '∞'}</span>
      </div>
    </div>
  `;
  
  card.addEventListener('click', () => selectNode(node, card));
  
  return card;
}

// Select node
function selectNode(node, cardElement) {
  state.selectedNode = node;
  
  // Update UI
  document.querySelectorAll('.node-card').forEach(c => c.classList.remove('selected'));
  cardElement.classList.add('selected');
  
  // Enable connect button if wallet connected
  if (state.walletAddress) {
    document.getElementById('connectBtn').disabled = false;
  }
}

// Toggle VPN connection
async function toggleVpnConnection() {
  if (state.connected) {
    await disconnectVpn();
  } else {
    await connectVpn();
  }
}

// Connect to VPN
async function connectVpn() {
  if (!state.walletAddress) {
    showToast('Please connect wallet first', 'error');
    return;
  }
  
  if (!state.selectedNode) {
    showToast('Please select a node', 'error');
    return;
  }
  
  try {
    updateStatus('connecting', 'Checking balance...');
    document.getElementById('connectBtn').disabled = true;
    
    // Check if user has sufficient balance for 1 hour
    console.log('Checking balance for 1 hour payment...');
    await checkSufficientBalance(state.selectedNode);
    
    console.log('Starting VPN connection to:', state.selectedNode);
    updateStatus('connecting', 'Connecting...');
    
    // Use pre-configured keys and settings
    showToast('Connecting VPN...', 'info');
    console.log('Using stable WireGuard configuration...');
    
    const wgConfig = `[Interface]
PrivateKey = WE3ursrx1mFfhimFWqsj+Mvs2fqeFBdpvdfHGNStuH0=
Address = 10.0.1.17/24
DNS = 8.8.8.8, 8.8.4.4

[Peer]
PublicKey = ${state.selectedNode.wg_server_pubkey}
Endpoint = ${state.selectedNode.endpoint}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
`;
    
    console.log('Applying WireGuard config...');
    const applyResult = await window.electron.applyWgConfig(wgConfig);
    console.log('Apply result:', applyResult);
    
    if (!applyResult.success) {
      throw new Error(applyResult.error);
    }
    
    // Success!
    state.connected = true;
    state.currentSession = {
      sessionPda: 'session_' + Date.now(),
      sessionId: Date.now(),
      node: state.selectedNode,
      startTime: Date.now(),
      duration: 60 * 60 * 1000,
      clientIp: '10.0.1.17',
      presharedKey: null,
      totalPaid: 0
    };
    
    console.log('VPN connected successfully!', state.currentSession);
    
    saveSessionToStorage();
    updateStatus('connected', 'Connected');
    updateConnectionDetails();
    startSessionTimer();
    startPaymentMonitoring(); // Start payment detection and balance checking
    
    document.getElementById('connectBtn').textContent = 'Disconnect';
    document.getElementById('connectBtn').classList.add('connected');
    document.getElementById('connectBtn').disabled = false;
    
    showToast(`Connected! Your IP: ${state.selectedNode.endpoint.split(':')[0]}`, 'success');
  } catch (error) {
    console.error('Connection failed:', error);
    console.error('Error stack:', error.stack);
    updateStatus('disconnected', 'Disconnected');
    document.getElementById('connectBtn').disabled = false;
    showToast(`Connection failed: ${error.message}`, 'error');
  }
}

// Disconnect VPN
async function disconnectVpn() {
  try {
    updateStatus('connecting', 'Disconnecting...');
    document.getElementById('connectBtn').disabled = true;
    
    // Stop payment monitoring
    stopPaymentMonitoring();
    
    // Get preshared key and server IP from current session
    const presharedKey = state.currentSession?.presharedKey;
    const serverIp = state.selectedNode?.endpoint?.split(':')[0];
    
    // Disconnect WireGuard
    const result = await window.electron.disconnectVpn(presharedKey, serverIp);
    if (!result.success) {
      throw new Error(result.error);
    }
    
    // Close session on-chain (optional, for refund)
    if (state.currentSession) {
      try {
        await closeSessionOnChain(state.currentSession.sessionPda);
      } catch (error) {
        console.error('Failed to close session on-chain:', error);
      }
    }
    
    state.connected = false;
    state.currentSession = null;
    clearSessionFromStorage();
    
    updateStatus('disconnected', 'Disconnected');
    document.getElementById('connectionDetails').style.display = 'none';
    document.getElementById('connectBtn').textContent = 'Connect to VPN';
    document.getElementById('connectBtn').classList.remove('connected');
    document.getElementById('connectBtn').disabled = false;
    
    showToast('Disconnected from VPN', 'success');
  } catch (error) {
    console.error('Disconnect failed:', error);
    showToast(`Disconnect failed: ${error.message}`, 'error');
    document.getElementById('connectBtn').disabled = false;
  }
}

// Update status indicator
function updateStatus(status, text) {
  const indicator = document.getElementById('statusIndicator');
  const dot = indicator.querySelector('.status-dot');
  const statusText = document.getElementById('statusText');
  
  dot.className = `status-dot ${status}`;
  statusText.textContent = text;
}

// Update connection details
function updateConnectionDetails() {
  if (state.currentSession) {
    document.getElementById('connectionDetails').style.display = 'block';
    document.getElementById('connectedNode').textContent = state.currentSession.node.endpoint;
    document.getElementById('connectedRegion').textContent = state.currentSession.node.region;
    document.getElementById('sessionId').textContent = 
      state.currentSession.sessionPda.slice(0, 8) + '...';
  }
}

// Start session timer
function startSessionTimer() {
  const timer = setInterval(() => {
    if (!state.currentSession || !state.connected) {
      clearInterval(timer);
      return;
    }
    
    const elapsed = Date.now() - state.currentSession.startTime;
    const remaining = state.currentSession.duration - elapsed;
    
    if (remaining <= 0) {
      // Check balance before auto-renewing
      handleSessionExpiry();
      clearInterval(timer);
      return;
    }
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    document.getElementById('timeRemaining').textContent = 
      `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, 1000);
}

// Start payment monitoring - deduct payment every 5 minutes and check balance after 1 hour
function startPaymentMonitoring() {
  console.log('Starting payment monitoring...');
  
  // Payment deduction every 5 minutes
  state.paymentTimer = setInterval(async () => {
    if (!state.connected || !state.currentSession) {
      clearInterval(state.paymentTimer);
      return;
    }
    
    try {
      const elapsed = Date.now() - state.currentSession.startTime;
      const minutesElapsed = Math.floor(elapsed / 60000);
      const paymentAmount = state.selectedNode.price_per_minute_lamports * 5; // 5 minutes worth
      
      console.log(`Deducting payment: ${minutesElapsed} minutes elapsed, ${(paymentAmount / 1e9).toFixed(6)} SOL`);
      
      // Send payment to provider wallet
      await sendPaymentToProvider(paymentAmount);
      
      state.currentSession.totalPaid += paymentAmount;
      showToast(`Payment sent: ${(paymentAmount / 1e9).toFixed(4)} SOL`, 'info');
      
    } catch (error) {
      console.error('Payment failed:', error);
      showToast('Payment failed, disconnecting...', 'error');
      disconnectVpn();
    }
  }, 5 * 60 * 1000); // Every 5 minutes
  
  // Balance check after 1 hour
  state.balanceCheckTimer = setTimeout(async () => {
    await handleSessionExpiry();
  }, 60 * 60 * 1000); // After 1 hour
}

// Handle session expiry - check balance and decide to renew or disconnect
async function handleSessionExpiry() {
  console.log('Session expired, checking balance for renewal...');
  
  try {
    // Check if user has balance for another hour
    await checkSufficientBalance(state.selectedNode);
    
    // User has sufficient balance, extend session for another hour
    console.log('Balance sufficient, extending session for another hour');
    state.currentSession.startTime = Date.now();
    state.currentSession.duration = 60 * 60 * 1000;
    saveSessionToStorage();
    
    // Restart timers
    startSessionTimer();
    startPaymentMonitoring();
    
    showToast('Session extended for 1 hour', 'success');
    
  } catch (error) {
    console.log('Insufficient balance for renewal, disconnecting...');
    showToast('Insufficient balance. Disconnecting...', 'error');
    await disconnectVpn();
  }
}

// Send payment to provider wallet
async function sendPaymentToProvider(amountLamports) {
  console.log(`Sending ${(amountLamports / 1e9).toFixed(6)} SOL to provider...`);
  
  try {
    // In a real implementation, this would create and send a Solana transaction
    // For now, we simulate it
    const response = await fetch(`${state.settings.rpcUrl}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [state.walletAddress]
      })
    });
    
    const data = await response.json();
    const currentBalance = data.result.value;
    
    if (currentBalance < amountLamports) {
      throw new Error('Insufficient balance for payment');
    }
    
    console.log('Payment simulated successfully');
    await updateBalance();
    
    // In production, this would be:
    // const transaction = new Transaction().add(
    //   SystemProgram.transfer({
    //     fromPubkey: state.walletAddress,
    //     toPubkey: new PublicKey(state.settings.providerWallet),
    //     lamports: amountLamports
    //   })
    // );
    // await state.wallet.sendTransaction(transaction);
    
  } catch (error) {
    console.error('Payment error:', error);
    throw error;
  }
}

// Stop payment monitoring
function stopPaymentMonitoring() {
  if (state.paymentTimer) {
    clearInterval(state.paymentTimer);
    state.paymentTimer = null;
  }
  if (state.balanceCheckTimer) {
    clearTimeout(state.balanceCheckTimer);
    state.balanceCheckTimer = null;
  }
  console.log('Payment monitoring stopped');
}

// Check VPN status
async function checkVpnStatus() {
  const result = await window.electron.getVpnStatus();
  if (result.success && result.connected && !state.connected) {
    // VPN is connected but we lost state (app restart?)
    // Try to restore from localStorage
    restoreSessionFromStorage();
  }
}

// Helper functions for blockchain operations
async function calculateSessionPDA(userPubkey, nodePubkey, sessionId) {
  // This is a simplified version - in production, use @solana/web3.js
  // For now, return a placeholder
  return 'SESSION_PDA_' + sessionId;
}

async function createSessionTransaction(sessionPda, sessionId, minutes) {
  // This would create the actual transaction
  // For now, return a mock transaction
  return { transaction: 'mock_tx' };
}

async function confirmTransaction(signature) {
  // Wait for transaction confirmation
  await new Promise(resolve => setTimeout(resolve, 2000));
}

async function closeSessionOnChain(sessionPda) {
  // Close session on-chain
  console.log('Closing session:', sessionPda);
}

function generateWgConfig(serverConfig) {
  return `
[Interface]
PrivateKey = ${state.wgKeys.privateKey}
Address = ${serverConfig.clientIp}/32
DNS = 1.1.1.1

[Peer]
PublicKey = ${serverConfig.serverWgPubkey}
Endpoint = ${serverConfig.endpoint}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
  `.trim();
}

// Session storage
function saveSessionToStorage() {
  if (state.currentSession) {
    localStorage.setItem('dvpn_session', JSON.stringify(state.currentSession));
  }
}

function clearSessionFromStorage() {
  localStorage.removeItem('dvpn_session');
}

function restoreSessionFromStorage() {
  const saved = localStorage.getItem('dvpn_session');
  if (saved) {
    state.currentSession = JSON.parse(saved);
    state.connected = true;
    updateStatus('connected', 'Connected');
    updateConnectionDetails();
    startSessionTimer();
    document.getElementById('connectBtn').textContent = 'Disconnect';
    document.getElementById('connectBtn').classList.add('connected');
  }
}

// Load sessions
async function loadSessions() {
  const container = document.getElementById('sessionsContainer');
  container.innerHTML = '<div class="loading">Loading sessions...</div>';
  
  if (!state.walletAddress) {
    container.innerHTML = '<div class="loading">Please connect wallet</div>';
    return;
  }
  
  try {
    const response = await fetch(
      `${state.settings.indexerUrl}/sessions?user=${state.walletAddress}`
    );
    const sessions = await response.json();
    
    if (sessions.length === 0) {
      container.innerHTML = '<div class="loading">No sessions found</div>';
      return;
    }
    
    container.innerHTML = '';
    sessions.forEach(session => {
      const card = createSessionCard(session);
      container.appendChild(card);
    });
  } catch (error) {
    console.error('Failed to load sessions:', error);
    container.innerHTML = `<div class="loading">Error: ${error.message}</div>`;
  }
}

// Create session card
function createSessionCard(session) {
  const card = document.createElement('div');
  card.className = 'session-card';
  
  const status = session.state || 'unknown';
  const startDate = new Date(session.start_ts * 1000).toLocaleString();
  
  card.innerHTML = `
    <div class="session-header">
      <div>
        <strong>Session ${session.session_id}</strong>
        <div style="font-size: 0.875rem; color: var(--text-secondary);">
          Started: ${startDate}
        </div>
      </div>
      <span class="session-status ${status.toLowerCase()}">${status}</span>
    </div>
    <div class="node-stats">
      <div class="stat">
        <span class="stat-label">Escrow</span>
        <span class="stat-value">${(session.escrow_lamports / 1e9).toFixed(4)} SOL</span>
      </div>
      <div class="stat">
        <span class="stat-label">Data Used</span>
        <span class="stat-value">${formatBytes(session.bytes_used || 0)}</span>
      </div>
    </div>
  `;
  
  return card;
}

// Utility functions
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showToast(message, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${message}`);
  // In production, implement a proper toast notification system
}

function showModal(title, body, showFooter = true) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = body;
  document.querySelector('.modal-footer').style.display = showFooter ? 'flex' : 'none';
  document.getElementById('modalOverlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
