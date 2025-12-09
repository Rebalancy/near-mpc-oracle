import { ChainConfig } from '../types';

export const SUPPORTED_CHAINS: Record<string, ChainConfig> = {
  ethereumSepolia: {
    chainId: 11155111,
    name: 'Ethereum Sepolia',
    rpcUrl: process.env.ETHEREUM_SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com',
    aavePoolAddress: '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951',
    usdcAddress: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0', // USDT on Sepolia (USDC not available)
  },
  baseSepolia: {
    chainId: 84532,
    name: 'Base Sepolia',
    rpcUrl: process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org',
    aavePoolAddress: '0x6a9d64f93db660eacb2b6e9424792c630cda87d8',
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Circle's official USDC on Base Sepolia testnet
    vaultAddress: process.env.BASE_VAULT_ADDRESS || '0x773035EABdA16B5416B26E12156483C6B6F56451', // AaveVault (CORRECT AI_AGENT)
  },
  arbitrumSepolia: {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc',
    aavePoolAddress: '0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff',
    usdcAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    vaultAddress: process.env.ARBITRUM_VAULT_ADDRESS || '0xE168d95f8d1B8EC167A63c8E696076EC8EE95337', // Vault with agent 0x20f2747bbc52453ac0774b5b2fe0e28dc6637f30
  },
  optimismSepolia: {
    chainId: 11155420,
    name: 'Optimism Sepolia',
    rpcUrl: process.env.OPTIMISM_SEPOLIA_RPC || 'https://sepolia.optimism.io',
    aavePoolAddress: '0xb50201558B00496A145fE76f7424749556E326D8',
    usdcAddress: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
  },
};

// Get all chains as an array
export function getAllChains(): ChainConfig[] {
  return Object.values(SUPPORTED_CHAINS);
}

// Get chain by ID
export function getChainById(chainId: number): ChainConfig | undefined {
  return Object.values(SUPPORTED_CHAINS).find(chain => chain.chainId === chainId);
}

// Get all vaults
export function getAllVaults(): Array<{ chainId: number; vaultAddress: string }> {
  return Object.values(SUPPORTED_CHAINS)
    .filter(chain => chain.vaultAddress)
    .map(chain => ({
      chainId: chain.chainId,
      vaultAddress: chain.vaultAddress!,
    }));
}


