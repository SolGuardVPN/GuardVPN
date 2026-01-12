use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("8LQKwvHJPdK6fKmopXmUwct8JjVGQhf3RFQd64nCV39i");

pub const PROVIDER_SEED: &[u8] = b"provider";
pub const NODE_SEED: &[u8] = b"node";
pub const SESSION_SEED: &[u8] = b"session";

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
    ) -> Result<()> {
        require!(endpoint.len() <= 80, DvpnError::StringTooLong);
        require!(region.len() <= 12, DvpnError::StringTooLong);

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
        node.is_active = true;
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

        // Move remaining balance from session PDA -> provider authority
        let amount = session.remaining_balance;

        if amount > 0 {
            **session.to_account_info().try_borrow_mut_lamports()? -= amount;
            **ctx.accounts.authority.to_account_info().try_borrow_mut_lamports()? += amount;
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
        let provider = &ctx.accounts.provider;

        require_keys_eq!(provider.authority, ctx.accounts.authority.key(), DvpnError::Unauthorized);
        require!(session.state == SessionState::Active, DvpnError::SessionNotActive);
        require!(amount_lamports > 0, DvpnError::InvalidAmount);
        require!(session.remaining_balance >= amount_lamports, DvpnError::InsufficientBalance);

        // Update session proof and usage
        session.last_proof_hash = proof_hash;
        session.bytes_used = session.bytes_used.saturating_add(bytes_used);

        // Transfer chunk from session -> provider
        **session.to_account_info().try_borrow_mut_lamports()? -= amount_lamports;
        **ctx.accounts.authority.to_account_info().try_borrow_mut_lamports()? += amount_lamports;

        session.remaining_balance = session.remaining_balance.saturating_sub(amount_lamports);

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

    pub mint: Account<'info, token::Mint>,

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
}

#[derive(Accounts)]
pub struct ClaimChunk<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [PROVIDER_SEED, authority.key().as_ref()],
        bump = provider.bump
    )]
    pub provider: Account<'info, Provider>,

    #[account(mut)]
    pub session: Account<'info, Session>,
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

#[account]
pub struct Provider {
    pub authority: Pubkey,
    pub node_count: u64,
    pub stake_lamports: u64,
    pub reputation_score: u16,
    pub total_uptime_seconds: u64,
    pub total_sessions: u64,
    pub bump: u8,
}
impl Provider {
    pub const MAX_SIZE: usize = 32 + 8 + 8 + 2 + 8 + 8 + 1;
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
    pub is_active: bool,
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
        4 + 4 + 8 + 1 +
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
}