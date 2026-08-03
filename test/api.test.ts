/**
 * API client tests against a mocked coordinator-api (stubbed global fetch).
 * Verifies request URLs/bodies and, critically, that error responses are
 * normalized into ApiError with the right status codes so the UI can react
 * to 404 / 403 / 409 precisely.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  createRequest,
  getRequest,
  isNotFound,
  submitSignature,
} from '../src/lib/api';
import { API_BASE_URL } from '../src/lib/config';

function stubFetch(status: number, body: unknown, options?: { throws?: boolean; badJson?: boolean }) {
  const mock = vi.fn(async () => {
    if (options?.throws) throw new TypeError('fetch failed');
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (options?.badJson) throw new SyntaxError('Unexpected token');
        return body;
      },
    };
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createRequest', () => {
  it('POSTs the transaction to /requests and returns the id', async () => {
    const fetchMock = stubFetch(201, { id: '0123456789abcdef0123456789abcdef' });

    const result = await createRequest({
      sourceAccount: 'GABC',
      transactionXdr: 'AAAAAgAAAA…',
      network: 'testnet',
      ttlSeconds: 604800,
    });

    expect(result).toEqual({ id: '0123456789abcdef0123456789abcdef' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/requests`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      sourceAccount: 'GABC',
      transactionXdr: 'AAAAAgAAAA…',
      network: 'testnet',
      ttlSeconds: 604800,
    });
  });

  it('omits ttlSeconds when not provided', async () => {
    const fetchMock = stubFetch(201, { id: 'a'.repeat(32) });

    await createRequest({ sourceAccount: 'GABC', transactionXdr: 'x', network: 'mainnet' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).not.toHaveProperty('ttlSeconds');
  });
});

describe('getRequest', () => {
  const requestPayload = {
    id: '0123456789abcdef0123456789abcdef',
    sourceAccount: 'GABC',
    network: 'testnet',
    status: 'pending',
    createdAt: '2026-08-03T12:00:00Z',
    expiresAt: '2026-08-10T12:00:00Z',
    submittedAt: null,
    summary: {
      source: 'GABC',
      fee: '100',
      sequence: '123',
      memo: null,
      timeBounds: null,
      operations: [
        {
          type: 'payment',
          description: 'Pay 10.0000000 XLM to GXYZ',
          details: { destination: 'GXYZ', amount: '10.0000000', asset: 'XLM' },
        },
      ],
      signaturesAttachedToEnvelope: 0,
    },
    signatureState: {
      accountStatus: 'ok',
      threshold: 2,
      signedWeight: 1,
      thresholdMet: false,
      signers: [{ key: 'GABC', weight: 1, signed: true, signedAt: '2026-08-03T12:00:00Z' }],
    },
  };

  it('fetches and parses a request', async () => {
    stubFetch(200, requestPayload);

    const request = await getRequest('0123456789abcdef0123456789abcdef');

    expect(request.status).toBe('pending');
    expect(request.summary.operations[0].description).toBe('Pay 10.0000000 XLM to GXYZ');
    expect(request.signatureState.threshold).toBe(2);
  });

  it('maps a 404 to ApiError with status 404 (uniform missing/expired)', async () => {
    stubFetch(404, { error: 'request not found' });

    const error = await getRequest('deadbeef').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).message).toBe('request not found');
    expect(isNotFound(error)).toBe(true);
  });

  it('surfaces server error messages for 403 and 409', async () => {
    stubFetch(403, { error: 'signerPublicKey is not a current signer of this account' });
    const forbidden = await getRequest('x').catch((caught: unknown) => caught);
    expect((forbidden as ApiError).status).toBe(403);
    expect((forbidden as ApiError).message).toContain('not a current signer');

    stubFetch(409, { error: 'signer has already signed this request' });
    const conflict = await getRequest('x').catch((caught: unknown) => caught);
    expect((conflict as ApiError).status).toBe(409);
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    stubFetch(500, undefined, { badJson: true });

    const error = await getRequest('x').catch((caught: unknown) => caught);

    expect((error as ApiError).status).toBe(500);
    expect((error as ApiError).message).toContain('Request failed with status 500');
  });

  it('reports a network failure distinctly (status 0)', async () => {
    stubFetch(0, undefined, { throws: true });

    const error = await getRequest('x').catch((caught: unknown) => caught);

    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).message).toContain('Could not reach the coordinator service');
  });
});

describe('submitSignature', () => {
  it('POSTs the detached signature and returns the resulting status', async () => {
    const fetchMock = stubFetch(200, { status: 'submitted' });

    const result = await submitSignature('0123456789abcdef0123456789abcdef', {
      signerPublicKey: 'GABC',
      signature: 'aGFzaGVk',
    });

    expect(result).toEqual({ status: 'submitted' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/requests/0123456789abcdef0123456789abcdef/sign`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      signerPublicKey: 'GABC',
      signature: 'aGFzaGVk',
    });
  });
});
