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

