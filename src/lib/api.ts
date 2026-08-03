/**
 * Typed client for the Stellar multisig coordinator-api.
 *
 * Mirrors the contract implemented by the sibling repo (stellarquorum/
 * coordinator-api): POST /requests, GET /requests/:id, POST /requests/:id/sign.
 * Errors are `{ error: string }` with an HTTP status; this client normalizes
 * them into `ApiError` so callers can react to 404 / 403 / 409 specifically.
 */
import { API_BASE_URL } from './config';

export type NetworkName = 'testnet' | 'mainnet';
export type RequestStatus = 'pending' | 'submitted' | 'expired';

/** One operation as decoded by the API — always a full plain-language sentence. */
export interface OperationSummary {
  type: string;
  description: string;
  details: Record<string, string | number | boolean | null>;
}

/** The complete decoded picture of a transaction a signer reviews. */
export interface TransactionSummary {
  source: string;
  fee: string;
  sequence: string;
  memo: { type: string; value: string } | null;
  timeBounds: { minTime: string; maxTime: string } | null;
  operations: OperationSummary[];
  signaturesAttachedToEnvelope: number;
}

export interface SignerState {
  key: string;
  weight: number;
  signed: boolean;
  signedAt: string | null;
}

/**
 * The account's CURRENT signer list and threshold, resolved live from the
 * network by the API at read time — never cached, never client-supplied.
 */
export interface SignatureState {
  accountStatus: 'ok' | 'not_found';
  threshold: number | null;
  signedWeight: number;
  thresholdMet: boolean;
  signers: SignerState[];
}

/** Full GET /requests/:id payload. */
export interface MultisigRequest {
  id: string;
  sourceAccount: string;
  network: NetworkName;
  status: RequestStatus;
  createdAt: string;
  expiresAt: string;
  submittedAt: string | null;
  summary: TransactionSummary;
  signatureState: SignatureState;
}

export interface CreateRequestInput {
  sourceAccount: string;
  transactionXdr: string;
  network: NetworkName;
  ttlSeconds?: number;
}

export interface SubmitSignatureInput {
  signerPublicKey: string;
  signature: string;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError('Could not reach the coordinator service', 0);
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body: unknown = await response.json();
      if (typeof body === 'object' && body !== null && 'error' in body) {
        const candidate = (body as { error: unknown }).error;
        if (typeof candidate === 'string' && candidate.length > 0) {
          message = candidate;
        }
      }
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

/** POST /requests — creates a pending request, returns its unguessable id. */
export function createRequest(input: CreateRequestInput): Promise<{ id: string }> {
  return request<{ id: string }>('/requests', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** GET /requests/:id — the full review surface for one request. */
export function getRequest(id: string): Promise<MultisigRequest> {
  return request<MultisigRequest>(`/requests/${id}`);
}

/**
 * POST /requests/:id/sign — records one signer's detached signature and
 * returns the resulting status ('pending' or 'submitted').
 */
export function submitSignature(
  id: string,
  input: SubmitSignatureInput,
): Promise<{ status: RequestStatus }> {
  return request<{ status: RequestStatus }>(`/requests/${id}/sign`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
