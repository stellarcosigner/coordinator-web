import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// GitHub Pages SPA fallback: /404.html hands deep links to the app via ?path=
// (hash fragment preserved). Restore it before React Router reads the URL.
const pathParam = new URLSearchParams(window.location.search).get('path');
if (pathParam) {
  window.history.replaceState(null, '', pathParam);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
