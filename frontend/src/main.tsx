import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initBrowserSentry } from '@/app/observability/sentry';
import { App } from './app/App';
import './styles/globals.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Fire-and-forget: never delays first paint, no-op without VITE_SENTRY_DSN.
void initBrowserSentry();
