import { client } from '../db';
import { createInitialDemoState } from './catalog';
import { applyDemoAction, demoDay } from './domain';
import type { DemoAction, DemoState } from './types';

const WORLD_ID = 'local-family-v1';

/** Factory supports isolated integration rows. The HTTP router never accepts a world ID. */
export function createDemoStore(worldId: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(worldId)) throw new Error('Invalid demo world ID');
  let initialized: Promise<void> | undefined;
  /** Additive storage only. It never reads, migrates or changes the real family tables. */
  function ensure(): Promise<void> {
    if (!initialized) initialized = (async () => {
      await client`CREATE TABLE IF NOT EXISTS demo_worlds (
        id TEXT PRIMARY KEY,
        state JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      const initial = createInitialDemoState(demoDay());
      // Drizzle replaces this shared client's JSON serializers with pass-through handlers.
      // Explicit JSON text + cast works with that client without changing its global codecs.
      await client`INSERT INTO demo_worlds (id, state) VALUES (${worldId}, ${JSON.stringify(initial)}::jsonb) ON CONFLICT (id) DO NOTHING`;
    })().catch(error => { initialized = undefined; throw error; });
    return initialized;
  }

  async function getState(): Promise<DemoState> {
    await ensure();
    const [row] = await client`SELECT state FROM demo_worlds WHERE id = ${worldId}`;
    const state = row.state as DemoState;
    return { ...state, day: demoDay(new Date(), state.timezone) };
  }

  async function dispatch(action: DemoAction): Promise<{ state: DemoState; message: string }> {
    await ensure();
    return client.begin(async tx => {
      // All checks and balance changes happen AFTER locking the persisted world.
      // Multiple tabs/processes cannot both purchase or reward the same event.
      const [row] = await tx`SELECT state FROM demo_worlds WHERE id = ${worldId} FOR UPDATE`;
      const result = applyDemoAction(row.state as DemoState, action);
      await tx`UPDATE demo_worlds SET state = ${JSON.stringify(result.state)}::jsonb, updated_at = NOW() WHERE id = ${worldId}`;
      return result;
    }) as Promise<{ state: DemoState; message: string }>;
  }
  return { ensure, getState, dispatch };
}

const localStore = createDemoStore(WORLD_ID);
export const ensureDemoStore = localStore.ensure;
export const getDemoState = localStore.getState;
export const dispatchDemoAction = localStore.dispatch;
