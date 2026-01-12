// Hash-Chain Payment Proof System for DVPN
// Implements cryptographic proof-of-payment using hash chains
// Reduces on-chain transactions and provides verifiable usage proofs

const crypto = require('crypto');
const anchor = require('@coral-xyz/anchor');
const { PublicKey } = require('@solana/web3.js');

/**
 * Hash Chain Payment System
 * 
 * Concept:
 * 1. User generates a hash chain of N preimages
 * 2. User commits the final hash (H_N) on-chain when creating session
 * 3. Every minute/MB, user reveals next preimage to provider
 * 4. Provider verifies: H(preimage_i) = H_{i+1}
 * 5. Provider can claim payment by submitting last revealed preimage
 * 
 * Benefits:
 * - Minimal on-chain transactions (only commit + final claim)
 * - Cryptographic proof of usage
 * - No trust required between parties
 * - Automatic micro-payments
 */
class HashChainPayment {
  constructor(program) {
    this.program = program;
    this.hashAlgorithm = 'sha256';
  }

  /**
   * Generate hash chain
   * Creates N preimages and hashes them sequentially
   * 
   * @param {number} length - Number of payments (e.g., 60 for 60 minutes)
   * @param {number} seed - Random seed (optional)
   * @returns {Object} { preimages: Array, hashes: Array, commitment: string }
   */
  generateHashChain(length, seed = null) {
    if (length < 1 || length > 10000) {
      throw new Error('Length must be between 1 and 10000');
    }

    // Generate random seed if not provided
    const initialSeed = seed || crypto.randomBytes(32);
    
    const preimages = [];
    const hashes = [];
    
    // Generate preimages
    let current = initialSeed;
    for (let i = 0; i < length; i++) {
      preimages.push(current);
      current = this.hash(current);
      hashes.push(current);
    }
    
    // The final hash is the commitment
    const commitment = hashes[hashes.length - 1];
    
    console.log('✅ Hash chain generated:');
    console.log('   Length:', length);
    console.log('   Commitment:', commitment.toString('hex').slice(0, 16) + '...');
    
    return {
      preimages: preimages,
      hashes: hashes,
      commitment: commitment.toString('hex'),
      length: length
    };
  }

  /**
   * Hash function wrapper
   */
  hash(data) {
    return crypto.createHash(this.hashAlgorithm).update(data).digest();
  }

  /**
   * Verify preimage
   * Checks if H(preimage) = expectedHash
   */
  verifyPreimage(preimage, expectedHash) {
    const computed = this.hash(Buffer.from(preimage, 'hex'));
    const expected = Buffer.from(expectedHash, 'hex');
    return computed.equals(expected);
  }

  /**
   * Create session with hash-chain commitment
   * User commits to the final hash when creating session
   */
  async createSessionWithHashChain(
    userKeypair,
    nodePubkey,
    sessionId,
    hashChain,
    escrowAmount
  ) {
    const [sessionPda] = await PublicKey.findProgramAddress(
      [
        Buffer.from('session'),
        userKeypair.publicKey.toBuffer(),
        nodePubkey.toBuffer(),
        Buffer.from(sessionId.toString())
      ],
      this.program.programId
    );

    // Store commitment on-chain
    const commitment = Buffer.from(hashChain.commitment, 'hex');

    console.log('📝 Creating session with hash-chain:');
    console.log('   Session PDA:', sessionPda.toBase58());
    console.log('   Chain length:', hashChain.length);
    console.log('   Commitment:', hashChain.commitment.slice(0, 16) + '...');

    // In production, this would use a new instruction variant
    // For now, simulate with existing open_session
    
    return {
      sessionPda: sessionPda,
      hashChain: hashChain,
      currentIndex: 0,
      revealed: []
    };
  }

  /**
   * Reveal next preimage
   * User reveals the next preimage to provider for payment
   */
  revealPreimage(sessionState, index) {
    if (index >= sessionState.hashChain.preimages.length) {
      throw new Error('Index out of bounds');
    }

    if (index < sessionState.currentIndex) {
      throw new Error('Cannot reveal past preimages');
    }

    const preimage = sessionState.hashChain.preimages[index];
    const hash = sessionState.hashChain.hashes[index];

    // Update state
    sessionState.currentIndex = index + 1;
    sessionState.revealed.push({
      index: index,
      preimage: preimage.toString('hex'),
      hash: hash.toString('hex'),
      timestamp: Date.now()
    });

    console.log(`🔓 Preimage revealed [${index}/${sessionState.hashChain.length}]`);
    
    return {
      index: index,
      preimage: preimage.toString('hex'),
      hash: hash.toString('hex')
    };
  }

  /**
   * Verify hash chain (provider side)
   * Provider verifies each revealed preimage
   */
  verifyHashChain(revealed, commitment) {
    if (revealed.length === 0) {
      return { valid: true, verified: 0 };
    }

    // Sort by index
    revealed.sort((a, b) => a.index - b.index);

    // Verify each link in the chain
    for (let i = 0; i < revealed.length; i++) {
      const current = revealed[i];
      const nextHash = i < revealed.length - 1 
        ? revealed[i + 1].hash 
        : commitment;

      if (!this.verifyPreimage(current.preimage, nextHash)) {
        console.error(`❌ Hash chain broken at index ${current.index}`);
        return { valid: false, verified: i, broken: current.index };
      }
    }

    console.log(`✅ Hash chain verified: ${revealed.length} links`);
    return { valid: true, verified: revealed.length };
  }

  /**
   * Claim payment with hash-chain proof
   * Provider submits last revealed preimage to claim payment
   */
  async claimPaymentWithProof(
    providerKeypair,
    sessionPda,
    lastRevealed,
    amountToClaim
  ) {
    console.log('💰 Claiming payment with hash-chain proof:');
    console.log('   Session:', sessionPda.toBase58());
    console.log('   Last index:', lastRevealed.index);
    console.log('   Amount:', amountToClaim);

    // In production, this would call a new instruction:
    // claim_with_hashchain_proof(last_preimage, last_index, amount)
    
    // The program would verify:
    // 1. Hash the preimage N-index times
    // 2. Check it matches the commitment
    // 3. Check index hasn't been used before
    // 4. Transfer payment proportional to index

    const proof = {
      preimage: lastRevealed.preimage,
      index: lastRevealed.index,
      hash: lastRevealed.hash
    };

    return {
      success: true,
      proof: proof,
      amount: amountToClaim
    };
  }

  /**
   * Auto-reveal daemon for client
   * Automatically reveals preimages at intervals
   */
  startAutoReveal(sessionState, intervalMs, callback) {
    console.log('🔄 Starting auto-reveal daemon...');
    console.log('   Interval:', intervalMs, 'ms');

    const interval = setInterval(() => {
      if (sessionState.currentIndex >= sessionState.hashChain.length) {
        console.log('✅ All preimages revealed');
        clearInterval(interval);
        return;
      }

      const revealed = this.revealPreimage(sessionState, sessionState.currentIndex);
      
      if (callback) {
        callback(revealed);
      }
    }, intervalMs);

    return interval;
  }

  /**
   * Calculate payment amount per preimage
   */
  calculatePaymentPerReveal(totalEscrow, chainLength) {
    return Math.floor(totalEscrow / chainLength);
  }

  /**
   * Get session progress
   */
  getProgress(sessionState) {
    const total = sessionState.hashChain.length;
    const revealed = sessionState.currentIndex;
    const percentage = (revealed / total * 100).toFixed(1);

    return {
      revealed: revealed,
      total: total,
      percentage: percentage,
      remaining: total - revealed
    };
  }
}

/**
 * Time-based vs Data-based hash chains
 */
class TimeBasedHashChain extends HashChainPayment {
  constructor(program) {
    super(program);
    this.secondsPerPreimage = 60; // 1 minute per preimage
  }

  createSession(userKeypair, nodePubkey, durationMinutes, escrowAmount) {
    const chainLength = durationMinutes;
    const hashChain = this.generateHashChain(chainLength);
    
    return this.createSessionWithHashChain(
      userKeypair,
      nodePubkey,
      Date.now(),
      hashChain,
      escrowAmount
    );
  }
}

class DataBasedHashChain extends HashChainPayment {
  constructor(program) {
    super(program);
    this.bytesPerPreimage = 100 * 1024 * 1024; // 100 MB per preimage
  }

  createSession(userKeypair, nodePubkey, maxGB, escrowAmount) {
    const chainLength = Math.ceil(maxGB * 1024 / 100); // Number of 100MB chunks
    const hashChain = this.generateHashChain(chainLength);
    
    return this.createSessionWithHashChain(
      userKeypair,
      nodePubkey,
      Date.now(),
      hashChain,
      escrowAmount
    );
  }
}

/**
 * Example usage
 */
async function exampleUsage() {
  const program = null; // Your Anchor program
  
  // Initialize hash-chain payment system
  const hashChainPayment = new HashChainPayment(program);
  
  // 1. User generates hash chain (60 minutes)
  const hashChain = hashChainPayment.generateHashChain(60);
  
  // 2. User creates session with commitment
  const sessionState = await hashChainPayment.createSessionWithHashChain(
    null, // userKeypair
    null, // nodePubkey
    Date.now(),
    hashChain,
    1000000000 // 1 SOL escrow
  );
  
  // 3. Auto-reveal every minute
  const interval = hashChainPayment.startAutoReveal(
    sessionState,
    60000, // 60 seconds
    (revealed) => {
      console.log('📤 Sending preimage to provider:', revealed.index);
      // Send to provider via API
    }
  );
  
  // 4. After 30 minutes, provider claims payment
  setTimeout(async () => {
    const lastRevealed = sessionState.revealed[sessionState.revealed.length - 1];
    const amountToClaim = 500000000; // 0.5 SOL (30 minutes worth)
    
    await hashChainPayment.claimPaymentWithProof(
      null, // providerKeypair
      sessionState.sessionPda,
      lastRevealed,
      amountToClaim
    );
  }, 30 * 60 * 1000);
}

/**
 * Comparison: Traditional vs Hash-Chain
 */
const PaymentComparison = {
  traditional: {
    name: 'Traditional Receipt-Based',
    onChainTxPerHour: 12, // Every 5 minutes
    cost: '12 tx × 0.000005 SOL = 0.00006 SOL/hour',
    security: 'Moderate (receipt signatures)',
    latency: 'High (wait for confirmation)'
  },
  hashChain: {
    name: 'Hash-Chain Proofs',
    onChainTxPerHour: 2, // Start + end only
    cost: '2 tx × 0.000005 SOL = 0.00001 SOL/hour',
    security: 'High (cryptographic proof)',
    latency: 'Low (instant verification)'
  },
  savings: {
    txReduction: '83%',
    costReduction: '83%',
    latencyReduction: '100% (instant)'
  }
};

module.exports = {
  HashChainPayment,
  TimeBasedHashChain,
  DataBasedHashChain,
  PaymentComparison
};
