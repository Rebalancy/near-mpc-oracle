import { ethers } from 'ethers';
import { ChainConfig, ChainBalance, VaultBalance, AggregatedBalances } from '../types';
import { AAVE_POOL_ABI, ERC20_ABI } from '../config/abis';
import { logger } from '../utils/logger';

// Cache for aToken addresses to avoid repeated queries
const aTokenAddressCache: Map<string, string> = new Map();

// Hardcoded aToken addresses as fallback (from AAVE deployments)
const KNOWN_ATOKEN_ADDRESSES: Record<number, Record<string, string>> = {
  // Ethereum Sepolia  
  11155111: {
    '0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0': '0x8A458A9dc9048e005d22849F470891b840296619', // USDT aToken
  },
  // Base Sepolia
  84532: {
    '0x036cbd53842c5426634e7929541ec2318f3dcf7e': '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', // USDC aToken (correct address)
    '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d': '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', // USDC aToken (alternate)
  },
  // Arbitrum Sepolia
  421614: {
    '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d': '0x460b97BD498E1157530AEb3086301d5225b91216', // USDC aToken (Circle)
  },
  // Optimism Sepolia
  11155420: {
    '0x5fd84259d66cd46123540766be93dfe6d43130d7': '0x16dA4541aD1807f4443d92D26044C1147406EB80', // USDC aToken (Circle)
  },
};

/**
 * Get aToken address for a given USDC address on a chain
 */
export async function getATokenAddress(
  chainConfig: ChainConfig,
  usdcAddress: string
): Promise<string> {
  const cacheKey = `${chainConfig.chainId}-${usdcAddress}`;
  
  // Check cache first
  if (aTokenAddressCache.has(cacheKey)) {
    return aTokenAddressCache.get(cacheKey)!;
  }

  // Try to get from AAVE pool first
  try {
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const aavePool = new ethers.Contract(
      chainConfig.aavePoolAddress,
      AAVE_POOL_ABI,
      provider
    );

    const reserveData = await aavePool.getReserveData(usdcAddress);
    const aTokenAddress = reserveData.aTokenAddress;

    // Cache the result
    aTokenAddressCache.set(cacheKey, aTokenAddress);

    logger.debug(`aToken address for ${chainConfig.name}: ${aTokenAddress}`);
    return aTokenAddress;
  } catch (error) {
    // Fallback to hardcoded addresses
    logger.warn(`Failed to query AAVE pool on ${chainConfig.name}, using hardcoded aToken address`);
    
    const chainAddresses = KNOWN_ATOKEN_ADDRESSES[chainConfig.chainId];
    if (chainAddresses && chainAddresses[usdcAddress.toLowerCase()]) {
      const aTokenAddress = chainAddresses[usdcAddress.toLowerCase()];
      logger.info(`Using hardcoded aToken address for ${chainConfig.name}: ${aTokenAddress}`);
      
      // Cache it
      aTokenAddressCache.set(cacheKey, aTokenAddress);
      return aTokenAddress;
    }

    logger.error(`No aToken address available for ${chainConfig.name} / ${usdcAddress}`);
    throw new Error(`Failed to get aToken address on ${chainConfig.name}: ${error}`);
  }
}

/**
 * Fetch aToken balance for an address on a specific chain
 */
export async function fetchATokenBalance(
  chainConfig: ChainConfig,
  agentAddress: string
): Promise<ChainBalance> {
  try {
    logger.debug(`Fetching aToken balance on ${chainConfig.name} for ${agentAddress}`);

    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    
    // Get aToken address
    const aTokenAddress = await getATokenAddress(chainConfig, chainConfig.usdcAddress);
    
    // Query balance
    const aToken = new ethers.Contract(aTokenAddress, ERC20_ABI, provider);
    let balance: bigint;
    try {
      balance = await aToken.balanceOf(agentAddress);
    } catch (balanceError: any) {
      // If contract call fails with BAD_DATA, the address likely has 0 balance or contract doesn't exist
      if (balanceError.code === 'BAD_DATA') {
        logger.warn(`Contract call returned empty data on ${chainConfig.name}, assuming 0 balance`);
        balance = 0n;
      } else {
        throw balanceError;
      }
    }
    
    const blockNumber = await provider.getBlockNumber();

    const result: ChainBalance = {
      chainId: chainConfig.chainId,
      chainName: chainConfig.name,
      aTokenBalance: balance.toString(),
      aTokenAddress,
      blockNumber,
      timestamp: Math.floor(Date.now() / 1000),
    };

    logger.info(
      `aToken balance on ${chainConfig.name}: ${ethers.formatUnits(balance, 6)} aTokens (address: ${agentAddress})`
    );

    return result;
  } catch (error) {
    logger.error(`Failed to fetch aToken balance on ${chainConfig.name}:`, error);
    throw new Error(`Failed to fetch aToken balance on ${chainConfig.name}: ${error}`);
  }
}

/**
 * Fetch USDC balance for a vault on a specific chain
 */
export async function fetchVaultUSDCBalance(
  chainConfig: ChainConfig,
  vaultAddress: string
): Promise<string> {
  try {
    logger.debug(`Fetching USDC balance for vault ${vaultAddress} on ${chainConfig.name}`);

    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const usdc = new ethers.Contract(chainConfig.usdcAddress, ERC20_ABI, provider);
    let balance: bigint;
    try {
      balance = await usdc.balanceOf(vaultAddress);
    } catch (balanceError: any) {
      if (balanceError.code === 'BAD_DATA') {
        logger.warn(`USDC contract call returned empty data on ${chainConfig.name}, assuming 0 balance`);
        balance = 0n;
      } else {
        throw balanceError;
      }
    }

    logger.info(
      `USDC balance for vault on ${chainConfig.name}: ${ethers.formatUnits(balance, 6)} USDC`
    );

    return balance.toString();
  } catch (error) {
    logger.error(`Failed to fetch USDC balance on ${chainConfig.name}:`, error);
    throw new Error(`Failed to fetch USDC balance on ${chainConfig.name}: ${error}`);
  }
}

/**
 * Fetch aToken balance for a vault on a specific chain
 */
export async function fetchVaultATokenBalance(
  chainConfig: ChainConfig,
  vaultAddress: string
): Promise<string> {
  try {
    logger.debug(`Fetching aToken balance for vault ${vaultAddress} on ${chainConfig.name}`);

    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    
    // Get aToken address
    const aTokenAddress = await getATokenAddress(chainConfig, chainConfig.usdcAddress);
    
    // Query balance
    const aToken = new ethers.Contract(aTokenAddress, ERC20_ABI, provider);
    let balance: bigint;
    try {
      balance = await aToken.balanceOf(vaultAddress);
    } catch (balanceError: any) {
      if (balanceError.code === 'BAD_DATA') {
        logger.warn(`aToken contract call returned empty data on ${chainConfig.name}, assuming 0 balance`);
        balance = 0n;
      } else {
        throw balanceError;
      }
    }

    logger.info(
      `aToken balance for vault on ${chainConfig.name}: ${ethers.formatUnits(balance, 6)} aTokens`
    );

    return balance.toString();
  } catch (error) {
    logger.error(`Failed to fetch vault aToken balance on ${chainConfig.name}:`, error);
    throw new Error(`Failed to fetch vault aToken balance on ${chainConfig.name}: ${error}`);
  }
}

/**
 * Fetch complete vault balance using ERC4626 totalAssets()
 * This is the correct way to get vault value since USDC is invested in AAVE as aTokens
 */
export async function fetchVaultBalance(
  chainConfig: ChainConfig,
  vaultAddress: string
): Promise<VaultBalance> {
  try {
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const blockNumber = await provider.getBlockNumber();

    // ERC4626 vault - use totalAssets() to get the real value
    // The vault invests USDC into AAVE, so USDC.balanceOf(vault) would be 0
    // totalAssets() returns the total value of all assets managed by the vault
    const VAULT_ABI = [
      'function totalAssets() view returns (uint256)',
    ];
    
    const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);
    let totalAssets: bigint;
    
    try {
      totalAssets = await vault.totalAssets();
      logger.info(`Vault totalAssets on ${chainConfig.name}: ${ethers.formatUnits(totalAssets, 6)} USDC`);
    } catch (error: any) {
      logger.warn(`Failed to call totalAssets on ${chainConfig.name}, falling back to token balances`);
      // Fallback to old method if vault doesn't support totalAssets
      const [usdcBalance, aTokenBalance] = await Promise.all([
        fetchVaultUSDCBalance(chainConfig, vaultAddress),
        fetchVaultATokenBalance(chainConfig, vaultAddress),
      ]);
      return {
        chainId: chainConfig.chainId,
        chainName: chainConfig.name,
        vaultAddress,
        usdcBalance,
        aTokenBalance,
        blockNumber,
        timestamp: Math.floor(Date.now() / 1000),
      };
    }

    // For ERC4626 vaults, totalAssets IS the total value
    // We put it in aTokenBalance since that's what represents invested assets
    return {
      chainId: chainConfig.chainId,
      chainName: chainConfig.name,
      vaultAddress,
      usdcBalance: '0', // USDC is invested, not sitting idle
      aTokenBalance: totalAssets.toString(), // Total vault value
      blockNumber,
      timestamp: Math.floor(Date.now() / 1000),
    };
  } catch (error) {
    logger.error(`Failed to fetch vault balance on ${chainConfig.name}:`, error);
    throw new Error(`Failed to fetch vault balance on ${chainConfig.name}: ${error}`);
  }
}

/**
 * Fetch balances across all chains for a given agent address
 */
export async function fetchChainBalances(agentAddress: string): Promise<ChainBalance[]> {
  // Import dynamically to avoid circular dependency
  const { getAllChains } = await import('../config/chains');
  const chains = getAllChains();
  
  logger.info(`Fetching balances across ${chains.length} chains for agent ${agentAddress}`);

  const balances = await Promise.all(
    chains.map(async (chain) => {
      try {
        // fetchATokenBalance returns full ChainBalance
        return await fetchATokenBalance(chain, agentAddress);
      } catch (error) {
        logger.error(`Failed to fetch balance on ${chain.name}:`, error);
        throw error;
      }
    })
  );

  return balances;
}

/**
 * Fetch balances across all vaults
 */
export async function fetchVaultBalances(): Promise<VaultBalance[]> {
  // Import dynamically to avoid circular dependency
  const { getAllVaults, getChainById } = await import('../config/chains');
  const vaults = getAllVaults();
  
  logger.info(`Fetching balances across ${vaults.length} vaults`);

  const balances = await Promise.all(
    vaults.map(async ({ chainId, vaultAddress }) => {
      const chain = getChainById(chainId);
      if (!chain) {
        throw new Error(`Chain ${chainId} not found`);
      }

      try {
        return await fetchVaultBalance(chain, vaultAddress);
      } catch (error) {
        logger.error(`Failed to fetch vault balance on ${chain.name}:`, error);
        throw error;
      }
    })
  );

  return balances;
}

/**
 * Aggregate all balances across chains
 */
export function aggregateBalances(
  chainBalances: ChainBalance[],
  vaultBalances: VaultBalance[]
): Omit<AggregatedBalances, 'agentAddress'> {
  // Sum all vault aToken balances (invested in AAVE)
  const totalVaultATokens = vaultBalances.reduce((sum, vault) => {
    return sum + BigInt(vault.aTokenBalance);
  }, BigInt(0));

  // Sum all vault USDC balances (idle in vaults)
  const totalVaultUSDC = vaultBalances.reduce((sum, vault) => {
    return sum + BigInt(vault.usdcBalance);
  }, BigInt(0));

  // Total aTokens across all chains (only from vaults, since agent doesn't hold aTokens directly)
  const totalATokens = totalVaultATokens;

  // Total value = all aTokens + vault USDC
  const totalValue = totalATokens + totalVaultUSDC;

  logger.info('Balance Aggregation:');
  logger.info(`   Vault aTokens: ${ethers.formatUnits(totalVaultATokens, 6)}`);
  logger.info(`   Vault USDC: ${ethers.formatUnits(totalVaultUSDC, 6)}`);
  logger.info(`   Total aTokens: ${ethers.formatUnits(totalATokens, 6)}`);
  logger.info(`   Total Value: ${ethers.formatUnits(totalValue, 6)}`);

  return {
    totalATokens: totalATokens.toString(),
    totalUSDC: totalVaultUSDC.toString(),
    totalValue: totalValue.toString(),
    chainBalances,
    vaultBalances,
    timestamp: Math.floor(Date.now() / 1000),
  };
}

