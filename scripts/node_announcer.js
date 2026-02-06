#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DVPN Node Announcer
 * 
 * Publishes node availability to IPFS PubSub for decentralized discovery
 * Run alongside node_daemon_server.js on VPN nodes
 * ═══════════════════════════════════════════════════════════════════════════
 */

const IPFS = require('ipfs-core');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  // IPFS topic for node announcements
  pubsubTopic: process.env.IPFS_TOPIC || 'gvpn-nodes-v1',
  
  // Announcement interval (30 seconds)
  announceIntervalMs: parseInt(process.env.ANNOUNCE_INTERVAL_MS) || 30000,
  
  // Node info (from environment or config file)
  nodeConfigFile: process.env.NODE_CONFIG || path.join(__dirname, '..', 'onchain-config.json'),
  
  // IPFS repo location
  ipfsRepo: process.env.IPFS_REPO || './ipfs-node-announcer',
  
  // Bootstrap nodes
  ipfsBootstrap: [
    '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
    '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
    '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
    '/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ'
  ]
};

// State
let ipfs = null;
let nodeInfo = null;
let announceInterval = null;

/**
 * Load node configuration
 */
function loadNodeConfig() {
  // Try environment variables first
  if (process.env.NODE_PUBKEY && process.env.NODE_ENDPOINT) {
    return {
      pubkey: process.env.NODE_PUBKEY,
      endpoint: process.env.NODE_ENDPOINT,
      region: process.env.NODE_REGION || 'unknown',
      pricePerMinute: parseInt(process.env.NODE_PRICE_LAMPORTS) || 100000,
      wgServerPubkey: process.env.WG_SERVER_PUBKEY || '',
      maxCapacity: parseInt(process.env.NODE_CAPACITY) || 100,
      provider: process.env.PROVIDER_PUBKEY || ''
    };
  }
  
  // Try config file
  if (fs.existsSync(CONFIG.nodeConfigFile)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG.nodeConfigFile, 'utf8'));
      return {
        pubkey: config.nodePubkey || config.NODE_PUBKEY,
        endpoint: config.endpoint || config.NODE_ENDPOINT,
        region: config.region || config.NODE_REGION || 'unknown',
        pricePerMinute: config.pricePerMinute || config.NODE_PRICE_LAMPORTS || 100000,
        wgServerPubkey: config.wgServerPubkey || config.WG_SERVER_PUBKEY || '',
        maxCapacity: config.maxCapacity || config.NODE_CAPACITY || 100,
        provider: config.provider || config.PROVIDER_PUBKEY || ''
      };
    } catch (e) {
      console.error('❌ Failed to load node config:', e.message);
    }
  }
  
  console.error('❌ No node configuration found!');
  console.error('   Set NODE_PUBKEY, NODE_ENDPOINT, NODE_REGION environment variables');
  console.error('   Or create config file at:', CONFIG.nodeConfigFile);
  process.exit(1);
}

/**
 * Initialize IPFS node
 */
async function initIPFS() {
  console.log('🌐 Starting IPFS node for announcements...');
  
  ipfs = await IPFS.create({
    repo: CONFIG.ipfsRepo,
    start: true,
    config: {
      Bootstrap: CONFIG.ipfsBootstrap,
      Addresses: {
        Swarm: [
          '/ip4/0.0.0.0/tcp/4002',
          '/ip4/0.0.0.0/tcp/4003/ws'
        ]
      }
    },
    EXPERIMENTAL: {
      pubsub: true
    }
  });
  
  const { id, agentVersion } = await ipfs.id();
  console.log(`   ✅ IPFS started: ${id.substring(0, 16)}...`);
  console.log(`   • Agent: ${agentVersion}`);
  console.log(`   • Topic: ${CONFIG.pubsubTopic}`);
  
  return ipfs;
}

/**
 * Announce node to the network
 */
async function announceNode() {
  if (!ipfs || !nodeInfo) return;
  
  const announcement = {
    // Node identification
    pubkey: nodeInfo.pubkey,
    provider: nodeInfo.provider,
    
    // Connection info
    endpoint: nodeInfo.endpoint,
    region: nodeInfo.region,
    
    // Pricing
    pricePerMinute: nodeInfo.pricePerMinute,
    
    // Capacity
    maxCapacity: nodeInfo.maxCapacity,
    
    // WireGuard
    wgServerPubkey: nodeInfo.wgServerPubkey,
    
    // Metadata
    timestamp: Date.now(),
    version: '1.0',
    isActive: true
  };
  
  try {
    // Publish to PubSub
    await ipfs.pubsub.publish(
      CONFIG.pubsubTopic,
      new TextEncoder().encode(JSON.stringify(announcement))
    );
    
    console.log(`📡 Announced: ${nodeInfo.endpoint} (${nodeInfo.region})`);
    
  } catch (error) {
    console.error('❌ Announcement failed:', error.message);
  }
}

/**
 * Start periodic announcements
 */
function startAnnouncing() {
  // Announce immediately
  announceNode();
  
  // Then announce periodically
  announceInterval = setInterval(announceNode, CONFIG.announceIntervalMs);
  
  console.log(`🔄 Announcing every ${CONFIG.announceIntervalMs / 1000}s`);
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  console.log('\n🛑 Shutting down...');
  
  if (announceInterval) {
    clearInterval(announceInterval);
  }
  
  if (ipfs) {
    // Send final "going offline" announcement
    try {
      const offlineAnnouncement = {
        pubkey: nodeInfo?.pubkey,
        isActive: false,
        timestamp: Date.now(),
        version: '1.0'
      };
      
      await ipfs.pubsub.publish(
        CONFIG.pubsubTopic,
        new TextEncoder().encode(JSON.stringify(offlineAnnouncement))
      );
    } catch (e) {
      // Ignore
    }
    
    await ipfs.stop();
  }
  
  console.log('👋 Goodbye');
  process.exit(0);
}

/**
 * Main
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   DVPN Node Announcer - Decentralized Discovery');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  
  // Load configuration
  nodeInfo = loadNodeConfig();
  console.log('📋 Node Configuration:');
  console.log(`   • Pubkey: ${nodeInfo.pubkey?.substring(0, 16)}...`);
  console.log(`   • Endpoint: ${nodeInfo.endpoint}`);
  console.log(`   • Region: ${nodeInfo.region}`);
  console.log(`   • Price: ${nodeInfo.pricePerMinute} lamports/min`);
  console.log('');
  
  // Initialize IPFS
  await initIPFS();
  console.log('');
  
  // Start announcing
  startAnnouncing();
  
  // Handle shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  
  console.log('');
  console.log('✅ Node announcer running. Press Ctrl+C to stop.');
  console.log('');
}

// Run
main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
