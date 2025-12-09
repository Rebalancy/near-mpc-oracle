// derive-agent-address.ts
import { providers, utils } from 'near-api-js';
import * as secp256k1 from 'secp256k1';
import { SHA3 } from 'sha3';
import { keccak256 } from 'js-sha3';

const NEAR_CONTRACT_ID = 'rebalancer-abcdefghij-57.testnet';
const PATH = 'ethereum-1';
const MPC_CONTRACT = 'v1.signer-prod.testnet';

async function deriveAgentAddress() {
  const provider = new providers.JsonRpcProvider({ url: 'https://rpc.testnet.near.org' });

  // 1. Get MPC root public key
  const result: any = await provider.query({
    request_type: 'call_function',
    finality: 'final',
    account_id: MPC_CONTRACT,
    method_name: 'public_key',
    args_base64: Buffer.from(JSON.stringify({})).toString('base64'),
  });

  const publicKeyStr = JSON.parse(Buffer.from(result.result).toString());
  const rootPublicKey = publicKeyStr.replace('secp256k1:', '');
  console.log('MPC Root Public Key:', rootPublicKey.substring(0, 20) + '...');

  // 2. Derive epsilon
  const EPSILON_DERIVATION_PREFIX = 'near-mpc-recovery v0.1.0 epsilon derivation:';
  const derivationString = `${EPSILON_DERIVATION_PREFIX}${NEAR_CONTRACT_ID},${PATH}`;
  
  const sha3 = new SHA3(256);
  sha3.update(derivationString);
  const epsilonHash = Buffer.from(sha3.digest());

  // 3. Parse root public key
  let rootPkBytes = utils.serialize.base_decode(rootPublicKey);
  if (rootPkBytes.length === 64) {
    rootPkBytes = Buffer.concat([Buffer.from([0x04]), Buffer.from(rootPkBytes)]);
  } else if (rootPkBytes.length === 33) {
    rootPkBytes = secp256k1.publicKeyConvert(rootPkBytes, false);
  }

  // 4. Derive public key: derived_pk = root_pk + (G * epsilon)
  const epsilonPoint = secp256k1.publicKeyCreate(epsilonHash, false);
  const derivedPkBytes = secp256k1.publicKeyCombine([Buffer.from(rootPkBytes), Buffer.from(epsilonPoint)], false);

  // 5. Convert to EVM address
  const pkForHashing = derivedPkBytes.slice(1);
  const addressHash = Buffer.from(keccak256.create().update(pkForHashing).digest());
  const address = '0x' + addressHash.slice(-20).toString('hex');

  console.log('\n=== Agent EVM Address ===');
  console.log('NEAR Contract:', NEAR_CONTRACT_ID);
  console.log('Path:', PATH);
  console.log('Agent Address:', address);
  
  return address;
}

deriveAgentAddress().catch(console.error);