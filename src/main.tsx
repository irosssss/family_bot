import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initSentryClient } from './utils/sentry';
import { getTelegramInitData } from './utils/apiFetch';
import './index.css';
import {withLegacyApiAuth} from './utils/legacyApiAuth';

const V3App = React.lazy(() => import('./v3/V3App'));
const DemoApp = React.lazy(() => import('./demo/DemoApp'));
// The additive local demo never replaces the authenticated production app.
const localDemo = import.meta.env.DEV && new URLSearchParams(location.search).get('legacy') !== '1';

initSentryClient();

// Legacy Telegram credentials must never reach assets, external URLs or target access.
const originalFetch = window.fetch.bind(window);
window.fetch = withLegacyApiAuth(originalFetch,location.origin,getTelegramInitData);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <React.Suspense fallback={<div style={{ padding: 32 }}>Открываем семейный дом…</div>}>
        {localDemo ? (new URLSearchParams(location.search).get('demo') === 'legacy' ? <DemoApp /> : <V3App />) : <App />}
      </React.Suspense>
    </ErrorBoundary>
  </React.StrictMode>
);
