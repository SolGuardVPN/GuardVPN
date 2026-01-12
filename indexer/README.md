# DVPN Indexer Service

Indexes DVPN on-chain data to PostgreSQL and exposes REST API for clients.

## Setup

### 1. Install PostgreSQL

```bash
# macOS
brew install postgresql@14
brew services start postgresql@14

# Ubuntu/Debian
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### 2. Create Database

```bash
createdb dvpn
```

### 3. Install Dependencies

```bash
cd indexer
npm install
```

### 4. Configure Environment

```bash
export ANCHOR_PROVIDER_URL="https://api.testnet.solana.com"
export DB_HOST="localhost"
export DB_PORT="5432"
export DB_NAME="dvpn"
export DB_USER="postgres"
export DB_PASSWORD="postgres"
export INDEXER_PORT="8080"
```

### 5. Run

```bash
npm start
```

## API Endpoints

### GET /providers
Returns all providers sorted by reputation.

**Example:**
```bash
curl http://localhost:8080/providers
```

### GET /nodes?region=us&active=true
Returns nodes filtered by region and active status.

**Query params:**
- `region` (optional): Filter by region
- `active` (optional): Filter by active status (true/false)

**Example:**
```bash
curl "http://localhost:8080/nodes?region=us&active=true"
```

### GET /sessions?user=<pubkey>&node=<pubkey>
Returns sessions filtered by user or node.

**Query params:**
- `user` (optional): Filter by user pubkey
- `node` (optional): Filter by node pubkey

**Example:**
```bash
curl "http://localhost:8080/sessions?user=ABC123..."
```

### GET /stats
Returns overall system statistics.

**Example:**
```bash
curl http://localhost:8080/stats
```

## Database Schema

### providers
- pubkey (PRIMARY KEY)
- authority
- node_count
- stake_lamports
- reputation_score
- total_uptime_seconds
- total_sessions
- last_updated

### nodes
- pubkey (PRIMARY KEY)
- provider (FOREIGN KEY)
- node_id
- endpoint
- region
- price_per_minute_lamports
- wg_server_pubkey
- max_capacity
- active_sessions
- total_uptime_seconds
- is_active
- last_updated

### sessions
- pubkey (PRIMARY KEY)
- user_pubkey
- node_pubkey (FOREIGN KEY)
- session_id
- start_ts
- end_ts
- escrow_lamports
- remaining_balance
- bytes_used
- state
- last_updated
