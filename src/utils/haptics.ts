export function triggerHaptic(
  type: 'impact' | 'notification' | 'selection',
  subtype: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' | 'error' | 'success' | 'warning' = 'medium'
): void {
  if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
    try {
      if (type === 'impact') {
        window.navigator.vibrate(10);
      } else if (type === 'notification') {
        window.navigator.vibrate([20, 50, 20]);
      } else if (type === 'selection') {
        window.navigator.vibrate(5);
      }
    } catch (e) {
      // Ignore vibration errors
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
  return false;
}

export function initTelegramWebApp(): void {
  // No-op
}
