const https = require('https');

const PINATA_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI0ODkyYjA3YS05MWZhLTQxYTYtOWNkYS1kZWY3MWM4ZTAzOTciLCJlbWFpbCI6ImJlc3R0ZWNob25jaGFpbkBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiYzllYjAyODFhODllNjBiY2YwYjgiLCJzY29wZWRLZXlTZWNyZXQiOiJjYTg2ZGQxYmM5OTYxYzIwNDk1Zjg5NDg5OTgzMTk1OTljM2FmYjZmMWEwNDU3MjZjYjE5Y2VlYjM5Yzg1OTQzIiwiZXhwIjoxODAwNjI5ODQ0fQ.av5ETqtwPQE-XyzLFsTXN06qwi6IPn0Ic-YIzwW3Rr0';
const WALLET_TO_REMOVE = '67N56dCWoKUKDgZpngqc7YTRYs6TMyw76p85LNF1wwtB';

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function pinataRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.pinata.cloud',
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${PINATA_JWT}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function main() {

  // 1. Get the latest registry CID
  // Try gvpn-nodes-registry first (newer naming)
  let pinList = await pinataRequest('GET', '/data/pinList?status=pinned&metadata[name]=gvpn-nodes-registry');
  
  if (!pinList.rows || pinList.rows.length === 0) {
    pinList = await pinataRequest('GET', '/data/pinList?status=pinned&metadata[name]=dvpn-nodes-registry');
  }

  if (!pinList.rows || pinList.rows.length === 0) {
    return;
  }

  const latestCID = pinList.rows[0].ipfs_pin_hash;

  // 2. Fetch current registry content
  const registry = await fetchJson(`https://gateway.pinata.cloud/ipfs/${latestCID}`);
  
  if (registry.nodes) {
    registry.nodes.forEach((n, i) => {
    });
  }

  // 3. Remove the wallet's node
  const originalCount = registry.nodes?.length || 0;
  const filteredNodes = (registry.nodes || []).filter(n => n.provider !== WALLET_TO_REMOVE);
  const removedCount = originalCount - filteredNodes.length;
  
  if (removedCount === 0) {
    return;
  }


  // 4. Create new registry
  const newRegistry = {
    ...registry,
    nodes: filteredNodes,
    lastUpdated: new Date().toISOString()
  };

  
  // Pin new content
  const pinResponse = await pinataRequest('POST', '/pinning/pinJSONToIPFS', {
    pinataContent: newRegistry,
    pinataMetadata: {
      name: 'gvpn-nodes-registry',
      keyvalues: {
        type: 'vpn-registry',
        updated: newRegistry.lastUpdated || new Date().toISOString(),
        version: '1.0'
      }
    }
  });

  if (pinResponse.IpfsHash) {
  } else {
  }

}

main().catch(console.error);
