import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initSentryClient } from './utils/sentry';
import { getTelegramInitData } from './utils/apiFetch';
import './index.css';

const DemoApp = React.lazy(() => import('./demo/DemoApp'));
// The additive local demo never replaces the authenticated production app.
const localDemo = import.meta.env.DEV && new URLSearchParams(location.search).get('legacy') !== '1';

initSentryClient();

// --- API auth (этап 1 аудита): каждый fetch получает заголовок
// `Authorization: tma <initData>`, если открыто внутри Telegram Mini App.
// Вне Telegram (браузер/DEMO) заголовок не ставится — сервер в DEMO MODE
// (нет BOT_TOKEN) пропускает запросы без auth.
const originalFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const initData = getTelegramInitData();
  if (initData) {
    const headers = new Headers(init?.headers);
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `tma ${initData}`);
    }
    return originalFetch(input, { ...init, headers });
  }
  return originalFetch(input, init);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <React.Suspense fallback={<div style={{ padding: 32 }}>Открываем семейный дом…</div>}>
        {localDemo ? <DemoApp /> : <App />}
      </React.Suspense>
    </ErrorBoundary>
  </React.StrictMode>
);
