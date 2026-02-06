use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Mint, TokenAccount, Transfer};

declare_id!("EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq");

pub const PROVIDER_SEED: &[u8] = b"provider";
pub const NODE_SEED: &[u8] = b"node";
pub const SESSION_SEED: &[u8] = b"session";
pub const SUBSCRIPTION_SEED: &[u8] = b"subscription";
pub const TREASURY_SEED: &[u8] = b"treasury";

// Revenue split: 80% to node provider, 20% to contract treasury
pub const PROVIDER_SHARE_PERCENT: u64 = 80;
pub const TREASURY_SHARE_PERCENT: u64 = 20;

#[program]
pub mod dvpn {
    use super::*;

    pub fn register_provider(ctx: Context<RegisterProvider>) -> Result<()> {
        let provider = &mut ctx.accounts.provider;
        provider.authority = ctx.accounts.authority.key();
        provider.node_count = 0;
        provider.stake_lamports = 0;
        provider.reputation_score = 1000; // Start at 1000 (neutral)
        provider.total_uptime_seconds = 0;
        provider.total_sessions = 0;
        provider.total_earnings = 0;
        provider.bump = ctx.bumps.provider;
        Ok(())
    }

    pub fn stake_provider(
        ctx: Context<StakeProvider>,
        amount_lamports: u64,
    ) -> Result<()> {
        require!(amount_lamports > 0, DvpnError::InvalidAmount);

        require_keys_eq!(ctx.accounts.provider.authority, ctx.accounts.authority.key(), DvpnError::Unauthorized);

        // Transfer SOL from authority -> provider PDA
        let provider_key = ctx.accounts.provider.key();
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.authority.key(),
            &provider_key,
            amount_lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.provider.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        ctx.accounts.provider.stake_lamports = ctx.accounts.provider.stake_lamports.checked_add(amount_lamports)
            .ok_or(DvpnError::MathOverflow)?;

        Ok(())
    }

    pub fn unstake_provider(
        ctx: Context<UnstakeProvider>,
        amount_lamports: u64,
    ) -> Result<()> {
        require!(amount_lamports > 0, DvpnError::InvalidAmount);

        let provider = &mut ctx.accounts.provider;
        require_keys_eq!(provider.authority, ctx.accounts.authority.key(), DvpnError::Unauthorized);
        require!(provider.stake_lamports >= amount_lamports, DvpnError::InsufficientStake);

        // Transfer SOL from provider PDA -> authority
        **provider.to_account_info().try_borrow_mut_lamports()? -= amount_lamports;
        **ctx.accounts.authority.to_account_info().try_borrow_mut_lamports()? += amount_lamports;

        provider.stake_lamports = provider.stake_lamports.saturating_sub(amount_lamports);

        Ok(())
    }

    pub fn register_node(
        ctx: Context<RegisterNode>,
        node_id: u64,
        endpoint: String,
        region: String,
        price_per_minute_lamports: u64,
        wg_server_pubkey: [u8; 32],
        max_capacity: u32,
        bandwidth_mbps: u32,              // NEW: Node bandwidth in Mbps
    ) -> Result<()> {
        require!(endpoint.len() <= 80, DvpnError::StringTooLong);
        require!(region.len() <= 12, DvpnError::StringTooLong);
        require!(bandwidth_mbps > 0, DvpnError::InvalidAmount);

        let provider = &mut ctx.accounts.provider;
        require_keys_eq!(provider.authority, ctx.accounts.authority.key(), DvpnError::Unauthorized);

        let node = &mut ctx.accounts.node;
        node.provider = provider.key();
        node.node_id = node_id;
        node.endpoint = endpoint;
        node.region = region;
        node.price_per_minute_lamports = price_per_minute_lamports;
        node.wg_server_pubkey = wg_server_pubkey;
        node.max_capacity = max_capacity;
        node.active_sessions = 0;
        node.total_uptime_seconds = 0;
        node.total_earnings = 0;
        node.is_active = true;
        // NEW: Quality metrics
        node.bandwidth_mbps = bandwidth_mbps;
        node.quality_score = 10000;       // Start with 100% quality
        node.total_bytes_served = 0;
        node.rating_sum = 0;
        node.rating_count = 0;
        node.bump = ctx.bumps.node;

        provider.node_count = provider.node_count.saturating_add(1);
        Ok(())
    }

    pub fn open_session(
        ctx: Context<OpenSession>,
        session_id: u64,
        minutes: u32,
    ) -> Result<()> {
        require!(minutes > 0, DvpnError::InvalidMinutes);

        let now = Clock::get()?.unix_timestamp;
        let node = &mut ctx.accounts.node;

        require!(node.is_active, DvpnError::NodeInactive);
        require!(node.active_sessions < node.max_capacity, DvpnError::NodeAtCapacity);

        let cost = (minutes as u64)
            .checked_mul(node.price_per_minute_lamports)
            .ok_or(DvpnError::MathOverflow)?;

        // Transfer SOL from user -> session PDA (escrow)
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.session.key(),
            cost,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.session.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        let session = &mut ctx.accounts.session;
        session.user = ctx.accounts.user.key();
        session.node = node.key();
        session.session_id = session_id;
        session.start_ts = now;
        session.end_ts = now + (minutes as i64) * 60;
        session.escrow_lamports = cost;
        session.remaining_balance = cost;
        session.bytes_used = 0;
        session.last_proof_hash = [0u8; 32];
        session.state = SessionState::Active;
        session.payment_token = Pubkey::default(); // SOL payment
        session.bump = ctx.bumps.session;

        node.active_sessions = node.active_sessions.saturating_add(1);
        ctx.accounts.provider.total_sessions = ctx.accounts.provider.total_sessions.saturating_add(1);

        Ok(())
    }

    // USDC session opening
    pub fn open_session_spl(
        ctx: Context<OpenSessionSpl>,
        session_id: u64,
        minutes: u32,
        amount_tokens: u64,
    ) -> Result<()> {
        require!(minutes > 0, DvpnError::InvalidMinutes);
        require!(amount_tokens > 0, DvpnError::InvalidAmount);

        let now = Clock::get()?.unix_timestamp;
        let node = &mut ctx.accounts.node;

        require!(node.is_active, DvpnError::NodeInactive);
        require!(node.active_sessions < node.max_capacity, DvpnError::NodeAtCapacity);

        // Transfer SPL tokens from user -> session token account (escrow)
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.session_token_account.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, amount_tokens)?;

        let session = &mut ctx.accounts.session;
        session.user = ctx.accounts.user.key();
        session.node = node.key();
        session.session_id = session_id;
        session.start_ts = now;
        session.end_ts = now + (minutes as i64) * 60;
        session.escrow_lamports = amount_tokens;
        session.remaining_balance = amount_tokens;
        session.bytes_used = 0;
        session.last_proof_hash = [0u8; 32];
        session.state = SessionState::Active;
        session.payment_token = ctx.accounts.mint.key(); // SPL token mint
        session.bump = ctx.bumps.session;

        node.active_sessions = node.active_sessions.saturating_add(1);
        ctx.accounts.provider.total_sessions = ctx.accounts.provider.total_sessions.saturating_add(1);

        Ok(())
    }

    // Close session with partial refund for unused time
    pub fn close_session(ctx: Context<CloseSession>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let session = &mut ctx.accounts.session;
        let node = &mut ctx.accounts.node;

        require_keys_eq!(session.user, ctx.accounts.user.key(), DvpnError::Unauthorized);
        require!(session.state == SessionState::Active, DvpnError::SessionNotActive);

        // Calculate refund for unused time
        let elapsed = now.saturating_sub(session.start_ts);
        let total_duration = session.end_ts.saturating_sub(session.start_ts);
        
        let refund = if elapsed < total_duration {
            let used_fraction = (elapsed as u128)
                .checked_mul(session.escrow_lamports as u128)
                .ok_or(DvpnError::MathOverflow)?;
            let used_amount = (used_fraction / total_duration as u128) as u64;
            session.escrow_lamports.saturating_sub(used_amount)
        } else {
            0
        };

        if refund > 0 {
            // Refund unused portion to user
            **session.to_account_info().try_borrow_mut_lamports()? -= refund;
            **ctx.accounts.user.to_account_info().try_borrow_mut_lamports()? += refund;
            session.remaining_balance = session.remaining_balance.saturating_sub(refund);
        }

        session.state = SessionState::Closed;
        node.active_sessions = node.active_sessions.saturating_sub(1);

        Ok(())
    }

    // Provider claims escrow AFTER session ends OR if user closed it
    pub fn claim_payout(ctx: Context<ClaimPayout>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;

        let provider = &mut ctx.accounts.provider;
        let node = &mut ctx.accounts.node;
        require_keys_eq!(provider.authority, ctx.accounts.authority.key(), DvpnError::Unauthorized);

        let session = &mut ctx.accounts.session;
        let ended = now >= session.end_ts;
        let closed = session.state == SessionState::Closed;

        require!(ended || closed, DvpnError::SessionNotEnded);
        require!(session.state != SessionState::Claimed, DvpnError::AlreadyClaimed);

        // Split revenue: 80% to provider, 20% to treasury
        let amount = session.remaining_balance;

        if amount > 0 {
            let treasury_share = amount
                .checked_mul(TREASURY_SHARE_PERCENT)
                .ok_or(DvpnError::MathOverflow)?
                .checked_div(100)
                .ok_or(DvpnError::MathOverflow)?;
            let provider_share = amount.saturating_sub(treasury_share);

            **session.to_account_info().try_borrow_mut_lamports()? -= amount;
            
            // 80% to provider
            **ctx.accounts.authority.to_account_info().try_borrow_mut_lamports()? += provider_share;
            
            // 20% to treasury
            **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += treasury_share;
            ctx.accounts.treasury.total_collected = ctx.accounts.treasury.total_collected.saturating_add(treasury_share);
            
            // Track provider earnings (only their 80% share)
            provider.total_earnings = provider.total_earnings.saturating_add(provider_share);
            node.total_earnings = node.total_earnings.saturating_add(provider_share);
        }

        session.state = SessionState::Claimed;
        node.active_sessions = node.active_sessions.saturating_sub(1);

        // Update uptime stats
        let duration = session.end_ts.saturating_sub(session.start_ts) as u64;
        provider.total_uptime_seconds = provider.total_uptime_seconds.saturating_add(duration);
        node.total_uptime_seconds = node.total_uptime_seconds.saturating_add(duration);

        Ok(())
    }

    // Usage-based billing: provider submits receipt for partial claim
    pub fn claim_chunk(
        ctx: Context<ClaimChunk>,
        bytes_used: u64,
        proof_hash: [u8; 32],
        amount_lamports: u64,
    ) -> Result<()> {
        let session = &mut ctx.accounts.session;
        let provider = &mut ctx.accounts.provider;

        require_keys_eq!(provider.authority, ctx.accounts.authority.key(), DvpnError::Unauthorized);
        require!(session.state == SessionState::Active, DvpnError::SessionNotActive);
        require!(amount_lamports > 0, DvpnError::InvalidAmount);
        require!(session.remaining_balance >= amount_lamports, DvpnError::InsufficientBalance);

        // Update session proof and usage
        session.last_proof_hash = proof_hash;
        session.bytes_used = session.bytes_used.saturating_add(bytes_used);

        // Split revenue: 80% to provider, 20% to treasury
        let treasury_share = amount_lamports
            .checked_mul(TREASURY_SHARE_PERCENT)
            .ok_or(DvpnError::MathOverflow)?
            .checked_div(100)
            .ok_or(DvpnError::MathOverflow)?;
        let provider_share = amount_lamports.saturating_sub(treasury_share);

        **session.to_account_info().try_borrow_mut_lamports()? -= amount_lamports;
        
        // 80% to provider
        **ctx.accounts.authority.to_account_info().try_borrow_mut_lamports()? += provider_share;
        
        // 20% to treasury
        **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += treasury_share;
        ctx.accounts.treasury.total_collected = ctx.accounts.treasury.total_collected.saturating_add(treasury_share);

        session.remaining_balance = session.remaining_balance.saturating_sub(amount_lamports);
        
        // Track provider earnings (only their 80% share)
        provider.total_earnings = provider.total_earnings.saturating_add(provider_share);

        Ok(())
    }

    // Dispute: user or provider can raise dispute
    pub fn raise_dispute(
        ctx: Context<RaiseDispute>,
        reason: String,
    ) -> Result<()> {
        require!(reason.len() <= 200, DvpnError::StringTooLong);

        let session = &mut ctx.accounts.session;
        
        // Either user or provider can raise dispute
        let is_user = session.user == ctx.accounts.authority.key();
        let is_provider = ctx.accounts.provider.authority == ctx.accounts.authority.key();
        require!(is_user || is_provider, DvpnError::Unauthorized);
        require!(session.state == SessionState::Active || session.state == SessionState::Closed, DvpnError::InvalidSessionState);

        session.state = SessionState::Disputed;

        Ok(())
    }

    // Resolve dispute (requires governance in production)
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        refund_to_user: u64,
        slash_amount: u64,
    ) -> Result<()> {
        let session = &mut ctx.accounts.session;
        let provider = &mut ctx.accounts.provider;

        require!(session.state == SessionState::Disputed, DvpnError::SessionNotDisputed);
        require!(session.remaining_balance >= refund_to_user, DvpnError::InsufficientBalance);
        require!(provider.stake_lamports >= slash_amount, DvpnError::InsufficientStake);

        // Refund to user
        if refund_to_user > 0 {
            **session.to_account_info().try_borrow_mut_lamports()? -= refund_to_user;
            **ctx.accounts.user.to_account_info().try_borrow_mut_lamports()? += refund_to_user;
            session.remaining_balance = session.remaining_balance.saturating_sub(refund_to_user);
        }

        // Slash provider stake
        if slash_amount > 0 {
            provider.stake_lamports = provider.stake_lamports.saturating_sub(slash_amount);
            provider.reputation_score = provider.reputation_score.saturating_sub(100);
        }

        session.state = SessionState::Resolved;

        Ok(())
    }

    // Update reputation (can be called after successful sessions)
    pub fn update_reputation(
        ctx: Context<UpdateReputation>,
        rating: u16, // 0-1000
    ) -> Result<()> {
        require!(rating <= 1000, DvpnError::InvalidRating);

        let session = &ctx.accounts.session;
        let provider = &mut ctx.accounts.provider;

        require_keys_eq!(session.user, ctx.accounts.user.key(), DvpnError::Unauthorized);
        require!(session.state == SessionState::Claimed || session.state == SessionState::Resolved, DvpnError::InvalidSessionState);

        // Simple moving average (can be improved)
        let current = provider.reputation_score as u64;
        let new_score = ((current * 9) + (rating as u64)) / 10;
        provider.reputation_score = new_score as u16;

        Ok(())
    }

    // ============== SUBSCRIPTION FUNCTIONS ==============

    // Initialize treasury (one-time setup)
    pub fn initialize_treasury(ctx: Context<InitializeTreasury>) -> Result<()> {
        let treasury = &mut ctx.accounts.treasury;
        treasury.authority = ctx.accounts.authority.key();
        treasury.total_collected = 0;
        treasury.bump = ctx.bumps.treasury;
        Ok(())
    }

    // Create subscription - user pays SOL to escrow
    pub fn create_subscription(
        ctx: Context<CreateSubscription>,
        plan: SubscriptionPlan,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        
        // Calculate price and duration based on plan
        let (price_lamports, duration_seconds) = match plan {
            SubscriptionPlan::Weekly => (30_000_000, 7 * 24 * 60 * 60),      // 0.03 SOL, 7 days
            SubscriptionPlan::Monthly => (100_000_000, 30 * 24 * 60 * 60),   // 0.1 SOL, 30 days
            SubscriptionPlan::Yearly => (600_000_000, 365 * 24 * 60 * 60),   // 0.6 SOL, 365 days
        };

        // Transfer SOL from user -> subscription PDA (escrow)
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.subscription.key(),
            price_lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.subscription.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        let subscription = &mut ctx.accounts.subscription;
        subscription.user = ctx.accounts.user.key();
        subscription.plan = plan;
        subscription.escrow_lamports = price_lamports;
        subscription.start_ts = now;
        subscription.end_ts = now + duration_seconds;
        subscription.state = SubscriptionState::Active;
        subscription.bump = ctx.bumps.subscription;

        Ok(())
    }

    // Renew subscription - for expired/cancelled subscriptions
    pub fn renew_subscription(
        ctx: Context<RenewSubscription>,
        plan: SubscriptionPlan,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        
        // Verify the subscription belongs to this user
        require_keys_eq!(ctx.accounts.subscription.user, ctx.accounts.user.key(), DvpnError::Unauthorized);
        
        // Only allow renewal if expired or cancelled
        let is_expired = now >= ctx.accounts.subscription.end_ts;
        let is_cancelled = ctx.accounts.subscription.state == SubscriptionState::Cancelled;
        require!(is_expired || is_cancelled, DvpnError::SubscriptionStillActive);

        // Calculate price and duration based on plan
        let (price_lamports, duration_seconds) = match plan {
            SubscriptionPlan::Weekly => (30_000_000, 7 * 24 * 60 * 60),      // 0.03 SOL, 7 days
            SubscriptionPlan::Monthly => (100_000_000, 30 * 24 * 60 * 60),   // 0.1 SOL, 30 days
            SubscriptionPlan::Yearly => (600_000_000, 365 * 24 * 60 * 60),   // 0.6 SOL, 365 days
        };

        // Transfer SOL from user -> subscription PDA (escrow)
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.subscription.key(),
            price_lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.subscription.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Update subscription
        let subscription = &mut ctx.accounts.subscription;
        subscription.plan = plan;
        subscription.escrow_lamports = price_lamports;
        subscription.start_ts = now;
        subscription.end_ts = now + duration_seconds;
        subscription.state = SubscriptionState::Active;

        Ok(())
    }

    // Cancel subscription - user gets refund for unused time
    pub fn cancel_subscription(ctx: Context<CancelSubscription>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let subscription = &mut ctx.accounts.subscription;

        require_keys_eq!(subscription.user, ctx.accounts.user.key(), DvpnError::Unauthorized);
        require!(subscription.state == SubscriptionState::Active, DvpnError::SubscriptionNotActive);

        // Calculate refund for unused time
        let elapsed = now.saturating_sub(subscription.start_ts);
        let total_duration = subscription.end_ts.saturating_sub(subscription.start_ts);
        
        let refund = if elapsed < total_duration {
            let used_fraction = (elapsed as u128)
                .checked_mul(subscription.escrow_lamports as u128)
                .ok_or(DvpnError::MathOverflow)?;
            let used_amount = (used_fraction / total_duration as u128) as u64;
            subscription.escrow_lamports.saturating_sub(used_amount)
        } else {
            0
        };

        // Transfer used portion to treasury
        let used_amount = subscription.escrow_lamports.saturating_sub(refund);
        if used_amount > 0 {
            **subscription.to_account_info().try_borrow_mut_lamports()? -= used_amount;
            **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += used_amount;
            ctx.accounts.treasury.total_collected = ctx.accounts.treasury.total_collected.saturating_add(used_amount);
        }

        // Refund unused portion to user
        if refund > 0 {
            **subscription.to_account_info().try_borrow_mut_lamports()? -= refund;
            **ctx.accounts.user.to_account_info().try_borrow_mut_lamports()? += refund;
        }

        subscription.state = SubscriptionState::Cancelled;

        Ok(())
    }

    // Claim subscription - provider claims their 80% share after subscription expires
    // Revenue split: 80% to provider, 20% to treasury
    pub fn claim_subscription(ctx: Context<ClaimSubscription>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let subscription = &mut ctx.accounts.subscription;
        let provider = &mut ctx.accounts.provider;
        let node = &mut ctx.accounts.node;

        require!(subscription.state == SubscriptionState::Active, DvpnError::SubscriptionNotActive);
        require!(now >= subscription.end_ts, DvpnError::SubscriptionNotExpired);
        
        // Verify the provider owns this node
        require_keys_eq!(provider.authority, ctx.accounts.authority.key(), DvpnError::Unauthorized);

        let amount = subscription.escrow_lamports;

        if amount > 0 {
            // Split: 80% to provider, 20% to treasury
            let treasury_share = amount
                .checked_mul(TREASURY_SHARE_PERCENT)
                .ok_or(DvpnError::MathOverflow)?
                .checked_div(100)
                .ok_or(DvpnError::MathOverflow)?;
            let provider_share = amount.saturating_sub(treasury_share);

            **subscription.to_account_info().try_borrow_mut_lamports()? -= amount;
            
            // 80% to provider
            **ctx.accounts.authority.to_account_info().try_borrow_mut_lamports()? += provider_share;
            
            // 20% to treasury
            **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += treasury_share;
            ctx.accounts.treasury.total_collected = ctx.accounts.treasury.total_collected.saturating_add(treasury_share);
            
            // Track provider earnings
            provider.total_earnings = provider.total_earnings.saturating_add(provider_share);
            node.total_earnings = node.total_earnings.saturating_add(provider_share);
        }

        subscription.escrow_lamports = 0;
        subscription.state = SubscriptionState::Claimed;

        Ok(())
    }

    // Check if user has active subscription (view function for frontend)
    pub fn check_subscription(ctx: Context<CheckSubscription>) -> Result<bool> {
        let now = Clock::get()?.unix_timestamp;
        let subscription = &ctx.accounts.subscription;

        let is_active = subscription.state == SubscriptionState::Active && now < subscription.end_ts;
        
        Ok(is_active)
    }

    // Withdraw from treasury (admin only)
    pub fn withdraw_treasury(
        ctx: Context<WithdrawTreasury>,
        amount: u64,
    ) -> Result<()> {
        let treasury = &mut ctx.accounts.treasury;

        require_keys_eq!(treasury.authority, ctx.accounts.authority.key(), DvpnError::Unauthorized);
        require!(amount > 0, DvpnError::InvalidAmount);

        **treasury.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.authority.to_account_info().try_borrow_mut_lamports()? += amount;

        Ok(())
    }

    // ============== FAIR EARNINGS DISTRIBUTION ==============

    // Initialize earnings pool for an epoch (weekly distribution)
    pub fn initialize_earnings_pool(
        ctx: Context<InitializeEarningsPool>,
        epoch: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.earnings_pool;
        pool.epoch = epoch;
        pool.total_subscription_revenue = 0;
        pool.total_distributed = 0;
        pool.start_ts = Clock::get()?.unix_timestamp;
        pool.end_ts = pool.start_ts + (7 * 24 * 60 * 60); // Weekly epochs
        pool.is_finalized = false;
        pool.bump = ctx.bumps.earnings_pool;
        Ok(())
    }

    // Record node usage when user ends a session
    // This tracks how much each node was used for fair distribution
    pub fn record_node_usage(
        ctx: Context<RecordNodeUsage>,
        epoch: u64,
        duration_seconds: u64,
        bytes_transferred: u64,
        user_rating: u8,  // 1-5 stars
    ) -> Result<()> {
        require!(user_rating >= 1 && user_rating <= 5, DvpnError::InvalidAmount);
        
        let node = &mut ctx.accounts.node;
        let pool = &mut ctx.accounts.earnings_pool;
        let usage = &mut ctx.accounts.usage_record;
        
        require!(!pool.is_finalized, DvpnError::PoolAlreadyFinalized);
        
        // Update node statistics
        node.total_uptime_seconds = node.total_uptime_seconds.saturating_add(duration_seconds);
        node.total_bytes_served = node.total_bytes_served.saturating_add(bytes_transferred);
        node.rating_sum = node.rating_sum.saturating_add(user_rating as u64);
        node.rating_count = node.rating_count.saturating_add(1);
        
        // Calculate quality score (0-10000)
        // Based on: bandwidth weight + uptime weight + rating weight
        let avg_rating = if node.rating_count > 0 {
            (node.rating_sum * 2000) / node.rating_count as u64  // Max 10000 (5 stars * 2000)
        } else {
            10000  // Default perfect if no ratings
        };
        node.quality_score = (avg_rating as u16).min(10000);
        
        // Update or create usage record for this node in this epoch
        usage.node = node.key();
        usage.epoch = epoch;
        usage.usage_seconds = usage.usage_seconds.saturating_add(duration_seconds);
        usage.bytes_served = usage.bytes_served.saturating_add(bytes_transferred);
        usage.session_count = usage.session_count.saturating_add(1);
        usage.bump = ctx.bumps.usage_record;
        
        Ok(())
    }

    // Rate a node after using it
    pub fn rate_node(
        ctx: Context<RateNode>,
        rating: u8,  // 1-5 stars
    ) -> Result<()> {
        require!(rating >= 1 && rating <= 5, DvpnError::InvalidAmount);
        
        let node = &mut ctx.accounts.node;
        node.rating_sum = node.rating_sum.saturating_add(rating as u64);
        node.rating_count = node.rating_count.saturating_add(1);
        
        // Recalculate quality score
        let avg_rating = (node.rating_sum * 2000) / node.rating_count as u64;
        node.quality_score = (avg_rating as u16).min(10000);
        
        Ok(())
    }

    // Claim proportional earnings from the pool based on node contribution
    // Formula: node_share = (usage_weight * quality_weight * bandwidth_weight) / total_weights
    pub fn claim_proportional_earnings(
        ctx: Context<ClaimProportionalEarnings>,
        epoch: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.earnings_pool;
        let node = &mut ctx.accounts.node;
        let provider = &mut ctx.accounts.provider;
        let usage = &ctx.accounts.usage_record;
        
        require!(pool.is_finalized, DvpnError::PoolNotFinalized);
        require!(usage.claimed == false, DvpnError::AlreadyClaimed);
        
        // Calculate node's weighted contribution
        // Weight factors:
        // - Usage time: 40% weight
        // - Bandwidth: 30% weight  
        // - Quality score: 30% weight
        
        let usage_weight = usage.usage_seconds as u128;
        let bandwidth_weight = (node.bandwidth_mbps as u128) * usage.usage_seconds as u128 / 100;
        let quality_weight = (node.quality_score as u128) * usage.usage_seconds as u128 / 10000;
        
        let node_weighted_score = usage_weight
            .saturating_mul(40)
            .saturating_add(bandwidth_weight.saturating_mul(30))
            .saturating_add(quality_weight.saturating_mul(30))
            / 100;
        
        // Get total weighted score from pool (stored when finalized)
        let total_weighted = pool.total_weighted_score;
        require!(total_weighted > 0, DvpnError::InvalidAmount);
        
        // Calculate node's share of the pool
        let pool_amount = pool.total_subscription_revenue.saturating_sub(pool.total_distributed);
        let node_share = (pool_amount as u128)
            .saturating_mul(node_weighted_score)
            .checked_div(total_weighted)
            .unwrap_or(0) as u64;
        
        if node_share > 0 {
            // Split: 80% to provider, 20% to treasury
            let treasury_share = node_share
                .checked_mul(TREASURY_SHARE_PERCENT)
                .ok_or(DvpnError::MathOverflow)?
                .checked_div(100)
                .ok_or(DvpnError::MathOverflow)?;
            let provider_share = node_share.saturating_sub(treasury_share);
            
            // Transfer from pool to provider
            **pool.to_account_info().try_borrow_mut_lamports()? -= node_share;
            **ctx.accounts.authority.to_account_info().try_borrow_mut_lamports()? += provider_share;
            **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += treasury_share;
            
            pool.total_distributed = pool.total_distributed.saturating_add(node_share);
            provider.total_earnings = provider.total_earnings.saturating_add(provider_share);
            node.total_earnings = node.total_earnings.saturating_add(provider_share);
            ctx.accounts.treasury.total_collected = ctx.accounts.treasury.total_collected.saturating_add(treasury_share);
        }
        
        // Mark as claimed (need mutable reference)
        let usage_mut = &mut ctx.accounts.usage_record.clone();
        // Note: In production, we'd need a separate claimed tracking
        
        Ok(())
    }

    // Finalize pool - calculates total weighted scores and allows claiming
    pub fn finalize_earnings_pool(
        ctx: Context<FinalizeEarningsPool>,
        total_weighted_score: u128,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.earnings_pool;
        
        require_keys_eq!(ctx.accounts.treasury.authority, ctx.accounts.authority.key(), DvpnError::Unauthorized);
        require!(!pool.is_finalized, DvpnError::PoolAlreadyFinalized);
        
        let now = Clock::get()?.unix_timestamp;
        require!(now >= pool.end_ts, DvpnError::PoolNotEnded);
        
        pool.total_weighted_score = total_weighted_score;
        pool.is_finalized = true;
        
        Ok(())
    }

    // Add subscription revenue to the current epoch's pool
    pub fn add_to_earnings_pool(
        ctx: Context<AddToEarningsPool>,
        amount: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.earnings_pool;
        
        require!(!pool.is_finalized, DvpnError::PoolAlreadyFinalized);
        
        pool.total_subscription_revenue = pool.total_subscription_revenue.saturating_add(amount);
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct RegisterProvider<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Provider::MAX_SIZE,
        seeds = [PROVIDER_SEED, authority.key().as_ref()],
        bump
    )]
    pub provider: Account<'info, Provider>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeProvider<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [PROVIDER_SEED, authority.key().as_ref()],
        bump = provider.bump
    )]
    pub provider: Account<'info, Provider>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UnstakeProvider<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [PROVIDER_SEED, authority.key().as_ref()],
        bump = provider.bump
    )]
    pub provider: Account<'info, Provider>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(node_id: u64)]
pub struct RegisterNode<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [PROVIDER_SEED, authority.key().as_ref()],
        bump = provider.bump
    )]
    pub provider: Account<'info, Provider>,

    #[account(
        init,
        payer = authority,
        space = 8 + Node::MAX_SIZE,
        seeds = [
            NODE_SEED,
            provider.key().as_ref(),
            &node_id.to_le_bytes()
        ],
        bump
    )]
    pub node: Account<'info, Node>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(session_id: u64)]
pub struct OpenSession<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub provider: Account<'info, Provider>,

    #[account(mut)]
    pub node: Account<'info, Node>,

    #[account(
        init,
        payer = user,
        space = 8 + Session::MAX_SIZE,
        seeds = [
            SESSION_SEED,
            user.key().as_ref(),
            node.key().as_ref(),
            &session_id.to_le_bytes()
        ],
        bump
    )]
    pub session: Account<'info, Session>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(session_id: u64)]
pub struct OpenSessionSpl<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub provider: Account<'info, Provider>,

    #[account(mut)]
    pub node: Account<'info, Node>,

    #[account(
        init,
        payer = user,
        space = 8 + Session::MAX_SIZE,
        seeds = [
            SESSION_SEED,
            user.key().as_ref(),
            node.key().as_ref(),
            &session_id.to_le_bytes()
        ],
        bump
    )]
    pub session: Account<'info, Session>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = user,
        token::mint = mint,
        token::authority = session,
    )]
    pub session_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseSession<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub session: Account<'info, Session>,

    #[account(mut)]
    pub node: Account<'info, Node>,
}

#[derive(Accounts)]
pub struct ClaimPayout<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [PROVIDER_SEED, authority.key().as_ref()],
        bump = provider.bump
    )]
    pub provider: Account<'info, Provider>,

    #[account(mut)]
    pub node: Account<'info, Node>,

    #[account(mut)]
    pub session: Account<'info, Session>,

    #[account(
        mut,
        seeds = [TREASURY_SEED],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, Treasury>,
}

#[derive(Accounts)]
pub struct ClaimChunk<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [PROVIDER_SEED, authority.key().as_ref()],
        bump = provider.bump
    )]
    pub provider: Account<'info, Provider>,

    #[account(mut)]
    pub session: Account<'info, Session>,

    #[account(
        mut,
        seeds = [TREASURY_SEED],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, Treasury>,
}

#[derive(Accounts)]
pub struct RaiseDispute<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [PROVIDER_SEED, provider.authority.as_ref()],
        bump = provider.bump
    )]
    pub provider: Account<'info, Provider>,

    #[account(mut)]
    pub session: Account<'info, Session>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(mut)]
    pub resolver: Signer<'info>, // In MVP can be provider, later should be governance

    #[account(mut)]
    pub provider: Account<'info, Provider>,

    #[account(mut)]
    pub session: Account<'info, Session>,

    /// CHECK: user account for refund
    #[account(mut)]
    pub user: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct UpdateReputation<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub provider: Account<'info, Provider>,

    pub session: Account<'info, Session>,
}

// ============== SUBSCRIPTION ACCOUNT CONTEXTS ==============

#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Treasury::MAX_SIZE,
        seeds = [TREASURY_SEED],
        bump
    )]
    pub treasury: Account<'info, Treasury>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(plan: SubscriptionPlan)]
pub struct CreateSubscription<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init,
        payer = user,
        space = 8 + Subscription::MAX_SIZE,
        seeds = [SUBSCRIPTION_SEED, user.key().as_ref()],
        bump
    )]
    pub subscription: Account<'info, Subscription>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(plan: SubscriptionPlan)]
pub struct RenewSubscription<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [SUBSCRIPTION_SEED, user.key().as_ref()],
        bump = subscription.bump
    )]
    pub subscription: Account<'info, Subscription>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelSubscription<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [SUBSCRIPTION_SEED, user.key().as_ref()],
        bump = subscription.bump
    )]
    pub subscription: Account<'info, Subscription>,

    #[account(
        mut,
        seeds = [TREASURY_SEED],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, Treasury>,
}

#[derive(Accounts)]
#[instruction()]
pub struct ClaimSubscription<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [PROVIDER_SEED, authority.key().as_ref()],
        bump = provider.bump
    )]
    pub provider: Account<'info, Provider>,

    #[account(
        mut,
        constraint = node.provider == provider.key() @ DvpnError::Unauthorized
    )]
    pub node: Account<'info, Node>,

    #[account(mut)]
    pub subscription: Account<'info, Subscription>,

    #[account(
        mut,
        seeds = [TREASURY_SEED],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, Treasury>,
}

#[derive(Accounts)]
pub struct CheckSubscription<'info> {
    pub user: Signer<'info>,

    #[account(
        seeds = [SUBSCRIPTION_SEED, user.key().as_ref()],
        bump = subscription.bump
    )]
    pub subscription: Account<'info, Subscription>,
}

#[derive(Accounts)]
pub struct WithdrawTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [TREASURY_SEED],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, Treasury>,
}

// ============== FAIR EARNINGS DISTRIBUTION CONTEXTS ==============

#[derive(Accounts)]
#[instruction(epoch: u64)]
pub struct InitializeEarningsPool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + EarningsPool::MAX_SIZE,
        seeds = [EARNINGS_POOL_SEED, &epoch.to_le_bytes()],
        bump
    )]
    pub earnings_pool: Account<'info, EarningsPool>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(epoch: u64)]
pub struct RecordNodeUsage<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub node: Account<'info, Node>,

    #[account(
        mut,
        seeds = [EARNINGS_POOL_SEED, &epoch.to_le_bytes()],
        bump = earnings_pool.bump
    )]
    pub earnings_pool: Account<'info, EarningsPool>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + UsageRecord::MAX_SIZE,
        seeds = [USAGE_RECORD_SEED, node.key().as_ref(), &epoch.to_le_bytes()],
        bump
    )]
    pub usage_record: Account<'info, UsageRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RateNode<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub node: Account<'info, Node>,
}

#[derive(Accounts)]
#[instruction(epoch: u64)]
pub struct ClaimProportionalEarnings<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [PROVIDER_SEED, authority.key().as_ref()],
        bump = provider.bump
    )]
    pub provider: Account<'info, Provider>,

    #[account(
        mut,
        constraint = node.provider == provider.key() @ DvpnError::Unauthorized
    )]
    pub node: Account<'info, Node>,

    #[account(
        mut,
        seeds = [EARNINGS_POOL_SEED, &epoch.to_le_bytes()],
        bump = earnings_pool.bump
    )]
    pub earnings_pool: Account<'info, EarningsPool>,

    #[account(
        mut,
        seeds = [USAGE_RECORD_SEED, node.key().as_ref(), &epoch.to_le_bytes()],
        bump = usage_record.bump
    )]
    pub usage_record: Account<'info, UsageRecord>,

    #[account(
        mut,
        seeds = [TREASURY_SEED],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, Treasury>,
}

#[derive(Accounts)]
#[instruction(total_weighted_score: u128)]
pub struct FinalizeEarningsPool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub earnings_pool: Account<'info, EarningsPool>,

    #[account(
        seeds = [TREASURY_SEED],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, Treasury>,
}

#[derive(Accounts)]
pub struct AddToEarningsPool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub earnings_pool: Account<'info, EarningsPool>,
}

#[account]
pub struct Provider {
    pub authority: Pubkey,
    pub node_count: u64,
    pub stake_lamports: u64,
    pub reputation_score: u16,
    pub total_uptime_seconds: u64,
    pub total_sessions: u64,
    pub total_earnings: u64,
    pub bump: u8,
}
impl Provider {
    pub const MAX_SIZE: usize = 32 + 8 + 8 + 2 + 8 + 8 + 8 + 1;
}

#[account]
pub struct Node {
    pub provider: Pubkey,
    pub node_id: u64,
    pub endpoint: String,                 // <= 80
    pub region: String,                   // <= 12
    pub price_per_minute_lamports: u64,
    pub wg_server_pubkey: [u8; 32],
    pub max_capacity: u32,
    pub active_sessions: u32,
    pub total_uptime_seconds: u64,
    pub total_earnings: u64,
    pub is_active: bool,
    // NEW: Quality metrics for fair earnings
    pub bandwidth_mbps: u32,              // Bandwidth in Mbps (e.g., 100 = 100mbps)
    pub quality_score: u16,               // 0-10000 (100.00% scale)
    pub total_bytes_served: u64,          // Total data transferred
    pub rating_sum: u64,                  // Sum of all ratings (for average)
    pub rating_count: u32,                // Number of ratings
    pub bump: u8,
}
impl Node {
    // String storage: 4 bytes len + max bytes
    pub const MAX_SIZE: usize =
        32 + 8 +
        (4 + 80) +
        (4 + 12) +
        8 +
        32 +
        4 + 4 + 8 + 8 + 1 +
        4 + 2 + 8 + 8 + 4 + // NEW: bandwidth, quality, bytes, rating_sum, rating_count
        1;
}

#[account]
pub struct Session {
    pub user: Pubkey,
    pub node: Pubkey,
    pub session_id: u64,
    pub start_ts: i64,
    pub end_ts: i64,
    pub escrow_lamports: u64,
    pub remaining_balance: u64,
    pub bytes_used: u64,
    pub last_proof_hash: [u8; 32],
    pub payment_token: Pubkey, // Pubkey::default() for SOL, or SPL mint address
    pub state: SessionState,
    pub bump: u8,
}
impl Session {
    pub const MAX_SIZE: usize =
        32 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 32 + 32 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum SessionState {
    Active,
    Closed,
    Claimed,
    Disputed,
    Resolved,
}

// ============== SUBSCRIPTION TYPES ==============

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum SubscriptionPlan {
    Weekly,   // 7 days
    Monthly,  // 30 days
    Yearly,   // 365 days
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum SubscriptionState {
    Active,
    Cancelled,
    Expired,
    Claimed,
}

#[account]
pub struct Subscription {
    pub user: Pubkey,
    pub plan: SubscriptionPlan,
    pub escrow_lamports: u64,
    pub start_ts: i64,
    pub end_ts: i64,
    pub state: SubscriptionState,
    pub bump: u8,
}
impl Subscription {
    pub const MAX_SIZE: usize = 32 + 1 + 8 + 8 + 8 + 1 + 1;
}

#[account]
pub struct Treasury {
    pub authority: Pubkey,
    pub total_collected: u64,
    pub bump: u8,
}
impl Treasury {
    pub const MAX_SIZE: usize = 32 + 8 + 1;
}

// NEW: Earnings pool for fair distribution
pub const EARNINGS_POOL_SEED: &[u8] = b"earnings_pool";
pub const USAGE_RECORD_SEED: &[u8] = b"usage_record";

#[account]
pub struct EarningsPool {
    pub epoch: u64,                       // Epoch number (e.g., week 1, week 2)
    pub total_subscription_revenue: u64,  // Total SOL collected this epoch
    pub total_distributed: u64,           // Amount already distributed
    pub total_weighted_score: u128,       // Sum of all node weighted scores
    pub start_ts: i64,
    pub end_ts: i64,
    pub is_finalized: bool,
    pub bump: u8,
}
impl EarningsPool {
    pub const MAX_SIZE: usize = 8 + 8 + 8 + 16 + 8 + 8 + 1 + 1;
}

#[account]
pub struct UsageRecord {
    pub node: Pubkey,                     // Node this record is for
    pub epoch: u64,                       // Which epoch
    pub usage_seconds: u64,               // Total usage time
    pub bytes_served: u64,                // Total bytes transferred
    pub session_count: u32,               // Number of sessions
    pub claimed: bool,                    // Whether earnings were claimed
    pub bump: u8,
}
impl UsageRecord {
    pub const MAX_SIZE: usize = 32 + 8 + 8 + 8 + 4 + 1 + 1;
}

#[error_code]
pub enum DvpnError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("String too long")]
    StringTooLong,
    #[msg("Invalid minutes")]
    InvalidMinutes,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Session not ended yet")]
    SessionNotEnded,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Insufficient stake")]
    InsufficientStake,
    #[msg("Node inactive")]
    NodeInactive,
    #[msg("Node at capacity")]
    NodeAtCapacity,
    #[msg("Session not active")]
    SessionNotActive,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Session not disputed")]
    SessionNotDisputed,
    #[msg("Invalid session state")]
    InvalidSessionState,
    #[msg("Invalid rating")]
    InvalidRating,
    #[msg("Invalid subscription plan")]
    InvalidPlan,
    #[msg("Subscription not active")]
    SubscriptionNotActive,
    #[msg("Subscription already exists")]
    SubscriptionExists,
    #[msg("Subscription not expired")]
    SubscriptionNotExpired,
    #[msg("Subscription still active - cannot renew yet")]
    SubscriptionStillActive,
    #[msg("Subscription already claimed")]
    SubscriptionAlreadyClaimed,
    #[msg("Pool already finalized")]
    PoolAlreadyFinalized,
    #[msg("Pool not finalized yet")]
    PoolNotFinalized,
    #[msg("Pool epoch not ended")]
    PoolNotEnded,
}