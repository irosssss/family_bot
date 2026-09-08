import React from 'react';
import ReactDOM from 'react-dom/client';
import DemoApp from '../demo/DemoApp';
import { ErrorBoundary } from '../components/ErrorBoundary';
import '../index.css';
import { getTelegramInitData } from '../utils/apiFetch';
import { createBrowserDemoTransport } from './browserDemo';

// A present but invalid Telegram signature must still be rejected by the server.
const browserDemo = !getTelegramInitData();
const browserTransport = browserDemo ? createBrowserDemoTransport() : undefined;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary>
    <aside style={{ padding: '8px 16px', background: '#172c29', color: '#e7f0da', fontSize: 12, textAlign: 'center' }}>
      {browserDemo ? 'Браузерная демо · отдельная тестовая семья · сброс при обновлении страницы' : 'Тестовая версия · ваша отдельная демо-семья · данные до перезапуска'}
    </aside>
    <DemoApp apiRequest={browserTransport} storageNamespace={browserDemo ? 'family-browser-preview' : 'family-demo'} allowCatalogEditing={false} />
  </ErrorBoundary></React.StrictMode>,
);
