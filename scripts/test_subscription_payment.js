/**
 * Test Subscription Payment on Devnet
 * 
 * This script tests the subscription payment flow by:
 * 1. Connecting to devnet
 * 2. Creating a subscription PDA
 * 3. Sending SOL to the PDA as escrow
 * 
 * Run: node scripts/test_subscription_payment.js
 */

const { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction, 
  SystemProgram, 
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction 
} = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

// Configuration
const PROGRAM_ID = new PublicKey('8LQKwvHJPdK6fKmopXmUwct8JjVGQhf3RFQd64nCV39i');
const RPC_URL = 'https://api.devnet.solana.com';
const SUBSCRIPTION_SEED = Buffer.from('subscription');

// Subscription plans
const PLANS = {
  weekly: { price: 0.03, days: 7 },
  monthly: { price: 0.1, days: 30 },
  yearly: { price: 0.6, days: 365 }
};

async function main() {
  const connection = new Connection(RPC_URL, 'confirmed');

  // Load or create wallet
  let wallet;
  // Try main wallet first, then test wallet
  const mainWalletPath = path.join(__dirname, '..', 'wallet.json');
  const testWalletPath = path.join(__dirname, '..', 'test-wallet-keypair.json');
  
  let walletPath = fs.existsSync(mainWalletPath) ? mainWalletPath : testWalletPath;
  
  if (fs.existsSync(walletPath)) {
    const walletData = JSON.parse(fs.readFileSync(walletPath));
    // Handle both formats: array or object with secretKey
    if (Array.isArray(walletData)) {
      wallet = Keypair.fromSecretKey(Uint8Array.from(walletData));
    } else if (walletData.secretKey) {
      wallet = Keypair.fromSecretKey(Uint8Array.from(walletData.secretKey));
    } else {
      throw new Error('Invalid wallet format');
    }
  } else {
    wallet = Keypair.generate();
    fs.writeFileSync(testWalletPath, JSON.stringify(Array.from(wallet.secretKey)));
  }

  // Check balance
  const balance = await connection.getBalance(wallet.publicKey);

  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    try {
      const sig = await connection.requestAirdrop(wallet.publicKey, LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
      const newBalance = await connection.getBalance(wallet.publicKey);
    } catch (e) {
      return;
    }
  }

  // Derive subscription PDA
  const [subscriptionPDA, bump] = PublicKey.findProgramAddressSync(
    [SUBSCRIPTION_SEED, wallet.publicKey.toBuffer()],
    PROGRAM_ID
  );

  // Check if PDA already has funds
  const pdaBalance = await connection.getBalance(subscriptionPDA);
  if (pdaBalance > 0) {
  }

  // Test subscription payment (weekly plan)
  const plan = PLANS.weekly;

  // Create transfer instruction to PDA (simulating escrow deposit)
  // Note: In the real contract, this would be done by the program
  // Here we're just testing the payment flow
  const transferIx = SystemProgram.transfer({
    fromPubkey: wallet.publicKey,
    toPubkey: subscriptionPDA,
    lamports: Math.floor(plan.price * LAMPORTS_PER_SOL)
  });

  const transaction = new Transaction().add(transferIx);

  
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet]
    );
    

    // Check new PDA balance
    const newPdaBalance = await connection.getBalance(subscriptionPDA);


  } catch (error) {
    console.error('❌ Transaction failed:', error.message);
  }
}

// Cleanup function to reclaim test funds
async function cleanup() {
  const connection = new Connection(RPC_URL, 'confirmed');
  
  const walletPath = path.join(__dirname, '..', 'test-wallet-keypair.json');
  if (!fs.existsSync(walletPath)) {
    return;
  }
  
  const walletData = JSON.parse(fs.readFileSync(walletPath));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(walletData));
  
  const [subscriptionPDA] = PublicKey.findProgramAddressSync(
    [SUBSCRIPTION_SEED, wallet.publicKey.toBuffer()],
    PROGRAM_ID
  );
  
  const pdaBalance = await connection.getBalance(subscriptionPDA);
  
  // Note: In production, only the program can transfer from PDA
  // This cleanup would require program instruction
}

// Run
if (process.argv[2] === '--cleanup') {
  cleanup();
} else {
  main();
}
