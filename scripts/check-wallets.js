const fs = require('fs');
const { Keypair } = require('@solana/web3.js');


// Check wallet.json
try {
  const data = JSON.parse(fs.readFileSync('wallet.json'));
  const kp = Keypair.fromSecretKey(new Uint8Array(data.secretKey || data));
} catch(e) {
}

// Check user-keypair.json
try {
  const data = JSON.parse(fs.readFileSync('user-keypair.json'));
  const kp = Keypair.fromSecretKey(new Uint8Array(data.secretKey || data));
} catch(e) {
}

// Check test-wallet-keypair.json
try {
  const data = JSON.parse(fs.readFileSync('test-wallet-keypair.json'));
  const kp = Keypair.fromSecretKey(new Uint8Array(data.secretKey || data));
} catch(e) {
}

