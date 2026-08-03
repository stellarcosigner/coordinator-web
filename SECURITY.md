# Security

This frontend is a thin, static client for the
[stellarquorum/coordinator-api](https://github.com/stellarquorum/coordinator-api).
Most of the security properties live in that service (see its README and
SECURITY.md). This document covers what this app must hold, and what it must
never do.

## Threat model

**Assets in scope:**

- The user's **private keys** — they must never touch this app's code, state,
  or network traffic.
- **Signed transaction data** — a signature is only valid if the signer
  intended it; a misleading UI is an attack on that intention.
- The **request id** and **transaction payload** — access to a link grants
  the ability to review (and, if a signer, sign) the request.

**Out of scope / accepted properties:**

- The API's unguessable-ID design means links are bearer credentials: anyone
  holding the full link can read the request. Treat shareable links as
  sensitive. (This is inherent to the coordinator model, not a bug.)
- The API rejects any signature that doesn't cryptographically verify for the
  exact stored transaction and the claiming key, so a compromised or buggy
  client cannot forge a signature.

## What this app does

- **Keys never leave the wallet.** All signing happens inside Freighter
  (`src/lib/wallet.ts`). The only wallet interaction is: ask for a public key,
  ask for a signature over the exact envelope the signer reviewed.
- **No storage of secrets.** No `localStorage`/`sessionStorage` of
  transaction XDR, signatures, public keys, or anything session-relevant. The
  transaction payload travels only in the URL fragment (`#tx=…`), which is
  never sent to a server and never persisted by the app.
- **The summary is the surface, and it is honest.** The signer page renders
  the API's decoded summary; the Propose preview decodes the same way. If any
  operation can't be decoded into plain language, the UI says so and tells
  the signer to review the raw XDR — it never shows a partial or guessed
  description.
- **“Submitted” is only claimed when the API says so.** The success banner
  appears only after `POST /requests/:id/sign` returns `status: submitted`,
  and the block-explorer link is derived from the actual transaction hash.

## What this app never does

- Never handles, stores, or transmits a private key or mnemonic.
- Never records a signature locally or anywhere other than the coordinator-api
  (which stores it server-side, additive-only).
- Never lists or indexes requests; it only ever addresses a request by the id
  from the URL.
- Never trusts client state about signers or thresholds — the signer list
  shown comes live from the API's network resolution.

## Supply chain

Dependencies are pinned with a lockfile (`package-lock.json`). The production
bundle is built from that lockfile in CI (`npm ci`). Review dependency bumps
carefully; `@stellar/stellar-sdk` and `@stellar/freighter-api` are the
security-critical ones.

## Reporting a vulnerability

This project is early-stage and self-hosted. For now, report issues privately
to the repository maintainers (email the address in the git configuration)
with:

- The affected surface (page, endpoint, or library function).
- A minimal reproduction.
- Why you believe it's a security issue.

Do **not** open a public issue for active exploits or anything involving
private-key handling.
