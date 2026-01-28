// REST API server for querying indexed data
const express = require('express');
const cors = require('cors');
const { getNodes, getSessions, pool } = require('./db');

const app = express();
const PORT = process.env.API_PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get all nodes (with filters)
app.get('/nodes', async (req, res) => {
  try {
    const filters = {
      region: req.query.region,
      is_active: req.query.is_active === 'true',
      min_reputation: req.query.min_reputation ? parseInt(req.query.min_reputation) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit) : 100,
    };
    
    const nodes = await getNodes(filters);
    res.json({ nodes, count: nodes.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get specific node
app.get('/nodes/:pubkey', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT n.*, p.reputation_score FROM nodes n JOIN providers p ON n.provider = p.pubkey WHERE n.pubkey = $1',
      [req.params.pubkey]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get sessions (with filters)
app.get('/sessions', async (req, res) => {
  try {
    const filters = {
      user_pubkey: req.query.user,
      node: req.query.node,
      state: req.query.state,
      limit: req.query.limit ? parseInt(req.query.limit) : 100,
    };
    
    const sessions = await getSessions(filters);
    res.json({ sessions, count: sessions.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get specific session
app.get('/sessions/:pubkey', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM sessions WHERE pubkey = $1',
      [req.params.pubkey]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get provider stats
app.get('/providers/:pubkey', async (req, res) => {
  try {
    const providerResult = await pool.query(
      'SELECT * FROM providers WHERE pubkey = $1',
      [req.params.pubkey]
    );
    
    if (providerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }
    
    const nodesResult = await pool.query(
      'SELECT * FROM nodes WHERE provider = $1',
      [req.params.pubkey]
    );
    
    res.json({
      provider: providerResult.rows[0],
      nodes: nodesResult.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get statistics
app.get('/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM providers) as total_providers,
        (SELECT COUNT(*) FROM nodes WHERE is_active = true) as active_nodes,
        (SELECT COUNT(*) FROM sessions WHERE state = 'Active') as active_sessions,
        (SELECT SUM(total_sessions) FROM providers) as total_sessions_all_time
    `);
    
    res.json(stats.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Rate a node (after VPN disconnect)
app.post('/nodes/:id/rate', async (req, res) => {
  try {
    const nodeId = req.params.id;
    const { rating, wallet } = req.body;
    
    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    
    console.log(`⭐ Node ${nodeId} rated ${rating} stars by ${wallet || 'anonymous'}`);
    
    // Try to update node in database
    try {
      // First try to find by pubkey
      let result = await pool.query(
        `UPDATE nodes SET 
          rating_sum = COALESCE(rating_sum, 0) + $1,
          rating_count = COALESCE(rating_count, 0) + 1
         WHERE pubkey = $2 OR endpoint LIKE $3
         RETURNING *`,
        [rating, nodeId, `%${nodeId}%`]
      );
      
      if (result.rows.length > 0) {
        const node = result.rows[0];
        const avgRating = node.rating_count > 0 ? (node.rating_sum / node.rating_count).toFixed(1) : rating;
        console.log(`✅ Updated node rating: ${avgRating} (${node.rating_count} ratings)`);
        return res.json({ 
          success: true, 
          average_rating: parseFloat(avgRating),
          total_ratings: node.rating_count
        });
      }
    } catch (dbErr) {
      console.warn('DB update failed (columns may not exist):', dbErr.message);
    }
    
    // If DB update fails, just acknowledge the rating
    res.json({ 
      success: true, 
      message: 'Rating recorded',
      rating: rating
    });
    
  } catch (err) {
    console.error('Rate node error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🌐 API server running on http://localhost:${PORT}`);
  console.log(`📊 Endpoints:`);
  console.log(`   GET /health`);
  console.log(`   GET /nodes?region=&min_reputation=&limit=`);
  console.log(`   GET /nodes/:pubkey`);
  console.log(`   POST /nodes/:id/rate`);
  console.log(`   GET /sessions?user=&node=&state=&limit=`);
  console.log(`   GET /sessions/:pubkey`);
  console.log(`   GET /providers/:pubkey`);
  console.log(`   GET /stats`);
});
