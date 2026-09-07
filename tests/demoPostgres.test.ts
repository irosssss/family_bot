/**
 * Opt-in REAL PostgreSQL integration; never touches local-family-v1 or existing family tables.
 * envskill run --only SQL_HOST,SQL_USER,SQL_PASSWORD,SQL_DB_NAME -- env DOTENV_CONFIG_PATH=/dev/null DEMO_REAL_PG=1 npx vitest run tests/demoPostgres.test.ts
 * Creates only integration-<UUID> rows, then deletes those exact rows in afterAll.
 */
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { createDemoStore as StoreFactory } from '../src/demo/store';
import type { client as SqlClient } from '../src/db';

const enabled = process.env.DEMO_REAL_PG === '1';

describe.skipIf(!enabled)('real PostgreSQL local demo transactions', () => {
  let createStore: typeof StoreFactory;
  let sql: typeof SqlClient;
  let store: ReturnType<typeof StoreFactory>;
  let worldId: string;
  const createdIds: string[] = [];
  const nextRequest = () => randomUUID();

  beforeAll(async () => {
    ({ createDemoStore: createStore } = await import('../src/demo/store'));
    ({ client: sql } = await import('../src/db'));
  });
  beforeEach(async () => {
    worldId = `integration-${randomUUID()}`;
    createdIds.push(worldId);
    store = createStore(worldId);
    await store.ensure();
  });
  afterAll(async () => {
    if (sql) {
      try {
        for (const createdId of createdIds) {
          if (!/^integration-[a-f0-9-]{36}$/.test(createdId)) throw new Error('Refusing non-test row cleanup');
          await sql`DELETE FROM demo_worlds WHERE id = ${createdId}`;
        }
        const remaining = await sql`SELECT id FROM demo_worlds WHERE id = ANY(${createdIds})`;
        expect(remaining).toHaveLength(0);
        console.info(`[demo-postgres] Removed ${createdIds.length} isolated test rows; no live demo rows targeted.`);
      } finally { await sql.end({ timeout: 5 }); }
    }
  });

  it('loads an isolated initial world and persists its first update', async () => {
    const before = await store.getState();
    expect(before.users).toHaveLength(4); expect(before.wallet.coins).toBe(60);
    await store.dispatch({ actorId: 'father', action: 'claimDaily', requestId: nextRequest() });
    const after = await createStore(worldId).getState();
    expect(after.wallet.coins).toBe(62); expect(after.dailyBonusDay).toBe(after.day);
  });

  it('serializes 12 concurrent daily claims to one family gift', async () => {
    const actors = ['father', 'mother', 'son', 'daughter'];
    await Promise.all(Array.from({ length: 12 }, (_, n) => store.dispatch({ actorId: actors[n % 4], action: 'claimDaily', requestId: nextRequest() })));
    const state = await store.getState();
    expect(state.wallet.coins).toBe(62); expect(state.users.every(u => u.energy === 0 && u.xp === 0)).toBe(true);
    expect(state.processedRequestIds).toHaveLength(12);
  });

  it('rewards a trusted task once under 16 simultaneous independent submits', async () => {
    await Promise.all(Array.from({ length: 16 }, () => store.dispatch({ actorId: 'son', action: 'completeTask', taskId: 'teeth', requestId: nextRequest() })));
    const state = await store.getState(); const child = state.users.find(u => u.id === 'son')!;
    expect(state.completions).toHaveLength(1); expect(state.wallet.coins).toBe(65);
    expect(child.energy).toBe(10); expect(child.xp).toBe(10); expect(child.eggIds).toEqual(['cat']);
  });

  it('serializes concurrent parent approvals and preserves the submitted reward snapshot', async () => {
    const pending = await store.dispatch({ actorId: 'son', action: 'completeTask', taskId: 'tidy', requestId: nextRequest() });
    await store.dispatch({ actorId: 'father', action: 'saveTask', requestId: nextRequest(), task: { id: 'tidy', reward: { coins: 100, xp: 100, gold: 100, energy: 30 } } });
    await Promise.all(Array.from({ length: 8 }, (_, n) => store.dispatch({ actorId: n % 2 ? 'father' : 'mother', action: 'approveTask', completionId: pending.state.completions[0].id, requestId: nextRequest() })));
    const state = await store.getState();
    expect(state.wallet.coins).toBe(72); expect(state.users.find(u => u.id === 'son')?.energy).toBe(15);
    expect(state.completions[0].reward.coins).toBe(12);
  });

  it('prevents overspend when two different purchases race for the same wallet', async () => {
    const results = await Promise.allSettled([
      store.dispatch({ actorId: 'son', action: 'buyItem', itemId: 'rare-rogue-body', requestId: nextRequest() }),
      store.dispatch({ actorId: 'son', action: 'buyItem', itemId: 'rare-rogue-weapon', requestId: nextRequest() }),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    const state = await store.getState(); const child = state.users.find(u => u.id === 'son')!;
    const bought = state.catalog.items.filter(i => i.id.startsWith('rare-') && child.ownedItemIds.includes(i.id));
    expect(bought).toHaveLength(1); expect(state.wallet.coins).toBe(60 - bought[0].price);
    expect(state.wallet.coins).toBeGreaterThanOrEqual(0);
  });

  it('deduplicates 12 simultaneous retries of the same attack', async () => {
    await store.dispatch({ actorId: 'son', action: 'completeTask', taskId: 'teeth', requestId: nextRequest() });
    const requestId = nextRequest();
    await Promise.all(Array.from({ length: 12 }, () => store.dispatch({ actorId: 'son', action: 'attackBoss', requestId })));
    const state = await store.getState();
    expect(state.battle.hp).toBe(40); expect(state.users.find(u => u.id === 'son')?.energy).toBe(0);
    expect(state.processedRequestIds).toHaveLength(2);
  });

  it('grants one boss victory reward under concurrent finishing attacks', async () => {
    for (const taskId of ['teeth', 'bed', 'reading']) await store.dispatch({ actorId: 'son', action: 'completeTask', taskId, requestId: nextRequest() });
    const before = await store.getState();
    await Promise.all(Array.from({ length: 3 }, () => store.dispatch({ actorId: 'son', action: 'attackBoss', requestId: nextRequest() })));
    const after = await store.getState();
    expect(after.battle.hp).toBe(0); expect(after.battle.rewarded).toBe(true);
    expect(after.wallet.coins).toBe(before.wallet.coins + 25); expect(after.defeatedBossIds).toEqual(['procrastination']);
    expect(after.users.find(u => u.id === 'son')?.energy).toBe(0);
  });

  it('rolls back the full transaction if validation fails after provisional appearance changes', async () => {
    const before = await store.getState();
    await expect(store.dispatch({ actorId: 'son', action: 'saveAppearance', requestId: nextRequest(), appearance: { classId: 'mage', bodyId: 'rare-mage-body' } })).rejects.toThrow('Сначала получите');
    expect(await store.getState()).toEqual(before);
  });

  it('reads persisted state from a fresh Node process and does not replay a purchase after restart', async () => {
    const requestId = nextRequest();
    await store.dispatch({ actorId: 'father', action: 'simulatePurchase', requestId });
    const program = `
      import { createDemoStore } from './src/demo/store.ts';
      import { client } from './src/db/index.ts';
      try {
        const store = createDemoStore(${JSON.stringify(worldId)});
        const result = await store.dispatch({ actorId: 'father', action: 'simulatePurchase', requestId: ${JSON.stringify(requestId)} });
        console.log('DEMO_PERSISTENCE_RESULT=' + JSON.stringify({ credits: result.state.wallet.decorativeCredits, purchases: result.state.simulatedPurchases.length }));
      } catch (error) { console.error('DEMO_PERSISTENCE_FAILED'); process.exitCode = 1; }
      finally { await client.end({ timeout: 5 }); }
    `;
    const output = await new Promise<string>((resolve, reject) => {
      const worker = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', program], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      worker.stdout.on('data', data => { stdout += String(data); });
      // Diagnostic output is intentionally not surfaced: no credentials or connection details.
      worker.stderr.resume();
      worker.once('error', () => reject(new Error('Isolated persistence worker could not start')));
      worker.once('close', code => code === 0 ? resolve(stdout) : reject(new Error('Isolated persistence worker failed')));
    });
    const line = output.split('\n').find(l => l.startsWith('DEMO_PERSISTENCE_RESULT='));
    expect(line).toBe('DEMO_PERSISTENCE_RESULT={"credits":120,"purchases":1}');
    expect((await store.getState()).wallet.decorativeCredits).toBe(120);
  });
});
