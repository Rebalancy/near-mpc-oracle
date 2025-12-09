/**
 * Test script for the new build_and_sign_crosschain_balance_snapshot_tx integration
 * 
 * Run with: npx ts-node test-contract-integration.ts
 */

import dotenv from 'dotenv';
// Load phala.env for testing
dotenv.config({ path: './phala.env' });

import { NearContractService } from './src/services/nearContractService';
import { ethers } from 'ethers';

const VAULT_ADDRESS = '0xE168d95f8d1B8EC167A63c8E696076EC8EE95337';
const CHAIN_ID = 421614; // Arbitrum Sepolia

async function testContractIntegration() {
  console.log('=== Testing NEAR Contract Integration ===\n');
  
  console.log('Configuration:');
  console.log(`  NEAR Account: ${process.env.NEAR_ACCOUNT_ID}`);
  console.log(`  NEAR Contract: ${process.env.NEAR_CONTRACT_ID}`);
  console.log(`  Vault Address: ${VAULT_ADDRESS}`);
  console.log(`  Chain ID: ${CHAIN_ID}`);
  console.log('');

  // Create test snapshot data
  // Use ethers.getAddress to ensure proper checksum
  const testReceiver = ethers.getAddress('0x742d35cc6634c0532925a3b844bc454e7595f5de');
  const testSnapshot = {
    balance: '1000000', // 1 USDC worth of aTokens (6 decimals)
    nonce: '0',
    deadline: Math.floor(Date.now() / 1000 + 3600).toString(), // 1 hour from now
    assets: '500000', // 0.5 USDC deposit
    receiver: testReceiver,
  };

  console.log('Test Snapshot:');
  console.log(`  Balance: ${testSnapshot.balance}`);
  console.log(`  Nonce: ${testSnapshot.nonce}`);
  console.log(`  Deadline: ${testSnapshot.deadline}`);
  console.log(`  Assets: ${testSnapshot.assets}`);
  console.log(`  Receiver: ${testSnapshot.receiver}`);
  console.log('');

  try {
    // Create and initialize the contract service
    console.log('Initializing NearContractService...');
    const contractService = new NearContractService();
    await contractService.initialize();
    
    const agentAddress = await contractService.getAgentAddress();
    console.log(`Agent Address: ${agentAddress}\n`);

    // Sign the balance snapshot
    console.log('Calling build_and_sign_crosschain_balance_snapshot_tx...');
    console.log('(This will call the NEAR contract which calls the MPC - may take 10-30 seconds)\n');
    
    const startTime = Date.now();
    const result = await contractService.signBalanceSnapshot(
      testSnapshot,
      VAULT_ADDRESS,
      CHAIN_ID
    );
    const elapsed = (Date.now() - startTime) / 1000;

    console.log('\n=== SUCCESS ===');
    console.log(`Time elapsed: ${elapsed.toFixed(2)}s`);
    console.log(`Signature: ${result.signature}`);
    console.log(`Agent Address: ${result.agentAddress}`);

    // Verify the signature locally
    console.log('\n=== Local Verification ===');
    const domain = {
      name: 'AaveVault',
      version: '1',
      chainId: CHAIN_ID,
      verifyingContract: VAULT_ADDRESS,
    };

    const types = {
      CrossChainBalanceSnapshot: [
        { name: 'balance', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
        { name: 'assets', type: 'uint256' },
        { name: 'receiver', type: 'address' },
      ],
    };

    const digest = ethers.TypedDataEncoder.hash(domain, types, testSnapshot);
    console.log(`EIP-712 Digest: ${digest}`);

    const recoveredAddress = ethers.recoverAddress(digest, result.signature);
    console.log(`Recovered Address: ${recoveredAddress}`);
    console.log(`Expected Address: ${result.agentAddress}`);

    if (recoveredAddress.toLowerCase() === result.agentAddress.toLowerCase()) {
      console.log('\n✅ Signature verification PASSED!');
      console.log('The integration is working correctly.');
    } else {
      console.log('\n❌ Signature verification FAILED!');
      console.log('The recovered address does not match the expected agent address.');
    }

  } catch (error) {
    console.error('\n❌ Test FAILED with error:');
    console.error(error);
    process.exit(1);
  }
}

testContractIntegration();

