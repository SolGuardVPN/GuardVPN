#!/bin/bash
# Register DVPN Node on Solana
# Run this after setting up WireGuard server

set -e

SERVER_IP="64.227.150.205"
WG_PORT="51820"
REGION="nyc"
PRICE_PER_MINUTE=1000000  # 0.001 SOL per minute
MAX_CAPACITY=100

echo "═══════════════════════════════════════════════════"
echo "   Register DVPN Node on Solana"
echo "═══════════════════════════════════════════════════"
echo ""

# Check if on server or local
if [ "$(hostname -I | grep -o '^[0-9.]*' | head -1)" = "$SERVER_IP" ]; then
  echo "✅ Running on server ($SERVER_IP)"
  WG_PUBLIC_KEY=$(cat /etc/wireguard/server_public.key)
else
  echo "✅ Running locally, will register remote server"
  echo "⚠️  Make sure you have the WireGuard public key from server"
  echo ""
  echo "Get it by running on server:"
  echo "   cat /etc/wireguard/server_public.key"
  echo ""
  read -p "Enter WireGuard public key: " WG_PUBLIC_KEY
fi

echo ""
echo "📋 Node Details:"
echo "   IP: $SERVER_IP"
echo "   Port: $WG_PORT"
echo "   Region: $REGION"
echo "   Price: $PRICE_PER_MINUTE lamports/min"
echo "   Capacity: $MAX_CAPACITY sessions"
echo "   WG Public Key: $WG_PUBLIC_KEY"
echo ""

# Create registration script
cat > /tmp/register_node.js << EOF
const anchor = require('@coral-xyz/anchor');
const { PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');
const idl = require('../target/idl/dvpn.json');

async function main() {
  // Setup
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, provider);
  
  console.log('🔗 Connecting to Solana...');
  console.log('   RPC:', provider.connection.rpcEndpoint);
  console.log('   Wallet:', provider.wallet.publicKey.toBase58());
  
  // Get or create provider account
  const [providerPda] = await PublicKey.findProgramAddress(
    [Buffer.from('provider'), provider.wallet.publicKey.toBuffer()],
    program.programId
  );
  
  try {
    const providerAccount = await program.account.provider.fetch(providerPda);
    console.log('✅ Provider exists:', providerPda.toBase58());
  } catch (e) {
    console.log('📝 Creating provider account...');
    await program.methods
      .registerProvider()
      .accounts({
        provider: providerPda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId
      })
      .rpc();
    console.log('✅ Provider created:', providerPda.toBase58());
  }
  
  // Register node
  const nodeId = Date.now();
  const endpoint = '$SERVER_IP:$WG_PORT';
  const region = '$REGION';
  const pricePerMinute = $PRICE_PER_MINUTE;
  const maxCapacity = $MAX_CAPACITY;
  
  // Convert WG public key to bytes
  const wgPubkeyStr = '$WG_PUBLIC_KEY';
  const wgPubkeyBytes = Buffer.from(wgPubkeyStr, 'base64');
  if (wgPubkeyBytes.length !== 32) {
    throw new Error('WireGuard public key must be 32 bytes');
  }
  
  const [nodePda] = await PublicKey.findProgramAddress(
    [
      Buffer.from('node'),
      providerPda.toBuffer(),
      Buffer.from(nodeId.toString())
    ],
    program.programId
  );
  
  console.log('\\n📝 Registering node...');
  await program.methods
    .registerNode(
      new anchor.BN(nodeId),
      endpoint,
      region,
      new anchor.BN(pricePerMinute),
      Array.from(wgPubkeyBytes),
      maxCapacity
    )
    .accounts({
      node: nodePda,
      provider: providerPda,
      authority: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId
    })
    .rpc();
  
  console.log('✅ Node registered successfully!');
  console.log('   Node PDA:', nodePda.toBase58());
  console.log('   Node ID:', nodeId);
  console.log('   Endpoint:', endpoint);
  console.log('   Region:', region);
  
  // Save node info
  const nodeInfo = {
    nodePda: nodePda.toBase58(),
    nodeId: nodeId.toString(),
    providerPda: providerPda.toBase58(),
    endpoint: endpoint,
    region: region,
    wgPublicKey: wgPubkeyStr,
    pricePerMinute: pricePerMinute,
    maxCapacity: maxCapacity,
    registeredAt: new Date().toISOString()
  };
  
  fs.writeFileSync('/opt/dvpn-node/node-info.json', JSON.stringify(nodeInfo, null, 2));
  console.log('\\n💾 Node info saved to /opt/dvpn-node/node-info.json');
  
  // Update daemon config
  const config = JSON.parse(fs.readFileSync('/opt/dvpn-node/config.json'));
  config.node = {
    ...config.node,
    pda: nodePda.toBase58(),
    node_id: nodeId.toString(),
    provider_pda: providerPda.toBase58()
  };
  fs.writeFileSync('/opt/dvpn-node/config.json', JSON.stringify(config, null, 2));
  console.log('💾 Config updated: /opt/dvpn-node/config.json');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
EOF

# Run registration
echo "🚀 Registering node on-chain..."
cd /Users/sheikhhamza/BBTProjects/VPN/fix/fixed-DVPN
node /tmp/register_node.js

echo ""
echo "═══════════════════════════════════════════════════"
echo "   ✅ Node Registration Complete!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "📋 Next Steps:"
echo "   1. Copy daemon files to server:"
echo "      scp scripts/node_daemon_server.js root@$SERVER_IP:/opt/dvpn-node/daemon.js"
echo "   2. SSH to server and install deps:"
echo "      ssh root@$SERVER_IP"
echo "      cd /opt/dvpn-node && npm install"
echo "   3. Start daemon:"
echo "      cd /opt/dvpn-node && npm start"
echo ""
