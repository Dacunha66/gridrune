import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import favicon from './assets/favicon.png';
import touchIcon from './assets/apple-touch-icon.png';

// GridRune icons for the browser tab and the iPhone/iPad home screen (bundled into the single HTML file).
for (const [rel, href] of [['icon', favicon], ['apple-touch-icon', touchIcon]]) {
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  document.head.appendChild(link);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA: on the website, a service worker keeps the game on the device (fast start, opens without internet).
// Not in the single-file version for the hosted preview and not during development.
if (import.meta.env.PROD && import.meta.env.MODE !== 'single' && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Without the service worker the game simply works as a normal website.
    });
  });
}
