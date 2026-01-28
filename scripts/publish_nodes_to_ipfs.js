#!/usr/bin/env node

/**
 * Publish VPN Nodes to IPFS Network
 * This script announces your VPN nodes to the decentralized IPFS network
 * Run this on each VPN server or centrally to manage all nodes
 */

const { create } = require('ipfs-core');
const fs = require('fs');
const path = require('path');

// Configuration
const NODES_TOPIC = 'dvpn-nodes';
const REPUBLISH_INTERVAL = 5 * 60 * 1000; // Re-announce every 5 minutes

// Your VPN Nodes
const VPN_NODES = [
  {
    pubkey: '31.57.228.54:51820',
    provider: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6',
    node_id: 1,
    endpoint: '31.57.228.54:51820',
    location: 'UAE, Dubai',
    region: 'me-dubai',
    price_per_minute_lamports: 100000,
    wg_server_pubkey: 'YOUR_WG_PUBLIC_KEY_1=',  // Replace with actual WG public key
    max_capacity: 100,
    active_sessions: 0,
    is_active: true,
    reputation_score: 1000,
    features: ['wireguard', 'ipv4', 'ipv6'],
    bandwidth_mbps: 1000,
    latency_ms: 8
  },
  {
    pubkey: '64.227.150.205:41194',
    provider: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6',
    node_id: 2,
    endpoint: '64.227.150.205:41194',
    location: 'INDIA, Bangalore',
    region: 'as-south',
    price_per_minute_lamports: 100000,
    wg_server_pubkey: '8Cb9gEAKpJUWLBPx7s32DYUOIhLPyaFVGsGv93j0nH0=',
    max_capacity: 100,
    active_sessions: 0,
    is_active: true,
    reputation_score: 1000,
    features: ['wireguard', 'ipv4', 'ipv6'],
    bandwidth_mbps: 1000,
    latency_ms: 5
  }
];

let ipfs = null;
let publishedCIDs = [];

// Initialize IPFS node
async function initIPFS() {
  console.log('🚀 Starting IPFS node...');
  console.log('   This may take a minute on first run...\n');
  
  ipfs = await create({
    repo: './ipfs-publisher-data',
    config: {
      Addresses: {
        Swarm: [
          '/ip4/0.0.0.0/tcp/4001',
          '/ip4/0.0.0.0/tcp/4002/ws'
        ]
      },
      Bootstrap: [
        '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
        '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
        '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
        '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt',
        '/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ'
      ]
    }
  });
  
  const { id, agentVersion } = await ipfs.id();
  console.log('✅ IPFS node started successfully!');
  console.log(`   Peer ID: ${id}`);
  console.log(`   Version: ${agentVersion}\n`);
  
  return ipfs;
}

// Publish a single node to IPFS
async function publishNode(nodeData) {
  try {
    // Add timestamp
    const nodeWithTimestamp = {
      ...nodeData,
      published_at: new Date().toISOString(),
      last_update: Date.now()
    };
    
    // Store in IPFS
    const { cid } = await ipfs.add(JSON.stringify(nodeWithTimestamp, null, 2));
    const cidString = cid.toString();
    
    console.log(`📝 Node stored in IPFS:`);
    console.log(`   Endpoint: ${nodeData.endpoint}`);
    console.log(`   Location: ${nodeData.location}`);
    console.log(`   CID: ${cidString}`);
    
    // Announce via PubSub
    const announcement = {
      ...nodeWithTimestamp,
      cid: cidString
    };
    
    await ipfs.pubsub.publish(
      NODES_TOPIC,
      new TextEncoder().encode(JSON.stringify(announcement))
    );
    
    console.log(`📢 Announced to network: ${NODES_TOPIC}\n`);
    
    return cidString;
  } catch (error) {
    console.error(`❌ Failed to publish node ${nodeData.endpoint}:`, error.message);
    return null;
  }
}

// Publish all nodes
async function publishAllNodes() {
  console.log('═══════════════════════════════════════════════');
  console.log('   Publishing Nodes to IPFS Network');
  console.log('═══════════════════════════════════════════════\n');
  
  publishedCIDs = [];
  
  for (const node of VPN_NODES) {
    const cid = await publishNode(node);
    if (cid) {
      publishedCIDs.push({ endpoint: node.endpoint, cid });
    }
    // Small delay between announcements
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('═══════════════════════════════════════════════');
  console.log(`   ✅ Published ${publishedCIDs.length}/${VPN_NODES.length} nodes`);
  console.log('═══════════════════════════════════════════════\n');
  
  // Save CIDs to file
  const cidsFile = path.join(__dirname, 'published-nodes.json');
  fs.writeFileSync(cidsFile, JSON.stringify({
    published_at: new Date().toISOString(),
    nodes: publishedCIDs
  }, null, 2));
  
  console.log(`💾 CIDs saved to: ${cidsFile}\n`);
}

// Monitor IPFS network
async function monitorNetwork() {
  console.log('👀 Monitoring IPFS network for other nodes...\n');
  
  await ipfs.pubsub.subscribe(NODES_TOPIC, (msg) => {
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.data));
      const isOwnNode = VPN_NODES.some(n => n.endpoint === data.endpoint);
      
      if (!isOwnNode) {
        console.log(`📨 Discovered peer node: ${data.endpoint} (${data.location})`);
      }
    } catch (err) {
      // Ignore malformed messages
    }
  });
}

// Get network stats
async function getNetworkStats() {
  try {
    const peers = await ipfs.swarm.peers();
    const topics = await ipfs.pubsub.ls();
    
    console.log('\n📊 Network Statistics:');
    console.log(`   Connected Peers: ${peers.length}`);
    console.log(`   Active Topics: ${topics.length}`);
    console.log(`   Subscribed to: ${NODES_TOPIC}`);
    
    return { peers: peers.length, topics: topics.length };
  } catch (error) {
    console.error('Error getting stats:', error.message);
    return null;
  }
}

// Main function
async function main() {
  console.clear();
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║   DVPN - IPFS Node Publisher                 ║');
  console.log('║   Decentralized VPN Node Discovery           ║');
  console.log('╚═══════════════════════════════════════════════╝\n');
  
  try {
    // Initialize IPFS
    await initIPFS();
    
    // Publish nodes initially
    await publishAllNodes();
    
    // Start monitoring
    await monitorNetwork();
    
    // Show stats
    await getNetworkStats();
    
    // Keep alive and republish periodically
    console.log(`\n🔄 Will re-announce nodes every ${REPUBLISH_INTERVAL / 60000} minutes`);
    console.log('   Press Ctrl+C to stop\n');
    
    setInterval(async () => {
      console.log(`\n⏰ ${new Date().toLocaleTimeString()} - Re-announcing nodes...`);
      await publishAllNodes();
      await getNetworkStats();
    }, REPUBLISH_INTERVAL);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down...');
  if (ipfs) {
    console.log('   Stopping IPFS node...');
    await ipfs.stop();
  }
  console.log('   Goodbye! 👋\n');
  process.exit(0);
});

// Run
main().catch(console.error);
