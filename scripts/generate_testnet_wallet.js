// Generate a test wallet keypair for Solana testnet
const { Keypair } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

// Generate new keypair
const keypair = Keypair.generate();

const walletData = {
  publicKey: keypair.publicKey.toBase58(),
  secretKey: Array.from(keypair.secretKey)
};

// Save to file
const outputPath = path.join(__dirname, '../test-wallet-keypair.json');
fs.writeFileSync(outputPath, JSON.stringify(walletData, null, 2));

console.log('✅ Test wallet generated!');
console.log('📁 Saved to:', outputPath);
console.log('🔑 Public Key:', walletData.publicKey);
console.log('\n⚠️  IMPORTANT: This is for TESTNET only!');
console.log('💰 Get testnet SOL from: https://faucet.solana.com');
console.log(`   Use address: ${walletData.publicKey}`);
