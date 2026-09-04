type HapticImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type HapticNotificationType = 'error' | 'success' | 'warning';

interface TelegramWebAppBridge {
  ready?: () => void;
  expand?: () => void;
  themeParams?: Record<string, string | undefined>;
  viewportStableHeight?: number;
  safeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
  contentSafeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
  onEvent?: (
    eventType: 'themeChanged' | 'viewportChanged' | 'safeAreaChanged' | 'contentSafeAreaChanged',
    callback: () => void,
  ) => void;
  HapticFeedback?: {
    impactOccurred?: (style: HapticImpactStyle) => void;
    notificationOccurred?: (type: HapticNotificationType) => void;
    selectionChanged?: () => void;
  };
}

let initialized = false;

function getTelegramWebApp(): TelegramWebAppBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as Window & { Telegram?: { WebApp?: TelegramWebAppBridge } }).Telegram?.WebApp ?? null;
}

function applyTelegramViewportTokens(webApp: TelegramWebAppBridge): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const theme = webApp.themeParams ?? {};
  const stableHeight = webApp.viewportStableHeight;
  const safe = webApp.safeAreaInset ?? {};
  const contentSafe = webApp.contentSafeAreaInset ?? {};

  if (typeof stableHeight === 'number' && stableHeight > 0) {
    root.style.setProperty('--tg-viewport-stable-height', String(stableHeight) + 'px');
  }

  ([
    ['--tg-theme-bg-color', theme.bg_color],
    ['--tg-theme-secondary-bg-color', theme.secondary_bg_color],
    ['--tg-theme-text-color', theme.text_color],
    ['--tg-theme-hint-color', theme.hint_color],
    ['--tg-theme-link-color', theme.link_color],
    ['--tg-theme-button-color', theme.button_color],
    ['--tg-theme-button-text-color', theme.button_text_color],
    ['--tg-safe-area-inset-top', safe.top],
    ['--tg-safe-area-inset-bottom', safe.bottom],
    ['--tg-safe-area-inset-left', safe.left],
    ['--tg-safe-area-inset-right', safe.right],
    ['--tg-content-safe-area-inset-top', contentSafe.top],
    ['--tg-content-safe-area-inset-bottom', contentSafe.bottom],
    ['--tg-content-safe-area-inset-left', contentSafe.left],
    ['--tg-content-safe-area-inset-right', contentSafe.right],
  ] as const).forEach(([name, value]) => {
    if (typeof value === 'string' && value) root.style.setProperty(name, value);
    if (typeof value === 'number' && value >= 0) root.style.setProperty(name, String(value) + 'px');
  });
}

export function triggerHaptic(
  type: 'impact' | 'notification' | 'selection',
  subtype: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' | 'error' | 'success' | 'warning' = 'medium',
): void {
  const telegramHaptics = getTelegramWebApp()?.HapticFeedback;

  try {
    if (type === 'selection') {
      if (telegramHaptics?.selectionChanged) {
        telegramHaptics.selectionChanged();
        return;
      }
    }

    if (type === 'impact') {
      const impactStyle: HapticImpactStyle = ['light', 'medium', 'heavy', 'rigid', 'soft'].includes(subtype)
        ? subtype as HapticImpactStyle
        : 'medium';
      if (telegramHaptics?.impactOccurred) {
        telegramHaptics.impactOccurred(impactStyle);
        return;
      }
    } else if (type === 'notification') {
      const notificationType: HapticNotificationType = ['error', 'success', 'warning'].includes(subtype)
        ? subtype as HapticNotificationType
        : 'success';
      if (telegramHaptics?.notificationOccurred) {
        telegramHaptics.notificationOccurred(notificationType);
        return;
      }
    }
  } catch {
    // Telegram may reject haptics in an unsupported client. Fall through to the browser fallback.
  }

  if (typeof window !== 'undefined' && window.navigator?.vibrate) {
    try {
      if (type === 'impact') window.navigator.vibrate(10);
      else if (type === 'notification') window.navigator.vibrate([20, 50, 20]);
      else window.navigator.vibrate(5);
    } catch {
      // Vibration is an optional progressive enhancement.
    }
  }
}

export function shareMiniApp(text: string, url: string = window.location.href): void {
  if (navigator.share) {
    navigator.share({
      title: 'Family Chores RPG',
      text: text,
      url: url,
    }).catch(console.error);
  } else {
    // Fallback
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(shareUrl, '_blank');
  }
}

export function isTelegramMiniApp(): boolean {
  return getTelegramWebApp() !== null;
}

export function initTelegramWebApp(): void {
  const webApp = getTelegramWebApp();
  if (!webApp) return;

  webApp.ready?.();
  webApp.expand?.();
  applyTelegramViewportTokens(webApp);

  if (initialized) return;
  initialized = true;

  const syncTokens = () => applyTelegramViewportTokens(webApp);
  webApp.onEvent?.('themeChanged', syncTokens);
  webApp.onEvent?.('viewportChanged', syncTokens);
  webApp.onEvent?.('safeAreaChanged', syncTokens);
  webApp.onEvent?.('contentSafeAreaChanged', syncTokens);
}
