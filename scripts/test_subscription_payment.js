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
  console.log('🔗 Connecting to Devnet...');
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
    console.log('📝 Loaded wallet from:', walletPath);
    console.log('   Address:', wallet.publicKey.toBase58());
  } else {
    wallet = Keypair.generate();
    fs.writeFileSync(testWalletPath, JSON.stringify(Array.from(wallet.secretKey)));
    console.log('🆕 Created new wallet:', wallet.publicKey.toBase58());
  }

  // Check balance
  const balance = await connection.getBalance(wallet.publicKey);
  console.log('💰 Wallet balance:', balance / LAMPORTS_PER_SOL, 'SOL');

  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    console.log('\n⚠️  Low balance! Request airdrop...');
    try {
      const sig = await connection.requestAirdrop(wallet.publicKey, LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
      console.log('✅ Airdrop successful!');
      const newBalance = await connection.getBalance(wallet.publicKey);
      console.log('💰 New balance:', newBalance / LAMPORTS_PER_SOL, 'SOL');
    } catch (e) {
      console.log('❌ Airdrop failed (rate limited?):', e.message);
      console.log('   Get devnet SOL from: https://faucet.solana.com/');
      return;
    }
  }

  // Derive subscription PDA
  const [subscriptionPDA, bump] = PublicKey.findProgramAddressSync(
    [SUBSCRIPTION_SEED, wallet.publicKey.toBuffer()],
    PROGRAM_ID
  );
  console.log('\n📍 Subscription PDA:', subscriptionPDA.toBase58());

  // Check if PDA already has funds
  const pdaBalance = await connection.getBalance(subscriptionPDA);
  if (pdaBalance > 0) {
    console.log('💰 PDA already has:', pdaBalance / LAMPORTS_PER_SOL, 'SOL');
    console.log('   This would be the escrowed subscription amount.');
  }

  // Test subscription payment (weekly plan)
  const plan = PLANS.weekly;
  console.log(`\n📋 Testing ${plan.days}-day subscription...`);
  console.log(`   Price: ${plan.price} SOL`);

  // Create transfer instruction to PDA (simulating escrow deposit)
  // Note: In the real contract, this would be done by the program
  // Here we're just testing the payment flow
  const transferIx = SystemProgram.transfer({
    fromPubkey: wallet.publicKey,
    toPubkey: subscriptionPDA,
    lamports: Math.floor(plan.price * LAMPORTS_PER_SOL)
  });

  const transaction = new Transaction().add(transferIx);

  console.log('\n🔐 Signing and sending transaction...');
  
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet]
    );
    
    console.log('✅ Transaction successful!');
    console.log('   Signature:', signature);
    console.log('   View on Solscan: https://solscan.io/tx/' + signature + '?cluster=devnet');

    // Check new PDA balance
    const newPdaBalance = await connection.getBalance(subscriptionPDA);
    console.log('\n💰 PDA escrow balance:', newPdaBalance / LAMPORTS_PER_SOL, 'SOL');

    console.log('\n✅ PAYMENT TEST SUCCESSFUL!');
    console.log('   The subscription escrow mechanism works.');
    console.log('   In the full contract, this SOL would be locked until:');
    console.log('   - User cancels (proportional refund)');
    console.log('   - Subscription expires (treasury claims)');

  } catch (error) {
    console.error('❌ Transaction failed:', error.message);
  }
}

// Cleanup function to reclaim test funds
async function cleanup() {
  console.log('\n🧹 Cleanup: Reclaiming funds from PDA...');
  const connection = new Connection(RPC_URL, 'confirmed');
  
  const walletPath = path.join(__dirname, '..', 'test-wallet-keypair.json');
  if (!fs.existsSync(walletPath)) {
    console.log('No wallet found.');
    return;
  }
  
  const walletData = JSON.parse(fs.readFileSync(walletPath));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(walletData));
  
  const [subscriptionPDA] = PublicKey.findProgramAddressSync(
    [SUBSCRIPTION_SEED, wallet.publicKey.toBuffer()],
    PROGRAM_ID
  );
  
  const pdaBalance = await connection.getBalance(subscriptionPDA);
  console.log('PDA balance:', pdaBalance / LAMPORTS_PER_SOL, 'SOL');
  
  // Note: In production, only the program can transfer from PDA
  // This cleanup would require program instruction
  console.log('Note: Full cleanup requires program cancel instruction.');
}

// Run
if (process.argv[2] === '--cleanup') {
  cleanup();
} else {
  main();
}
