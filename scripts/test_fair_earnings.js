/**
 * Fair Earnings Distribution Test Script
 * 
 * This script demonstrates how the fair earnings system works with multiple node providers.
 * It simulates:
 * - 100 node providers with different bandwidth and quality
 * - User sessions using different nodes
 * - Fair earnings distribution based on weighted formula
 */

const { Connection, PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { AnchorProvider, Program, BN, web3 } = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');

// Configuration
const PROGRAM_ID = 'EYDWvx95gq6GhniDGHMHbn6DsigFhcWGHvHgbbxzuqQq';
const RPC_URL = 'https://api.devnet.solana.com';

// Weights for fair earnings (must match smart contract)
const USAGE_WEIGHT = 40;      // 40% weight for usage time
const BANDWIDTH_WEIGHT = 30;  // 30% weight for bandwidth
const QUALITY_WEIGHT = 30;    // 30% weight for quality score

// Simulate node providers with different characteristics
function generateSimulatedNodes(count) {
  const nodes = [];
  
  for (let i = 0; i < count; i++) {
    // Random bandwidth between 10-100 Mbps
    const bandwidthMbps = Math.floor(Math.random() * 91) + 10;
    
    // Random quality score 1-5 (average rating)
    const qualityScore = Math.floor(Math.random() * 5) + 1;
    
    // Random usage time (seconds) - some nodes used more than others
    // Power law distribution - few nodes have most traffic
    const usageSeconds = Math.floor(Math.pow(Math.random(), 0.5) * 100000);
    
    nodes.push({
      id: i + 1,
      name: `Node-${i + 1}`,
      bandwidthMbps,
      qualityScore,
      usageSeconds,
      region: ['US-East', 'US-West', 'EU-Central', 'Asia-Pacific', 'South-America'][i % 5]
    });
  }
  
  return nodes;
}

// Calculate fair earnings distribution
function calculateFairEarnings(nodes, totalPoolLamports) {
  // Platform takes 20%
  const platformFee = totalPoolLamports * 0.20;
  const providerPool = totalPoolLamports * 0.80;
  
  // Calculate totals for normalization
  const totalUsage = nodes.reduce((sum, n) => sum + n.usageSeconds, 0);
  const maxBandwidth = Math.max(...nodes.map(n => n.bandwidthMbps));
  const maxQuality = 5;
  
  // Calculate weighted scores for each node
  const nodeScores = nodes.map(node => {
    // Normalize each factor to 0-100 scale
    const usageNormalized = totalUsage > 0 ? (node.usageSeconds / totalUsage) * 100 : 0;
    const bandwidthNormalized = (node.bandwidthMbps / maxBandwidth) * 100;
    const qualityNormalized = (node.qualityScore / maxQuality) * 100;
    
    // Calculate weighted score
    const weightedScore = 
      (usageNormalized * USAGE_WEIGHT / 100) +
      (bandwidthNormalized * BANDWIDTH_WEIGHT / 100) +
      (qualityNormalized * QUALITY_WEIGHT / 100);
    
    return {
      ...node,
      usageNormalized,
      bandwidthNormalized,
      qualityNormalized,
      weightedScore
    };
  });
  
  // Calculate total weighted score
  const totalWeightedScore = nodeScores.reduce((sum, n) => sum + n.weightedScore, 0);
  
  // Calculate earnings for each node
  const earnings = nodeScores.map(node => {
    const sharePercent = totalWeightedScore > 0 
      ? (node.weightedScore / totalWeightedScore) * 100 
      : 0;
    const earningsLamports = Math.floor(providerPool * (sharePercent / 100));
    const earningsSOL = earningsLamports / LAMPORTS_PER_SOL;
    
    return {
      ...node,
      sharePercent,
      earningsLamports,
      earningsSOL
    };
  });
  
  // Sort by earnings (highest first)
  earnings.sort((a, b) => b.earningsSOL - a.earningsSOL);
  
  return {
    totalPoolSOL: totalPoolLamports / LAMPORTS_PER_SOL,
    platformFeeSOL: platformFee / LAMPORTS_PER_SOL,
    providerPoolSOL: providerPool / LAMPORTS_PER_SOL,
    earnings
  };
}

// Print results
function printResults(result) {
  
  
  
  
  result.earnings.slice(0, 10).forEach((node, idx) => {
    const usageHours = (node.usageSeconds / 3600).toFixed(1);
      `${(idx + 1).toString().padEnd(6)}` +
      `${node.name.padEnd(12)}` +
      `${node.region.padEnd(14)}` +
      `${node.bandwidthMbps.toString().padEnd(10)}` +
      `${('⭐'.repeat(node.qualityScore)).padEnd(8)}` +
      `${usageHours.padEnd(10)}` +
      `${node.sharePercent.toFixed(2).padEnd(8)}%` +
      `${node.earningsSOL.toFixed(6)} SOL`
    );
  });
  
  result.earnings.slice(-10).forEach((node, idx) => {
    const usageHours = (node.usageSeconds / 3600).toFixed(1);
      `${(result.earnings.length - 9 + idx).toString().padEnd(6)}` +
      `${node.name.padEnd(12)}` +
      `${node.region.padEnd(14)}` +
      `${node.bandwidthMbps.toString().padEnd(10)}` +
      `${('⭐'.repeat(node.qualityScore)).padEnd(8)}` +
      `${usageHours.padEnd(10)}` +
      `${node.sharePercent.toFixed(2).padEnd(8)}%` +
      `${node.earningsSOL.toFixed(6)} SOL`
    );
  });
  
  // Compare high vs low quality nodes
  
  const highQualityNodes = result.earnings.filter(n => n.bandwidthMbps >= 80 && n.qualityScore >= 4);
  const lowQualityNodes = result.earnings.filter(n => n.bandwidthMbps <= 20 && n.qualityScore <= 2);
  
  const avgHighEarnings = highQualityNodes.length > 0 
    ? highQualityNodes.reduce((sum, n) => sum + n.earningsSOL, 0) / highQualityNodes.length 
    : 0;
  const avgLowEarnings = lowQualityNodes.length > 0 
    ? lowQualityNodes.reduce((sum, n) => sum + n.earningsSOL, 0) / lowQualityNodes.length 
    : 0;
  
  
  if (avgLowEarnings > 0) {
    const multiplier = avgHighEarnings / avgLowEarnings;
  }
  
}

// Compare specific scenarios
function compareScenarios() {
  
  // Create two nodes with same usage but different bandwidth
  const testNodes = [
    { id: 1, name: 'Fast-Node', bandwidthMbps: 100, qualityScore: 5, usageSeconds: 36000, region: 'US-East' },
    { id: 2, name: 'Slow-Node', bandwidthMbps: 10, qualityScore: 3, usageSeconds: 36000, region: 'US-West' }
  ];
  
  const result = calculateFairEarnings(testNodes, 1 * LAMPORTS_PER_SOL); // 1 SOL pool
  
  
  result.earnings.forEach(node => {
  });
  
  const fastNode = result.earnings.find(n => n.name === 'Fast-Node');
  const slowNode = result.earnings.find(n => n.name === 'Slow-Node');
  
  if (fastNode && slowNode && slowNode.earningsSOL > 0) {
    const ratio = fastNode.earningsSOL / slowNode.earningsSOL;
  }
}

// Main execution
async function main() {
  
  // Scenario 1: 100 node providers with 10 SOL pool
  const nodes100 = generateSimulatedNodes(100);
  const result100 = calculateFairEarnings(nodes100, 10 * LAMPORTS_PER_SOL);
  printResults(result100);
  
  // Scenario 2: Compare 100mbps vs 10mbps specifically
  compareScenarios();
  
}

main().catch(console.error);
