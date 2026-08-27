import * as Sentry from '@sentry/react';

const metaEnv = (import.meta as any).env || {};
const SENTRY_DSN = metaEnv.VITE_SENTRY_DSN || '';

export const initSentryClient = () => {
  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
      const reasonStr = String(event.reason?.message || event.reason || '');
      if (
        reasonStr.includes('WebSocket') ||
        reasonStr.includes('vite') ||
        reasonStr.includes('closed without opened')
      ) {
        event.preventDefault();
        console.debug('Handled benign Vite WebSocket disconnection.');
      }
    });
  }

  if (SENTRY_DSN) {
    Sentry.init({
      dsn: SENTRY_DSN,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration(),
      ],
      tracesSampleRate: 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      environment: metaEnv.MODE || 'production',
    });
    console.log('[Sentry] Client Sentry initialized successfully');
  } else {
    console.log('[Sentry] Client Sentry DSN not provided; running in local diagnostic mode');
  }
};

export const captureClientError = (error: Error | unknown, context?: Record<string, any>) => {
  console.error('[Client Error Captured]:', error, context);
  if (SENTRY_DSN) {
    Sentry.captureException(error, {
      extra: context,
    });
  }
};

export const captureClientMessage = (message: string, level: 'info' | 'warning' | 'error' = 'info') => {
  console.log(`[Client Log ${level.toUpperCase()}]:`, message);
  if (SENTRY_DSN) {
    Sentry.captureMessage(message, level);
  }
};
