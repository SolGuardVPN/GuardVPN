// Guard VPN - Complete Renderer with Full Functionality
// Combines new UI with old VPN connection logic

// Settings
const settings = {
  indexerUrl: 'http://localhost:8080',
  rpcUrl: 'https://api.testnet.solana.com',
  programId: '8LQKwvHJPdK6fKmopXmUwct8JjVGQhf3RFQd64nCV39i',
  providerWallet: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6'
};

// Country flags mapping
const countryFlags = {
  'US': '🇺🇸', 'USA': '🇺🇸', 'United States': '🇺🇸',
  'DE': '🇩🇪', 'Germany': '🇩🇪',
  'GB': '🇬🇧', 'UK': '🇬🇧', 'United Kingdom': '🇬🇧',
  'CA': '🇨🇦', 'Canada': '🇨🇦',
  'AU': '🇦🇺', 'Australia': '🇦🇺',
  'NL': '🇳🇱', 'Netherlands': '🇳🇱',
  'SG': '🇸🇬', 'Singapore': '🇸🇬',
  'IN': '🇮🇳', 'India': '🇮🇳',
  'FR': '🇫🇷', 'France': '🇫🇷',
  'JP': '🇯🇵', 'Japan': '🇯🇵',
  'local': '🏠', 'nyc': '🇺🇸'
};

// State
let state = {
  nodes: [],
  connected: false,
  selectedNode: null,
  currentSession: null,
  connectionTime: 0,
  timerInterval: null,
  downloadSpeed: 0,
  uploadSpeed: 0,
  subscriptionType: 'hourly', // 'hourly', 'weekly', 'monthly'
  wallet: null,
  walletAddress: null,
  paymentTimer: null
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initializeUI();
  loadNodesFromIndexer();
  setupEventListeners();
  drawWorldMap();
  startConnectionTimer();
  updateSpeedStats();
  loadSettings();
});

// Load settings
function loadSettings() {
  const saved = localStorage.getItem('dvpn_settings');
  if (saved) {
    Object.assign(settings, JSON.parse(saved));
  }
  
  const savedWallet = localStorage.getItem('dvpn_wallet');
  if (savedWallet) {
    state.walletAddress = savedWallet;
  }
}

// Initialize UI
function initializeUI() {
  updateConnectionStatus();
  updateCurrentLocation();
  updateSubscriptionUI();
}

// Load nodes from indexer
async function loadNodesFromIndexer() {
  const locationsList = document.getElementById('locationsList');
  locationsList.innerHTML = '<div style="padding: 20px; color: #8A8A8A; text-align: center;">Loading nodes...</div>';
  
  try {
    
    // Add timeout to fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${settings.indexerUrl}/nodes`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    const nodes = data.nodes || [];
    
    
    if (nodes.length === 0) {
      locationsList.innerHTML = `
        <div style="padding: 20px; color: #8A8A8A; text-align: center;">
          No nodes available.<br><br>
          <button onclick="loadNodesFromIndexer()" style="padding: 10px 20px; background: #00D4AA; border: none; border-radius: 8px; color: #0A0A0A; cursor: pointer; font-weight: 600;">
            Retry
          </button>
        </div>`;
      showToast('No nodes found. Click Retry or start indexer.', 'error');
      return;
    }
    
    // Transform nodes to location format
    state.nodes = nodes.map(node => {
      const region = node.region || 'US';
      const city = node.city || node.location || extractCityFromEndpoint(node.endpoint) || 'Unknown';
      
      return {
        pubkey: node.pubkey,
        country: getCountryName(region),
        city: city,
        flag: countryFlags[region] || countryFlags[region.toUpperCase()] || '🌐',
        region: region,
        available: node.is_active !== false,
        connected: false,
        endpoint: node.endpoint,
        bandwidth: node.bandwidth_tier || 1,
        price_per_minute: node.price_per_minute_lamports || 1000000,
        price_per_gb: node.price_per_gb || 100000,
        reputation: node.reputation_score || 1000,
        wg_pubkey: node.wg_server_pubkey,
        provider: node.provider,
        node: node
      };
    });
    
    // Auto-select first node
    if (state.nodes.length > 0) {
      state.selectedNode = state.nodes[0];
    }
    
    populateLocations();
    updateCurrentLocation();
    showToast(`✅ Loaded ${state.nodes.length} available node(s)`, 'success');
    
  } catch (error) {
    console.error('Failed to load nodes:', error);
    
    let errorMessage = error.message;
    if (error.name === 'AbortError') {
      errorMessage = 'Connection timeout';
    } else if (error.message.includes('fetch')) {
      errorMessage = 'Cannot connect to indexer';
    }
    
    locationsList.innerHTML = `
      <div style="padding: 20px; color: #FF4D4D; text-align: center;">
        ❌ Error loading nodes<br><br>
        <div style="color: #8A8A8A; font-size: 14px; margin: 10px 0;">${errorMessage}</div>
        <div style="margin: 20px 0; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px; font-size: 13px; color: #00D4AA;">
          Make sure the indexer is running:<br>
          <code style="display: block; margin-top: 10px; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 4px;">node scripts/mock_indexer.js</code>
        </div>
        <button onclick="loadNodesFromIndexer()" style="padding: 10px 20px; background: #00D4AA; border: none; border-radius: 8px; color: #0A0A0A; cursor: pointer; font-weight: 600;">
          Retry Connection
        </button>
      </div>`;
    showToast('Failed to load nodes. Click Retry.', 'error');
  }
}

// Make loadNodesFromIndexer available globally for retry button
window.loadNodesFromIndexer = loadNodesFromIndexer;

function extractCityFromEndpoint(endpoint) {
  if (!endpoint) return 'Unknown';
  const ip = endpoint.split(':')[0];
  if (ip.startsWith('192.168') || ip.startsWith('10.')) return 'Local';
  return ip;
}

// Get country name from region code
function getCountryName(region) {
  const countryNames = {
    'US': 'United States', 'USA': 'United States',
    'DE': 'Germany', 'GB': 'United Kingdom', 'UK': 'United Kingdom',
    'CA': 'Canada', 'AU': 'Australia', 'NL': 'Netherlands',
    'SG': 'Singapore', 'IN': 'India', 'FR': 'France',
    'JP': 'Japan', 'KR': 'South Korea', 'BR': 'Brazil',
    'MX': 'Mexico', 'local': 'Local Network', 'nyc': 'New York'
  };
  
  return countryNames[region] || countryNames[region?.toUpperCase()] || region || 'Unknown';
}

// Populate locations list
function populateLocations() {
  const locationsList = document.getElementById('locationsList');
  locationsList.innerHTML = '';
  
  if (state.nodes.length === 0) {
    locationsList.innerHTML = '<div style="padding: 20px; color: #8A8A8A; text-align: center;">No nodes available</div>';
    return;
  }
  
  state.nodes.forEach((location, index) => {
    const locationItem = document.createElement('div');
    locationItem.className = `location-item ${location.connected ? 'connected' : ''}`;
    locationItem.dataset.index = index;
    
    const price = calculateSubscriptionPrice(location);
    const priceText = formatPrice(price);
    
    locationItem.innerHTML = `
      <span class="location-flag">${location.flag}</span>
      <div class="location-details">
        <div class="location-name">${location.country}</div>
        <div class="location-city">${location.city} • ${priceText}</div>
      </div>
      <div class="location-status">
        <div class="status-badge ${location.available ? 'available' : ''} ${location.connected ? 'connected' : ''}" title="${location.available ? 'Available' : 'Offline'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
      </div>
    `;
    
    locationItem.addEventListener('click', () => selectLocation(index));
    locationsList.appendChild(locationItem);
  });
}

// Calculate subscription price
function calculateSubscriptionPrice(node) {
  const SOL_USD_RATE = 100; // $100 per SOL
  
  switch(state.subscriptionType) {
    case 'monthly':
      // $30 per month
      return Math.floor((30 / SOL_USD_RATE) * 1e9);
    
    case 'weekly':
      // $10 per week
      return Math.floor((10 / SOL_USD_RATE) * 1e9);
    
    case 'hourly':
    default:
      // Use node's base rate for hourly
      const pricePerMinute = node.price_per_minute || 1000000;
      return pricePerMinute * 60;
  }
}

// Format price
function formatPrice(lamports) {
  const sol = lamports / 1e9;
  if (state.subscriptionType === 'monthly') {
    return `${sol.toFixed(2)} SOL/mo`;
  } else if (state.subscriptionType === 'weekly') {
    return `${sol.toFixed(2)} SOL/wk`;
  } else {
    return `${sol.toFixed(4)} SOL/hr`;
  }
}

// Select location
function selectLocation(index) {
  if (index < 0 || index >= state.nodes.length) return;
  
  state.selectedNode = state.nodes[index];
  
  // Update UI
  document.querySelectorAll('.location-item').forEach((item, i) => {
    item.classList.toggle('active', i === index);
  });
  
  updateCurrentLocation();
  
  const node = state.nodes[index];
  const price = calculateSubscriptionPrice(node);
  const priceText = formatPrice(price);
  showToast(`Selected ${node.country} - ${node.city} (${priceText})`, 'success');
}

// Update current location display
function updateCurrentLocation() {
  if (!state.selectedNode) return;
  
  const location = state.selectedNode;
  document.getElementById('currentFlag').textContent = location.flag;
  document.getElementById('currentCountry').textContent = location.country;
  document.getElementById('currentCity').textContent = state.connected ? 
    `${location.city}, ${location.country}` : 
    `${location.city}`;
  
  // Update popup on map
  const popupFlag = document.getElementById('popupFlag');
  if (popupFlag) popupFlag.textContent = location.flag;
  document.getElementById('popupCountry').textContent = location.country;
  document.getElementById('popupCity').textContent = location.city;
}

// Setup event listeners
function setupEventListeners() {
  // Status circle click to connect/disconnect
  document.getElementById('statusCircle').addEventListener('click', toggleConnection);
  
  // Current location card click
  document.getElementById('currentLocationCard').addEventListener('click', () => {
    showToast('Select a location from the list', 'success');
  });
  
  // Premium button
  const premiumBtn = document.getElementById('premiumBtn');
  if (premiumBtn) {
    premiumBtn.addEventListener('click', showSubscriptionModal);
  }
  
  // Refresh nodes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F5' || (e.metaKey && e.key === 'r')) {
      e.preventDefault();
      loadNodesFromIndexer();
    }
  });
  
  // Search functionality
  document.getElementById('searchLocation').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    document.querySelectorAll('.location-item').forEach(item => {
      const country = item.querySelector('.location-name').textContent.toLowerCase();
      const city = item.querySelector('.location-city').textContent.toLowerCase();
      const matches = country.includes(query) || city.includes(query);
      item.style.display = matches ? 'flex' : 'none';
    });
  });
  
  // Nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      const tab = item.dataset.tab;
      showToast(`Switched to ${tab} tab`, 'success');
    });
  });
}

// Show subscription modal
function showSubscriptionModal() {
  const modal = document.createElement('div');
  modal.className = 'subscription-modal';
  modal.innerHTML = `
    <div class="modal-overlay" onclick="this.parentElement.remove()"></div>
    <div class="modal-content">
      <h2 style="margin-bottom: 20px; color: #00D4AA;">Select Subscription Plan</h2>
      
      <div class="subscription-options">
        <div class="subscription-card ${state.subscriptionType === 'hourly' ? 'active' : ''}" onclick="selectSubscription('hourly')">
          <div class="subscription-icon">⏱️</div>
          <h3>Hourly</h3>
          <div class="subscription-price">~0.06 SOL/hr</div>
          <p>Pay as you go</p>
        </div>
        
        <div class="subscription-card ${state.subscriptionType === 'weekly' ? 'active' : ''}" onclick="selectSubscription('weekly')">
          <div class="subscription-icon">📅</div>
          <h3>Weekly</h3>
          <div class="subscription-price">0.10 SOL/wk</div>
          <p>~$10 per week</p>
        </div>
        
        <div class="subscription-card ${state.subscriptionType === 'monthly' ? 'active' : ''}" onclick="selectSubscription('monthly')">
          <div class="subscription-icon">📆</div>
          <h3>Monthly</h3>
          <div class="subscription-price">0.30 SOL/mo</div>
          <p>~$30 per month</p>
          <div class="subscription-badge">BEST VALUE</div>
        </div>
      </div>
      
      <button class="btn-primary" onclick="this.closest('.subscription-modal').remove()" style="margin-top: 30px;">Done</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Add styles if not exists
  if (!document.getElementById('subscription-modal-styles')) {
    const style = document.createElement('style');
    style.id = 'subscription-modal-styles';
    style.textContent = `
      .subscription-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .modal-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(4px);
      }
      .modal-content {
        position: relative;
        background: #1C1C1C;
        border: 1px solid #2A2A2A;
        border-radius: 16px;
        padding: 40px;
        max-width: 800px;
        width: 90%;
        z-index: 1;
      }
      .subscription-options {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 20px;
      }
      .subscription-card {
        background: rgba(255, 255, 255, 0.03);
        border: 2px solid #2A2A2A;
        border-radius: 12px;
        padding: 30px 20px;
        text-align: center;
        cursor: pointer;
        transition: all 0.3s ease;
        position: relative;
      }
      .subscription-card:hover {
        border-color: #00D4AA;
        background: rgba(0, 212, 170, 0.05);
        transform: translateY(-4px);
      }
      .subscription-card.active {
        border-color: #00D4AA;
        background: rgba(0, 212, 170, 0.1);
      }
      .subscription-icon {
        font-size: 48px;
        margin-bottom: 15px;
      }
      .subscription-card h3 {
        font-size: 20px;
        margin-bottom: 10px;
        color: #FFFFFF;
      }
      .subscription-price {
        font-size: 24px;
        font-weight: 600;
        color: #00D4AA;
        margin-bottom: 10px;
      }
      .subscription-card p {
        color: #8A8A8A;
        font-size: 14px;
      }
      .subscription-badge {
        position: absolute;
        top: -10px;
        right: -10px;
        background: #00D4AA;
        color: #0A0A0A;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.5px;
      }
      .btn-primary {
        width: 100%;
        padding: 16px;
        background: #00D4AA;
        border: none;
        border-radius: 12px;
        color: #0A0A0A;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
      }
      .btn-primary:hover {
        background: #00B893;
      }
    `;
    document.head.appendChild(style);
  }
}

// Select subscription
window.selectSubscription = function(type) {
  state.subscriptionType = type;
  updateSubscriptionUI();
  populateLocations();
  showToast(`Changed to ${type} plan`, 'success');
  
  // Update active state in modal
  document.querySelectorAll('.subscription-card').forEach(card => {
    card.classList.remove('active');
  });
  event.currentTarget.classList.add('active');
};

// Update subscription UI
function updateSubscriptionUI() {
  // Update any subscription indicators
}

// Toggle VPN connection
async function toggleConnection() {
  if (state.connected) {
    await disconnect();
  } else {
    await connect();
  }
}

// Connect to VPN
async function connect() {
  if (!state.selectedNode) {
    showToast('Please select a node first', 'error');
    return;
  }
  
  const statusCircle = document.getElementById('statusCircle');
  const statusText = document.getElementById('statusText');
  
  try {
    // Show connecting state
    statusCircle.classList.remove('disconnected');
    statusCircle.classList.add('connecting');
    statusText.textContent = 'Connecting...';
    
    
    // Calculate payment amount based on subscription type
    const paymentAmount = calculateSubscriptionPrice(state.selectedNode);
    
    // Process payment
    showToast(`Processing payment: ${formatPrice(paymentAmount)}...`, 'success');
    
    const paymentSuccess = await processPayment(
      state.selectedNode.provider || settings.providerWallet,
      paymentAmount
    );
    
    if (!paymentSuccess) {
      throw new Error('Payment failed');
    }
    
    // Connect via Electron IPC if available
    if (window.electron && window.electron.connectVpn) {
      const wgConfig = {
        endpoint: state.selectedNode.endpoint,
        serverPubkey: state.selectedNode.wg_pubkey,
        presharedKey: generatePresharedKey()
      };
      
      const result = await window.electron.connectVpn(wgConfig);
      
      if (!result.success) {
        throw new Error(result.error || 'Connection failed');
      }
      
      state.currentSession = {
        node: state.selectedNode,
        startTime: Date.now(),
        clientIp: result.clientIp || '10.0.1.17',
        presharedKey: wgConfig.presharedKey,
        totalPaid: paymentAmount
      };
    } else {
      // Mock connection for browser preview
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      state.currentSession = {
        node: state.selectedNode,
        startTime: Date.now(),
        clientIp: '10.0.1.17',
        presharedKey: 'mock_key',
        totalPaid: paymentAmount
      };
    }
    
    // Update state
    state.connected = true;
    state.connectionTime = 0;
    statusCircle.classList.remove('connecting');
    statusCircle.classList.add('connected');
    statusText.textContent = 'Connected';
    
    // Update nodes as connected
    state.nodes.forEach(node => node.connected = false);
    state.selectedNode.connected = true;
    populateLocations();
    
    // Show connection visuals
    document.getElementById('serverMarker').classList.add('visible');
    document.getElementById('connectionLine').classList.add('active');
    const popup = document.getElementById('locationPopup');
    if (popup) popup.classList.add('visible');
    
    updateConnectionLine();
    
    // Start payment monitoring for hourly plans
    if (state.subscriptionType === 'hourly') {
      startPaymentMonitoring();
    }
    
    showToast(`Connected to ${state.selectedNode.country} - ${state.selectedNode.city}!`, 'success');
    
  } catch (error) {
    console.error('Connection failed:', error);
    statusCircle.classList.remove('connecting');
    statusCircle.classList.add('disconnected');
    statusText.textContent = 'Disconnected';
    showToast(`Connection failed: ${error.message}`, 'error');
  }
}

// Process payment
async function processPayment(recipientAddress, amountLamports) {
  try {
    const recipient = recipientAddress || settings.providerWallet;
    
    // Use Electron IPC for real payments
    if (window.electron && window.electron.processPayment && window.testKeypair) {
      const result = await window.electron.processPayment({
        fromKeypair: window.testKeypair.secretKey,
        toAddress: recipient,
        amountLamports: amountLamports
      });
      
      if (result.success) {
        return true;
      } else {
        console.error('❌ Payment failed:', result.error);
        return false;
      }
    }
    
    // Fallback to mock payment
    await new Promise(resolve => setTimeout(resolve, 1500));
    return true;
    
  } catch (error) {
    console.error('❌ Payment error:', error);
    return false;
  }
}

// Generate preshared key
function generatePresharedKey() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Start payment monitoring (for hourly plans)
function startPaymentMonitoring() {
  if (state.subscriptionType !== 'hourly') return;
  
  // Pay every hour
  state.paymentTimer = setInterval(async () => {
    if (!state.connected || !state.selectedNode) {
      stopPaymentMonitoring();
      return;
    }
    
    const amount = calculateSubscriptionPrice(state.selectedNode);
    showToast('Processing hourly payment...', 'success');
    
    const success = await processPayment(
      state.selectedNode.provider || settings.providerWallet,
      amount
    );
    
    if (!success) {
      showToast('Hourly payment failed. Disconnecting...', 'error');
      await disconnect();
    } else {
      state.currentSession.totalPaid += amount;
      showToast('Hourly payment successful', 'success');
    }
  }, 3600000); // 1 hour
}

// Stop payment monitoring
function stopPaymentMonitoring() {
  if (state.paymentTimer) {
    clearInterval(state.paymentTimer);
    state.paymentTimer = null;
  }
}

// Disconnect from VPN
async function disconnect() {
  const statusCircle = document.getElementById('statusCircle');
  const statusText = document.getElementById('statusText');
  
  try {
    statusText.textContent = 'Disconnecting...';
    
    stopPaymentMonitoring();
    
    // Disconnect via Electron IPC if available
    if (window.electron && window.electron.disconnectVpn) {
      const result = await window.electron.disconnectVpn(
        state.currentSession?.presharedKey,
        state.selectedNode?.endpoint?.split(':')[0]
      );
      
      if (!result.success) {
        console.error('Disconnect warning:', result.error);
      }
    }
    
    state.connected = false;
    state.currentSession = null;
    statusCircle.classList.remove('connected', 'connecting');
    statusCircle.classList.add('disconnected');
    statusText.textContent = 'Disconnected';
    
    // Hide connection indicators
    document.getElementById('serverMarker').classList.remove('visible');
    document.getElementById('connectionLine').classList.remove('active');
    const popup = document.getElementById('locationPopup');
    if (popup) popup.classList.remove('visible');
    
    // Update nodes
    state.nodes.forEach(node => node.connected = false);
    populateLocations();
    
    showToast('Disconnected from VPN', 'success');
    
  } catch (error) {
    console.error('Disconnect error:', error);
    showToast(`Disconnect error: ${error.message}`, 'error');
  }
}

// Update connection status
function updateConnectionStatus() {
  const statusCircle = document.getElementById('statusCircle');
  const statusText = document.getElementById('statusText');
  const statusIp = document.getElementById('statusIp');
  
  if (state.connected) {
    statusCircle.classList.add('connected');
    statusCircle.classList.remove('disconnected');
    statusText.textContent = 'Connected';
    statusIp.textContent = state.currentSession?.clientIp || '100.100.212.32';
  } else {
    statusCircle.classList.add('disconnected');
    statusCircle.classList.remove('connected');
    statusText.textContent = 'Disconnected';
    statusIp.textContent = '---';
  }
}

// Connection timer
function startConnectionTimer() {
  setInterval(() => {
    if (state.connected) {
      state.connectionTime++;
      const hours = Math.floor(state.connectionTime / 3600);
      const minutes = Math.floor((state.connectionTime % 3600) / 60);
      const seconds = state.connectionTime % 60;
      
      const timerText = [hours, minutes, seconds]
        .map(v => v.toString().padStart(2, '0'))
        .join(':');
      
      document.getElementById('connectionTimer').textContent = timerText;
    } else {
      state.connectionTime = 0;
      document.getElementById('connectionTimer').textContent = '00:00:00';
    }
  }, 1000);
}

// Update speed stats
function updateSpeedStats() {
  setInterval(() => {
    if (state.connected) {
      // Simulate speed fluctuation
      state.downloadSpeed = (45 + Math.random() * 15).toFixed(2);
      state.uploadSpeed = (30 + Math.random() * 10).toFixed(2);
      
      document.getElementById('downloadSpeed').textContent = `${state.downloadSpeed}/Mbps`;
      document.getElementById('uploadSpeed').textContent = `${state.uploadSpeed}/Mbps`;
    } else {
      state.downloadSpeed = 0;
      state.uploadSpeed = 0;
      document.getElementById('downloadSpeed').textContent = '0.00/Mbps';
      document.getElementById('uploadSpeed').textContent = '0.00/Mbps';
    }
  }, 2000);
}

// Draw world map
function drawWorldMap() {
  const canvas = document.getElementById('mapCanvas');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  
  // Draw simple world map dots
  ctx.fillStyle = '#2A2A2A';
  
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const size = Math.random() * 2;
    
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Draw continents outlines (simplified)
  ctx.strokeStyle = '#2A2A2A';
  ctx.lineWidth = 2;
  
  // North America
  ctx.beginPath();
  ctx.moveTo(canvas.width * 0.15, canvas.height * 0.3);
  ctx.quadraticCurveTo(canvas.width * 0.2, canvas.height * 0.2, canvas.width * 0.28, canvas.height * 0.35);
  ctx.quadraticCurveTo(canvas.width * 0.25, canvas.height * 0.5, canvas.width * 0.2, canvas.height * 0.55);
  ctx.stroke();
  
  // Europe/Africa
  ctx.beginPath();
  ctx.moveTo(canvas.width * 0.45, canvas.height * 0.28);
  ctx.quadraticCurveTo(canvas.width * 0.5, canvas.height * 0.35, canvas.width * 0.48, canvas.height * 0.5);
  ctx.quadraticCurveTo(canvas.width * 0.5, canvas.height * 0.65, canvas.width * 0.48, canvas.height * 0.75);
  ctx.stroke();
  
  // Asia/Australia
  ctx.beginPath();
  ctx.moveTo(canvas.width * 0.6, canvas.height * 0.25);
  ctx.quadraticCurveTo(canvas.width * 0.75, canvas.height * 0.3, canvas.width * 0.8, canvas.height * 0.4);
  ctx.quadraticCurveTo(canvas.width * 0.85, canvas.height * 0.55, canvas.width * 0.82, canvas.height * 0.7);
  ctx.stroke();
}

// Update connection line between markers
function updateConnectionLine() {
  const clientMarker = document.getElementById('clientMarker');
  const serverMarker = document.getElementById('serverMarker');
  const connectionLine = document.getElementById('connectionLine');
  
  if (!clientMarker || !serverMarker || !connectionLine) return;
  
  const clientRect = clientMarker.getBoundingClientRect();
  const serverRect = serverMarker.getBoundingClientRect();
  const container = document.querySelector('.connection-indicator');
  if (!container) return;
  
  const containerRect = container.getBoundingClientRect();
  
  const x1 = clientRect.left + clientRect.width / 2 - containerRect.left;
  const y1 = clientRect.top + clientRect.height / 2 - containerRect.top;
  const x2 = serverRect.left + serverRect.width / 2 - containerRect.left;
  const y2 = serverRect.top + serverRect.height / 2 - containerRect.top;
  
  const line = connectionLine.querySelector('line');
  if (line) {
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
  }
}

// Show toast notification
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Handle window resize
window.addEventListener('resize', () => {
  drawWorldMap();
  if (state.connected) {
    updateConnectionLine();
  }
});
