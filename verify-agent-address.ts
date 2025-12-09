// verify-agent-address.ts
import { providers, utils } from 'near-api-js';
import { ethers } from 'ethers';
import * as secp256k1 from 'secp256k1';
import { SHA3 } from 'sha3';
import { keccak256 } from 'js-sha3';

const NEAR_CONTRACT_ID = 'rebalancer-abcdefghij-57.testnet';
const PATH = 'ethereum-1';
const MPC_CONTRACT = 'v1.signer-prod.testnet';

const VAULT_ADDRESS = '0xE168d95f8d1B8EC167A63c8E696076EC8EE95337';

const CHAINS = [
  { name: 'Base Sepolia', rpc: 'https://sepolia.base.org' },
  { name: 'Arbitrum Sepolia', rpc: 'https://sepolia-rollup.arbitrum.io/rpc' },
];

async function deriveAgentAddress(): Promise<string> {
  const provider = new providers.JsonRpcProvider({ url: 'https://rpc.testnet.near.org' });

  const result: any = await provider.query({
    request_type: 'call_function',
    finality: 'final',
    account_id: MPC_CONTRACT,
    method_name: 'public_key',
    args_base64: Buffer.from(JSON.stringify({})).toString('base64'),
  });

  const publicKeyStr = JSON.parse(Buffer.from(result.result).toString());
  const rootPublicKey = publicKeyStr.replace('secp256k1:', '');

  const EPSILON_DERIVATION_PREFIX = 'near-mpc-recovery v0.1.0 epsilon derivation:';
  const derivationString = `${EPSILON_DERIVATION_PREFIX}${NEAR_CONTRACT_ID},${PATH}`;
  
  const sha3 = new SHA3(256);
  sha3.update(derivationString);
  const epsilonHash = Buffer.from(sha3.digest());

  let rootPkBytes = utils.serialize.base_decode(rootPublicKey);
  if (rootPkBytes.length === 64) {
    rootPkBytes = Buffer.concat([Buffer.from([0x04]), Buffer.from(rootPkBytes)]);
  } else if (rootPkBytes.length === 33) {
    rootPkBytes = secp256k1.publicKeyConvert(rootPkBytes, false);
  }

  const epsilonPoint = secp256k1.publicKeyCreate(epsilonHash, false);
  const derivedPkBytes = secp256k1.publicKeyCombine([Buffer.from(rootPkBytes), Buffer.from(epsilonPoint)], false);

  const pkForHashing = derivedPkBytes.slice(1);
  const addressHash = Buffer.from(keccak256.create().update(pkForHashing).digest());
  return '0x' + addressHash.slice(-20).toString('hex');
}

async function checkChain(chain: { name: string; rpc: string }): Promise<void> {
  const provider = new ethers.JsonRpcProvider(chain.rpc);
  
  // First check if contract exists
  const code = await provider.getCode(VAULT_ADDRESS);
  if (code === '0x') {
    console.log(`${chain.name}: ❌ No contract at this address`);
    return;
  }

  // Contract exists, get AI_AGENT
  const abi = ['function AI_AGENT() view returns (address)'];
  const vault = new ethers.Contract(VAULT_ADDRESS, abi, provider);
  
  try {
    const vaultAgent = await vault.AI_AGENT();
    console.log(`${chain.name}: ✅ Contract found`);
    console.log(`  AI_AGENT: ${vaultAgent}`);
    return;
  } catch (e) {
    console.log(`${chain.name}: ⚠️ Contract exists but AI_AGENT() failed`);
  }
}

async function verify() {
  console.log('Deriving agent address from MPC...');
  const derivedAddress = await deriveAgentAddress();
  console.log(`Derived Agent: ${derivedAddress}\n`);

  console.log(`Checking vault ${VAULT_ADDRESS} on chains:\n`);
  
  for (const chain of CHAINS) {
    await checkChain(chain);
  }
}

verify().catch(console.error);