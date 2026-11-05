import './styles/tokens.css';
import './styles/base.css';
import './styles/typography.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { trackKeyboardInset } from './platform/keyboard';
import { markStandalone } from './platform/standalone';

markStandalone();
trackKeyboardInset();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
