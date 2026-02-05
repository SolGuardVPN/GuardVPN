// Simple mock API for testing the app
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Mock nodes data
const mockNodes = [
  {
    pubkey: '3TXwC1yPntAHpHUSW1JRbtpvskQ87FZ1Tor6prdHcRYG',
    provider: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6',
    node_id: 1,
    endpoint: '45.76.123.45:51820',
    location: 'United States, New York',
    region: 'us-east',
    price_per_minute_lamports: 100000,
    wg_server_pubkey: 'mock_wg_public_key_1==',
    max_capacity: 100,
    active_sessions: 5,
    is_active: true,
    reputation_score: 950
  },
  {
    pubkey: '7YzE2pMkgRZvQ9Nj3BxTFhD8WqP4LsK1GcVmA6Ux5Rnt',
    provider: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6',
    node_id: 2,
    endpoint: '104.238.165.89:51820',
    location: 'United States, Los Angeles',
    region: 'us-west',
    price_per_minute_lamports: 120000,
    wg_server_pubkey: 'mock_wg_public_key_2==',
    max_capacity: 150,
    active_sessions: 8,
    is_active: true,
    reputation_score: 980
  },
  {
    pubkey: '9KmP3rTvN2qA5WxD8LfH7YbE6CsG1RjU4VnB9ZkM2Qwt',
    provider: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6',
    node_id: 3,
    endpoint: '178.128.45.67:51820',
    location: 'United Kingdom, London',
    region: 'eu-west',
    price_per_minute_lamports: 110000,
    wg_server_pubkey: 'mock_wg_public_key_3==',
    max_capacity: 120,
    active_sessions: 12,
    is_active: true,
    reputation_score: 920
  },
  {
    pubkey: '2FjK8wN5pL9TqV3mX7YbA1RcE6HzG4DsP9WnM5BvU8Qt',
    provider: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6',
    node_id: 4,
    endpoint: '139.180.156.234:51820',
    location: 'Germany, Frankfurt',
    region: 'eu-central',
    price_per_minute_lamports: 105000,
    wg_server_pubkey: 'mock_wg_public_key_4==',
    max_capacity: 200,
    active_sessions: 15,
    is_active: true,
    reputation_score: 995
  },
  {
    pubkey: '5HnW2rT8pQ3KvL9mY1XbD6JcF4GzE7AsN2VnP9CwR5Mt',
    provider: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6',
    node_id: 5,
    endpoint: '45.76.210.123:51820',
    location: 'Singapore, Singapore',
    region: 'ap-southeast',
    price_per_minute_lamports: 130000,
    wg_server_pubkey: 'mock_wg_public_key_5==',
    max_capacity: 80,
    active_sessions: 6,
    is_active: true,
    reputation_score: 890
  },
  {
    pubkey: '8KpR4vN7qT2LwX9mD5YbC3JfE1HzG6AsP8VnM2BwQ4Rt',
    provider: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6',
    node_id: 6,
    endpoint: '144.202.45.78:51820',
    location: 'Japan, Tokyo',
    region: 'ap-northeast',
    price_per_minute_lamports: 125000,
    wg_server_pubkey: 'mock_wg_public_key_6==',
    max_capacity: 100,
    active_sessions: 10,
    is_active: true,
    reputation_score: 960
  },
  {
    pubkey: '6NqT3wL8pR5KvM2nY7XbA9JcD1FzE4GsH6VnP3CwQ8Bt',
    provider: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6',
    node_id: 7,
    endpoint: '167.172.123.234:51820',
    location: 'Canada, Toronto',
    region: 'na-east',
    price_per_minute_lamports: 115000,
    wg_server_pubkey: 'mock_wg_public_key_7==',
    max_capacity: 90,
    active_sessions: 7,
    is_active: true,
    reputation_score: 870
  },
  {
    pubkey: '4MpK9wT6rL3QvN8mX2YbD5JcF7HzE1GsP4VnM8BwR6Ct',
    provider: 'ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6',
    node_id: 8,
    endpoint: '188.166.78.123:51820',
    location: 'Netherlands, Amsterdam',
    region: 'eu-west',
    price_per_minute_lamports: 108000,
    wg_server_pubkey: 'mock_wg_public_key_8==',
    max_capacity: 110,
    active_sessions: 9,
    is_active: true,
    reputation_score: 940
  }
];

const mockSessions = [];

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mode: 'mock',
    timestamp: new Date().toISOString(),
    nodes: mockNodes.length
  });
});

// Get all nodes
app.get('/nodes', async (req, res) => {
  try {
    res.json({ 
      success: true,
      nodes: mockNodes,
      count: mockNodes.length 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get specific node
app.get('/nodes/:pubkey', async (req, res) => {
  try {
    const node = mockNodes.find(n => n.pubkey === req.params.pubkey);
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    res.json(node);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get sessions
app.get('/sessions', async (req, res) => {
  try {
    res.json({ 
      success: true,
      sessions: mockSessions,
      count: mockSessions.length 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
});
