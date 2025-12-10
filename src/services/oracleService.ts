import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import { getNearContract } from './nearContractService';
import { CrossChainBalanceSnapshot } from './nearMpcService';
import { fetchChainBalances, fetchVaultBalances, aggregateBalances } from './balanceFetcher';
import { getVaultNonce, getCrossChainInvestedAssets } from './vaultService';
import { getChainById } from '../config/chains';

export interface SignedBalanceSnapshot {
  balance: string;
  nonce: string;
  deadline: string;
  assets: string;
  receiver: string;
  signature: string;
  agentAddress: string;
}

export interface PoolValueResponse {
  totalATokens: string;
  totalUSDC: string;
  totalPoolValue: string;
  breakdown: {
    chainId: number;
    chainName: string;
    aTokens: string;
    usdc: string;
  }[];
  timestamp: number;
}

/**
 * Oracle Service - Coordinates balance fetching and NEAR MPC signing
 */
export class OracleService {
  private nearMpc = getNearContract();

  /**
   * Generate a signed balance snapshot for deposit
   * 
   * This is the critical function for depositWithExtraInfoViaSignature()
   */
  async generateBalanceSnapshot(
    assets: string,
    receiver: string,
    vaultChainId: number
  ): Promise<SignedBalanceSnapshot> {
    try {
      logger.info(`Generating balance snapshot for vault on chain ${vaultChainId}`);
      logger.info(`   Assets: ${assets}, Receiver: ${receiver}`);

      // 1. Get agent address
      const agentAddress = await this.nearMpc.getAgentAddress();
      logger.info(`Agent address: ${agentAddress}`);
      
      // 2. Fetch all chain balances (aTokens)
      logger.info('Step 1: Fetching aToken balances across all chains...');
      const chainBalances = await fetchChainBalances(agentAddress);
      
      // 3. Fetch all vault balances (USDC in vaults)
      logger.info('Step 2: Fetching USDC in all vaults...');
      const vaultBalances = await fetchVaultBalances();

      // 4. Aggregate total aTokens (for logging/debugging)
      const aggregated = aggregateBalances(chainBalances, vaultBalances);
      logger.info(`Total aTokens across chains: ${aggregated.totalATokens}`);

      // 5. Get vault config and cross-chain invested assets
      logger.info(`Step 3: Getting vault state on chain ${vaultChainId}...`);
      const vaultChain = getChainById(vaultChainId);
      if (!vaultChain || !vaultChain.vaultAddress) {
        throw new Error(`No vault configured for chain ${vaultChainId}`);
      }

      // Get the vault's actual crossChainInvestedAssets (this is what matters for deposit routing)
      const crossChainBalance = await getCrossChainInvestedAssets(
        vaultChain.vaultAddress,
        vaultChain.rpcUrl,
        vaultChainId
      );
      logger.info(`Vault crossChainInvestedAssets: ${crossChainBalance.toString()}`);

      // 7. Get nonce from vault
      const nonce = await getVaultNonce(vaultChain.vaultAddress, vaultChain.rpcUrl, vaultChainId);
      logger.info(`Vault nonce: ${nonce}`);

      // 8. Calculate deadline (5 minutes from now)
      const deadline = Math.floor(Date.now() / 1000) + 300;
      logger.info(`Deadline: ${deadline} (5 minutes from now)`);

      // 8. Create snapshot with vault's cross-chain balance
      const snapshot: CrossChainBalanceSnapshot = {
        balance: crossChainBalance.toString(), // Vault's crossChainInvestedAssets
        nonce: nonce.toString(),
        deadline: deadline.toString(),
        assets,
        receiver,
      };

      logger.info('Snapshot created:', snapshot);

      // 9. Sign with NEAR MPC
      logger.info('Step 4: Calling NEAR MPC to sign...');
      const { signature } = await this.nearMpc.signBalanceSnapshot(
        snapshot,
        vaultChain.vaultAddress,
        vaultChain.chainId
      );

      logger.info('Signature received from NEAR MPC');
      logger.info(`   Agent Address: ${agentAddress}`);

      return {
        ...snapshot,
        signature,
        agentAddress,
      };
    } catch (error) {
      logger.error('Failed to generate balance snapshot:', error);
      throw error;
    }
  }

  /**
   * Get total pool value (for frontend charts)
   * 
   * This aggregates aTokens + USDC across all chains and vaults
   */
  async getPoolValue(vaultChainId?: number): Promise<PoolValueResponse> {
    try {
      logger.info('Calculating total pool value...');

      // Get agent address
      const agentAddress = await this.nearMpc.getAgentAddress();

      // Fetch all balances
      const chainBalances = await fetchChainBalances(agentAddress);
      const vaultBalances = await fetchVaultBalances();

      // Aggregate
      const aggregated = aggregateBalances(chainBalances, vaultBalances);

      // Build breakdown from vaults (vaults are on specific chains)
      const breakdown = vaultBalances.map(vb => ({
        chainId: vb.chainId,
        chainName: vb.chainName,
        aTokens: vb.aTokenBalance,
        usdc: vb.usdcBalance,
      }));

      const response: PoolValueResponse = {
        totalATokens: aggregated.totalATokens,
        totalUSDC: aggregated.totalUSDC,
        totalPoolValue: aggregated.totalValue,
        breakdown,
        timestamp: Math.floor(Date.now() / 1000),
      };

      logger.info(`Total Pool Value: $${ethers.formatUnits(response.totalPoolValue, 6)}`);
      logger.info(`   aTokens: $${ethers.formatUnits(response.totalATokens, 6)}`);
      logger.info(`   USDC: $${ethers.formatUnits(response.totalUSDC, 6)}`);

      return response;
    } catch (error) {
      logger.error('Failed to calculate pool value:', error);
      throw error;
    }
  }

  /**
   * Get agent address (for verification)
   */
  async getAgentAddress(): Promise<string> {
    return this.nearMpc.getAgentAddress();
  }
}

