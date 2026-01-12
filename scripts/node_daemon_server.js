const anchor = require('@coral-xyz/anchor');
const { PublicKey, Keypair, Connection } = require('@solana/web3.js');
const fs = require('fs');
const idl = require('../target/idl/dvpn.json');
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const crypto = require('crypto');
const child = require('child_process');
const path = require('path');
const STATE_DIR = path.join(__dirname, '..', 'state');
const PEERS_FILE = path.join(STATE_DIR, 'peers.json');
const WG_INTERFACE = process.env.WG_INTERFACE || 'wg0';
const lockfile = require('proper-lockfile');

// flags
const DRY_RUN = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run');

// simple JSON-line structured logger
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
function log(level, msg, meta){
  const lvlNum = LEVELS[level] ?? 2;
  const curNum = LEVELS[LOG_LEVEL] ?? 2;
  if (lvlNum > curNum) return;
  const out = Object.assign({ ts: new Date().toISOString(), level, msg }, meta || {});
  try{ process.stdout.write(JSON.stringify(out) + '\n'); }catch(e){ /* ignore */ }
}

const PROGRAM_ID = idl.metadata.address;
const NODE_PUB = new PublicKey('EG4d3Y7rmEFvsCjTFWhxY71mDrhZb5NoYx2bqQdhSpfZ');
const PROVIDER_PUB = new PublicKey('43y5RPkeFTrLz6ECNpKKT5vthuS9ge6WeaJwsi4gUFx7');

function jsonResponse(res, code, obj){
  const s = JSON.stringify(obj);
  res.writeHead(code, {'Content-Type':'application/json','Content-Length':Buffer.byteLength(s)});
  res.end(s);
}

function parseBody(req){
  return new Promise((resolve,reject)=>{
    let b=''; req.on('data',c=>b+=c); req.on('end',()=>{ try{ resolve(JSON.parse(b||'{}')); }catch(e){ reject(e) } });
  });
}

async function createSession(userKeypairPath, sessionId, minutes){
  const secret = JSON.parse(fs.readFileSync(userKeypairPath,'utf8'));
  const kp = Keypair.fromSecretKey(Buffer.from(secret));
  const url = process.env.ANCHOR_PROVIDER_URL || 'https://api.testnet.solana.com';
  const conn = new Connection(url, 'confirmed');
  const wallet = new anchor.Wallet(kp);
  const provider = new anchor.AnchorProvider(conn, wallet, anchor.AnchorProvider.defaultOptions());
  const program = new anchor.Program(idl, PROGRAM_ID, provider);

  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(sessionId));
  const [sessionPda] = await PublicKey.findProgramAddress([Buffer.from('session'), kp.publicKey.toBuffer(), NODE_PUB.toBuffer(), idBuf], program.programId);

  // Build manual instruction (Anchor client caused writable-privilege escalation in simulation)
  const disc = Buffer.from([130,54,124,7,236,20,104,104]);
  const minutesBuf = Buffer.alloc(4);
  minutesBuf.writeUInt32LE(Number(minutes), 0);
  const data = Buffer.concat([disc, idBuf, minutesBuf]);

  const ix = new anchor.web3.TransactionInstruction({
    keys: [
      { pubkey: kp.publicKey, isSigner: true, isWritable: true },
      { pubkey: PROVIDER_PUB, isSigner: false, isWritable: false },
      { pubkey: NODE_PUB, isSigner: false, isWritable: false },
      { pubkey: sessionPda, isSigner: false, isWritable: true },
      { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    programId: program.programId,
    data,
  });

  const tx = new anchor.web3.Transaction().add(ix);
  const sig = await provider.sendAndConfirm(tx, [kp]);
  return { tx: sig, sessionPda: sessionPda.toBase58() };
}

async function runServer(){
  const url = process.env.ANCHOR_PROVIDER_URL || 'https://api.testnet.solana.com';
  const conn = new Connection(url, 'confirmed');
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  let program = null;
  async function getProgram(){
    if (program) return program;
    try{ program = new anchor.Program(idl, PROGRAM_ID, provider); return program; }catch(e){ throw e }
  }

  // simple in-process locks to prevent concurrent wg/peers.json races
  const sessionLocks = new Set();

  const server = require('http').createServer(async (req,res)=>{
    try{
      if (req.method==='GET' && req.url==='/node'){
        const node = await program.account.node.fetchNullable(NODE_PUB);
        if (!node) return jsonResponse(res,404,{error:'node not found'});
        return jsonResponse(res,200,{endpoint:node.endpoint, region:node.region, wg_server_pubkey: Buffer.from(node.wgServerPubkey||node.wg_server_pubkey).toString('hex'), node_id: node.nodeId?.toString?node.nodeId.toString():node.node_id});
      }

      if (req.method==='GET' && req.url.startsWith('/session/')){
        const p = req.url.split('/')[2];
        if (!p) return jsonResponse(res,400,{error:'missing session pda'});
        try{ const sess = await program.account.session.fetch(p); return jsonResponse(res,200,{session:sess}); }catch(e){ return jsonResponse(res,404,{error:'session not found', details:e.message}); }
      }

      if (req.method==='POST' && req.url==='/session'){
        const body = await parseBody(req);
        const { keypairPath, sessionId, minutes } = body;
        if (!keypairPath || sessionId===undefined || minutes===undefined) return jsonResponse(res,400,{error:'keypairPath, sessionId, minutes required'});
        try{
          const r = await createSession(keypairPath, Number(sessionId), Number(minutes));
          return jsonResponse(res,200,r);
        }catch(e){ return jsonResponse(res,500,{error:'create session failed', details:e.message}); }
      }

      // helper: decode Session account bytes directly (avoid Anchor account factory issues)
      async function decodeSessionAccount(sessionPda){
        const info = await conn.getAccountInfo(new PublicKey(sessionPda));
        if (!info) throw new Error('account not found');
        const d = info.data;
        if (d.length < 106) throw new Error('account data too short');
        // skip 8-byte discriminator
        let off = 8;
        const user = new PublicKey(d.slice(off, off+32)); off += 32;
        const node = new PublicKey(d.slice(off, off+32)); off += 32;
        const session_id = Number(d.readBigUInt64LE(off)); off += 8;
        const start_ts = Number(d.readBigInt64LE(off)); off += 8;
        const end_ts = Number(d.readBigInt64LE(off)); off += 8;
        const escrow_lamports = Number(d.readBigUInt64LE(off)); off += 8;
        const stateByte = d.readUInt8(off); off += 1;
        const bump = d.readUInt8(off); off += 1;
        const state = stateByte===0? {Active:{}} : stateByte===1? {Closed:{}} : {Claimed:{}};
        return { user, node, session_id, start_ts, end_ts, escrow_lamports, state, bump };
      }

      // helper: decode Node account bytes directly
      async function decodeNodeAccount(nodePub){
        const info = await conn.getAccountInfo(new PublicKey(nodePub));
        if (!info) throw new Error('node account not found');
        const d = info.data;
        let off = 8; // discriminator
        const provider = new PublicKey(d.slice(off, off+32)); off += 32;
        const node_id = Number(d.readBigUInt64LE(off)); off += 8;
        const endpointLen = d.readUInt32LE(off); off += 4;
        const endpoint = d.slice(off, off+endpointLen).toString('utf8'); off += endpointLen;
        const regionLen = d.readUInt32LE(off); off += 4;
        const region = d.slice(off, off+regionLen).toString('utf8'); off += regionLen;
        const price_per_minute_lamports = Number(d.readBigUInt64LE(off)); off += 8;
        const wg_server_pubkey = d.slice(off, off+32); off += 32;
        const bump = d.readUInt8(off); off += 1;
        return { provider, node_id, endpoint, region, price_per_minute_lamports, wg_server_pubkey, bump };
      }

      // Auth endpoint: node will add client WG peer after verifying user signature
      if (req.method==='POST' && req.url==='/session/auth'){
        const body = await parseBody(req);
        const { sessionPda, clientWgPubkey, signature } = body;
        if (!sessionPda || !clientWgPubkey || !signature) return jsonResponse(res,400,{error:'sessionPda, clientWgPubkey, signature required'});

        // validate formats early
        try{ new PublicKey(sessionPda); }catch(e){ return jsonResponse(res,400,{error:'invalid sessionPda'}); }
        let wgPubBuf = null;
        try{ wgPubBuf = Buffer.from(clientWgPubkey.trim(), 'base64'); if (wgPubBuf.length!==32) throw new Error('invalid wg pubkey length'); }catch(e){ return jsonResponse(res,400,{error:'invalid clientWgPubkey: must be base64 32 bytes', details: e.message}); }
        let sigBuf = null;
        try{ sigBuf = bs58.decode(signature); if (sigBuf.length!==64) throw new Error('invalid signature length'); }catch(e){ return jsonResponse(res,400,{error:'invalid signature (must be bs58 of 64 bytes)', details: e.message}); }

        // acquire simple in-process lock for this session to avoid races
        if (sessionLocks.has(sessionPda)) return jsonResponse(res,429,{error:'session busy, try again shortly'});
        sessionLocks.add(sessionPda);
        try{
          // fetch and decode session without Anchor
          let sess;
          try{ sess = await decodeSessionAccount(sessionPda); }catch(e){ return jsonResponse(res,404,{error:'session not found', details: e.message}); }

          // ensure session active and not expired
          const now = Math.floor(Date.now()/1000);
          const endTs = Number(sess.endTs?.toString ? sess.endTs.toString() : sess.end_ts?.toString());
          if (endTs && now > endTs) return jsonResponse(res,403,{error:'session expired'});

          const userPk = sess.user.toBase58();

          // verify signature: client signs the clientWgPubkey (base64) bytes
          try{
            const msg = Buffer.from(clientWgPubkey.trim(), 'utf8');
            const userPubBytes = sess.user.toBuffer();
            if (!nacl.sign.detached.verify(msg, sigBuf, userPubBytes)) return jsonResponse(res,403,{error:'invalid signature'});
          }catch(e){ return jsonResponse(res,400,{error:'signature verification failed', details: e.message}); }

          // ensure state dir and read peers atomically
          try{ if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR); }catch(e){}
          let peers = {};
          try{ peers = JSON.parse(fs.readFileSync(PEERS_FILE,'utf8')||'{}'); }catch(e){ peers = {}; }

          // idempotency: if peer already recorded and wg shows peer exists, return existing mapping
          const existing = peers[sessionPda];
          try{
            const wgDump = child.execSync(`sudo wg show ${WG_INTERFACE} dump`, {encoding:'utf8', shell:true});
            if (existing && wgDump.indexOf(existing.clientWgPubkey) !== -1){
              return jsonResponse(res,200,{assignedIp: existing.assignedIp, clientConfig: { interface: { address: `${existing.assignedIp}/32` } }});
            }
          }catch(e){ /* continue - wg dump may fail, proceed to add */ }

          // allocate IP deterministically from client pubkey
          const hash = crypto.createHash('sha256').update(clientWgPubkey.trim()).digest();
          const last = (hash[0] % 250) + 4; // avoid .0-.3 and .255
          const assignedIp = `10.10.0.${last}`;

          // ensure wg binary and interface exist
          try { child.execSync('command -v wg', {stdio:'ignore', shell:true}); }
          catch (ee) { return jsonResponse(res,500,{error:'wg not installed', details:'install WireGuard tools (wg) or ensure it is in PATH'}); }
          try { child.execSync(`sudo wg show ${WG_INTERFACE} >/dev/null 2>&1`, {stdio:'ignore', shell:true}); }
          catch (ee) { return jsonResponse(res,500,{error:'wg interface not found', details:`bring up interface ${WG_INTERFACE} or set WG_INTERFACE env var`}); }

          // add or re-add peer
          try{
            const wgPub = clientWgPubkey.trim();
            // remove any existing entry for same pubkey first (idempotency)
            try{ child.execSync(`sudo wg set ${WG_INTERFACE} peer ${wgPub} remove`, {stdio:'ignore', shell:true}); }catch(_){ }
            child.execSync(`sudo wg set ${WG_INTERFACE} peer ${wgPub} allowed-ips ${assignedIp}/32 persistent-keepalive 25`, {stdio:'ignore', shell:true});
          }catch(e){ return jsonResponse(res,500,{error:'failed to run wg command', details: e.message}); }

          // store mapping atomically
          peers[sessionPda] = { clientWgPubkey: clientWgPubkey.trim(), assignedIp, addedAt: Math.floor(Date.now()/1000), user: userPk };
          try{
            const tmp = PEERS_FILE + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(peers, null, 2));
            fs.renameSync(tmp, PEERS_FILE);
          }catch(e){ console.error('failed to write peers file:', e.message || e.toString()); }

          // convert any remaining console.error in this block to structured log

          // return WG client snippet (decode node without Anchor)
          let serverPub = '';
          let endpoint = 'endpoint:51820';
          try{
            const nd = await decodeNodeAccount(NODE_PUB);
            serverPub = Buffer.from(nd.wg_server_pubkey || nd.wg_server_pubkey).toString('base64');
            endpoint = nd.endpoint || endpoint;
          }catch(e){ /* ignore, fallback to defaults */ }

          const clientConfig = {
            interface: { address: `${assignedIp}/32` },
            peer: {
              public_key: serverPub,
              endpoint: endpoint,
              allowed_ips: '0.0.0.0/0',
              persistent_keepalive: 25
            }
          };

          return jsonResponse(res,200,{assignedIp, clientConfig});
        }finally{ sessionLocks.delete(sessionPda); }
      }

      jsonResponse(res,404,{error:'not found'});
    }catch(e){ jsonResponse(res,500,{error:e.message, stack: e.stack}); }
  });

  // Periodic cleanup: remove expired peers from WireGuard and peers.json
  async function cleanupExpiredPeers(){
    try{
      if (!fs.existsSync(PEERS_FILE)) return;
      const now = Math.floor(Date.now()/1000);
      let changed = false;

      // lock peers file for the duration of cleanup
      const release = await lockfile.lock(PEERS_FILE, { retries: { retries: 5, factor: 2, minTimeout: 50 } });
      try{
        let peers = {};
        try{ peers = JSON.parse(fs.readFileSync(PEERS_FILE,'utf8')||'{}'); }catch(e){ peers = {}; }

        for (const sessionPda of Object.keys(peers)){
          try{
            let sess = null;
            try{ sess = await decodeSessionAccount(sessionPda); }catch(_){ sess = null; }
            let endTs = null;
            if (sess){ endTs = Number(sess.end_ts?.toString ? sess.end_ts.toString() : sess.endTs?.toString()); }

            // If session account missing or expired, remove peer
            if (!sess || (endTs && now > endTs)){
              const wgPub = peers[sessionPda].clientWgPubkey;
              if (!DRY_RUN){
                try{ child.execSync(`sudo wg set ${WG_INTERFACE} peer ${wgPub} remove`, {stdio:'ignore', shell:true}); }catch(e){ /* ignore */ }
                delete peers[sessionPda];
                changed = true;
                log('info','removed expired peer',{ sessionPda });
              }else{
                log('info','dry-run: would remove expired peer',{ sessionPda });
              }
            }
          }catch(e){
            try{ const wgPub = peers[sessionPda].clientWgPubkey; if (!DRY_RUN) child.execSync(`sudo wg set ${WG_INTERFACE} peer ${wgPub} remove`, {stdio:'ignore', shell:true}); }catch(_){ }
            if (!DRY_RUN){ delete peers[sessionPda]; changed = true; log('info','removed peer (error)',{ sessionPda, err: e.message || e.toString() }); }
            else{ log('info','dry-run: would remove peer (error)',{ sessionPda, err: e.message || e.toString() }); }
          }
        }

        if (changed && !DRY_RUN){ const tmp = PEERS_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(peers, null, 2)); fs.renameSync(tmp, PEERS_FILE); }
      }finally{ await release(); }
    }catch(e){ log('error','cleanupExpiredPeers error',{ err: e.message || e.toString() }); }
  }

  // run cleanup once at startup and then every minute
  cleanupExpiredPeers().catch((e)=>log('error','cleanup startup error',{ err: e.message || e.toString() }));
  const cleanupIv = setInterval(() => cleanupExpiredPeers().catch(()=>{}), Number(process.env.CLEANUP_INTERVAL_MS || 60000));

  const port = process.env.PORT || 3000;
  server.listen(port, ()=>log('info','node daemon server listening',{ port }));
  // CLI: run a single cleanup cycle and exit if requested
  if (process.argv.includes('--cleanup-now')){
    log('info','cleanup-now requested');
    try{
      await cleanupExpiredPeers();
      log('info','cleanup-now complete');
      process.exit(0);
    }catch(e){
      log('error','cleanup-now failed',{ err: e.message || e.toString() });
      process.exit(1);
    }
  }
  process.on('SIGINT', ()=>{ clearInterval(cleanupIv); server.close(()=>process.exit(0)); });
}

runServer().catch(e=>{ log('error','runServer fatal',{ err: e.message || e.toString() }); process.exit(1); });
