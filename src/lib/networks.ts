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

/**
 * Human label for a network passphrase, used in the wallet-network mismatch
 * warning. Falls back to a generic label for a passphrase this app doesn't
 * otherwise recognize (e.g. Futurenet, a custom standalone network) rather
 * than guessing a specific name.
 */
export function networkLabelForPassphrase(passphrase: string): string {
  if (passphrase === NETWORK_PASSPHRASES.testnet) return 'Testnet';
  if (passphrase === NETWORK_PASSPHRASES.mainnet) return 'Mainnet';
  return 'a different network';
}

export type NetworkMismatchCheck =
  | { kind: 'match' }
  | { kind: 'unknown' }
  | { kind: 'mismatch'; walletNetworkLabel: string };

/**
 * Compares the wallet's currently reported network passphrase against a
 * transaction's expected network. The transaction's network is authoritative.
 *
 * `walletPassphrase` is `null` whenever the wallet's network could not be
 * determined (not installed, access denied, or any other lookup failure) —
 * that case always reports 'unknown', never a fabricated 'match' or
 * 'mismatch', so a signer is neither falsely reassured nor falsely warned.
 */
export function checkWalletNetwork(
  walletPassphrase: string | null,
  transactionNetwork: NetworkName,
): NetworkMismatchCheck {
  if (!walletPassphrase) return { kind: 'unknown' };
  if (walletPassphrase === networkPassphrase(transactionNetwork)) return { kind: 'match' };
  return { kind: 'mismatch', walletNetworkLabel: networkLabelForPassphrase(walletPassphrase) };
}

/** Public block-explorer URL for a transaction hash on a given network. */
export function blockExplorerTxUrl(network: NetworkName, txHash: string): string {
  return network === 'mainnet'
    ? `https://stellar.expert/explorer/public/tx/${txHash}`
    : `https://stellar.expert/explorer/testnet/tx/${txHash}`;
}
