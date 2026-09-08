import { createInitialDemoState } from '../demo/catalog';
import { applyDemoAction, demoDay, DemoError } from '../demo/domain';
import type { DemoAction } from '../demo/types';
import type { apiFetch } from '../utils/apiFetch';

/** Separate synthetic world for this page. It never sends API requests or stores Telegram identities. */
export function createBrowserDemoTransport(): typeof apiFetch {
  let state = createInitialDemoState(demoDay());
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  return async (url, init = {}) => {
    if (url === '/api/demo/state' && (!init.method || init.method === 'GET')) {
      return reply({ state: { ...state, day: demoDay(new Date(), state.timezone) } });
    }
    if (url !== '/api/demo/action' || init.method !== 'POST') {
      return reply({ error: 'Этот раздел недоступен в браузерной демо.' }, 404);
    }
    const action = init.json as DemoAction;
    if (action?.action === 'saveCatalog') return reply({ error: 'Редактор каталога доступен в локальной версии.' }, 403);
    try {
      const result = applyDemoAction(state, action);
      state = result.state;
      return reply(result);
    } catch (error) {
      return reply({ error: error instanceof DemoError ? error.message : 'Не удалось выполнить действие.' }, error instanceof DemoError ? error.status : 500);
    }
  };
}
