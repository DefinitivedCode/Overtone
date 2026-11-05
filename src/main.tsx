import './styles/tokens.css';
import './styles/base.css';
import './styles/typography.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { trackKeyboardInset } from './platform/keyboard';
import { markStandalone } from './platform/standalone';

markStandalone();

// The service worker only exists in production builds (dev serves modules directly).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const register = () =>
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((e: unknown) => console.warn('Service worker registration failed', e));
  // 'load' may already have fired by the time this module runs.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);
}
trackKeyboardInset();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
