// Guard VPN - Renderer Process
// UI Logic and interactions

// Settings
const settings = {
  indexerUrl: 'http://localhost:8080',
  rpcUrl: 'https://api.testnet.solana.com'
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
  'KR': '🇰🇷', 'South Korea': '🇰🇷',
  'BR': '🇧🇷', 'Brazil': '🇧🇷',
  'MX': '🇲🇽', 'Mexico': '🇲🇽'
};

// State
let state = {
  nodes: [],
  connected: false,
  selectedNode: null,
  connectionTime: 0,
  timerInterval: null,
  downloadSpeed: 0,
  uploadSpeed: 0,
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initializeUI();
  loadNodesFromIndexer();
  setupEventListeners();
  drawWorldMap();
  startConnectionTimer();
  updateSpeedStats();
});

// Load nodes from indexer
async function loadNodesFromIndexer() {
  const locationsList = document.getElementById('locationsList');
  locationsList.innerHTML = '<div style="padding: 20px; color: #8A8A8A; text-align: center;">Loading nodes...</div>';
  
  try {
    console.log('Fetching nodes from:', settings.indexerUrl);
    const response = await fetch(`${settings.indexerUrl}/nodes`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    const nodes = data.nodes || [];
    
    console.log(`Loaded ${nodes.length} nodes from indexer`);
    
    if (nodes.length === 0) {
      locationsList.innerHTML = '<div style="padding: 20px; color: #8A8A8A; text-align: center;">No nodes available.<br><br>Start the indexer service:<br><code style="color: #00D4AA;">node scripts/mock_indexer.js</code></div>';
      showToast('No nodes found. Please start the indexer service.', 'error');
      return;
    }
    
    // Transform nodes to location format
    state.nodes = nodes.map(node => {
      const region = node.region || 'US';
      const city = node.city || node.location || node.endpoint?.split(':')[0] || 'Unknown';
      
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
        price_per_gb: node.price_per_gb || 100000,
        reputation: node.reputation_score || 1000,
        node: node
      };
    });
    
    // Auto-select first node
    if (state.nodes.length > 0) {
      state.selectedNode = state.nodes[0];
    }
    
    populateLocations();
    updateCurrentLocation();
    showToast(`Loaded ${state.nodes.length} available node(s)`, 'success');
    
  } catch (error) {
    console.error('Failed to load nodes:', error);
    locationsList.innerHTML = `<div style="padding: 20px; color: #FF4D4D; text-align: center;">❌ Error loading nodes<br><br>${error.message}<br><br>Make sure the indexer is running:<br><code style="color: #00D4AA;">node scripts/mock_indexer.js</code></div>`;
    showToast('Failed to load nodes: ' + error.message, 'error');
  }
}

// Get country name from region code
function getCountryName(region) {
  const countryNames = {
    'US': 'United States',
    'USA': 'United States',
    'DE': 'Germany',
    'GB': 'United Kingdom',
    'UK': 'United Kingdom',
    'CA': 'Canada',
    'AU': 'Australia',
    'NL': 'Netherlands',
    'SG': 'Singapore',
    'IN': 'India',
    'FR': 'France',
    'JP': 'Japan',
    'KR': 'South Korea',
    'BR': 'Brazil',
    'MX': 'Mexico'
  };
  
  return countryNames[region] || countryNames[region.toUpperCase()] || region;
}

// Initialize UI
function initializeUI() {
  updateConnectionStatus();
  updateCurrentLocation();
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
    
    // Show bandwidth tier indicator
    const bandwidthDots = '●'.repeat(location.bandwidth || 1);
    
    locationItem.innerHTML = `
      <span class="location-flag">${location.flag}</span>
      <div class="location-details">
        <div class="location-name">${location.country}</div>
        <div class="location-city">${location.city}</div>
      </div>
      <div class="location-status">
        <div class="status-badge ${location.available ? 'available' : ''} ${location.connected ? 'connected' : ''}" title="${location.available ? 'Available' : 'Offline'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        ${location.available && !location.connected ? `
          <div class="status-badge available" title="Bandwidth: ${location.bandwidth || 1}" style="font-size: 10px; width: auto; padding: 0 6px;">
            ${bandwidthDots}
          </div>
        ` : ''}
      </div>
    `;
    
    locationItem.addEventListener('click', () => selectLocation(index));
    locationsList.appendChild(locationItem);
  });
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
  const pricePerGB = (node.price_per_gb / 1000000).toFixed(4);
  showToast(`Selected ${node.country} - ${node.city} (${pricePerGB} SOL/GB)`, 'success');
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
  document.getElementById('popupFlag').textContent = location.flag;
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
  document.getElementById('premiumBtn').addEventListener('click', () => {
    showToast('Premium features coming soon!', 'success');
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

// Toggle VPN connection
function toggleConnection() {
  if (state.connected) {
    disconnect();
  } else {
    connect();
  }
}

// Connect to VPN
function connect() {
  if (!state.selectedNode) {
    showToast('Please select a node first', 'error');
    return;
  }
  
  const statusCircle = document.getElementById('statusCircle');
  const statusText = document.getElementById('statusText');
  
  // Show connecting state
  statusCircle.classList.remove('disconnected');
  statusCircle.classList.add('connecting');
  statusText.textContent = 'Connecting...';
  
  console.log('Connecting to node:', state.selectedNode.endpoint);
  
  // Simulate connection delay
  setTimeout(() => {
    state.connected = true;
    state.connectionTime = 0;
    statusCircle.classList.remove('connecting');
    statusCircle.classList.add('connected');
    statusText.textContent = 'Connected';
    
    // Update nodes as connected
    state.nodes.forEach(node => node.connected = false);
    state.selectedNode.connected = true;
    populateLocations();
    
    // Show connection line and server marker
    document.getElementById('serverMarker').classList.add('visible');
    document.getElementById('connectionLine').classList.add('active');
    document.getElementById('locationPopup').classList.add('visible');
    
    // Update connection line position
    updateConnectionLine();
    
    showToast(`Connected to ${state.selectedNode.country} - ${state.selectedNode.city}!`, 'success');
  }, 2000);
}

// Disconnect from VPN
function disconnect() {
  const statusCircle = document.getElementById('statusCircle');
  const statusText = document.getElementById('statusText');
  
  state.connected = false;
  statusCircle.classList.remove('connected', 'connecting');
  statusCircle.classList.add('disconnected');
  statusText.textContent = 'Disconnected';
  
  // Hide connection indicators
  document.getElementById('serverMarker').classList.remove('visible');
  document.getElementById('connectionLine').classList.remove('active');
  document.getElementById('locationPopup').classList.remove('visible');
  
  // Update nodes
  state.nodes.forEach(node => node.connected = false);
  populateLocations();
  
  showToast('Disconnected from VPN', 'success');
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
    statusIp.textContent = '100.100.212.32';
  } else {
    statusCircle.classList.add('disconnected');
    statusCircle.classList.remove('connected');
    statusText.textContent = 'Disconnected';
    statusIp.textContent = '100.100.212.32';
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
      document.getElementById('connectionTimer').textContent = '00:00:00';
    }
  }, 1000);
}

// Update speed stats
function updateSpeedStats() {
  setInterval(() => {
    if (state.connected) {
      // Simulate speed fluctuation
      state.downloadSpeed = (49 + Math.random() * 10).toFixed(2);
      state.uploadSpeed = (35 + Math.random() * 8).toFixed(2);
      
      document.getElementById('downloadSpeed').textContent = `${state.downloadSpeed}/Mbps`;
      document.getElementById('uploadSpeed').textContent = `${state.uploadSpeed}/Mbps`;
    } else {
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
  const container = document.querySelector('.connection-indicator').getBoundingClientRect();
  
  const x1 = clientRect.left + clientRect.width / 2 - container.left;
  const y1 = clientRect.top + clientRect.height / 2 - container.top;
  const x2 = serverRect.left + serverRect.width / 2 - container.left;
  const y2 = serverRect.top + serverRect.height / 2 - container.top;
  
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
