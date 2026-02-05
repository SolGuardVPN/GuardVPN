/**
 * IPFS Node Registry for DVPN
 * 
 * This module handles storing and retrieving VPN nodes from IPFS.
 * Uses Pinata for permanent IPFS pinning
 * 
 * How it works:
 * 1. Each node is stored as a JSON file on IPFS via Pinata
 * 2. The registry CID is stored locally and can be shared
 * 3. Anyone with the CID can fetch all registered nodes
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Pinata API credentials
const PINATA_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI0ODkyYjA3YS05MWZhLTQxYTYtOWNkYS1kZWY3MWM4ZTAzOTciLCJlbWFpbCI6ImJlc3R0ZWNob25jaGFpbkBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiYzllYjAyODFhODllNjBiY2YwYjgiLCJzY29wZWRLZXlTZWNyZXQiOiJjYTg2ZGQxYmM5OTYxYzIwNDk1Zjg5NDg5OTgzMTk1OTljM2FmYjZmMWEwNDU3MjZjYjE5Y2VlYjM5Yzg1OTQzIiwiZXhwIjoxODAwNjI5ODQ0fQ.av5ETqtwPQE-XyzLFsTXN06qwi6IPn0Ic-YIzwW3Rr0';

// Registry file to store CIDs locally
const REGISTRY_FILE = path.join(__dirname, 'ipfs-registry.json');
const CONFIG_FILE = path.join(__dirname, 'vpn-nodes-config.json');

// Public IPFS gateways for reading (updated with working ones - w3s.link is most reliable)
const IPFS_GATEWAYS = [
  'https://w3s.link/ipfs/',           // Web3.Storage - most reliable
  'https://nftstorage.link/ipfs/',    // NFT.Storage gateway
  'https://gateway.pinata.cloud/ipfs/', // Pinata (may rate limit)
  'https://cf-ipfs.com/ipfs/',        // Cloudflare IPFS
  'https://ipfs.filebase.io/ipfs/'    // Filebase gateway
];

// Load registry from file
function loadRegistry() {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading IPFS registry:', error.message);
  }
  return { nodes: [], lastUpdate: null, registryCid: null };
}

// Save registry to file
function saveRegistry(registry) {
  try {
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
  } catch (error) {
    console.error('Error saving IPFS registry:', error.message);
  }
}

// Fetch data from IPFS using public gateways
async function fetchFromIPFS(cid) {
  for (const gateway of IPFS_GATEWAYS) {
    try {
      const url = gateway + cid;
      
      const data = await new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: 10000 }, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            // Follow redirect
            https.get(res.headers.location, (res2) => {
              let data = '';
              res2.on('data', chunk => data += chunk);
              res2.on('end', () => resolve(data));
            }).on('error', reject);
            return;
          }
          
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data));
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
      
      return JSON.parse(data);
    } catch (error) {
    }
  }
  throw new Error('All IPFS gateways failed');
}

// Upload to IPFS using Pinata API
async function uploadToIPFS(data, apiToken = PINATA_JWT) {
  const token = apiToken || PINATA_JWT;
  
  if (!token) {
    return null;
  }
  
  const payload = JSON.stringify({
    pinataContent: data,
    pinataMetadata: {
      name: 'dvpn-nodes-registry',
      keyvalues: {
        type: 'vpn-nodes',
        version: '1.0',
        updated: new Date().toISOString()
      }
    }
  });
  
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.pinata.cloud',
      path: '/pinning/pinJSONToIPFS',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const result = JSON.parse(data);
          resolve(result.IpfsHash);
        } else {
          console.error(`❌ Pinata error: ${res.statusCode} - ${data}`);
          reject(new Error(`Upload failed: ${res.statusCode} - ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Get all nodes from IPFS (using known registry CID)
async function getNodesFromIPFS(registryCid = null) {
  const registry = loadRegistry();
  const cidToUse = registryCid || registry.registryCid;
  
  if (!cidToUse) {
    return [];
  }
  
  try {
    const data = await fetchFromIPFS(cidToUse);
    return data.nodes || [];
  } catch (error) {
    console.error('❌ Failed to fetch from IPFS:', error.message);
    return [];
  }
}

// Publish all current nodes to IPFS via Pinata
async function publishNodesToIPFS(nodes, apiToken = PINATA_JWT) {
  const registry = {
    name: 'DVPN Node Registry',
    version: '1.0',
    updated_at: new Date().toISOString(),
    nodes: nodes.map(n => ({
      endpoint: n.endpoint,
      location: n.location,
      region: n.region,
      provider: n.provider || n.provider_wallet,
      wg_server_pubkey: n.wg_server_pubkey,
      price_per_hour_lamports: n.price_per_hour_lamports || n.price_per_minute_lamports * 60,
      is_active: n.is_active !== false,
      bandwidth_mbps: n.bandwidth_mbps || 100,
      rating_avg: n.rating_count > 0 ? (n.rating_sum / n.rating_count).toFixed(1) : '5.0'
    }))
  };
  
  try {
    const cid = await uploadToIPFS(registry, apiToken);
    
    if (cid) {
      // Save CID to local registry
      const localRegistry = loadRegistry();
      localRegistry.registryCid = cid;
      localRegistry.lastUpdate = new Date().toISOString();
      localRegistry.nodeCount = nodes.length;
      saveRegistry(localRegistry);
      
    }
    
    return cid;
  } catch (error) {
    console.error('❌ Failed to publish to IPFS:', error.message);
    return null;
  }
}

// List all pinned files from Pinata
async function listPinnedFiles(apiToken = PINATA_JWT) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.pinata.cloud',
      path: '/data/pinList?status=pinned',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const result = JSON.parse(data);
          resolve(result.rows || []);
        } else {
          reject(new Error(`List failed: ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

// Unpin a file from Pinata
async function unpinFile(cid, apiToken = PINATA_JWT) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.pinata.cloud',
      path: `/pinning/unpin/${cid}`,
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiToken}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          reject(new Error(`Unpin failed: ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

// Sync nodes from IPFS and merge with local
async function syncNodesFromIPFS(localNodes, registryCid = null) {
  try {
    const ipfsNodes = await getNodesFromIPFS(registryCid);
    
    if (ipfsNodes.length === 0) {
      return localNodes;
    }
    
    // Merge: IPFS nodes that aren't in local
    let added = 0;
    for (const ipfsNode of ipfsNodes) {
      const exists = localNodes.find(n => 
        n.endpoint === ipfsNode.endpoint || 
        n.provider === ipfsNode.provider
      );
      
      if (!exists && ipfsNode.endpoint && ipfsNode.provider) {
        localNodes.push({
          pubkey: ipfsNode.endpoint,
          provider: ipfsNode.provider,
          node_id: localNodes.length + 1,
          endpoint: ipfsNode.endpoint,
          location: ipfsNode.location,
          region: ipfsNode.region,
          price_per_minute_lamports: Math.floor((ipfsNode.price_per_hour_lamports || 6000000) / 60),
          wg_server_pubkey: ipfsNode.wg_server_pubkey,
          max_capacity: 100,
          active_sessions: 0,
          is_active: ipfsNode.is_active !== false,
          reputation_score: 1000,
          source: 'ipfs'
        });
        added++;
      }
    }
    
    if (added > 0) {
    }
    
    return localNodes;
  } catch (error) {
    console.error('Error syncing from IPFS:', error.message);
    return localNodes;
  }
}

// Known public DVPN registry CIDs (can be shared/hardcoded)
const KNOWN_REGISTRIES = [
  // Add your published registry CID here after running publishNodesToIPFS
  // Example: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
];

module.exports = {
  loadRegistry,
  saveRegistry,
  fetchFromIPFS,
  uploadToIPFS,
  getNodesFromIPFS,
  publishNodesToIPFS,
  syncNodesFromIPFS,
  listPinnedFiles,
  unpinFile,
  KNOWN_REGISTRIES,
  IPFS_GATEWAYS,
  PINATA_JWT
};
