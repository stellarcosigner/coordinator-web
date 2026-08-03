import { Networks } from '@stellar/stellar-sdk';
import type { NetworkName } from './api';

/**
 * The passphrase used to parse and hash transactions on each network. The
 * coordinator-api resolves everything else from the network live; these are
 * only needed for local XDR decoding and for Freighter's network warning.
 */
export const NETWORK_PASSPHRASES: Record<NetworkName, string> = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
};

export function networkPassphrase(network: NetworkName): string {
  return NETWORK_PASSPHRASES[network];
}

/** Public block-explorer URL for a transaction hash on a given network. */
export function blockExplorerTxUrl(network: NetworkName, txHash: string): string {
  return network === 'mainnet'
    ? `https://stellar.expert/explorer/public/tx/${txHash}`
    : `https://stellar.expert/explorer/testnet/tx/${txHash}`;
}
