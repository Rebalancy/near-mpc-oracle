import { connect, keyStores, KeyPair } from 'near-api-js';
import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import { CrossChainBalanceSnapshot } from './nearMpcService';

export interface MpcSignatureResponse {
  signature: string;
  agentAddress: string;
}

/**
 * NEAR Contract Service - Calls rebalancer-abcdefghij-57.testnet for signing
 * Uses build_and_sign_crosschain_balance_snapshot_tx which computes EIP-712 digest on-chain
 */
export class NearContractService {
  private nearContractId: string;
  private nearAccountId: string;
  private agentAddress: string = '0x20f2747bbc52453ac0774b5b2fe0e28dc6637f30';
  private keyStore: keyStores.InMemoryKeyStore | null = null;
  private isInitialized: boolean = false;

  constructor() {
    // Load NEAR credentials from environment
    if (!process.env.NEAR_ACCOUNT_ID || !process.env.NEAR_PRIVATE_KEY) {
      throw new Error('NEAR credentials required: Set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY in .env');
    }

    if (!process.env.NEAR_CONTRACT_ID) {
      throw new Error('NEAR_CONTRACT_ID required in .env');
    }

    this.nearAccountId = process.env.NEAR_ACCOUNT_ID;
    this.nearContractId = process.env.NEAR_CONTRACT_ID;

    logger.info(`NEAR contract configured: ${this.nearContractId}`);
    logger.info(`Agent address: ${this.agentAddress}`);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Set up key store
    this.keyStore = new keyStores.InMemoryKeyStore();
    const keyPair = KeyPair.fromString(process.env.NEAR_PRIVATE_KEY!);
    await this.keyStore.setKey('testnet', this.nearAccountId, keyPair);

    this.isInitialized = true;
    logger.info(`NEAR Contract Service ready. Agent: ${this.agentAddress}`);
  }

  async getAgentAddress(): Promise<string> {
    return this.agentAddress;
  }

  /**
   * Sign a cross-chain balance snapshot using the NEAR contract
   * The contract computes the EIP-712 digest on-chain for security
   */
  async signBalanceSnapshot(
    snapshot: CrossChainBalanceSnapshot,
    vaultAddress: string,
    chainId: number
  ): Promise<MpcSignatureResponse> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      logger.info('Calling NEAR contract to sign balance snapshot...');
      logger.info(`  Vault: ${vaultAddress}`);
      logger.info(`  Chain ID: ${chainId}`);
      logger.info(`  Balance: ${snapshot.balance}`);
      logger.info(`  Nonce: ${snapshot.nonce}`);
      logger.info(`  Deadline: ${snapshot.deadline}`);
      logger.info(`  Assets: ${snapshot.assets}`);
      logger.info(`  Receiver: ${snapshot.receiver}`);

      // Build args in SnapshotDigestArgs format
      // The contract computes the EIP-712 digest on-chain
      // Note: Rust u128/u64 expect JSON numbers, String fields expect JSON strings
      const args = {
        args: {
          balance: parseInt(snapshot.balance),      // u128 - JSON number
          chain_id: chainId,                        // u64 - JSON number
          verifying_contract: vaultAddress,         // String
          nonce: parseInt(snapshot.nonce),          // u64 - JSON number
          deadline: parseInt(snapshot.deadline),    // u64 - JSON number
          assets: snapshot.assets,                  // String (U256 as string)
          receiver: snapshot.receiver,              // String (address)
        },
        callback_gas_tgas: 50,                      // u64 - JSON number
      };

      logger.info(`Calling ${this.nearContractId}.build_and_sign_crosschain_balance_snapshot_tx...`);

      // Connect to NEAR
      const near = await connect({
        networkId: 'testnet',
        keyStore: this.keyStore!,
        nodeUrl: process.env.NEAR_RPC_URL || 'https://rpc.testnet.near.org',
      });

      const account = await near.account(this.nearAccountId);

      // Call the contract
      const result: any = await account.functionCall({
        contractId: this.nearContractId,
        methodName: 'build_and_sign_crosschain_balance_snapshot_tx',
        args,
        gas: '300000000000000' as any,
        attachedDeposit: '0' as any,
      });

      logger.info('NEAR transaction completed');

      // The result should contain the return value in status.SuccessValue
      if (!result.status?.SuccessValue) {
        logger.error('Transaction result:', JSON.stringify(result, null, 2));
        throw new Error('No SuccessValue in NEAR transaction result');
      }

      // Parse the signature from the return value
      // The callback returns Vec<u8> with 65 bytes: [r(32) + s(32) + v(1)]
      // NEAR RPC JSON-serializes Vec<u8> as a string like "[10,125,117,...]"
      const returnValue = Buffer.from(result.status.SuccessValue, 'base64');
      const returnString = returnValue.toString('utf8');
      logger.info(`Callback returned string: ${returnString.slice(0, 50)}...`);

      // Parse the JSON array of bytes
      const signatureArray = JSON.parse(returnString);
      if (!Array.isArray(signatureArray)) {
        throw new Error('Expected signature to be an array of bytes');
      }

      const signatureBytes = Buffer.from(signatureArray);

      if (signatureBytes.length !== 65) {
        throw new Error(`Invalid signature length: ${signatureBytes.length}, expected 65`);
      }

      // Extract r, s, v
      // The contract returns v as recovery_id (0 or 1), we need to convert to Ethereum format (27 or 28)
      const r = signatureBytes.subarray(0, 32);
      const s = signatureBytes.subarray(32, 64);
      const recoveryId = signatureBytes[64];
      const v = recoveryId + 27; // Convert recovery_id to Ethereum v

      logger.info(`Signature components:`);
      logger.info(`  r: ${ethers.hexlify(r)}`);
      logger.info(`  s: ${ethers.hexlify(s)}`);
      logger.info(`  recovery_id: ${recoveryId} -> v: ${v}`);

      // Concatenate into Ethereum signature format with corrected v
      const signature65 = ethers.hexlify(ethers.concat([r, s, new Uint8Array([v])]));
      logger.info(`Final signature (65 bytes): ${signature65}`);

      // Compute the digest locally for verification purposes
      const domain = {
        name: 'AaveVault',
        version: '1',
        chainId: chainId,
        verifyingContract: vaultAddress,
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

      const digest = ethers.TypedDataEncoder.hash(domain, types, {
        balance: snapshot.balance,
        nonce: snapshot.nonce,
        deadline: snapshot.deadline,
        assets: snapshot.assets,
        receiver: snapshot.receiver,
      });

      // Verify the signature
      const recoveredAddress = ethers.recoverAddress(digest, signature65);
      logger.info(`Recovered signer address: ${recoveredAddress}`);
      logger.info(`Expected agent address: ${this.agentAddress}`);

      if (recoveredAddress.toLowerCase() !== this.agentAddress.toLowerCase()) {
        throw new Error(
          `Signature verification failed! Recovered ${recoveredAddress}, expected ${this.agentAddress}`
        );
      }

      logger.info('✅ Signature verified successfully!');

      return {
        signature: signature65,
        agentAddress: this.agentAddress,
      };
    } catch (error) {
      logger.error('Failed to sign balance snapshot with NEAR contract:', error);
      throw error;
    }
  }
}

// Singleton instance
let instance: NearContractService | null = null;

export function getNearContract(): NearContractService {
  if (!instance) {
    instance = new NearContractService();
  }
  return instance;
}
