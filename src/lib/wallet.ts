/**
 * Wallet connection and signing abstraction.
 *
 * This app never touches a private key. All signing happens inside the
 * connected wallet extension (Freighter); this module only asks the wallet to
 * sign and extracts the resulting detached signature so it can be POSTed to
 * the coordinator-api.
 *
 * Freighter's API (v6) returns result objects with an optional `error` field
 * rather than throwing. We normalize that into typed errors so the UI can
 * react precisely (not installed / access denied / signing rejected).
 */
import * as freighter from '@stellar/freighter-api';
import { TransactionBuilder } from '@stellar/stellar-sdk';

export class WalletError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletError';
  }
}

export class WalletNotInstalledError extends WalletError {
  constructor() {
    super('Freighter is not installed. Install the Freighter extension and try again.');
    this.name = 'WalletNotInstalledError';
  }
}

export class WalletAccessDeniedError extends WalletError {
  constructor(message: string) {
    super(`Freighter access denied: ${message}`);
    this.name = 'WalletAccessDeniedError';
  }
}

export class WalletSignRejectedError extends WalletError {
  constructor(message: string) {
    super(`Freighter signing rejected: ${message}`);
    this.name = 'WalletSignRejectedError';
  }
}

export interface DetachedSignature {
  /** The public key the wallet used to sign (this is the signer to record). */
  signerPublicKey: string;
  /** Base64-encoded 64-byte ed25519 signature over the transaction hash. */
  signature: string;
  /** The full signed envelope returned by the wallet. */
  signedXdr: string;
}

export interface WalletAdapter {
  isInstalled(): Promise<boolean>;
  connect(): Promise<{ publicKey: string }>;
  /** Silently returns the connected key if the app is already authorized, else null. */
  getConnectedPublicKey(): Promise<string | null>;
  /**
   * Signs a transaction envelope and extracts the wallet's detached signature
   * (the coordinator-api needs the bare signature, not the full envelope).
   */
  signTransactionDetached(
    xdr: string,
    opts: { networkPassphrase: string },
  ): Promise<DetachedSignature>;
}

/**
 * Walks a signed envelope returned by the wallet and extracts the newest
 * signature. Freighter appends its signature to the envelope, so the last
 * entry is the one it just produced. The API cryptographically verifies the
 * submitted signature against the transaction hash and the claimed key, so a
 * mis-extraction can never be recorded — it would be rejected with a 400.
 */
function extractNewestSignature(
  signedXdr: string,
  networkPassphrase: string,
): { signature: string; signedXdr: string } {
  const signed = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
  const signatures = signed.signatures;
  if (signatures.length === 0) {
    throw new WalletError('The wallet returned a signed envelope with no signatures.');
  }
  const newest = signatures[signatures.length - 1];
  return {
    signature: newest.signature().toString('base64'),
    signedXdr,
  };
}

class FreighterWalletAdapter implements WalletAdapter {
  async isInstalled(): Promise<boolean> {
    const result = await freighter.isConnected();
    return result.isConnected === true;
  }

  async connect(): Promise<{ publicKey: string }> {
    if (!(await this.isInstalled())) {
      throw new WalletNotInstalledError();
    }
    const result = await freighter.requestAccess();
    if (result.error) {
      throw new WalletAccessDeniedError(result.error.message);
    }
    return { publicKey: result.address };
  }

  async getConnectedPublicKey(): Promise<string | null> {
    if (!(await this.isInstalled())) {
      return null;
    }
    const result = await freighter.getAddress();
    if (result.error) {
      return null;
    }
    return result.address || null;
  }

  async signTransactionDetached(
    xdr: string,
    opts: { networkPassphrase: string },
  ): Promise<DetachedSignature> {
    if (!(await this.isInstalled())) {
      throw new WalletNotInstalledError();
    }
    const result = await freighter.signTransaction(xdr, {
      networkPassphrase: opts.networkPassphrase,
    });
    if (result.error) {
      throw new WalletSignRejectedError(result.error.message);
    }
    const { signature, signedXdr } = extractNewestSignature(
      result.signedTxXdr,
      opts.networkPassphrase,
    );
    return {
      signerPublicKey: result.signerAddress,
      signature,
      signedXdr,
    };
  }
}

export const wallet: WalletAdapter = new FreighterWalletAdapter();
