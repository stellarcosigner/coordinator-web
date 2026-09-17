/**
 * Covers the wallet-network mismatch decision logic (coordinator-web issue
 * #3): the transaction's network is authoritative, and the comparison must
 * distinguish a known match, a known mismatch, and an undetermined wallet
 * network without ever fabricating a match or a mismatch for the last case.
 *
 * This is a pure-logic test of the decision function at the existing
 * networks.ts abstraction boundary, not a rendered-component test — the
 * project's vitest config runs in a Node environment with no jsdom/React
 * Testing Library, so SignRequest.tsx's UI wiring around this logic is not
 * directly exercised here (see PR description for how this was verified by
 * inspection instead).
 */
import { describe, expect, it } from 'vitest';
import { Networks } from '@stellar/stellar-sdk';
import {
  checkWalletNetwork,
  networkLabelForPassphrase,
  networkPassphrase,
} from '../src/lib/networks';

describe('checkWalletNetwork', () => {
  it('reports a match when the wallet is on the transaction network', () => {
    expect(checkWalletNetwork(Networks.TESTNET, 'testnet')).toEqual({ kind: 'match' });
    expect(checkWalletNetwork(Networks.PUBLIC, 'mainnet')).toEqual({ kind: 'match' });
  });

  it('reports a labeled mismatch when the wallet is on a different known network', () => {
    expect(checkWalletNetwork(Networks.PUBLIC, 'testnet')).toEqual({
      kind: 'mismatch',
      walletNetworkLabel: 'Mainnet',
    });
    expect(checkWalletNetwork(Networks.TESTNET, 'mainnet')).toEqual({
      kind: 'mismatch',
      walletNetworkLabel: 'Testnet',
    });
  });

  it('reports a mismatch (never a false match) for a network this app does not otherwise recognize', () => {
    const result = checkWalletNetwork(Networks.FUTURENET, 'testnet');
    expect(result).toEqual({ kind: 'mismatch', walletNetworkLabel: 'a different network' });
  });

  it('reports "unknown" — never a fabricated match or mismatch — when the wallet network could not be determined', () => {
    expect(checkWalletNetwork(null, 'testnet')).toEqual({ kind: 'unknown' });
    expect(checkWalletNetwork('', 'mainnet')).toEqual({ kind: 'unknown' });
  });
});

describe('networkLabelForPassphrase', () => {
  it('labels the two networks this app actually supports', () => {
    expect(networkLabelForPassphrase(networkPassphrase('testnet'))).toBe('Testnet');
    expect(networkLabelForPassphrase(networkPassphrase('mainnet'))).toBe('Mainnet');
  });

  it('falls back to a generic label instead of guessing an unrecognized network', () => {
    expect(networkLabelForPassphrase(Networks.FUTURENET)).toBe('a different network');
  });
});
