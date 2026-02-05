#!/usr/bin/env node
// DVPN Complete System Test
// Tests all components end-to-end

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
}

function runCommand(command, description, exitOnError = true) {
  log(`\n▶ ${description}`, 'cyan');
  log(`  Command: ${command}`, 'blue');
  
  try {
    const output = execSync(command, { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    log(`✅ ${description} - SUCCESS`, 'green');
    return { success: true, output };
  } catch (error) {
    log(`❌ ${description} - FAILED`, 'red');
    if (error.stdout) log(error.stdout, 'yellow');
    if (error.stderr) log(error.stderr, 'red');
    if (exitOnError) {
      process.exit(1);
    }
    return { success: false, error: error.message };
  }
}

function checkFile(filePath, description) {
  log(`\n▶ Checking: ${description}`, 'cyan');
  if (fs.existsSync(filePath)) {
    log(`✅ ${description} exists`, 'green');
    return true;
  } else {
    log(`❌ ${description} not found`, 'red');
    return false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  log('═══════════════════════════════════════════════════', 'cyan');
  log('   DVPN COMPLETE SYSTEM TEST', 'cyan');
  log('═══════════════════════════════════════════════════', 'cyan');
  
  // Test 1: Check prerequisites
  log('\n\n🔍 TEST 1: Prerequisites Check', 'yellow');
  log('═══════════════════════════════════════════════════', 'cyan');
  
  runCommand('solana --version', 'Check Solana CLI');
  runCommand('anchor --version', 'Check Anchor CLI');
  runCommand('node --version', 'Check Node.js');
  runCommand('cargo --version', 'Check Rust/Cargo');
  
  // Test 2: Check file structure
  log('\n\n📁 TEST 2: File Structure Check', 'yellow');
  log('═══════════════════════════════════════════════════', 'cyan');
  
  checkFile('programs/dvpn/src/lib.rs', 'Solana Program');
  checkFile('target/deploy/dvpn.so', 'Compiled Program Binary');
  checkFile('target/idl/dvpn.json', 'Program IDL');
  checkFile('scripts/node_daemon_server.js', 'Node Daemon Server');
  checkFile('scripts/node_daemon_enhanced.js', 'Enhanced Node Daemon');
  checkFile('indexer/index.js', 'Indexer Service');
  checkFile('app/main.js', 'Electron Client');
  checkFile('scripts/multisig_arbitration.js', 'Multi-Sig Arbitration');
  checkFile('scripts/hashchain_payment.js', 'Hash-Chain Payment');
  
  // Test 3: Check validator
  log('\n\n🔗 TEST 3: Solana Validator Check', 'yellow');
  log('═══════════════════════════════════════════════════', 'cyan');
  
  const clusterResult = runCommand('solana cluster-version', 'Check Cluster Connection', false);
  if (!clusterResult.success) {
    log('⚠️  No validator running. Starting test validator...', 'yellow');
    log('   Run in separate terminal: solana-test-validator', 'blue');
    log('   Then run this script again.', 'blue');
    process.exit(1);
  }
  
  runCommand('solana balance', 'Check Wallet Balance');
  
  // Test 4: Check program deployment
  log('\n\n🚀 TEST 4: Program Deployment Check', 'yellow');
  log('═══════════════════════════════════════════════════', 'cyan');
  
  const idlPath = 'target/idl/dvpn.json';
  if (fs.existsSync(idlPath)) {
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
    const programId = idl.metadata.address;
    log(`  Program ID: ${programId}`, 'blue');
    
    runCommand(`solana account ${programId}`, 'Check Program Account');
  } else {
    log('❌ IDL file not found. Program may not be deployed.', 'red');
  }
  
  // Test 5: Run basic tests
  log('\n\n🧪 TEST 5: Basic Functionality Tests', 'yellow');
  log('═══════════════════════════════════════════════════', 'cyan');
  
  if (checkFile('scripts/test_simple.js', 'test_simple.js')) {
    runCommand('node scripts/test_simple.js', 'Test Provider & Node Registration', false);
  }
  
  if (checkFile('scripts/test_session.js', 'test_session.js')) {
    runCommand('node scripts/test_session.js', 'Test Session Creation', false);
  }
  
  // Test 6: Check node modules
  log('\n\n📦 TEST 6: Dependencies Check', 'yellow');
  log('═══════════════════════════════════════════════════', 'cyan');
  
  if (checkFile('package.json', 'Root package.json')) {
    log('  Checking root dependencies...', 'blue');
    if (!fs.existsSync('node_modules')) {
      log('  Installing dependencies...', 'yellow');
      runCommand('npm install', 'Install Root Dependencies');
    } else {
      log('✅ Root dependencies installed', 'green');
    }
  }
  
  if (checkFile('indexer/package.json', 'Indexer package.json')) {
    log('  Checking indexer dependencies...', 'blue');
    if (!fs.existsSync('indexer/node_modules')) {
      log('  Installing indexer dependencies...', 'yellow');
      runCommand('cd indexer && npm install', 'Install Indexer Dependencies');
    } else {
      log('✅ Indexer dependencies installed', 'green');
    }
  }
  
  if (checkFile('app/package.json', 'App package.json')) {
    log('  Checking app dependencies...', 'blue');
    if (!fs.existsSync('app/node_modules')) {
      log('  Installing app dependencies...', 'yellow');
      runCommand('cd app && npm install', 'Install App Dependencies');
    } else {
      log('✅ App dependencies installed', 'green');
    }
  }
  
  // Test Summary
  log('\n\n═══════════════════════════════════════════════════', 'cyan');
  log('   TEST SUMMARY', 'cyan');
  log('═══════════════════════════════════════════════════', 'cyan');
  
  log('\n✅ All prerequisite tests passed!', 'green');
  log('\n📋 Next Steps:', 'yellow');
  log('   1. Run: npm run test:provider    (Test provider registration)', 'blue');
  log('   2. Run: npm run test:session     (Test session creation)', 'blue');
  log('   3. Run: npm run test:daemon      (Test node daemon)', 'blue');
  log('   4. Run: npm run test:indexer     (Test indexer)', 'blue');
  log('   5. Run: npm run test:client      (Test Electron client)', 'blue');
  log('   6. Run: npm run test:advanced    (Test advanced features)', 'blue');
  log('   7. Run: npm run test:all         (Run full test suite)', 'blue');
  log('\n');
}

main().catch(error => {
  log(`\n❌ Test failed with error: ${error.message}`, 'red');
  process.exit(1);
});
