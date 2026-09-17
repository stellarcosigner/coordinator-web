import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getRequest,
  isNotFound,
  submitSignature,
  ApiError,
} from '../lib/api';
import type { MultisigRequest } from '../lib/api';
import { wallet, WalletError } from '../lib/wallet';
import { networkPassphrase, networkLabelForPassphrase, checkWalletNetwork, blockExplorerTxUrl } from '../lib/networks';
import { formatDate, shortenAddress } from '../lib/format';
import TransactionSummary from '../components/TransactionSummary';
import SignerStatus from '../components/SignerStatus';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; request: MultisigRequest };

type SignState =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'connected'; publicKey: string }
  | { kind: 'signing' }
  | { kind: 'signed' }
  | { kind: 'submitted' }
  | { kind: 'error'; message: string };

/** The transaction payload travels in the URL fragment so the coordinator-api
 * never has to return raw XDR. Fragments never reach a server. */
function readFragmentXdr(): string | null {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const xdr = fragment.get('tx');
  return xdr && xdr.length > 0 ? xdr : null;
}

export default function SignRequest() {
  const { id = '' } = useParams<{ id: string }>();
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [sign, setSign] = useState<SignState>({ kind: 'idle' });
  const [signError, setSignError] = useState<string | null>(null);
  // The wallet's network label (e.g. "Mainnet") when it is known to differ
  // from the request's network; null whenever there is no known mismatch
  // (networks match, or the wallet's network could not be determined).
  const [walletNetworkWarning, setWalletNetworkWarning] = useState<string | null>(null);

  const fragmentXdr = useMemo(readFragmentXdr, [id]);

  const refresh = useCallback(async () => {
    setLoad({ kind: 'loading' });
    try {
      const request = await getRequest(id);
      setLoad({ kind: 'loaded', request });
    } catch (error) {
      if (isNotFound(error)) {
        setLoad({ kind: 'not-found' });
      } else {
        setLoad({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Could not load this request.',
        });
      }
    }
  }, [id]);

  // Refetch without flipping to the loading skeleton — used after connecting
  // so the signer list / already-signed state reflects the network right now.
  const silentRefresh = useCallback(async () => {
    try {
      const fresh = await getRequest(id);
      setLoad({ kind: 'loaded', request: fresh });
    } catch {
      // Keep the current view on transient failure.
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Checks the wallet's currently reported network against the request's
  // network and updates the warning state accordingly. Shared by every path
  // that can end with a connected wallet (explicit connect and silent
  // session restore) so the warning is never skipped depending on how the
  // wallet got connected. Never fabricates a mismatch: any lookup failure or
  // an undetermined network clears the warning rather than guessing.
  async function syncWalletNetworkWarning(transactionNetwork: MultisigRequest['network']) {
    let passphrase: string | null;
    try {
      passphrase = await wallet.getNetworkPassphrase();
    } catch {
      passphrase = null;
    }
    const result = checkWalletNetwork(passphrase, transactionNetwork);
    setWalletNetworkWarning(result.kind === 'mismatch' ? result.walletNetworkLabel : null);
  }

  // Restore a previous session's connection silently (no stored data — the
  // wallet answers from its own allow-list).
  useEffect(() => {
    if (load.kind !== 'loaded') return;
    const loadedRequest = load.request;
    void wallet
      .getConnectedPublicKey()
      .then((publicKey) => {
        if (publicKey) {
          setSign({ kind: 'connected', publicKey });
          void syncWalletNetworkWarning(loadedRequest.network);
        }
      })
      .catch(() => {
        /* leave the user to connect explicitly */
      });
  }, [load.kind]);

  const request = load.kind === 'loaded' ? load.request : null;

  async function connectWallet() {
    setSignError(null);
    setWalletNetworkWarning(null);
    setSign({ kind: 'connecting' });
    try {
      const { publicKey } = await wallet.connect();
      setSign({ kind: 'connected', publicKey });
      // The signer list is resolved live by the API; refresh it now that we
      // know which account is connected.
      void silentRefresh();
      if (request) {
        void syncWalletNetworkWarning(request.network);
      }
    } catch (error) {
      setSign({
        kind: 'error',
        message: error instanceof WalletError ? error.message : 'Could not connect to your wallet.',
      });
    }
  }

  async function handleSign() {
    if (!request || !fragmentXdr) return;
    setSignError(null);
    setSign({ kind: 'signing' });
    try {
      const passphrase = networkPassphrase(request.network);
      const { signerPublicKey, signature } = await wallet.signTransactionDetached(fragmentXdr, {
        networkPassphrase: passphrase,
      });

      const result = await submitSignature(request.id, { signerPublicKey, signature });

      if (result.status === 'submitted') {
        setSign({ kind: 'submitted' });
        // The API is the source of truth for the actual submitted transaction
        // hash (submissionHash) — fetch it rather than deriving one locally,
        // so the hash shown is correct for any viewer, with or without the
        // original #tx= fragment.
        await silentRefresh();
      } else {
        setSign({ kind: 'signed' });
        // Refresh the live signer list to show the new signature.
        await refresh();
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 409) {
          setSignError('You have already signed this request (signatures are additive-only).');
          await refresh();
        } else if (error.status === 403) {
          setSignError(
            'This wallet is not a current signer of the source account. The account’s signer list is resolved live from the network — only registered signers can sign.',
          );
        } else if (error.status === 400) {
          setSignError(
            'The signature did not verify for this exact transaction and key. Try again with the correct wallet and network.',
          );
        } else if (isNotFound(error)) {
          setLoad({ kind: 'not-found' });
        } else {
          setSignError(error.message);
        }
      } else if (error instanceof WalletError) {
        setSignError(error.message);
      } else {
        setSignError(error instanceof Error ? error.message : 'Signing failed.');
      }
      setSign({ kind: 'idle' });
    }
  }

  if (load.kind === 'loading') {
    return (
      <div data-testid="loading">
        <div className="card">
          <div className="skeleton skeleton-line w70" />
          <div className="skeleton skeleton-line w90" />
          <div className="skeleton skeleton-line w50" />
        </div>
      </div>
    );
  }

  if (load.kind === 'not-found') {
    return (
      <div className="not-found" data-testid="not-found">
        <div className="big">🔍</div>
        <h1>This request doesn’t exist or has expired</h1>
        <p>
          Expired requests are deliberately indistinguishable from ones that
          never existed — that’s a privacy feature. If you reached this from a
          shared link, ask the proposer to create a new request.
        </p>
        <Link className="btn btn-primary" to="/">
          Propose a new transaction
        </Link>
      </div>
    );
  }

  if (load.kind === 'error') {
    return (
      <div className="not-found">
        <div className="big">⚠️</div>
        <h1>Couldn’t load this request</h1>
        <p>{load.message}</p>
        <button type="button" className="btn" onClick={() => void refresh()}>
          Try again
        </button>
      </div>
    );
  }

  // All non-loaded kinds returned above; this narrows `request` for the rest
  // of the render.
  if (!request) {
    throw new Error('invariant: request must be loaded here');
  }

  const { status, network, summary, signatureState, submissionHash } = request;
  const connectedKey = sign.kind === 'connected' ? sign.publicKey : null;
  const connectedIsSigner = connectedKey
    ? signatureState.signers.some((signer) => signer.key === connectedKey)
    : false;
  const connectedAlreadySigned = connectedKey
    ? signatureState.signers.some((signer) => signer.key === connectedKey && signer.signed)
    : false;

  return (
    <div data-testid="sign-request">
      <div className="status-head">
        <h1 style={{ margin: 0 }}>Multisig request</h1>
        <span className={`badge badge-${status}`}>{status}</span>
        <span className="status-meta">
          {network === 'testnet' ? 'Testnet' : 'Mainnet'} · created {formatDate(request.createdAt)}
          {status === 'pending' && (
            <>
              {' '}
              · expires {formatDate(request.expiresAt)}
            </>
          )}
        </span>
      </div>

      {status === 'submitted' && (
        <div className="alert alert-success" role="alert">
          <strong>Threshold met. Transaction submitted to the network.</strong>{' '}
          {submissionHash ? (
            <>
              View it on the block explorer:{' '}
              <a
                href={blockExplorerTxUrl(network, submissionHash)}
                target="_blank"
                rel="noreferrer"
              >
                {shortenAddress(submissionHash, 8, 8)}
              </a>
              .
            </>
          ) : (
            'The submission hash is not available yet.'
          )}
        </div>
      )}

      {!fragmentXdr && status === 'pending' && (
        <div className="alert alert-info" role="alert">
          This link doesn’t include the transaction payload, so you can’t sign
          from this page — ask the proposer to share the full link. You can
          still review the request below.
        </div>
      )}

      <div className="card">
        <h2 className="card-title">What you’re approving</h2>
        <TransactionSummary summary={summary} />
      </div>

      <div className="card">
        <h2 className="card-title">Signatures required</h2>
        <SignerStatus signatureState={signatureState} connectedPublicKey={connectedKey} />
      </div>

      {status === 'pending' && fragmentXdr && (
        <div className="card">
          <h2 className="card-title">Sign with your wallet</h2>

          {signError && (
            <div className="alert alert-warning" role="alert">
              {signError}
            </div>
          )}

          {walletNetworkWarning && (
            <div className="alert alert-warning" role="alert">
              Your wallet is connected to <strong>{walletNetworkWarning}</strong>,
              but this request is for <strong>{networkLabelForPassphrase(networkPassphrase(network))}</strong>.
              Switch your wallet to the matching network before signing.
            </div>
          )}

          {sign.kind === 'signed' && (
            <div className="alert alert-success" role="alert">
              <strong>Signature recorded.</strong> Status refreshed — keep this
              page open or ask the other signers to sign from their own links.
            </div>
          )}

          {sign.kind === 'connecting' || sign.kind === 'signing' ? (
            <div className="wallet-box">
              <span className="spinner" />
              <span className="muted">
                {sign.kind === 'connecting'
                  ? 'Waiting for Freighter…'
                  : 'Waiting for your signature in Freighter…'}
              </span>
            </div>
          ) : sign.kind === 'connected' ? (
            <div className="wallet-box">
              <span className="connected-chip">
                <span className="dot" />
                {shortenAddress(sign.publicKey)}
              </span>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleSign()}
                disabled={!connectedIsSigner || connectedAlreadySigned}
              >
                {connectedAlreadySigned ? 'Already signed' : 'Sign transaction'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => void connectWallet()}>
                Switch account
              </button>
              {!connectedIsSigner && (
                <span className="muted">
                  This wallet isn’t one of the account’s current signers.
                </span>
              )}
            </div>
          ) : (
            <div className="wallet-box">
              <button type="button" className="btn btn-primary" onClick={() => void connectWallet()}>
                Connect Wallet
              </button>
              <span className="muted">
                Signing happens entirely in Freighter — your private key never
                leaves your wallet.
              </span>
            </div>
          )}
        </div>
      )}

      <div className="muted" style={{ fontSize: 13 }}>
        <button type="button" className="btn btn-ghost" onClick={() => void refresh()}>
          Refresh status
        </button>
      </div>
    </div>
  );
}
