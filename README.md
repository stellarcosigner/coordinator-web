# Stellar Multisig Coordinator — Web

[![CI](https://github.com/stellarcosigner/coordinator-web/actions/workflows/ci.yml/badge.svg)](https://github.com/stellarcosigner/coordinator-web/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

Frontend for a self-hosted **Stellar multisig coordinator**. This app does two
things, and nothing more:

1. **Propose** — a user pastes a pre-built Stellar transaction, the app posts
   it to the coordinator-api, and the proposer gets an unguessable link to
   share with the other required signers.
2. **Sign** — a signer opens that link, reads the transaction described in
   plain language, connects their own wallet (Freighter), and signs.

This app **never handles private keys**. All signing happens inside the
connected wallet extension; the only thing this app ever sends to the API is a
detached signature produced by the wallet. See [SECURITY.md](SECURITY.md) for
the full threat model.

It is a **pure client-side** app (Vite + React + TypeScript) — no server, no
build-time secrets, deployable to any static host. It consumes the
[stellarcosigner/coordinator-api](https://github.com/stellarcosigner/coordinator-api)
backend.

---

## The two flows

### Propose (`/`)

1. Build the transaction in the tool of your choice (Stellar Laboratory, the
   SDK, a CLI) and copy its **envelope XDR**.
2. Paste it here, pick the network, review the plain-language preview, submit.
3. The app shows a **shareable link** with a copy button — it does not
   navigate away, because copying that link is the whole point.

The shareable link looks like:

```
https://<your-frontend>/requests/<id>#tx=<envelope-xdr>
```

The `<id>` is the unguessable 32-hex-char request id returned by the API. The
transaction envelope travels in the **URL fragment** (`#tx=…`) — fragments are
never sent to any server — because the coordinator-api deliberately does not
return raw XDR from `GET /requests/:id` (see
[Design decisions](#design-decisions)).

### Sign (`/requests/:id`)

1. The page fetches `GET /requests/:id` and renders the API-decoded summary in
   plain language ("Pay 10.5 XLM to G…"), never raw XDR.
2. It shows the live signature state: who has signed, who hasn't, weight
   accumulated vs. the account's real on-chain threshold. The page does not
   auto-refresh: a signer must click **Refresh status** to see updates from
   other signers. This is expected behavior, not a bug.
3. **Connect Wallet** (Freighter), then **Sign**. Freighter shows its own
   confirmation; the app extracts the wallet's detached signature, POSTs it to
   `POST /requests/:id/sign`, and refreshes the status.
4. If the threshold was just met, the API submits to the network and the app
   shows **“Threshold met. Transaction submitted to the network.”** with a
   block-explorer link.

If the request doesn't exist or has expired, the page says exactly that —
“this request doesn't exist or has expired” — never a generic error.

---

## MVP scope decision (documented)

**Pasting a pre-built XDR is the MVP — there is deliberately no
transaction-construction UI.** Building a full field-by-field transaction
builder (assets, trustlines, path payments, claimable balances…) is a large
surface with a long tail of edge cases, and it is not what this app is for:
the coordinator *coordinates signatures*, it does not author transactions.
Stellar Laboratory and the SDK already do construction well and export the
envelope XDR this app expects.

The summary preview on the Propose page decodes the pasted XDR client-side, so
the proposer sees exactly what they're about to share before creating the
request.

---

## Design decisions

- **XDR rides in the URL fragment.** `GET /requests/:id` returns a fully
  decoded summary but not the raw envelope. The shareable link carries the
  envelope in `#tx=…` so the signer page can hand it to Freighter without the
  API ever echoing raw XDR. If someone shares only the bare `/requests/<id>`
  URL, the page still renders the full summary and status — it just explains
  that the payload is missing and signing isn't possible from that link.
- **The summary is decoded twice, identically.** The API decodes for
  `GET /requests/:id`; the frontend's `src/lib/txSummary.ts` mirrors that
  decoder for the Propose-page preview and for tests. Descriptions are
  word-for-word identical (see the sibling repo's `src/summary.ts`).
- **Unsummarizable operations are called out, never hidden.** Soroban
  `invokeHostFunction` operations (and anything unrecognized) render an
  explicit warning — “this app cannot fully summarize — review the raw XDR
  before signing” — instead of a silently partial description.
- **No signed data is stored client-side.** No localStorage/sessionStorage of
  transaction payloads, signatures, or keys. The wallet answers from its own
  allow-list; the page re-connects silently if the user previously authorized
  this origin.

---

## Configuration

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `VITE_API_URL` | no | `http://localhost:3000` | Base URL of the coordinator-api. Must be set at **build time** (Vite inlines it) when deploying. |

The API must be configured to allow this frontend's origin: set the API's
`CORS_ORIGIN` environment variable to your frontend's origin (comma-separated
for several). See the API's README.

If the coordinator-api is deployed on a free tier that spins down when idle
(for example Render's free web service), the first request after idle time can
take 30-60 seconds to respond. That is expected, not a broken deployment. See
the API's README for its deployment details.

## Development

```bash
npm install
npm run dev          # http://localhost:5173 (expects the API on :3000)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # vitest run
npm run build        # production build into dist/
npm run preview      # serve the production build locally
```

`node >= 22` is required (matches the API).

---

## Deployment (static hosts)

The app is a static site; `npm run build` emits `dist/`. Every static host
needs one extra rule so the client-side routes (`/requests/<id>`) work on a
hard refresh or direct link:

### Vercel

```bash
npm run build
```

`vercel.json` (already committed) rewrites all paths to `/index.html`:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

Set `VITE_API_URL` in the project's environment settings, build, deploy.

### Netlify

`public/_redirects` (already committed) contains:

```
/*    /index.html   200
```

Set `VITE_API_URL` in Site settings → Environment variables, then build with
`npm run build` and publish `dist/`.

### GitHub Pages

`public/404.html` (already committed) implements the standard SPA fallback:
GitHub Pages serves it for any unknown path, and it redirects to the app with
the deep link preserved via `?path=…` (the `#tx=…` fragment survives the
redirect). `src/main.tsx` restores the path before React Router reads the URL.

Set `VITE_API_URL` to your API origin in the Pages build step, then:

```bash
npm run build
npx gh-pages -d dist        # or any Pages workflow that publishes dist/
```

---

## Project layout

```
src/
  main.tsx                    entry; GitHub Pages deep-link restore
  App.tsx                     shell + routes
  pages/
    Propose.tsx               paste XDR → preview → submit → shareable link
    SignRequest.tsx           fetch, review, connect wallet, sign, submitted state
  lib/
    api.ts                    typed coordinator-api client (types + errors)
    wallet.ts                 Freighter adapter; detached-signature extraction
    txSummary.ts              XDR → plain-language decoder (mirrors the API)
    networks.ts               passphrases, block-explorer URLs
    config.ts                 API base URL from VITE_API_URL
    format.ts                 address shortening / date formatting
  components/
    TransactionSummary.tsx    the plain-language review surface
    SignerStatus.tsx          live signer list + threshold progress
test/
  txSummary.test.ts           decoder tests (safety-critical)
  api.test.ts                 client tests against a mocked API
  wallet.test.ts              wallet tests against a mocked Freighter
```

## Testing

`npm test` runs 23 tests. The XDR-summary tests are the most important: they
build real transactions with `@stellar/stellar-sdk` and assert the exact
plain-language sentences a signer will read. See
[CONTRIBUTING.md](CONTRIBUTING.md) for how to add coverage when you touch the
decoder.

## Related

- [stellarcosigner/coordinator-api](https://github.com/stellarcosigner/coordinator-api) — the backend this app talks to (routes, security model, README).
- [Freighter developer docs](https://docs.freighter.app/) — the wallet integration this app uses.
