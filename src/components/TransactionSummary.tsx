import type { TransactionSummary as TransactionSummaryData } from '../lib/api';
import { shortenAddress } from '../lib/format';

/**
 * Operation types the decoder does not render as plain language in v1
 * (Soroban host-function calls; anything unrecognized). For these we say so
 * explicitly rather than letting a signer believe the summary is complete.
 */
const UNSUMMARIZABLE_TYPES = new Set(['invokeHostFunction', 'unknown']);

function formatMemo(memo: { type: string; value: string } | null): string {
  if (!memo) return 'None';
  if (memo.type === 'text') return `“${memo.value}”`;
  return `${memo.type} ${memo.value}`;
}

function formatTimeBound(seconds: string): string {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return 'none';
  return `${seconds}s (${new Date(value * 1000).toLocaleString()})`;
}

export default function TransactionSummary({
  summary,
}: {
  summary: TransactionSummaryData;
}) {
  const operationCount = summary.operations.length;
  const hasUnsummarizable = summary.operations.some((op) =>
    UNSUMMARIZABLE_TYPES.has(op.type),
  );

  return (
    <div>
      {hasUnsummarizable && (
        <div className="alert alert-warning" role="alert">
          <strong>Caution:</strong> this transaction contains an operation type
          this app cannot fully summarize (such as a smart-contract call).
          Review the raw XDR before signing.
        </div>
      )}

      <p className="summary-lead">
        {operationCount === 0 ? (
          <>This transaction contains no operations.</>
        ) : operationCount === 1 ? (
          <>
            This transaction contains 1 operation from{' '}
            <span className="mono">{shortenAddress(summary.source)}</span>.
          </>
        ) : (
          <>
            This transaction contains {operationCount} operations from{' '}
            <span className="mono">{shortenAddress(summary.source)}</span>.
          </>
        )}
      </p>

      {operationCount > 0 && (
        <div className="op-list">
          {summary.operations.map((op, index) => (
            <div className="op" key={`${op.type}-${index}`}>
              <div className="op-type">
                {index + 1}. {op.type}
              </div>
              <div className="op-description">{op.description}</div>
              {Object.keys(op.details).length > 0 && (
                <dl className="op-details">
                  {Object.entries(op.details).map(([name, value]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="meta-grid">
        <div className="meta-item">
          <div className="label">Source account</div>
          <div className="value" title={summary.source}>
            {shortenAddress(summary.source, 6, 6)}
          </div>
        </div>
        <div className="meta-item">
          <div className="label">Fee</div>
          <div className="value">{summary.fee} stroops</div>
        </div>
        <div className="meta-item">
          <div className="label">Sequence</div>
          <div className="value">{summary.sequence}</div>
        </div>
        <div className="meta-item">
          <div className="label">Memo</div>
          <div className="value">{formatMemo(summary.memo)}</div>
        </div>
        {summary.timeBounds && (
          <div className="meta-item">
            <div className="label">Valid from</div>
            <div className="value">{formatTimeBound(summary.timeBounds.minTime)}</div>
          </div>
        )}
        {summary.timeBounds && (
          <div className="meta-item">
            <div className="label">Valid until</div>
            <div className="value">{formatTimeBound(summary.timeBounds.maxTime)}</div>
          </div>
        )}
        <div className="meta-item">
          <div className="label">Envelope signatures</div>
          <div className="value">{summary.signaturesAttachedToEnvelope}</div>
        </div>
      </div>
    </div>
  );
}
