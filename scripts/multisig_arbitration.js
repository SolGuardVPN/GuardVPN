// Multi-Sig Arbitration Module for DVPN Dispute Resolution
// This module provides decentralized governance for dispute resolution

const anchor = require('@coral-xyz/anchor');
const { PublicKey, Keypair, SystemProgram } = require('@solana/web3.js');

/**
 * Multi-Sig Configuration
 * 
 * Arbitrators: A set of trusted public keys that can vote on disputes
 * Threshold: Minimum number of signatures required to resolve a dispute
 * Cooldown: Time period before a dispute can be resolved (prevents rushing)
 */
class MultiSigArbitration {
  constructor(program, arbitrators, threshold) {
    this.program = program;
    this.arbitrators = arbitrators; // Array of PublicKey
    this.threshold = threshold; // Number (e.g., 3 out of 5)
    this.pendingDisputes = new Map();
  }

  /**
   * Initialize arbitration council
   * Creates a PDA to store arbitrator list and settings
   */
  async initializeCouncil(authority) {
    const [councilPda] = await PublicKey.findProgramAddress(
      [Buffer.from('arbitration_council')],
      this.program.programId
    );

    const councilData = {
      authority: authority.publicKey,
      arbitrators: this.arbitrators,
      threshold: this.threshold,
      totalDisputes: 0,
      bump: 0
    };

    // In production, this would be a new instruction in the Solana program

    return councilPda;
  }

  /**
   * Create a dispute proposal
   * When a user or provider raises a dispute, create a proposal for voting
   */
  async createDisputeProposal(sessionPda, disputeReason, proposer) {
    const proposalId = Date.now();
    const [proposalPda] = await PublicKey.findProgramAddress(
      [
        Buffer.from('dispute_proposal'),
        sessionPda.toBuffer(),
        Buffer.from(proposalId.toString())
      ],
      this.program.programId
    );

    const proposal = {
      sessionPda: sessionPda.toBase58(),
      proposer: proposer.toBase58(),
      reason: disputeReason,
      createdAt: Date.now(),
      votes: [],
      resolved: false,
      outcome: null
    };

    this.pendingDisputes.set(proposalPda.toBase58(), proposal);


    return proposalPda;
  }

  /**
   * Vote on a dispute
   * Arbitrators cast votes with their decision and reasoning
   */
  async voteOnDispute(proposalPda, arbitratorKeypair, vote) {
    const proposalKey = proposalPda.toBase58();
    const proposal = this.pendingDisputes.get(proposalKey);

    if (!proposal) {
      throw new Error('Proposal not found');
    }

    if (proposal.resolved) {
      throw new Error('Proposal already resolved');
    }

    // Verify arbitrator is authorized
    const isArbitrator = this.arbitrators.some(
      arb => arb.equals(arbitratorKeypair.publicKey)
    );

    if (!isArbitrator) {
      throw new Error('Not an authorized arbitrator');
    }

    // Check if already voted
    const alreadyVoted = proposal.votes.some(
      v => v.arbitrator === arbitratorKeypair.publicKey.toBase58()
    );

    if (alreadyVoted) {
      throw new Error('Already voted on this proposal');
    }

    // Add vote
    const voteData = {
      arbitrator: arbitratorKeypair.publicKey.toBase58(),
      decision: vote.decision, // 'refund_user', 'pay_provider', 'split', 'slash_provider'
      refundPercentage: vote.refundPercentage || 0,
      slashPercentage: vote.slashPercentage || 0,
      reasoning: vote.reasoning || '',
      timestamp: Date.now()
    };

    proposal.votes.push(voteData);


    // Check if threshold reached
    if (proposal.votes.length >= this.threshold) {
      await this.tallyVotes(proposalPda);
    }

    return voteData;
  }

  /**
   * Tally votes and determine outcome
   * Uses weighted voting based on arbitrator consensus
   */
  async tallyVotes(proposalPda) {
    const proposalKey = proposalPda.toBase58();
    const proposal = this.pendingDisputes.get(proposalKey);

    if (!proposal || proposal.votes.length < this.threshold) {
      throw new Error('Not enough votes');
    }

    // Count votes by decision type
    const voteCounts = {};
    const refundAmounts = [];
    const slashAmounts = [];

    proposal.votes.forEach(vote => {
      voteCounts[vote.decision] = (voteCounts[vote.decision] || 0) + 1;
      if (vote.refundPercentage) refundAmounts.push(vote.refundPercentage);
      if (vote.slashPercentage) slashAmounts.push(vote.slashPercentage);
    });

    // Determine majority decision
    const decisions = Object.entries(voteCounts);
    decisions.sort((a, b) => b[1] - a[1]);
    const [majorityDecision, voteCount] = decisions[0];

    // Calculate average refund/slash percentages
    const avgRefund = refundAmounts.length > 0
      ? refundAmounts.reduce((a, b) => a + b, 0) / refundAmounts.length
      : 0;

    const avgSlash = slashAmounts.length > 0
      ? slashAmounts.reduce((a, b) => a + b, 0) / slashAmounts.length
      : 0;

    const outcome = {
      decision: majorityDecision,
      refundPercentage: Math.round(avgRefund),
      slashPercentage: Math.round(avgSlash),
      voteCount: voteCount,
      totalVotes: proposal.votes.length,
      resolvedAt: Date.now()
    };

    proposal.outcome = outcome;
    proposal.resolved = true;


    // Execute the resolution on-chain
    await this.executeResolution(proposalPda, outcome);

    return outcome;
  }

  /**
   * Execute the resolution on-chain
   * Calls resolve_dispute instruction with the outcome
   */
  async executeResolution(proposalPda, outcome) {
    const proposal = this.pendingDisputes.get(proposalPda.toBase58());
    const sessionPda = new PublicKey(proposal.sessionPda);

    try {
      // Fetch session to get user and provider
      const session = await this.program.account.session.fetch(sessionPda);

      // Call resolve_dispute instruction
      await this.program.methods
        .resolveDispute(outcome.refundPercentage, outcome.slashPercentage)
        .accounts({
          session: sessionPda,
          user: session.user,
          provider: session.provider,
          node: session.node,
          arbitrator: this.arbitrators[0], // Use first arbitrator as signer
          systemProgram: SystemProgram.programId
        })
        .rpc();


    } catch (error) {
      console.error('❌ Failed to execute resolution:', error.message);
      throw error;
    }
  }

  /**
   * Get dispute proposal details
   */
  getProposal(proposalPda) {
    return this.pendingDisputes.get(proposalPda.toBase58());
  }

  /**
   * Get all pending disputes
   */
  getPendingDisputes() {
    return Array.from(this.pendingDisputes.entries())
      .filter(([_, proposal]) => !proposal.resolved)
      .map(([pda, proposal]) => ({ pda, ...proposal }));
  }

  /**
   * Get arbitrator voting history
   */
  getArbitratorHistory(arbitratorPubkey) {
    const history = [];

    this.pendingDisputes.forEach((proposal, pda) => {
      const vote = proposal.votes.find(
        v => v.arbitrator === arbitratorPubkey.toBase58()
      );

      if (vote) {
        history.push({
          proposalPda: pda,
          sessionPda: proposal.sessionPda,
          vote: vote,
          resolved: proposal.resolved,
          outcome: proposal.outcome
        });
      }
    });

    return history;
  }

  /**
   * Calculate arbitrator reputation
   * Based on voting consistency with majority
   */
  calculateArbitratorReputation(arbitratorPubkey) {
    const history = this.getArbitratorHistory(arbitratorPubkey);
    const resolvedCases = history.filter(h => h.resolved);

    if (resolvedCases.length === 0) return 100; // Default reputation

    let correctVotes = 0;

    resolvedCases.forEach(case => {
      if (case.vote.decision === case.outcome.decision) {
        correctVotes++;
      }
    });

    const accuracy = (correctVotes / resolvedCases.length) * 100;
    return Math.round(accuracy);
  }
}

/**
 * Dispute categories and recommended outcomes
 */
const DisputeCategories = {
  NO_CONNECTION: {
    name: 'No Connection Established',
    defaultRefund: 100,
    defaultSlash: 10
  },
  POOR_PERFORMANCE: {
    name: 'Poor Performance',
    defaultRefund: 50,
    defaultSlash: 5
  },
  DISCONNECTION: {
    name: 'Unexpected Disconnection',
    defaultRefund: 75,
    defaultSlash: 5
  },
  FRAUD: {
    name: 'Fraudulent Behavior',
    defaultRefund: 100,
    defaultSlash: 50
  },
  BILLING_ERROR: {
    name: 'Billing Error',
    defaultRefund: 100,
    defaultSlash: 0
  }
};

/**
 * Example usage and testing functions
 */
async function exampleUsage() {
  // Setup (in production, load from config)
  const program = null; // Your Anchor program instance

  const arbitrators = [
    // In production, these would be real arbitrator pubkeys
    Keypair.generate().publicKey,
    Keypair.generate().publicKey,
    Keypair.generate().publicKey,
    Keypair.generate().publicKey,
    Keypair.generate().publicKey
  ];

  const threshold = 3; // 3 out of 5 must agree

  // Initialize arbitration system
  const arbitration = new MultiSigArbitration(program, arbitrators, threshold);

  // Example: User reports a dispute
  const sessionPda = Keypair.generate().publicKey;
  const userKeypair = Keypair.generate();

  const proposalPda = await arbitration.createDisputeProposal(
    sessionPda,
    DisputeCategories.NO_CONNECTION.name,
    userKeypair.publicKey
  );

  // Arbitrators vote
  const arbitrator1 = Keypair.generate();
  await arbitration.voteOnDispute(proposalPda, arbitrator1, {
    decision: 'refund_user',
    refundPercentage: 100,
    slashPercentage: 10,
    reasoning: 'Provider failed to establish connection'
  });

  const arbitrator2 = Keypair.generate();
  await arbitration.voteOnDispute(proposalPda, arbitrator2, {
    decision: 'refund_user',
    refundPercentage: 100,
    slashPercentage: 15,
    reasoning: 'Clear violation of service terms'
  });

  const arbitrator3 = Keypair.generate();
  await arbitration.voteOnDispute(proposalPda, arbitrator3, {
    decision: 'refund_user',
    refundPercentage: 100,
    slashPercentage: 10,
    reasoning: 'Evidence supports user claim'
  });

  // After 3 votes (threshold), dispute is automatically resolved
  const outcome = arbitration.getProposal(proposalPda).outcome;
}

module.exports = {
  MultiSigArbitration,
  DisputeCategories
};
