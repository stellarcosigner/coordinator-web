import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// GitHub Pages SPA fallback: /404.html hands deep links to the app via ?path=
// (hash fragment preserved in the redirect). Restore it before React Router
// reads the URL — and keep the fragment: for /requests/:id links the #tx=…
// payload is what makes signing possible, and replaceState replaces the whole
// URL including the hash.
const pathParam = new URLSearchParams(window.location.search).get('path');
if (pathParam) {
  window.history.replaceState(null, '', pathParam + window.location.hash);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
