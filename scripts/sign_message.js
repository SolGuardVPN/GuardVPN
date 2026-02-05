const fs = require('fs');
const nacl = require('tweetnacl');
const bs58 = require('bs58');

const msg = process.argv[2];
const keypath = process.argv[3] || 'wallet.json';
if (!msg) { console.error('usage: node sign_message.js <message> [keypair.json]'); process.exit(1); }
const kp = JSON.parse(fs.readFileSync(keypath,'utf8'));
const sk = Uint8Array.from(kp);
const sig = nacl.sign.detached(Buffer.from(msg,'utf8'), sk);
