/**
 * Wallet abstraction tests against a mocked @stellar/freighter-api.
 *
 * Covers the error mapping (not installed / access denied / signing rejected)
 * and the safety-critical detached-signature extraction: the signature this
 * app POSTs to the coordinator must be the 64-byte ed25519 signature produced
 * by the wallet over the transaction hash — and it must verify.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import {
  wallet,
  WalletAccessDeniedError,
  WalletError,
  WalletNotInstalledError,
  WalletSignRejectedError,
} from '../src/lib/wallet';

vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn(),
  requestAccess: vi.fn(),
  getAddress: vi.fn(),
  getNetwork: vi.fn(),
  signTransaction: vi.fn(),
}));

import * as freighter from '@stellar/freighter-api';

const mocked = {
  isConnected: vi.mocked(freighter.isConnected),
  requestAccess: vi.mocked(freighter.requestAccess),
  getAddress: vi.mocked(freighter.getAddress),
  getNetwork: vi.mocked(freighter.getNetwork),
  signTransaction: vi.mocked(freighter.signTransaction),
};

const TESTNET = Networks.TESTNET;
const signer = Keypair.random();

function buildSignedEnvelope(): string {
  const transaction = new TransactionBuilder(new Account(signer.publicKey(), '1234567890'), {
    fee: '100',
    networkPassphrase: TESTNET,
  })
    .addOperation(Operation.payment({ destination: signer.publicKey(), asset: Asset.native(), amount: '1' }))
    .setTimeout(300)
    .build();
  transaction.sign(signer);
  return transaction.toXDR();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.isConnected.mockResolvedValue({ isConnected: true });
});

describe('connect', () => {
  it('throws WalletNotInstalledError when Freighter is missing', async () => {
    mocked.isConnected.mockResolvedValue({ isConnected: false });

    await expect(wallet.connect()).rejects.toBeInstanceOf(WalletNotInstalledError);
  });

  it('throws WalletAccessDeniedError when the user denies access', async () => {
    mocked.requestAccess.mockResolvedValue({ address: '', error: { code: -1, message: 'The user rejected this request.' } });

    await expect(wallet.connect()).rejects.toBeInstanceOf(WalletAccessDeniedError);
  });

  it('returns the public key on success', async () => {
    mocked.requestAccess.mockResolvedValue({ address: signer.publicKey() });

    await expect(wallet.connect()).resolves.toEqual({ publicKey: signer.publicKey() });
  });
});

describe('getConnectedPublicKey', () => {
  it('returns null when the app is not authorized', async () => {
    mocked.getAddress.mockResolvedValue({ address: '' });

    await expect(wallet.getConnectedPublicKey()).resolves.toBeNull();
  });

  it('returns the address when authorized', async () => {
    mocked.getAddress.mockResolvedValue({ address: signer.publicKey() });

    await expect(wallet.getConnectedPublicKey()).resolves.toBe(signer.publicKey());
  });
});

describe('signTransactionDetached', () => {
  it('throws WalletSignRejectedError when the user cancels signing', async () => {
    mocked.signTransaction.mockResolvedValue({
      signedTxXdr: '',
      signerAddress: '',
      error: { code: -1, message: 'The user rejected this request.' },
    });

    await expect(
      wallet.signTransactionDetached('AAAA', { networkPassphrase: TESTNET }),
    ).rejects.toBeInstanceOf(WalletSignRejectedError);
  });

  it('extracts a detached signature that verifies against the transaction hash', async () => {
    const signedXdr = buildSignedEnvelope();
    mocked.signTransaction.mockResolvedValue({
      signedTxXdr: signedXdr,
      signerAddress: signer.publicKey(),
    });

    const result = await wallet.signTransactionDetached(signedXdr, {
      networkPassphrase: TESTNET,
    });

    expect(result.signerPublicKey).toBe(signer.publicKey());

    // The extracted signature must be exactly 64 base64-decoded bytes and must
    // cryptographically verify for this key over this transaction's hash.
    const signatureBytes = Buffer.from(result.signature, 'base64');
    expect(signatureBytes).toHaveLength(64);

    const transaction = TransactionBuilder.fromXDR(signedXdr, TESTNET);
    expect(signer.verify(transaction.hash(), signatureBytes)).toBe(true);
  });

  it('rejects a wallet that signed a different transaction', async () => {
    const signedXdr = buildSignedEnvelope();
    // A second, different transaction — same signer, different destination.
    const other = new TransactionBuilder(new Account(signer.publicKey(), '1234567890'), {
      fee: '100',
      networkPassphrase: TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: Keypair.random().publicKey(),
          asset: Asset.native(),
          amount: '999',
        }),
      )
      .setTimeout(300)
      .build();
    other.sign(signer);

    mocked.signTransaction.mockResolvedValue({
      signedTxXdr: other.toXDR(),
      signerAddress: signer.publicKey(),
    });

    await expect(
      wallet.signTransactionDetached(signedXdr, { networkPassphrase: TESTNET }),
    ).rejects.toThrow('different transaction');
  });

  it('throws a WalletError when the signed envelope carries no signatures', async () => {
    // Build an unsigned envelope and pretend the wallet returned it.
    const unsigned = new TransactionBuilder(new Account(signer.publicKey(), '1234567890'), {
      fee: '100',
      networkPassphrase: TESTNET,
    })
      .addOperation(Operation.payment({ destination: signer.publicKey(), asset: Asset.native(), amount: '1' }))
      .setTimeout(300)
      .build()
      .toXDR();

    mocked.signTransaction.mockResolvedValue({
      signedTxXdr: unsigned,
      signerAddress: signer.publicKey(),
    });

    await expect(
      wallet.signTransactionDetached(unsigned, { networkPassphrase: TESTNET }),
    ).rejects.toBeInstanceOf(WalletError);
  });
});
