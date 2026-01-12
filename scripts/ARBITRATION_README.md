# Multi-Sig Arbitration Module

Decentralized governance system for DVPN dispute resolution using multi-signature voting.

## Overview

This module provides a fair, transparent, and decentralized way to resolve disputes between users and VPN providers. Instead of a single authority, disputes are resolved by a council of arbitrators using weighted voting.

## Architecture

### Components

1. **Arbitration Council**
   - Set of trusted public keys (arbitrators)
   - Configurable voting threshold (e.g., 3 of 5)
   - Stored on-chain as a PDA

2. **Dispute Proposals**
   - Created when user/provider raises dispute
   - Contains session details, reason, evidence
   - Tracks votes from arbitrators

3. **Voting System**
   - Each arbitrator casts one vote
   - Votes include decision + percentages (refund/slash)
   - Threshold triggers automatic resolution

4. **Outcome Execution**
   - Majority decision determined from votes
   - Average percentages calculated
   - Resolution executed on-chain via `resolve_dispute`

## Usage

### Initialize Arbitration Council

```javascript
const { MultiSigArbitration } = require('./multisig_arbitration');

// Define arbitrators (trusted pubkeys)
const arbitrators = [
  new PublicKey('Arbitrator1...'),
  new PublicKey('Arbitrator2...'),
  new PublicKey('Arbitrator3...'),
  new PublicKey('Arbitrator4...'),
  new PublicKey('Arbitrator5...')
];

// 3 out of 5 must agree
const threshold = 3;

const arbitration = new MultiSigArbitration(
  program,
  arbitrators,
  threshold
);

// Initialize on-chain
await arbitration.initializeCouncil(authorityKeypair);
```

### Create Dispute Proposal

```javascript
// User or provider raises a dispute
const proposalPda = await arbitration.createDisputeProposal(
  sessionPda,
  'No connection established',
  userPublicKey
);

console.log('Proposal created:', proposalPda.toBase58());
```

### Arbitrators Vote

```javascript
// Arbitrator 1 votes
await arbitration.voteOnDispute(proposalPda, arbitrator1Keypair, {
  decision: 'refund_user',
  refundPercentage: 100,
  slashPercentage: 10,
  reasoning: 'Provider failed to establish connection. Evidence reviewed.'
});

// Arbitrator 2 votes
await arbitration.voteOnDispute(proposalPda, arbitrator2Keypair, {
  decision: 'refund_user',
  refundPercentage: 100,
  slashPercentage: 15,
  reasoning: 'Clear service violation. Recommend stronger penalty.'
});

// Arbitrator 3 votes (threshold reached!)
await arbitration.voteOnDispute(proposalPda, arbitrator3Keypair, {
  decision: 'refund_user',
  refundPercentage: 100,
  slashPercentage: 10,
  reasoning: 'Agree with majority assessment.'
});

// Votes are automatically tallied and outcome executed
```

### Check Outcome

```javascript
const proposal = arbitration.getProposal(proposalPda);
console.log('Resolved:', proposal.resolved);
console.log('Outcome:', proposal.outcome);
// {
//   decision: 'refund_user',
//   refundPercentage: 100,
//   slashPercentage: 12, // Average of 10, 15, 10
//   voteCount: 3,
//   totalVotes: 3
// }
```

## Dispute Categories

Pre-defined categories with recommended outcomes:

### NO_CONNECTION
- **Default Refund**: 100%
- **Default Slash**: 10%
- **Description**: Provider failed to establish VPN connection

### POOR_PERFORMANCE
- **Default Refund**: 50%
- **Default Slash**: 5%
- **Description**: Slow speeds, high latency, packet loss

### DISCONNECTION
- **Default Refund**: 75%
- **Default Slash**: 5%
- **Description**: Unexpected disconnections during session

### FRAUD
- **Default Refund**: 100%
- **Default Slash**: 50%
- **Description**: Malicious behavior, data manipulation

### BILLING_ERROR
- **Default Refund**: 100%
- **Default Slash**: 0%
- **Description**: Incorrect charging, technical error

## Vote Decisions

Arbitrators can choose from:

1. **refund_user**: Full or partial refund to user
2. **pay_provider**: Payment to provider (user claim rejected)
3. **split**: Compromise solution (both parties share cost)
4. **slash_provider**: Refund user + slash provider stake

## Arbitrator Selection

### Criteria for Arbitrators

1. **Reputation**: Track record of fair decisions
2. **Technical Knowledge**: Understanding of VPN/blockchain
3. **Availability**: Ability to vote within timeframe
4. **Stake**: Optional requirement to stake SOL (incentive alignment)
5. **Diversity**: Geographic/organizational distribution

### Becoming an Arbitrator

```javascript
// Submit application (off-chain)
const application = {
  pubkey: applicantKeypair.publicKey,
  experience: 'VPN expert, 10 years',
  stake: 100_000_000_000, // 100 SOL
  reputation: 95
};

// Council votes on new arbitrator
// If approved, added to arbitrators array
```

## Reputation System

### Calculate Arbitrator Reputation

```javascript
const reputation = arbitration.calculateArbitratorReputation(
  arbitratorPublicKey
);

console.log('Reputation:', reputation, '%');
// Based on voting consistency with majority
```

### Reputation Factors

- **Accuracy**: % of votes matching final outcome
- **Participation**: % of disputes voted on
- **Timeliness**: Average response time
- **Reasoning Quality**: Detailed justifications

### Reputation Tiers

- **90-100%**: Excellent (trusted arbitrator)
- **75-89%**: Good (reliable)
- **60-74%**: Fair (probationary)
- **<60%**: Poor (removed from council)

## Security Considerations

### Preventing Collusion

1. **Anonymous Voting**: Arbitrators don't see others' votes
2. **Time Locks**: Cooldown period between dispute and resolution
3. **Stake Slashing**: Arbitrators stake SOL (slashed for misconduct)
4. **Rotation**: Regular rotation of arbitrators

### Dispute Evidence

Users/providers should submit:
- Session logs
- Connection attempts
- Speed test results
- Screenshots/videos
- Transaction hashes

### Appeals Process

If user/provider disagrees with outcome:
1. Submit appeal with new evidence
2. Higher threshold required (4 of 5)
3. Different arbitrators review
4. Final decision is binding

## Integration with Main Program

### Add to Solana Program

```rust
// New account in programs/dvpn/src/lib.rs
#[account]
pub struct ArbitrationCouncil {
    pub authority: Pubkey,
    pub arbitrators: Vec<Pubkey>,
    pub threshold: u8,
    pub total_disputes: u64,
    pub bump: u8,
}

#[account]
pub struct DisputeProposal {
    pub session: Pubkey,
    pub proposer: Pubkey,
    pub reason: String,
    pub votes: Vec<Vote>,
    pub resolved: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Vote {
    pub arbitrator: Pubkey,
    pub decision: DisputeDecision,
    pub refund_percentage: u8,
    pub slash_percentage: u8,
    pub timestamp: i64,
}
```

### New Instructions

```rust
pub fn create_dispute_proposal(
    ctx: Context<CreateDisputeProposal>,
    reason: String
) -> Result<()> { }

pub fn vote_on_dispute(
    ctx: Context<VoteOnDispute>,
    decision: DisputeDecision,
    refund_pct: u8,
    slash_pct: u8
) -> Result<()> { }

pub fn execute_dispute_resolution(
    ctx: Context<ExecuteResolution>
) -> Result<()> { }
```

## API Endpoints (Indexer)

Add to indexer API:

```javascript
// Get pending disputes
GET /disputes?status=pending

// Get dispute details
GET /disputes/:proposalPda

// Get arbitrator history
GET /arbitrators/:pubkey/history

// Get arbitrator reputation
GET /arbitrators/:pubkey/reputation
```

## Testing

### Run Tests

```bash
node scripts/multisig_arbitration.js
```

### Test Scenarios

1. **Unanimous Decision**: All arbitrators agree
2. **Split Vote**: Majority wins, minority recorded
3. **Tie Breaker**: Additional arbitrator votes
4. **Invalid Voter**: Non-arbitrator attempts to vote
5. **Double Vote**: Arbitrator attempts to vote twice

## Roadmap

- [ ] Add stake requirement for arbitrators
- [ ] Implement reputation decay over time
- [ ] Add appeals process
- [ ] Create arbitrator dashboard UI
- [ ] Integrate with on-chain governance
- [ ] Anonymous voting with ZK proofs
- [ ] Automated evidence analysis (ML)
- [ ] Community arbitrator selection

## Example Workflow

```
1. User Session Fails
   └─> User raises dispute via app
       └─> createDisputeProposal()
           └─> Notification sent to arbitrators

2. Arbitrators Review
   └─> Review evidence (logs, tests)
       └─> Each arbitrator votes
           ├─> Vote 1: refund 100%, slash 10%
           ├─> Vote 2: refund 100%, slash 15%
           └─> Vote 3: refund 100%, slash 10%

3. Resolution
   └─> Threshold reached (3 votes)
       └─> tallyVotes()
           └─> Outcome: refund 100%, slash 12%
               └─> executeResolution()
                   ├─> User receives refund
                   └─> Provider stake slashed

4. Post-Resolution
   └─> Outcome recorded on-chain
       └─> Arbitrator reputations updated
           └─> Case closed
```

## License

MIT
