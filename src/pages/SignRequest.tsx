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
import { parseEnvelope } from '../lib/txSummary';
import { networkPassphrase, blockExplorerTxUrl } from '../lib/networks';
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
  | { kind: 'submitted'; txHash: string }
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
  const [networkMismatch, setNetworkMismatch] = useState(false);

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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Restore a previous session's connection silently (no stored data — the
  // wallet answers from its own allow-list).
  useEffect(() => {
    if (load.kind !== 'loaded') return;
    void wallet
      .getConnectedPublicKey()
      .then((publicKey) => {
        if (publicKey) setSign({ kind: 'connected', publicKey });
      })
      .catch(() => {
        /* leave the user to connect explicitly */
      });
  }, [load.kind]);

  const request = load.kind === 'loaded' ? load.request : null;

  const txHashFromFragment = useMemo(() => {
    if (!request || !fragmentXdr) return null;
    try {
      return parseEnvelope(fragmentXdr, request.network)
        .hash()
        .toString('hex');
    } catch {
      return null;
    }
  }, [request, fragmentXdr]);

  async function connectWallet() {
    setSignError(null);
    setNetworkMismatch(false);
    setSign({ kind: 'connecting' });
    try {
      const { publicKey } = await wallet.connect();
      setSign({ kind: 'connected', publicKey });
      if (request) {
        try {
          const passphrase = await wallet.getNetworkPassphrase();
          if (passphrase && passphrase !== networkPassphrase(request.network)) {
            setNetworkMismatch(true);
          }
        } catch {
          /* network check is best-effort */
        }
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
      const { signerPublicKey, signature, signedXdr } = await wallet.signTransactionDetached(
        fragmentXdr,
        { networkPassphrase: passphrase },
      );

      const result = await submitSignature(request.id, { signerPublicKey, signature });

      if (result.status === 'submitted') {
        const hash = parseEnvelope(signedXdr, request.network).hash().toString('hex');
        setSign({ kind: 'submitted', txHash: hash });
        setLoad({ kind: 'loaded', request: { ...request, status: 'submitted' } });
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

  const { status, network, summary, signatureState } = request;
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
          {txHashFromFragment || sign.kind === 'submitted' ? (
            <>
              View it on the block explorer:{' '}
              <a
                href={blockExplorerTxUrl(
                  network,
                  sign.kind === 'submitted' ? sign.txHash : (txHashFromFragment as string),
                )}
                target="_blank"
                rel="noreferrer"
              >
                {shortenAddress(sign.kind === 'submitted' ? sign.txHash : (txHashFromFragment as string), 8, 8)}
              </a>
              .
            </>
          ) : (
            'The transaction hash is not available from this link.'
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

          {networkMismatch && (
            <div className="alert alert-warning" role="alert">
              Your wallet is configured for a different network than this
              request ({network}). Freighter will ask you to confirm — only
              sign if you are sure this is the right request.
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
