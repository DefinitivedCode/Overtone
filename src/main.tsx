import './styles/tokens.css';
import './styles/base.css';
import './styles/typography.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { trackKeyboardInset } from './platform/keyboard';
import { registerServiceWorker } from './app/updates';
import { markStandalone } from './platform/standalone';

markStandalone();

registerServiceWorker();
trackKeyboardInset();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
