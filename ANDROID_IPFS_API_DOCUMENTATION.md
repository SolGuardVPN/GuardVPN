# DVPN Android App - IPFS API Integration Guide

This document provides complete API documentation for integrating the DVPN decentralized VPN system into an Android application. All data is stored on IPFS via Pinata, making it fully decentralized.

---

## Table of Contents

1. [Overview](#overview)
2. [Configuration](#configuration)
3. [IPFS Gateways](#ipfs-gateways)
4. [API Endpoints](#api-endpoints)
   - [1. Fetch VPN Nodes](#1-fetch-vpn-nodes)
   - [2. Publish New Node](#2-publish-new-node)
   - [3. Fetch Sessions](#3-fetch-sessions)
   - [4. Publish Sessions](#4-publish-sessions)
   - [5. Fetch Earnings](#5-fetch-earnings)
   - [6. Publish Earnings](#6-publish-earnings)
   - [7. List Pinned Items](#7-list-pinned-items)
5. [Data Models](#data-models)
6. [Android Implementation Examples](#android-implementation-examples)
7. [Error Handling](#error-handling)
8. [Best Practices](#best-practices)

--- 

## Overview

The DVPN system uses IPFS (InterPlanetary File System) via Pinata for decentralized storage:

- **No Central Database**: All data is stored on IPFS
- **Content Addressable**: Data is accessed via CID (Content Identifier)
- **Immutable**: Once published, data cannot be changed (new CID for updates)
- **Multiple Gateways**: Data can be fetched from any IPFS gateway

### Architecture Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Android App    │────▶│  Pinata API     │────▶│  IPFS Network   │
│                 │     │  (Write Data)   │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                                               │
         │              ┌─────────────────┐              │
         └─────────────▶│  IPFS Gateway   │◀─────────────┘
                        │  (Read Data)    │
                        └─────────────────┘
```

---

## Configuration

### Constants (Store in your Android app)

```kotlin
object DVPNConfig {
    // Pinata JWT Token for uploading data
    const val PINATA_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI0ODkyYjA3YS05MWZhLTQxYTYtOWNkYS1kZWY3MWM4ZTAzOTciLCJlbWFpbCI6ImJlc3R0ZWNob25jaGFpbkBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiYzllYjAyODFhODllNjBiY2YwYjgiLCJzY29wZWRLZXlTZWNyZXQiOiJjYTg2ZGQxYmM5OTYxYzIwNDk1Zjg5NDg5OTgzMTk1OTljM2FmYjZmMWEwNDU3MjZjYjE5Y2VlYjM5Yzg1OTQzIiwiZXhwIjoxODAwNjI5ODQ0fQ.av5ETqtwPQE-XyzLFsTXN06qwi6IPn0Ic-YIzwW3Rr0"
    
    // Pinata API Base URL
    const val PINATA_API_URL = "https://api.pinata.cloud"
    
    // Default IPFS Gateway
    const val PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs/"
    
    // Known Node Registry CID (Update this when registry changes)
    // ⚠️ This is a FALLBACK CID - Always fetch the latest CID from Pinata API first!
    // This CID points to the current node registry on IPFS
    const val NODES_REGISTRY_CID = "QmWshwhqU236FVSmEA1aKgDeEHZuFebUF7ibJ5an9hn7My"
    
    // Solana Configuration
    const val SOLANA_RPC_URL = "https://api.devnet.solana.com"
    const val PROGRAM_ID = "EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq"
    const val PROVIDER_WALLET = "ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6"
}
```

### Understanding CIDs (Content Identifiers)

**What is a CID?**

A CID (Content Identifier) is a unique hash that represents content on IPFS. Think of it as a permanent address for your data:
- **Format**: `Qm...` (base58) or `bafy...` (base32)
- **Example**: `QmWshwhqU236FVSmEA1aKgDeEHZuFebUF7ibJ5an9hn7My`
- **Immutable**: Same content = same CID, different content = different CID

**Where do CIDs come from?**

1. **Initial/Bootstrap CID** - Hardcoded fallback in your app config
2. **Dynamic CIDs** - Fetched from Pinata API (always latest)
3. **Generated CIDs** - Returned when you publish new data to IPFS

**CID Types in DVPN:**

| CID Type | Description | Source | Storage |
|----------|-------------|--------|----------|
| **Node Registry CID** | Points to list of all VPN nodes | Pinata API (`metadata[name]=dvpn-nodes-registry`) | Hardcoded fallback + dynamic fetch |
| **Sessions CID** | Points to user's session history | Created when you publish sessions | Local SharedPreferences |
| **Earnings CID** | Points to provider earnings data | Created when you publish earnings | Local SharedPreferences |

**CID Lifecycle:**

```
1. App Starts
   ↓
2. Check Local Storage for CID
   ↓
3. If not found → Use hardcoded fallback CID
   ↓
4. Fetch latest CID from Pinata API (for node registry)
   ↓
5. Fetch data using CID from IPFS gateway
   ↓
6. User modifies data (creates session, withdraws, etc.)
   ↓
7. Publish new data to IPFS → Get NEW CID
   ↓
8. Save new CID locally for next time
```

---

## Quick Start Guide

This section shows you exactly how to use the API step-by-step.

### Step 1: Setup Dependencies & HTTP Client

```kotlin
// build.gradle.kts (app level)
dependencies {
    // Ktor HTTP Client
    implementation("io.ktor:ktor-client-android:2.3.7")
    implementation("io.ktor:ktor-client-content-negotiation:2.3.7")
    implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.7")
    
    // Kotlin Serialization
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.2")
}

// Create HTTP client instance
val httpClient = HttpClient(Android) {
    install(ContentNegotiation) {
        json(Json {
            ignoreUnknownKeys = true
            isLenient = true
            prettyPrint = true
        })
    }
    install(HttpTimeout) {
        requestTimeoutMillis = 30_000
        connectTimeoutMillis = 30_000
    }
}
```

### Step 2: Fetch VPN Nodes

**How it works:**
1. Call Pinata API to get the latest node registry CID
2. Use that CID to fetch node data from IPFS gateway
3. Filter for active nodes

```kotlin
suspend fun getVPNNodes(): List<VPNNode> {
    // STEP 1: Get the latest node registry CID from Pinata
    val latestCID = fetchLatestNodeRegistryCID()
    Log.d("DVPN", "Latest node registry CID: $latestCID")
    
    // STEP 2: Fetch node data from IPFS using the CID
    val nodes = fetchNodesFromIPFS(latestCID)
    Log.d("DVPN", "Fetched ${nodes.size} active nodes")
    
    return nodes
}

// Get latest CID from Pinata API
suspend fun fetchLatestNodeRegistryCID(): String {
    try {
        val response = httpClient.get(
            "${DVPNConfig.PINATA_API_URL}/data/pinList" +
            "?status=pinned" +
            "&metadata[name]=dvpn-nodes-registry" +
            "&pageLimit=1" +
            "&sortBy=date_pinned:DESC"  // Most recent first
        ) {
            header("Authorization", "Bearer ${DVPNConfig.PINATA_JWT}")
        }
        
        if (response.status.isSuccess()) {
            val jsonText = response.bodyAsText()
            val data = Json.decodeFromString<PinListResponse>(jsonText)
            
            if (data.rows.isNotEmpty()) {
                val latestCID = data.rows[0].ipfsPinHash
                Log.d("DVPN", "✅ Latest CID from Pinata: $latestCID")
                return latestCID
            }
        }
    } catch (e: Exception) {
        Log.e("DVPN", "❌ Failed to fetch latest CID: ${e.message}")
    }
    
    // Fallback to hardcoded CID if API fails
    Log.w("DVPN", "⚠️ Using fallback CID")
    return DVPNConfig.NODES_REGISTRY_CID
}

// Fetch nodes from IPFS using CID
suspend fun fetchNodesFromIPFS(cid: String): List<VPNNode> {
    val gateways = listOf(
        "https://w3s.link/ipfs/",              // Best reliability
        "https://gateway.pinata.cloud/ipfs/",   // May rate limit
        "https://ipfs.filebase.io/ipfs/"        // Alternative
    )
    
    for (gateway in gateways) {
        try {
            Log.d("DVPN", "Trying gateway: $gateway")
            val response = httpClient.get("$gateway$cid") {
                timeout { requestTimeoutMillis = 10_000 }
            }
            
            if (response.status.isSuccess()) {
                val jsonText = response.bodyAsText()
                val registry = Json.decodeFromString<NodeRegistry>(jsonText)
                
                Log.d("DVPN", "✅ Success! Fetched ${registry.nodes.size} nodes")
                return registry.nodes.filter { it.isActive }
            }
        } catch (e: Exception) {
            Log.d("DVPN", "❌ Gateway $gateway failed: ${e.message}")
        }
    }
    
    throw Exception("Failed to fetch nodes from all gateways")
}
```

### Step 3: Create a VPN Session

**How it works:**
1. Fetch your existing sessions (if any) using saved CID
2. Create new session object
3. Publish ALL sessions (old + new) to IPFS
4. Get back a NEW CID and save it locally

```kotlin
suspend fun createVPNSession(
    node: VPNNode, 
    userWallet: String
): Session {
    // STEP 1: Fetch existing sessions (if any)
    val existingSessions = fetchUserSessions(userWallet)
    Log.d("DVPN", "Found ${existingSessions.size} existing sessions")
    
    // STEP 2: Create new session object
    val sessionId = "session_${System.currentTimeMillis()}_${UUID.randomUUID().toString().take(9)}"
    val now = Instant.now().toString()
    
    val newSession = Session(
        id = sessionId,
        sessionId = sessionId,
        userWallet = userWallet,
        nodeProvider = node.provider,
        nodeEndpoint = node.endpoint,
        nodeLocation = node.location,
        startTime = now,
        endTime = null,
        isActive = true,
        bytesUsed = 0,
        amountPaid = 0,
        durationSeconds = null,
        createdAt = now
    )
    
    // STEP 3: Add to sessions list
    val allSessions = existingSessions.toMutableList()
    allSessions.add(newSession)
    Log.d("DVPN", "Total sessions now: ${allSessions.size}")
    
    // STEP 4: Publish to IPFS and get NEW CID
    val newCID = publishSessionsToIPFS(allSessions)
    Log.d("DVPN", "✅ Published to IPFS, new CID: $newCID")
    
    // STEP 5: Save the new CID locally for next time
    saveSessionsCID(newCID)
    
    return newSession
}

// Fetch user's sessions using saved CID
suspend fun fetchUserSessions(userWallet: String): List<Session> {
    // Get CID from local storage
    val prefs = context.getSharedPreferences("dvpn_prefs", Context.MODE_PRIVATE)
    val sessionsCID = prefs.getString("sessions_cid", null)
    
    if (sessionsCID == null) {
        Log.d("DVPN", "No sessions CID found - first time user")
        return emptyList()
    }
    
    Log.d("DVPN", "Fetching sessions from CID: $sessionsCID")
    
    // Try multiple IPFS gateways
    val gateways = listOf(
        "https://w3s.link/ipfs/",
        "https://gateway.pinata.cloud/ipfs/"
    )
    
    for (gateway in gateways) {
        try {
            val response = httpClient.get("$gateway$sessionsCID")
            if (response.status.isSuccess()) {
                val jsonText = response.bodyAsText()
                val container = Json.decodeFromString<SessionsContainer>(jsonText)
                
                // Filter sessions for this user only
                val userSessions = container.sessions.filter { 
                    it.userWallet == userWallet 
                }
                
                Log.d("DVPN", "✅ Found ${userSessions.size} sessions for user")
                return userSessions
            }
        } catch (e: Exception) {
            Log.d("DVPN", "Gateway $gateway failed: ${e.message}")
        }
    }
    
    Log.w("DVPN", "⚠️ Could not fetch sessions, returning empty list")
    return emptyList()
}

// Publish sessions to IPFS and get back the NEW CID
suspend fun publishSessionsToIPFS(sessions: List<Session>): String {
    val payload = buildJsonObject {
        putJsonObject("pinataContent") {
            put("name", "DVPN Sessions")
            put("version", "1.0")
            put("updated_at", Instant.now().toString())
            
            putJsonArray("sessions") {
                sessions.forEach { session ->
                    addJsonObject {
                        put("id", session.id)
                        put("session_id", session.sessionId)
                        put("user_wallet", session.userWallet)
                        put("node_provider", session.nodeProvider)
                        put("node_endpoint", session.nodeEndpoint)
                        put("node_location", session.nodeLocation)
                        put("start_time", session.startTime)
                        put("end_time", session.endTime)
                        put("is_active", session.isActive)
                        put("bytes_used", session.bytesUsed)
                        put("amount_paid", session.amountPaid)
                        put("duration_seconds", session.durationSeconds)
                        put("created_at", session.createdAt)
                    }
                }
            }
        }
        
        putJsonObject("pinataMetadata") {
            put("name", "dvpn-sessions-${System.currentTimeMillis()}")
            putJsonObject("keyvalues") {
                put("type", "dvpn-sessions")
                put("count", sessions.size.toString())
                put("updated", Instant.now().toString())
            }
        }
    }
    
    Log.d("DVPN", "Publishing ${sessions.size} sessions to IPFS...")
    
    val response = httpClient.post(
        "${DVPNConfig.PINATA_API_URL}/pinning/pinJSONToIPFS"
    ) {
        header("Authorization", "Bearer ${DVPNConfig.PINATA_JWT}")
        contentType(ContentType.Application.Json)
        setBody(payload.toString())
    }
    
    if (response.status.isSuccess()) {
        val jsonText = response.bodyAsText()
        val result = Json.decodeFromString<PinataResponse>(jsonText)
        return result.ipfsHash  // This is your NEW CID!
    } else {
        throw Exception("Failed to publish: ${response.status}")
    }
}

// Save CID to local storage
fun saveSessionsCID(cid: String) {
    val prefs = context.getSharedPreferences("dvpn_prefs", Context.MODE_PRIVATE)
    prefs.edit().putString("sessions_cid", cid).apply()
    Log.d("DVPN", "💾 Saved sessions CID: $cid")
}
```

### Step 4: End VPN Session

**How it works:**
1. Fetch current sessions
2. Find and update the specific session (set end time, calculate duration)
3. Publish updated sessions list to IPFS
4. Get NEW CID and save it

```kotlin
suspend fun endVPNSession(
    sessionId: String, 
    userWallet: String
): Session? {
    // STEP 1: Fetch current sessions
    val sessions = fetchUserSessions(userWallet).toMutableList()
    
    // STEP 2: Find the session to end
    val sessionIndex = sessions.indexOfFirst { it.id == sessionId }
    if (sessionIndex < 0) {
        Log.e("DVPN", "❌ Session not found: $sessionId")
        return null
    }
    
    val session = sessions[sessionIndex]
    
    // STEP 3: Calculate duration
    val startTime = Instant.parse(session.startTime)
    val endTime = Instant.now()
    val durationSeconds = Duration.between(startTime, endTime).seconds.toInt()
    
    Log.d("DVPN", "Ending session: $sessionId (${durationSeconds}s)")
    
    // STEP 4: Update session
    val updatedSession = session.copy(
        endTime = endTime.toString(),
        isActive = false,
        durationSeconds = durationSeconds,
        bytesUsed = calculateBytesUsed() // Your bandwidth tracking
    )
    
    sessions[sessionIndex] = updatedSession
    
    // STEP 5: Publish updated sessions → Get NEW CID
    val newCID = publishSessionsToIPFS(sessions)
    Log.d("DVPN", "✅ Session ended, new CID: $newCID")
    
    // STEP 6: Save new CID
    saveSessionsCID(newCID)
    
    return updatedSession
}

// Example bandwidth calculation (implement your own)
fun calculateBytesUsed(): Long {
    // Read from VPN interface stats
    // For now, return example value
    return Random.nextLong(1_000_000, 100_000_000)
}
```

### Step 5: Complete Example - Full VPN Connection Flow

```kotlin
class DVPNManager(private val context: Context) {
    private val httpClient = createHttpClient()
    private var currentSession: Session? = null
    private var currentNode: VPNNode? = null
    
    /**
     * Complete flow: Fetch nodes → Select node → Create session → Connect WireGuard
     */
    suspend fun connectToVPN(userWallet: String): Boolean {
        return try {
            // 1. Get available VPN nodes
            Log.d("DVPN", "📡 Fetching VPN nodes...")
            val nodes = getVPNNodes()
            
            if (nodes.isEmpty()) {
                Log.e("DVPN", "❌ No active nodes available")
                return false
            }
            
            // 2. Select best node (customize selection logic)
            val selectedNode = selectBestNode(nodes)
            currentNode = selectedNode
            
            Log.d("DVPN", "🌍 Selected: ${selectedNode.location} - ${selectedNode.endpoint}")
            
            // 3. Create session on IPFS
            Log.d("DVPN", "📝 Creating session on IPFS...")
            currentSession = createVPNSession(selectedNode, userWallet)
            
            // 4. Setup WireGuard connection
            Log.d("DVPN", "🔒 Setting up WireGuard tunnel...")
            val connected = setupWireGuard(selectedNode)
            
            if (connected) {
                Log.d("DVPN", "✅ Connected to VPN!")
                return true
            } else {
                Log.e("DVPN", "❌ WireGuard connection failed")
                // Clean up session
                currentSession?.let { endVPNSession(it.id, userWallet) }
                currentSession = null
                return false
            }
            
        } catch (e: Exception) {
            Log.e("DVPN", "💥 Connection failed: ${e.message}")
            e.printStackTrace()
            false
        }
    }
    
    /**
     * Disconnect from VPN and end session
     */
    suspend fun disconnectFromVPN(userWallet: String): Boolean {
        return try {
            Log.d("DVPN", "🔌 Disconnecting from VPN...")
            
            // 1. Disconnect WireGuard
            disconnectWireGuard()
            
            // 2. End session on IPFS
            currentSession?.let {
                Log.d("DVPN", "📝 Ending session ${it.id}...")
                endVPNSession(it.id, userWallet)
            }
            
            currentSession = null
            currentNode = null
            
            Log.d("DVPN", "✅ Disconnected from VPN")
            true
            
        } catch (e: Exception) {
            Log.e("DVPN", "💥 Disconnect failed: ${e.message}")
            false
        }
    }
    
    /**
     * Select best node based on criteria
     */
    private fun selectBestNode(nodes: List<VPNNode>): VPNNode {
        // Example: Select node with best rating
        return nodes.maxByOrNull { 
            it.ratingAvg?.toDoubleOrNull() ?: 0.0 
        } ?: nodes.first()
        
        // Or select by location
        // return nodes.find { it.location == "Germany" } ?: nodes.first()
    }
    
    /**
     * Setup WireGuard connection
     */
    private suspend fun setupWireGuard(node: VPNNode): Boolean {
        // Generate WireGuard keys
        val clientPrivateKey = generateWireGuardKey()
        val clientPublicKey = getPublicKey(clientPrivateKey)
        
        Log.d("DVPN", "🔑 Generated client keys")
        
        // Request config from VPN server
        val config = requestVPNConfig(node, clientPublicKey)
        Log.d("DVPN", "📥 Received config - IP: ${config.clientIP}")
        
        // Generate WireGuard config file
        val wgConfig = generateWireGuardConfig(
            node = node,
            clientPrivateKey = clientPrivateKey,
            clientPublicKey = clientPublicKey,
            clientAddress = config.clientIP,
            presharedKey = config.presharedKey
        )
        
        // Connect using WireGuard Android library
        return connectWireGuard(wgConfig)
    }
    
    private fun disconnectWireGuard() {
        // Implement WireGuard disconnect
        // Using wireguard-android library
    }
}
```

### Summary: Understanding the CID Flow

```kotlin
// 📋 COMPLETE CID FLOW EXPLAINED

// ═══════════════════════════════════════════════════════════════
// 1️⃣ NODE REGISTRY CID - Where it comes from
// ═══════════════════════════════════════════════════════════════

// Hardcoded fallback in your app:
const val FALLBACK_CID = "QmWshwhqU236FVSmEA1aKgDeEHZuFebUF7ibJ5an9hn7My"

// Always fetch latest from Pinata API:
val latestCID = fetchLatestNodeRegistryCID()
// Returns: "QmAbc123..." (could be different than fallback!)

// Use the latest CID to fetch nodes:
val nodes = fetchNodesFromIPFS(latestCID)


// ═══════════════════════════════════════════════════════════════
// 2️⃣ SESSIONS CID - How it's created and updated
// ═══════════════════════════════════════════════════════════════

// First time (no CID yet):
val sessionsCID = prefs.getString("sessions_cid", null) // null

// Create first session:
val session1 = createSession(node, wallet)
// → Publishes to IPFS
// → Returns CID: "QmSession1..."
// → Saves locally

// Later fetch:
val sessionsCID = prefs.getString("sessions_cid", null) // "QmSession1..."
val sessions = fetchSessions(sessionsCID) // 1 session

// Create second session:
val session2 = createSession(node, wallet)
// → Fetches existing sessions using "QmSession1..."
// → Adds new session
// → Publishes ALL sessions to IPFS
// → Returns NEW CID: "QmSession2..."
// → Saves new CID locally

// Now:
val sessionsCID = prefs.getString("sessions_cid", null) // "QmSession2..."
val sessions = fetchSessions(sessionsCID) // 2 sessions


// ═══════════════════════════════════════════════════════════════
// 3️⃣ KEY CONCEPT: IPFS is IMMUTABLE
// ═══════════════════════════════════════════════════════════════

// ❌ WRONG: You CANNOT update existing CID
// Old CID: QmAbc123 (3 sessions)
// Update attempt → Still shows 3 sessions (immutable!)

// ✅ CORRECT: Every update creates NEW CID
// Old CID: QmAbc123 (3 sessions)
// Publish update → New CID: QmDef456 (4 sessions)
// Save new CID → Always use latest CID


// ═══════════════════════════════════════════════════════════════
// 4️⃣ CID STORAGE PATTERN
// ═══════════════════════════════════════════════════════════════

// SharedPreferences keys:
// - "sessions_cid" → Your personal sessions
// - "earnings_cid" → Provider earnings (if you're a provider)

// Node registry CID:
// - Always fetch from Pinata API (don't store locally)
// - Falls back to hardcoded if API fails


// ═══════════════════════════════════════════════════════════════
// 5️⃣ PRACTICAL EXAMPLE TIMELINE
// ═══════════════════════════════════════════════════════════════

// Day 1 - 10:00 AM - First session
createSession() → CID: Qm111... (1 session)
saveLocalCID("Qm111...")

// Day 1 - 2:00 PM - Second session
fetchSessions("Qm111...") → 1 session
createSession() → CID: Qm222... (2 sessions)
saveLocalCID("Qm222...")

// Day 1 - 5:00 PM - End first session
fetchSessions("Qm222...") → 2 sessions
endSession() → CID: Qm333... (2 sessions, 1 ended)
saveLocalCID("Qm333...")

// Day 2 - New app session
fetchSessions("Qm333...") → 2 sessions
// Old CIDs (Qm111, Qm222) still exist on IPFS but we don't use them


// ═══════════════════════════════════════════════════════════════
// 6️⃣ SUMMARY
// ═══════════════════════════════════════════════════════════════

/**
 * Where CIDs come from:
 * 
 * NODE REGISTRY CID:
 *   - Source: Pinata API (list pins with metadata name)
 *   - Fallback: Hardcoded in app
 *   - Updates: When admin adds new nodes
 *   - Storage: Not stored (fetch each time)
 * 
 * SESSIONS CID:
 *   - Source: Your app publishes to IPFS
 *   - First time: null (create new)
 *   - Updates: Every time you modify sessions
 *   - Storage: SharedPreferences
 * 
 * EARNINGS CID:
 *   - Source: Your app publishes to IPFS
 *   - First time: null (create new)
 *   - Updates: When provider withdraws earnings
 *   - Storage: SharedPreferences
 */
```

---

## IPFS Gateways

Use multiple gateways for redundancy. Try each in order until one succeeds:

```kotlin
val IPFS_GATEWAYS = listOf(
    "https://w3s.link/ipfs/",           // Web3.Storage - most reliable
    "https://nftstorage.link/ipfs/",    // NFT.Storage gateway
    "https://gateway.pinata.cloud/ipfs/", // Pinata (may rate limit)
    "https://cf-ipfs.com/ipfs/",        // Cloudflare IPFS
    "https://ipfs.filebase.io/ipfs/"    // Filebase gateway
)
```

> **Note**: The `w3s.link` (Web3.Storage) gateway is the most reliable. Public gateways like `gateway.pinata.cloud` may return 429 (Too Many Requests) errors during high traffic.

### Gateway Usage Pattern

```kotlin
suspend fun fetchFromIPFS(cid: String): String? {
    for (gateway in IPFS_GATEWAYS) {
        try {
            val response = httpClient.get("$gateway$cid") {
                timeout {
                    requestTimeoutMillis = 10000
                }
            }
            if (response.status.isSuccess()) {
                return response.bodyAsText()
            }
        } catch (e: Exception) {
            Log.d("IPFS", "Gateway $gateway failed: ${e.message}")
        }
    }
    return null
}
```

---

## API Endpoints

### 0. Fetch Latest Registry CID (IMPORTANT!)

**IPFS is immutable** - when nodes are added/updated, a NEW registry CID is created. To always get the latest node list, you must first fetch the latest registry CID from Pinata.

#### Why This Step is Critical

```
❌ WRONG APPROACH:
App → Use hardcoded CID → Fetch old node list → Missing new nodes

✅ CORRECT APPROACH:
App → Fetch latest CID from Pinata → Fetch current node list → All nodes available
```

#### How it Works

1. **Admin adds new VPN node** → Publishes new registry to IPFS → **NEW CID created**
2. **Your app starts** → Calls Pinata API → **Gets latest CID**
3. **App fetches nodes** → Uses latest CID → **Gets all nodes including new one**

#### Request

```http
GET https://api.pinata.cloud/data/pinList?status=pinned&metadata[name]=dvpn-nodes-registry&pageLimit=1&sortBy=date_pinned:DESC
```

#### Headers

| Header | Value |
|--------|-------|
| Authorization | Bearer {PINATA_JWT} |

#### Query Parameters Explained

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `status` | `pinned` | Only show items currently pinned on IPFS |
| `metadata[name]` | `dvpn-nodes-registry` | Filter for node registry only |
| `pageLimit` | `1` | Return only 1 result (the latest) |
| `sortBy` | `date_pinned:DESC` | Sort by date, newest first |

#### Response

```json
{
  "count": 5,
  "rows": [
    {
      "id": "abc123def456",
      "ipfs_pin_hash": "QmWshwhqU236FVSmEA1aKgDeEHZuFebUF7ibJ5an9hn7My",
      "size": 1234,
      "date_pinned": "2026-01-23T12:00:00.000Z",
      "date_unpinned": null,
      "metadata": {
        "name": "dvpn-nodes-registry",
        "keyvalues": {
          "type": "vpn-nodes",
          "version": "1.0"
        }
      }
    }
  ]
}
```

#### Response Fields Explanation

| Field | Type | Description |
|-------|------|-------------|
| `count` | Number | Total number of matching pins |
| `rows` | Array | List of pinned items (sorted by date_pinned DESC) |
| `rows[0].ipfs_pin_hash` | String | **⭐ THIS IS THE CID YOU NEED!** Use this to fetch nodes |
| `date_pinned` | String | When this version was pinned (ISO 8601 format) |
| `metadata.name` | String | Human-readable name for identification |
| `metadata.keyvalues` | Object | Additional metadata for filtering |

**Important:** The `ipfs_pin_hash` field contains the CID (Content Identifier) you'll use to fetch the actual node data from IPFS.

#### Implementation

```kotlin
suspend fun fetchLatestRegistryCID(): String {
    try {
        val response = httpClient.get(
            "${DVPNConfig.PINATA_API_URL}/data/pinList" +
            "?status=pinned&metadata[name]=dvpn-nodes-registry&pageLimit=1"
        ) {
            header("Authorization", "Bearer ${DVPNConfig.PINATA_JWT}")
        }
        
        if (response.status.isSuccess()) {
            val data = response.body<PinListResponse>()
            if (data.rows.isNotEmpty()) {
                return data.rows[0].ipfsPinHash  // Latest registry CID
            }
        }
    } catch (e: Exception) {
        Log.e("DVPN", "Failed to fetch latest CID: ${e.message}")
    }
    
    // Fallback to hardcoded CID
    return DVPNConfig.NODES_REGISTRY_CID
}

// Data models for Pinata API response
data class PinListResponse(
    val count: Int,
    val rows: List<PinListItem>
)

data class PinListItem(
    val id: String,
    @SerializedName("ipfs_pin_hash") val ipfsPinHash: String,  // ⭐ The CID!
    val size: Long,
    @SerializedName("date_pinned") val datePinned: String,
    @SerializedName("date_unpinned") val dateUnpinned: String?,
    val metadata: PinMetadata
)

data class PinMetadata(
    val name: String,
    val keyvalues: Map<String, String>?
)
```

> **⚠️ CRITICAL**: Always call `fetchLatestRegistryCID()` before fetching nodes to ensure you get the most up-to-date node list!

#### Real-World Example

```kotlin
// Example: Node registry updates over time

// Day 1 - Initial registry with 2 nodes
Admin publishes nodes → CID: QmAbc123...
Your app fetches: QmAbc123... → Gets 2 nodes ✅

// Day 3 - Admin adds 3 more nodes
Admin publishes nodes → CID: QmDef456... (NEW!)

// Your app with hardcoded CID:
App uses: QmAbc123... → Still gets 2 nodes ❌ (Missing 3 new nodes!)

// Your app fetching latest CID:
App fetches latest CID → QmDef456...
App uses: QmDef456... → Gets all 5 nodes ✅

// Key Insight: The old CID (QmAbc123) still exists on IPFS and still 
// returns 2 nodes, but it's outdated. Always fetch the latest CID!
```

---

### 1. Fetch VPN Nodes

Retrieve all available VPN nodes from the IPFS registry.

#### Request

```
GET https://gateway.pinata.cloud/ipfs/{NODES_REGISTRY_CID}
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| CID | String | Content Identifier for the node registry (get latest from Pinata API first!) |

#### Response

```json
{
  "name": "DVPN Node Registry",
  "version": "1.0",
  "updated_at": "2026-01-23T10:00:00.000Z",
  "nodes": [
    {
      "endpoint": "167.71.230.209:51820",
      "location": "Germany",
      "region": "EU",
      "provider": "ahrWpmnbSqY1zrYKDWz1am6f2vgKgxDJrr1bdmx3KH6",
      "wg_server_pubkey": "WgServerPublicKeyBase64==",
      "price_per_hour_lamports": 6000000,
      "is_active": true,
      "bandwidth_mbps": 100,
      "rating_avg": "4.5"
    }
  ]
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `endpoint` | String | Server IP:Port for WireGuard connection |
| `location` | String | Human-readable location (e.g., "Germany") |
| `region` | String | Region code (EU, US, ASIA) |
| `provider` | String | Solana wallet address of node provider |
| `wg_server_pubkey` | String | WireGuard server public key (Base64) |
| `price_per_hour_lamports` | Number | Price in lamports (1 SOL = 1,000,000,000 lamports) |
| `is_active` | Boolean | Whether node is currently active |
| `bandwidth_mbps` | Number | Node bandwidth in Mbps |
| `rating_avg` | String | Average user rating (1-5) |

---

### 2. Publish New Node

Register a new VPN node on IPFS.

#### Request

```
POST https://api.pinata.cloud/pinning/pinJSONToIPFS
```

#### Headers

| Header | Value |
|--------|-------|
| Authorization | Bearer {PINATA_JWT} |
| Content-Type | application/json |

#### Request Body

```json
{
  "pinataContent": {
    "name": "DVPN Node",
    "version": "1.0",
    "type": "vpn-node",
    "published_at": "2026-01-23T10:00:00.000Z",
    "node": {
      "endpoint": "192.168.1.100:51820",
      "location": "United States",
      "provider_wallet": "YourSolanaWalletAddress",
      "wg_server_pubkey": "YourWireGuardPublicKey==",
      "price_per_hour_lamports": 6000000,
      "is_active": true,
      "bandwidth_mbps": 100
    }
  },
  "pinataMetadata": {
    "name": "dvpn-node-192-168-1-100-51820",
    "keyvalues": {
      "type": "vpn-node",
      "provider": "YourSolanaWalletAddress",
      "location": "United States"
    }
  }
}
```

#### Response

```json
{
  "IpfsHash": "Qm...",
  "PinSize": 1234,
  "Timestamp": "2026-01-23T10:00:00.000Z"
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `IpfsHash` | String | CID of the published content |
| `PinSize` | Number | Size in bytes |
| `Timestamp` | String | ISO 8601 timestamp |

---

### 3. Fetch Sessions

Retrieve user VPN sessions from IPFS.

#### Request

```
GET https://gateway.pinata.cloud/ipfs/{SESSIONS_CID}
```

#### Response

```json
{
  "name": "DVPN Sessions",
  "version": "1.0",
  "updated_at": "2026-01-23T10:00:00.000Z",
  "sessions": [
    {
      "id": "session_1706012345678_abc123def",
      "session_id": "session_1706012345678_abc123def",
      "user_wallet": "UserSolanaWalletAddress",
      "node_provider": "ProviderSolanaWalletAddress",
      "node_endpoint": "167.71.230.209:51820",
      "node_location": "Germany",
      "start_time": "2026-01-23T10:00:00.000Z",
      "end_time": "2026-01-23T11:00:00.000Z",
      "is_active": false,
      "bytes_used": 104857600,
      "amount_paid": 0,
      "duration_seconds": 3600,
      "created_at": "2026-01-23T10:00:00.000Z"
    }
  ]
}
```

#### Session Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Unique session identifier |
| `session_id` | String | Same as id (for compatibility) |
| `user_wallet` | String | User's Solana wallet address |
| `node_provider` | String | Provider's Solana wallet address |
| `node_endpoint` | String | VPN server endpoint used |
| `node_location` | String | Server location |
| `start_time` | String | ISO 8601 session start time |
| `end_time` | String | ISO 8601 session end time (null if active) |
| `is_active` | Boolean | Whether session is currently active |
| `bytes_used` | Number | Data transferred in bytes |
| `amount_paid` | Number | Amount paid in lamports |
| `duration_seconds` | Number | Total session duration |
| `created_at` | String | ISO 8601 creation timestamp |

---

### 4. Publish Sessions

Store updated sessions on IPFS.

#### Request

```
POST https://api.pinata.cloud/pinning/pinJSONToIPFS
```

#### Headers

| Header | Value |
|--------|-------|
| Authorization | Bearer {PINATA_JWT} |
| Content-Type | application/json |

#### Request Body

```json
{
  "pinataContent": {
    "name": "DVPN Sessions",
    "version": "1.0",
    "updated_at": "2026-01-23T10:00:00.000Z",
    "sessions": [
      {
        "id": "session_1706012345678_abc123def",
        "user_wallet": "UserWalletAddress",
        "node_provider": "ProviderWalletAddress",
        "node_endpoint": "167.71.230.209:51820",
        "node_location": "Germany",
        "start_time": "2026-01-23T10:00:00.000Z",
        "end_time": null,
        "is_active": true,
        "bytes_used": 0,
        "amount_paid": 0,
        "created_at": "2026-01-23T10:00:00.000Z"
      }
    ]
  },
  "pinataMetadata": {
    "name": "dvpn-sessions",
    "keyvalues": {
      "type": "dvpn-sessions",
      "count": "1",
      "updated": "2026-01-23T10:00:00.000Z"
    }
  }
}
```

#### Response

```json
{
  "IpfsHash": "QmNewSessionsCID...",
  "PinSize": 5678,
  "Timestamp": "2026-01-23T10:00:00.000Z"
}
```

> **Important**: Save the returned `IpfsHash` locally to fetch sessions later.

---

### 5. Fetch Earnings

Retrieve provider earnings from IPFS.

#### Request

```
GET https://gateway.pinata.cloud/ipfs/{EARNINGS_CID}
```

#### Response

```json
{
  "name": "DVPN Earnings",
  "version": "1.0",
  "updated_at": "2026-01-23T10:00:00.000Z",
  "earnings": {
    "ProviderWalletAddress": {
      "withdrawn": 100000000,
      "withdrawals": [
        {
          "amount": 100000000,
          "timestamp": "2026-01-22T10:00:00.000Z",
          "tx_signature": "SolanaTransactionSignature..."
        }
      ]
    }
  }
}
```

#### Earnings Calculation

Earnings are calculated from sessions:

```kotlin
fun calculateProviderEarnings(
    sessions: List<Session>, 
    providerWallet: String,
    withdrawnAmount: Long
): EarningsInfo {
    val providerSessions = sessions.filter { it.nodeProvider == providerWallet }
    
    // 0.001 SOL per minute (100000 lamports)
    val totalEarnedLamports = providerSessions.sumOf { session ->
        val durationMinutes = (session.durationSeconds ?: 0) / 60.0
        (durationMinutes * 100000).toLong()  // 0.001 SOL = 100000 lamports/min
    }
    
    val availableBalance = maxOf(0, totalEarnedLamports - withdrawnAmount)
    
    return EarningsInfo(
        totalEarned = totalEarnedLamports,
        totalEarnedSol = totalEarnedLamports / 1_000_000_000.0,
        withdrawn = withdrawnAmount,
        withdrawnSol = withdrawnAmount / 1_000_000_000.0,
        availableBalance = availableBalance,
        availableBalanceSol = availableBalance / 1_000_000_000.0,
        totalSessions = providerSessions.size,
        activeSessions = providerSessions.count { it.isActive }
    )
}
```

---

### 6. Publish Earnings

Store updated earnings data on IPFS.

#### Request

```
POST https://api.pinata.cloud/pinning/pinJSONToIPFS
```

#### Headers

| Header | Value |
|--------|-------|
| Authorization | Bearer {PINATA_JWT} |
| Content-Type | application/json |

#### Request Body

```json
{
  "pinataContent": {
    "name": "DVPN Earnings",
    "version": "1.0",
    "updated_at": "2026-01-23T10:00:00.000Z",
    "earnings": {
      "ProviderWalletAddress": {
        "withdrawn": 200000000,
        "withdrawals": [
          {
            "amount": 100000000,
            "timestamp": "2026-01-22T10:00:00.000Z",
            "tx_signature": "tx_signature_1"
          },
          {
            "amount": 100000000,
            "timestamp": "2026-01-23T10:00:00.000Z",
            "tx_signature": "tx_signature_2"
          }
        ]
      }
    }
  },
  "pinataMetadata": {
    "name": "dvpn-earnings",
    "keyvalues": {
      "type": "dvpn-earnings",
      "updated": "2026-01-23T10:00:00.000Z"
    }
  }
}
```

---

### 7. List Pinned Items

Get a list of all pinned items from Pinata.

#### Request

```
GET https://api.pinata.cloud/data/pinList?status=pinned&metadata[keyvalues][type]={"value":"vpn-node","op":"eq"}
```

#### Headers

| Header | Value |
|--------|-------|
| Authorization | Bearer {PINATA_JWT} |

#### Query Parameters

| Parameter | Description |
|-----------|-------------|
| status | Filter by pin status: `pinned`, `unpinned`, `all` |
| metadata[keyvalues][type] | Filter by metadata key-value pairs |

#### Response

```json
{
  "count": 5,
  "rows": [
    {
      "id": "abc123",
      "ipfs_pin_hash": "Qm...",
      "size": 1234,
      "user_id": "user123",
      "date_pinned": "2026-01-23T10:00:00.000Z",
      "date_unpinned": null,
      "metadata": {
        "name": "dvpn-node-192-168-1-100",
        "keyvalues": {
          "type": "vpn-node",
          "provider": "ProviderWalletAddress",
          "location": "Germany"
        }
      }
    }
  ]
}
```

---

## Data Models

### Kotlin Data Classes

```kotlin
// VPN Node
data class VPNNode(
    val endpoint: String,
    val location: String,
    val region: String?,
    val provider: String,
    @SerializedName("wg_server_pubkey") val wgServerPubkey: String,
    @SerializedName("price_per_hour_lamports") val pricePerHourLamports: Long,
    @SerializedName("is_active") val isActive: Boolean,
    @SerializedName("bandwidth_mbps") val bandwidthMbps: Int?,
    @SerializedName("rating_avg") val ratingAvg: String?
)

// Node Registry
data class NodeRegistry(
    val name: String,
    val version: String,
    @SerializedName("updated_at") val updatedAt: String,
    val nodes: List<VPNNode>
)

// Session
data class Session(
    val id: String,
    @SerializedName("session_id") val sessionId: String,
    @SerializedName("user_wallet") val userWallet: String,
    @SerializedName("node_provider") val nodeProvider: String,
    @SerializedName("node_endpoint") val nodeEndpoint: String,
    @SerializedName("node_location") val nodeLocation: String,
    @SerializedName("start_time") val startTime: String,
    @SerializedName("end_time") val endTime: String?,
    @SerializedName("is_active") val isActive: Boolean,
    @SerializedName("bytes_used") val bytesUsed: Long,
    @SerializedName("amount_paid") val amountPaid: Long,
    @SerializedName("duration_seconds") val durationSeconds: Int?,
    @SerializedName("created_at") val createdAt: String
)

// Sessions Container
data class SessionsContainer(
    val name: String,
    val version: String,
    @SerializedName("updated_at") val updatedAt: String,
    val sessions: List<Session>
)

// Withdrawal Record
data class Withdrawal(
    val amount: Long,
    val timestamp: String,
    @SerializedName("tx_signature") val txSignature: String
)

// Provider Earnings
data class ProviderEarnings(
    val withdrawn: Long,
    val withdrawals: List<Withdrawal>
)

// Earnings Container
data class EarningsContainer(
    val name: String,
    val version: String,
    @SerializedName("updated_at") val updatedAt: String,
    val earnings: Map<String, ProviderEarnings>
)

// Pinata Upload Response
data class PinataResponse(
    @SerializedName("IpfsHash") val ipfsHash: String,
    @SerializedName("PinSize") val pinSize: Long,
    @SerializedName("Timestamp") val timestamp: String
)

// Earnings Info (calculated)
data class EarningsInfo(
    val totalEarned: Long,
    val totalEarnedSol: Double,
    val withdrawn: Long,
    val withdrawnSol: Double,
    val availableBalance: Long,
    val availableBalanceSol: Double,
    val totalSessions: Int,
    val activeSessions: Int
)
```

---

## Android Implementation Examples

### 1. Repository Setup

```kotlin
class DVPNRepository(
    private val httpClient: HttpClient,
    private val context: Context
) {
    private val prefs = context.getSharedPreferences("dvpn_prefs", Context.MODE_PRIVATE)
    
    // Cache
    private var nodesCache: List<VPNNode>? = null
    private var sessionsCache: List<Session>? = null
    private var lastNodesFetch: Long = 0
    private var lastSessionsFetch: Long = 0
    private val CACHE_TTL = 30_000L // 30 seconds
    
    // CID Storage
    private var sessionsCid: String?
        get() = prefs.getString("sessions_cid", null)
        set(value) = prefs.edit().putString("sessions_cid", value).apply()
    
    private var earningsCid: String?
        get() = prefs.getString("earnings_cid", null)
        set(value) = prefs.edit().putString("earnings_cid", value).apply()
}
```

### 2. Fetch VPN Nodes

```kotlin
suspend fun fetchNodes(forceRefresh: Boolean = false): List<VPNNode> {
    // Check cache
    if (!forceRefresh && 
        nodesCache != null && 
        System.currentTimeMillis() - lastNodesFetch < CACHE_TTL) {
        return nodesCache!!
    }
    
    // Try each gateway
    for (gateway in DVPNConfig.IPFS_GATEWAYS) {
        try {
            val response = httpClient.get("$gateway${DVPNConfig.NODES_REGISTRY_CID}") {
                timeout { requestTimeoutMillis = 10_000 }
            }
            
            if (response.status.isSuccess()) {
                val registry = response.body<NodeRegistry>()
                nodesCache = registry.nodes.filter { it.isActive }
                lastNodesFetch = System.currentTimeMillis()
                return nodesCache!!
            }
        } catch (e: Exception) {
            Log.d("DVPN", "Gateway $gateway failed: ${e.message}")
        }
    }
    
    return nodesCache ?: emptyList()
}
```

### 3. Create Session

```kotlin
suspend fun createSession(node: VPNNode, userWallet: String): Session {
    // Fetch existing sessions
    val sessions = fetchSessions().toMutableList()
    
    // Create new session
    val sessionId = "session_${System.currentTimeMillis()}_${UUID.randomUUID().toString().take(9)}"
    val now = Instant.now().toString()
    
    val newSession = Session(
        id = sessionId,
        sessionId = sessionId,
        userWallet = userWallet,
        nodeProvider = node.provider,
        nodeEndpoint = node.endpoint,
        nodeLocation = node.location,
        startTime = now,
        endTime = null,
        isActive = true,
        bytesUsed = 0,
        amountPaid = 0,
        durationSeconds = null,
        createdAt = now
    )
    
    sessions.add(newSession)
    
    // Publish to IPFS
    publishSessions(sessions)
    
    return newSession
}
```

### 4. Publish to Pinata

```kotlin
suspend fun publishSessions(sessions: List<Session>): String? {
    val payload = buildJsonObject {
        putJsonObject("pinataContent") {
            put("name", "DVPN Sessions")
            put("version", "1.0")
            put("updated_at", Instant.now().toString())
            putJsonArray("sessions") {
                sessions.forEach { session ->
                    addJsonObject {
                        put("id", session.id)
                        put("session_id", session.sessionId)
                        put("user_wallet", session.userWallet)
                        put("node_provider", session.nodeProvider)
                        put("node_endpoint", session.nodeEndpoint)
                        put("node_location", session.nodeLocation)
                        put("start_time", session.startTime)
                        put("end_time", session.endTime)
                        put("is_active", session.isActive)
                        put("bytes_used", session.bytesUsed)
                        put("amount_paid", session.amountPaid)
                        put("duration_seconds", session.durationSeconds)
                        put("created_at", session.createdAt)
                    }
                }
            }
        }
        putJsonObject("pinataMetadata") {
            put("name", "dvpn-sessions")
            putJsonObject("keyvalues") {
                put("type", "dvpn-sessions")
                put("count", sessions.size.toString())
                put("updated", Instant.now().toString())
            }
        }
    }
    
    try {
        val response = httpClient.post("${DVPNConfig.PINATA_API_URL}/pinning/pinJSONToIPFS") {
            header("Authorization", "Bearer ${DVPNConfig.PINATA_JWT}")
            contentType(ContentType.Application.Json)
            setBody(payload.toString())
        }
        
        if (response.status.isSuccess()) {
            val result = response.body<PinataResponse>()
            sessionsCid = result.ipfsHash
            sessionsCache = sessions
            lastSessionsFetch = System.currentTimeMillis()
            Log.d("DVPN", "Sessions published: ${result.ipfsHash}")
            return result.ipfsHash
        }
    } catch (e: Exception) {
        Log.e("DVPN", "Failed to publish sessions: ${e.message}")
    }
    
    return null
}
```

### 5. End Session

```kotlin
suspend fun endSession(sessionId: String): Session? {
    val sessions = fetchSessions().toMutableList()
    val sessionIndex = sessions.indexOfFirst { it.id == sessionId || it.sessionId == sessionId }
    
    if (sessionIndex >= 0) {
        val session = sessions[sessionIndex]
        val now = Instant.now().toString()
        
        val startInstant = Instant.parse(session.startTime)
        val endInstant = Instant.now()
        val durationSeconds = Duration.between(startInstant, endInstant).seconds.toInt()
        
        val updatedSession = session.copy(
            endTime = now,
            isActive = false,
            durationSeconds = durationSeconds,
            bytesUsed = Random.nextLong(1_000_000, 100_000_000)
        )
        
        sessions[sessionIndex] = updatedSession
        publishSessions(sessions)
        
        return updatedSession
    }
    
    return null
}
```

### 6. WireGuard Integration

```kotlin
// Generate WireGuard configuration
fun generateWireGuardConfig(
    node: VPNNode,
    clientPrivateKey: String,
    clientPublicKey: String,
    clientAddress: String,
    presharedKey: String
): String {
    return """
        [Interface]
        PrivateKey = $clientPrivateKey
        Address = $clientAddress
        DNS = 1.1.1.1, 8.8.8.8
        
        [Peer]
        PublicKey = ${node.wgServerPubkey}
        PresharedKey = $presharedKey
        AllowedIPs = 0.0.0.0/0, ::/0
        Endpoint = ${node.endpoint}
        PersistentKeepalive = 25
    """.trimIndent()
}

// Connect to VPN Server to get client IP
suspend fun requestVPNConfig(node: VPNNode, clientPubkey: String): VPNConfigResponse {
    // Connect to VPN server on port 22222
    val socket = Socket()
    socket.connect(InetSocketAddress(node.endpoint.split(":")[0], 22222), 10000)
    
    val writer = BufferedWriter(OutputStreamWriter(socket.getOutputStream()))
    val reader = BufferedReader(InputStreamReader(socket.getInputStream()))
    
    // Send request
    writer.write("start\n$clientPubkey\n")
    writer.flush()
    
    // Read response
    val clientIP = reader.readLine()        // e.g., "10.0.0.5/32"
    val presharedKey = reader.readLine()    // Base64 preshared key
    
    socket.close()
    
    return VPNConfigResponse(
        clientIP = clientIP,
        presharedKey = presharedKey
    )
}

data class VPNConfigResponse(
    val clientIP: String,
    val presharedKey: String
)
```

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Gateway timeout | IPFS gateway slow | Try next gateway in list |
| 401 Unauthorized | Invalid Pinata JWT | Check JWT token |
| CID not found | Data not pinned | Verify CID is correct |
| Network error | No internet | Show offline message |

### Error Handling Example

```kotlin
sealed class DVPNResult<out T> {
    data class Success<T>(val data: T) : DVPNResult<T>()
    data class Error(val message: String, val code: Int? = null) : DVPNResult<Nothing>()
}

suspend fun <T> safeApiCall(block: suspend () -> T): DVPNResult<T> {
    return try {
        DVPNResult.Success(block())
    } catch (e: SocketTimeoutException) {
        DVPNResult.Error("Connection timed out. Please try again.")
    } catch (e: UnknownHostException) {
        DVPNResult.Error("No internet connection.")
    } catch (e: HttpException) {
        DVPNResult.Error("Server error: ${e.code()}", e.code())
    } catch (e: Exception) {
        DVPNResult.Error(e.message ?: "Unknown error occurred")
    }
}
```

---

## Best Practices

### 1. CID Management

```kotlin
// Always store CIDs locally after publishing
fun saveCid(type: String, cid: String) {
    prefs.edit().putString("${type}_cid", cid).apply()
}

fun getCid(type: String): String? {
    return prefs.getString("${type}_cid", null)
}
```

### 2. Caching Strategy

```kotlin
// Use memory cache with TTL
class Cache<T>(private val ttlMs: Long = 30_000) {
    private var data: T? = null
    private var lastFetch: Long = 0
    
    fun get(): T? {
        return if (isValid()) data else null
    }
    
    fun set(value: T) {
        data = value
        lastFetch = System.currentTimeMillis()
    }
    
    fun isValid(): Boolean {
        return data != null && System.currentTimeMillis() - lastFetch < ttlMs
    }
    
    fun invalidate() {
        data = null
        lastFetch = 0
    }
}
```

### 3. Gateway Fallback

```kotlin
// Always try multiple gateways
suspend fun fetchWithFallback(cid: String): String? {
    for (gateway in DVPNConfig.IPFS_GATEWAYS) {
        try {
            val response = httpClient.get("$gateway$cid") {
                timeout { requestTimeoutMillis = 10_000 }
            }
            if (response.status.isSuccess()) {
                return response.bodyAsText()
            }
        } catch (e: Exception) {
            continue
        }
    }
    throw Exception("All IPFS gateways failed")
}
```

### 4. Background Sync

```kotlin
// Use WorkManager for periodic sync
class DVPNSyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {
    
    override suspend fun doWork(): Result {
        return try {
            val repository = DVPNRepository.getInstance(applicationContext)
            repository.syncFromIPFS()
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}

// Schedule periodic sync
fun schedulePeriodSync() {
    val request = PeriodicWorkRequestBuilder<DVPNSyncWorker>(
        15, TimeUnit.MINUTES
    ).setConstraints(
        Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
    ).build()
    
    WorkManager.getInstance(context)
        .enqueueUniquePeriodicWork(
            "dvpn_sync",
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )
}
```

---

## Summary

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Fetch Nodes | `gateway/ipfs/{CID}` | GET |
| Publish Node | `/pinning/pinJSONToIPFS` | POST |
| Fetch Sessions | `gateway/ipfs/{CID}` | GET |
| Publish Sessions | `/pinning/pinJSONToIPFS` | POST |
| Fetch Earnings | `gateway/ipfs/{CID}` | GET |
| Publish Earnings | `/pinning/pinJSONToIPFS` | POST |
| List Pins | `/data/pinList` | GET |

### Key Points

1. **No Central Server**: All data is on IPFS
2. **CID Tracking**: Save CIDs locally after each publish
3. **Gateway Fallback**: Always try multiple gateways
4. **Cache Locally**: Reduce IPFS fetches with local caching
5. **Immutable Data**: Updates create new CIDs

---

## Support

For questions or issues:
- Check the [IPFS Documentation](https://docs.ipfs.io/)
- Check the [Pinata Documentation](https://docs.pinata.cloud/)
- Review the desktop app implementation in `/app/renderer.js`

---

**Version**: 1.0  
**Last Updated**: January 23, 2026  
**Compatible with**: DVPN Desktop v1.0.0
