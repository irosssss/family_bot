/**
 * Централизованный API-клиент: добавляет Telegram initData в каждый запрос.
 *
 * В Telegram Mini App: window.Telegram.WebApp.initData — подписанная Telegram строка.
 * Вне Telegram (браузер/DEMO): заголовок не ставится — сервер в DEMO MODE
 * (нет BOT_TOKEN) пропускает такие запросы.
 *
 * Постепенная миграция: вызовы заменяют `fetch(...)` на `apiFetch(...)`,
 * `body: JSON.stringify(x)` — на `json: x`.
 */
type ApiInit = RequestInit & { json?: unknown };

export function getTelegramInitData(): string {
  const tg = (window as any).Telegram?.WebApp;
  if (tg && typeof tg.initData === 'string' && tg.initData.length > 0) {
    return tg.initData;
  }
  return '';
}

export async function apiFetch(url: string, init: ApiInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const initData = getTelegramInitData();
  if (initData) {
    headers.set('Authorization', `tma ${initData}`);
  }
  const body = init.json !== undefined ? JSON.stringify(init.json) : init.body ?? null;
  return fetch(url, { ...init, headers, body });
}

/** JSON-хелпер: бросает ошибку с сообщением сервера при !ok. */
export async function apiJson<T = any>(url: string, init: ApiInit = {}): Promise<T> {
  const res = await apiFetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any)?.error || `HTTP ${res.status}`);
  }
  return data as T;
}
