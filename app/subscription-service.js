/**
 * Solana Subscription Service
 * Handles decentralized subscription payments via smart contract
 */

const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { Program, AnchorProvider, BN } = require('@coral-xyz/anchor');

// Program ID from your deployed contract
const PROGRAM_ID = new PublicKey('8LQKwvHJPdK6fKmopXmUwct8JjVGQhf3RFQd64nCV39i');

// Seeds for PDA derivation
const SUBSCRIPTION_SEED = Buffer.from('subscription');
const TREASURY_SEED = Buffer.from('treasury');

// Subscription plans with prices in lamports
const SUBSCRIPTION_PLANS = {
  weekly: {
    name: 'Weekly',
    priceSOL: 0.03,
    priceLamports: 30_000_000,
    durationDays: 7,
    enumValue: { weekly: {} }
  },
  monthly: {
    name: 'Monthly', 
    priceSOL: 0.1,
    priceLamports: 100_000_000,
    durationDays: 30,
    enumValue: { monthly: {} }
  },
  yearly: {
    name: 'Yearly',
    priceSOL: 0.6,
    priceLamports: 600_000_000,
    durationDays: 365,
    enumValue: { yearly: {} }
  }
};

class SubscriptionService {
  constructor(rpcUrl = 'https://api.devnet.solana.com') {
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.programId = PROGRAM_ID;
  }

  /**
   * Get subscription PDA for a user
   */
  getSubscriptionPDA(userPubkey) {
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [SUBSCRIPTION_SEED, userPubkey.toBuffer()],
      this.programId
    );
    return { pda, bump };
  }

  /**
   * Get treasury PDA
   */
  getTreasuryPDA() {
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [TREASURY_SEED],
      this.programId
    );
    return { pda, bump };
  }

  /**
   * Check if user has active subscription
   */
  async checkSubscription(userPubkey) {
    try {
      const { pda } = this.getSubscriptionPDA(new PublicKey(userPubkey));
      const accountInfo = await this.connection.getAccountInfo(pda);
      
      if (!accountInfo) {
        return { active: false, subscription: null };
      }

      // Parse subscription data (simplified - in production use proper deserialization)
      const data = accountInfo.data;
      
      // Skip 8-byte discriminator
      const userKey = new PublicKey(data.slice(8, 40));
      const plan = data[40]; // 0=Weekly, 1=Monthly, 2=Yearly
      const escrowLamports = data.readBigUInt64LE(41);
      const startTs = data.readBigInt64LE(49);
      const endTs = data.readBigInt64LE(57);
      const state = data[65]; // 0=Active, 1=Cancelled, 2=Expired, 3=Claimed

      const now = Math.floor(Date.now() / 1000);
      const isActive = state === 0 && now < Number(endTs);

      return {
        active: isActive,
        subscription: {
          user: userKey.toBase58(),
          plan: ['Weekly', 'Monthly', 'Yearly'][plan],
          escrowLamports: Number(escrowLamports),
          startTs: Number(startTs),
          endTs: Number(endTs),
          state: ['Active', 'Cancelled', 'Expired', 'Claimed'][state],
          expiresAt: new Date(Number(endTs) * 1000),
          daysRemaining: Math.max(0, Math.ceil((Number(endTs) - now) / 86400))
        }
      };
    } catch (error) {
      console.error('Error checking subscription:', error);
      return { active: false, subscription: null, error: error.message };
    }
  }

  /**
   * Create subscription transaction (to be signed by wallet)
   */
  async createSubscriptionTransaction(userPubkey, planType) {
    const plan = SUBSCRIPTION_PLANS[planType.toLowerCase()];
    if (!plan) {
      throw new Error('Invalid plan type. Use: weekly, monthly, or yearly');
    }

    const userKey = new PublicKey(userPubkey);
    const { pda: subscriptionPDA } = this.getSubscriptionPDA(userKey);

    // Check if subscription already exists
    const existing = await this.connection.getAccountInfo(subscriptionPDA);
    if (existing) {
      throw new Error('Subscription already exists. Cancel current subscription first.');
    }

    // Build instruction data for create_subscription
    // Discriminator (8 bytes) + plan enum (1 byte)
    const discriminator = Buffer.from([0x7c, 0x3c, 0x5d, 0x1e, 0x2b, 0x4a, 0x6f, 0x8d]); // create_subscription discriminator
    const planData = Buffer.from([['weekly', 'monthly', 'yearly'].indexOf(planType.toLowerCase())]);
    const instructionData = Buffer.concat([discriminator, planData]);

    // Create instruction
    const instruction = {
      keys: [
        { pubkey: userKey, isSigner: true, isWritable: true },
        { pubkey: subscriptionPDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: instructionData
    };

    const transaction = new Transaction().add(instruction);
    
    // Get recent blockhash
    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userKey;

    return {
      transaction,
      plan,
      subscriptionPDA: subscriptionPDA.toBase58()
    };
  }

  /**
   * Cancel subscription transaction
   */
  async cancelSubscriptionTransaction(userPubkey) {
    const userKey = new PublicKey(userPubkey);
    const { pda: subscriptionPDA } = this.getSubscriptionPDA(userKey);
    const { pda: treasuryPDA } = this.getTreasuryPDA();

    // Check subscription exists and is active
    const subCheck = await this.checkSubscription(userPubkey);
    if (!subCheck.active) {
      throw new Error('No active subscription to cancel');
    }

    // Build instruction data for cancel_subscription
    const discriminator = Buffer.from([0x9a, 0x2b, 0x3c, 0x4d, 0x5e, 0x6f, 0x7a, 0x8b]); // cancel_subscription discriminator

    const instruction = {
      keys: [
        { pubkey: userKey, isSigner: true, isWritable: true },
        { pubkey: subscriptionPDA, isSigner: false, isWritable: true },
        { pubkey: treasuryPDA, isSigner: false, isWritable: true },
      ],
      programId: this.programId,
      data: discriminator
    };

    const transaction = new Transaction().add(instruction);
    
    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userKey;

    // Calculate estimated refund
    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - subCheck.subscription.startTs;
    const totalDuration = subCheck.subscription.endTs - subCheck.subscription.startTs;
    const usedAmount = Math.floor((elapsed / totalDuration) * subCheck.subscription.escrowLamports);
    const refundAmount = subCheck.subscription.escrowLamports - usedAmount;

    return {
      transaction,
      estimatedRefund: refundAmount / LAMPORTS_PER_SOL,
      daysUsed: Math.ceil(elapsed / 86400),
      subscriptionPDA: subscriptionPDA.toBase58()
    };
  }
}

module.exports = {
  SubscriptionService,
  SUBSCRIPTION_PLANS,
  PROGRAM_ID
};
