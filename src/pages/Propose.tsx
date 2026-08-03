import { useEffect, useMemo, useState } from 'react';
import { createRequest } from '../lib/api';
import type { NetworkName, TransactionSummary as SummaryData } from '../lib/api';
import { decodeEnvelope, InvalidTransactionError } from '../lib/txSummary';
import { shortenAddress } from '../lib/format';
import TransactionSummary from '../components/TransactionSummary';

const DAYS_TO_SECONDS = 86_400;
const MAX_TTL_DAYS = 30;
const MIN_TTL_DAYS = 1;

/**
 * Propose page — MVP scope note: the transaction is PASTED as pre-built XDR
 * (e.g. built in Stellar Laboratory or with @stellar/stellar-sdk) rather than
 * constructed field-by-field here. Building a full transaction-construction
 * UI is deliberately out of scope; this app coordinates signatures, it does
 * not author transactions. See README for the full decision.
 */
export default function Propose() {
  const [network, setNetwork] = useState<NetworkName>('testnet');
  const [xdr, setXdr] = useState('');
  const [sourceAccount, setSourceAccount] = useState('');
  const [ttlDays, setTtlDays] = useState('');
  const [preview, setPreview] = useState<SummaryData | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Live preview: decode the pasted envelope as the user types.
  useEffect(() => {
    const trimmed = xdr.trim();
    if (!trimmed) {
      setPreview(null);
      setDecodeError(null);
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        const summary = decodeEnvelope(trimmed, network);
        setPreview(summary);
        setDecodeError(null);
        setSourceAccount((current) => current || summary.source);
      } catch (error) {
        setPreview(null);
        setDecodeError(
          error instanceof InvalidTransactionError
            ? error.message
            : 'Could not decode this transaction envelope.',
        );
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [xdr, network]);

  const shareableUrl = useMemo(() => {
    if (!createdId) return null;
    return `${window.location.origin}/requests/${createdId}#tx=${encodeURIComponent(xdr.trim())}`;
  }, [createdId, xdr]);

  const ttlSeconds = ttlDays.trim() === '' ? undefined : Math.round(Number(ttlDays) * DAYS_TO_SECONDS);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    setCopied(false);

    const trimmedXdr = xdr.trim();
    if (!trimmedXdr) {
      setSubmitError('Paste a transaction envelope XDR first.');
      return;
    }
    if (!preview) {
      setSubmitError(
        decodeError ?? 'The transaction envelope could not be decoded — fix it before submitting.',
      );
      return;
    }
    if (sourceAccount.trim() !== preview.source) {
      setSubmitError(
        `The source account (${shortenAddress(sourceAccount)}) does not match the transaction's own source (${shortenAddress(preview.source)}).`,
      );
      return;
    }
    if (ttlDays.trim() !== '') {
      const days = Number(ttlDays);
      if (!Number.isInteger(days) || days < MIN_TTL_DAYS || days > MAX_TTL_DAYS) {
        setSubmitError(`TTL must be a whole number of days between ${MIN_TTL_DAYS} and ${MAX_TTL_DAYS}.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const { id } = await createRequest({
        sourceAccount: sourceAccount.trim(),
        transactionXdr: trimmedXdr,
        network,
        ttlSeconds,
      });
      setCreatedId(id);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not create the request.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!shareableUrl) return;
    try {
      await navigator.clipboard.writeText(shareableUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context): fall back to a
      // selectable text field so the link can still be copied manually.
      setCopied(false);
    }
  }

  return (
    <div>
      <h1>Propose a multisig transaction</h1>
      <p className="lede">
        Build a transaction in your favorite tool (Stellar Laboratory, the SDK,
        a CLI), then paste its envelope XDR here. We’ll give you an unguessable
        link to share with the signers your account requires.
      </p>

      {createdId && shareableUrl && (
        <div className="share-panel" data-testid="share-panel">
          <div className="share-label">✓ Request created — share this link</div>
          <div className="share-link-box">
            <input
              className="link-input"
              value={shareableUrl}
              readOnly
              aria-label="Shareable link"
              onFocus={(event) => event.currentTarget.select()}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCopy}
              aria-live="polite"
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
          <p className="share-hint">
            The link works until the request expires. Anyone with it can see the
            transaction and (if they are a signer) sign it — treat it as
            sensitive. <a href={shareableUrl}>Open the request page →</a>
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <h2 className="card-title">Transaction</h2>

          <div className="form-row">
            <div className="field">
              <label htmlFor="network">Network</label>
              <select
                id="network"
                value={network}
                onChange={(event) => setNetwork(event.target.value as NetworkName)}
                disabled={Boolean(createdId)}
              >
                <option value="testnet">Testnet</option>
                <option value="mainnet">Mainnet</option>
              </select>
              <div className="hint">Must match the network the transaction was built for.</div>
            </div>

            <div className="field">
              <label htmlFor="sourceAccount">Source account</label>
              <input
                id="sourceAccount"
                value={sourceAccount}
                onChange={(event) => setSourceAccount(event.target.value)}
                placeholder="G…"
                spellCheck={false}
                disabled={Boolean(createdId)}
              />
              <div className="hint">Filled automatically when the XDR is decoded.</div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="xdr">Transaction envelope XDR</label>
            <textarea
              id="xdr"
              value={xdr}
              onChange={(event) => setXdr(event.target.value)}
              placeholder="AAAAAgAAAA…"
              spellCheck={false}
              disabled={Boolean(createdId)}
            />
            <div className="hint">
              Paste the base64 transaction envelope (the signed, shareable form
              exported by Stellar Laboratory).
            </div>
          </div>

          <div className="field">
            <label htmlFor="ttl">Link expires after (days, optional)</label>
            <input
              id="ttl"
              type="number"
              min={MIN_TTL_DAYS}
              max={MAX_TTL_DAYS}
              value={ttlDays}
              onChange={(event) => setTtlDays(event.target.value)}
              placeholder={`${MAX_TTL_DAYS} (default)`}
              disabled={Boolean(createdId)}
            />
            <div className="hint">
              Between {MIN_TTL_DAYS} and {MAX_TTL_DAYS} days. Defaults to 7 days.
            </div>
          </div>

          {submitError && (
            <div className="alert alert-danger" role="alert">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={submitting || Boolean(createdId)}
          >
            {submitting ? (
              <>
                <span className="spinner" /> Creating request…
              </>
            ) : createdId ? (
              'Request created'
            ) : (
              'Create shareable request'
            )}
          </button>
        </div>
      </form>

      {decodeError && (
        <div className="alert alert-danger" role="alert">
          {decodeError}
        </div>
      )}

      {preview && (
        <div className="card rise-in" data-testid="preview">
          <h2 className="card-title">What this transaction does</h2>
          <TransactionSummary summary={preview} />
        </div>
      )}
    </div>
  );
}
