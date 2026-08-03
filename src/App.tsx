import { BrowserRouter, Link } from 'react-router-dom';

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12.5l5.5 5.5L20 7.5" />
      </svg>
    </span>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="brand">
            <BrandMark />
            Stellar Multisig Coordinator
          </Link>
          <span className="brand-tag">
            <span className="dot" />
            Keys never leave your wallet
          </span>
        </div>
      </header>
      <main className="app-main">
        <p className="muted">Loading…</p>
      </main>
    </BrowserRouter>
  );
}
