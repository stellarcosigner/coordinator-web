# Contributing

Thanks for helping with the Stellar multisig coordinator frontend.

## Ground rules

This app's core promise: **a signer must be able to trust what they read.**
Keep these inviolable:

1. **Never render a transaction summary that could be wrong or misleading.**
   If any part of an XDR can't be decoded into confident plain language, the
   UI says so explicitly (“this app cannot summarize this operation — review
   the raw XDR”). Never omit silently, never invent details.
2. **Never make the app appear to have signed or submitted something it
   hasn't.** “Submitted” is only shown when the API answers
   `{ "status": "submitted" }`.
3. **Never touch a private key.** All signing goes through the wallet
   connector (`src/lib/wallet.ts`). If your change needs a signature, it
   requests it from the wallet — nothing else.

## Setup

```bash
npm install
npm run dev
```

Requires Node ≥ 22. The app expects the coordinator-api on `http://localhost:3000`
by default; override with `VITE_API_URL` if yours differs.

## Development loop

```bash
npm run typecheck   # strict TypeScript — must pass
npm run lint        # eslint — must pass
npm test            # vitest — must pass
npm run build       # production build — must succeed (not just dev mode!)
```

Always run the production build before considering a task done. This is a
client-side app, but build-time-only issues (browser globals, env handling)
have bitten projects that only checked dev mode.

## The XDR decoder is safety-critical

`src/lib/txSummary.ts` mirrors the API's `src/summary.ts` **exactly**. If you
change one, change the other — a proposer preview and a signer review must say
the same thing.

When you add or change decoder behavior:

- Keep descriptions full sentences with amounts, assets, and destinations.
- Keep the `default` branch's exhaustiveness guard (a new SDK operation type
  must fail to compile).
- Add a test in `test/txSummary.test.ts` that builds a **real transaction**
  with `@stellar/stellar-sdk` and asserts the exact sentence. Do not test with
  hand-written XDR fixtures — they rot.

## Git workflow (non-negotiable)

- **Never `git add .`** — stage specific files.
- **One commit per logical unit**, conventional commits
  (`feat(lib): …`, `fix(sign): …`, `test: …`, `docs: …`).
- Push immediately after each commit.
- Review your own diff before pushing: `git diff --cached`.

## Documentation

Update `README.md` when behavior, env vars, or deployment instructions change.
Update `SECURITY.md` if a security-relevant property changes (anything about
keys, storage, or what the API receives).
