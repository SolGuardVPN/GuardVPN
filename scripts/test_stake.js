const anchor = require('@coral-xyz/anchor');
const { PublicKey, SystemProgram, LAMPORTS_PER_SOL, Keypair } = require('@solana/web3.js');
const fs = require('fs');

async function main() {

  // Load wallet
  const walletPath = './wallet.json';
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(walletData));
  
  // Connect to local
  const connection = new anchor.web3.Connection('http://localhost:8899', 'confirmed');
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), {});
  anchor.setProvider(provider);

  // Program ID
  const programId = new PublicKey('8LQKwvHJPdK6fKmopXmUwct8JjVGQhf3RFQd64nCV39i');
  
  
  // Load IDL
  const idl = JSON.parse(fs.readFileSync('./target/idl/dvpn.json', 'utf8'));
  const program = new anchor.Program(idl, programId, provider);
  
  // Get provider PDA
  const [providerPda] = await PublicKey.findProgramAddress(
    [Buffer.from('provider'), wallet.publicKey.toBuffer()],
    programId
  );
  
  
  // Check if provider exists
  try {
    const providerAccount = await program.account.provider.fetch(providerPda);
  } catch (e) {
    process.exit(1);
  }
  
  // Stake 0.5 SOL
  const stakeAmount = new anchor.BN(0.5 * LAMPORTS_PER_SOL);
  
  try {
    const tx = await program.methods
      .stakeProvider(stakeAmount)
      .accounts({
        provider: providerPda,
        authority: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    
    // Verify
    const updatedProvider = await program.account.provider.fetch(providerPda);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.logs) {
    }
    process.exit(1);
  }
}

main().then(() => process.exit(0)).catch(console.error);
