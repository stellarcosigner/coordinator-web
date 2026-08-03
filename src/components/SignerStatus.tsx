import type { SignatureState } from '../lib/api';
import { formatDate, shortenAddress } from '../lib/format';

export default function SignerStatus({
  signatureState,
  connectedPublicKey,
}: {
  signatureState: SignatureState;
  connectedPublicKey?: string | null;
}) {
  if (signatureState.accountStatus === 'not_found') {
    return (
      <div className="alert alert-warning" role="alert">
        <strong>This account no longer exists on the network</strong> (it may
        have been merged or deleted). The recorded signatures can never reach
        the threshold, and this transaction can never be submitted.
      </div>
    );
  }

  const { threshold, signedWeight, thresholdMet, signers } = signatureState;
  const progressPercent =
    threshold && threshold > 0
      ? Math.min(100, Math.round((signedWeight / threshold) * 100))
      : 0;

  return (
    <div>
      <div className="threshold-row">
        <span className="threshold-text">
          Signature weight:{' '}
          <strong>
            {signedWeight} / {threshold ?? '?'}
          </strong>{' '}
          required
        </span>
        {thresholdMet ? (
          <span className="badge badge-submitted">Threshold met</span>
        ) : (
          <span className="badge badge-pending">More signatures needed</span>
        )}
      </div>

      <div className="progress" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={`progress-fill${thresholdMet ? ' met' : ''}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="signer-list">
        {signers.length === 0 && (
          <div className="muted">No signers are registered on this account.</div>
        )}
        {signers.map((signer) => {
          const isMe = signer.key === connectedPublicKey;
          return (
            <div className={`signer${isMe ? ' me' : ''}`} key={signer.key}>
              <span
                className={`signer-icon ${signer.signed ? 'signed' : 'pending'}`}
                aria-hidden="true"
              >
                {signer.signed ? '✓' : '○'}
              </span>
              <span className="signer-key" title={signer.key}>
                {shortenAddress(signer.key)}
                {isMe && <span className="me-label">you</span>}
              </span>
              <span className="signer-meta">weight {signer.weight}</span>
              <span className="signer-meta">
                {signer.signed ? `signed ${formatDate(signer.signedAt)}` : 'not signed yet'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
