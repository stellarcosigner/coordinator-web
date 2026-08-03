import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import Propose from './pages/Propose';

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
        <Routes>
          <Route path="/" element={<Propose />} />
          <Route
            path="*"
            element={
              <div className="not-found">
                <div className="big">🧭</div>
                <h1>Page not found</h1>
                <p>That URL doesn’t match anything in this app.</p>
                <Link className="btn btn-primary" to="/">
                  Propose a transaction
                </Link>
              </div>
            }
          />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
