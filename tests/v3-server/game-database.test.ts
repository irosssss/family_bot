import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setTimeout as delay } from 'node:timers/promises';
import { connectV3Database, type V3Database } from '../../src/v3-server/db/client.js';
import { readV3FoundationTestConfig } from '../../src/v3-server/db/config.js';
import { migrateV3Database } from '../../src/v3-server/db/migrate.js';
import { CAPABILITY_SCOPES, type Capability } from '../../src/v3-server/access/capabilities.js';
import { createAccessService, type VerifiedActor } from '../../src/v3-server/access/service.js';
import { createGameService } from '../../src/v3-server/game/service.js';
import { newEntityId } from '../../src/v3-server/foundation/ids.js';
import { parseRevision } from '../../src/v3-server/contracts/primitives.js';
import { canonical } from '../../src/v3-server/game/canonical.js';
import type { GameCommand } from '../../src/v3-server/game/commands.js';
import type { GameWorld } from '../../src/v3-shared/game.js';
import { createFixture, cleanFixture, grant, FixtureIdentityAdapter, type Fixture } from './support/fixture.js';

const pg = process.env.V3_FOUNDATION_TEST_CONFIG ? describe : describe.skip;
pg('V3 game persistence, uniqueness and transaction failures', () => {
  let db: V3Database, fixture: Fixture, sentinel: Fixture, adapter: FixtureIdentityAdapter;
  let access: ReturnType<typeof createAccessService<ReturnType<FixtureIdentityAdapter['credential']>>>;
  let game: ReturnType<typeof createGameService>;
  let actors: Record<'adult' | 'child', VerifiedActor>;
  let now: string;
  const envelope = (command: GameCommand['command'], payload: object, key = newEntityId()) => JSON.stringify({
    contract: 'family_life_v3.commands', version: '0.1', command, idempotencyKey: key, payload,
  });
  const call = (role: 'adult' | 'child', command: GameCommand['command'], payload: object = {}) => game.dispatch(actors[role], envelope(command, payload));
  const stored = async () => (await db.sql`select body from rpg_v3.game_documents where family_id=${fixture.family}`)[0]?.body as GameWorld;
  async function create(role: 'adult' | 'child' = 'child') {
    const created = await call('adult', 'CreateTask', { title: 'Дело в БД', description: '', assignment: 'individual',
      parts: [{ playerId: fixture[role].player, difficulty: 'epic', label: 'Выполнить часть' }],
      schedule: { kind: 'once', startsOn: '2026-09-09', weekdays: [] } });
    const occurrence = created.projection.occurrences.find(o => o.taskId === created.result.id)!;
    return created.projection.allocations.find(a => a.occurrenceId === occurrence.id)!;
  }
  async function pending() {
    const allocation = await create();
    const raw = envelope('SubmitCompletion', { allocationId: allocation.id, expectedRevision: 1, performedOn: '2026-09-09', note: null, continuation: { kind: 'first' } });
    const result = await game.dispatch(actors.child, raw);
    return { allocation, result, raw };
  }
  async function earn(count = 1) {
    for (let i = 0; i < count; i++) {
      const p = await pending();
      await call('adult', 'ReviewCompletion', { attemptId: p.result.result.id, expectedRevision: 1, decision: 'accept', reason: null });
    }
  }
  async function rewardQuote(price = '100') {
    const offer = await call('adult', 'CreateRealOffer', { title: 'Семейный выбор', promise: 'Занятие вместе', fulfillmentTerms: 'В согласованный день',
      price, eligiblePlayerIds: [fixture.child.player] });
    return call('child', 'QuoteRealReward', { offerId: offer.result.id });
  }
  async function assertMoney() {
    const world = await stored();
    for (const player of world.progress) {
      const [ledger] = await db.sql`select coalesce(sum(delta),0)::text as posted from rpg_v3.game_ledger
        where family_id=${fixture.family} and player_id=${player.playerId} and kind='gold'`;
      expect(player.postedGold).toBe(ledger.posted);
      expect(BigInt(player.postedGold)).toBeGreaterThanOrEqual(BigInt(player.reservedGold));
    }
  }
  beforeAll(async () => {
    db = await connectV3Database(readV3FoundationTestConfig(process.env)); await migrateV3Database(db);
    await db.sql`create schema if not exists v3_fixture`;
    await db.sql`create table if not exists v3_fixture.probes(id uuid primary key, family_id uuid not null, player_id uuid not null)`;
    sentinel = await createFixture(db);
  });
  beforeEach(async () => {
    fixture = await createFixture(db); adapter = new FixtureIdentityAdapter(); now = '2026-09-09T10:00:00.000Z';
    for (const role of ['adult', 'child'] as const) for (const capability of Object.keys(CAPABILITY_SCOPES) as Capability[]) {
      if (role === 'adult' || CAPABILITY_SCOPES[capability] === 'self' || capability === 'family.read') await grant(db, fixture, role, capability);
    }
    access = createAccessService(db, adapter); game = createGameService(access, async () => now);
    actors = { adult: await access.authenticate(adapter.credential(fixture.adult.session)), child: await access.authenticate(adapter.credential(fixture.child.session)) };
  });
  afterEach(async () => {
    await cleanFixture(db, fixture);
    expect(await db.sql`select id from rpg_v3.families where id=${sentinel.family}`).toHaveLength(1);
  });
  afterAll(async () => { if (db) { if (sentinel) await cleanFixture(db, sentinel); await db.close(); } });

  it('replays exact requests and permanent settlements even after transport receipts are deleted', async () => {
    const p = await pending();
    const raw = envelope('ReviewCompletion', { attemptId: p.result.result.id, expectedRevision: 1, decision: 'accept', reason: null });
    const first = await game.dispatch(actors.adult, raw), again = await game.dispatch(actors.adult, raw);
    expect(again.outcome).toBe('already_applied'); expect(again.operationId).toBe(first.operationId);
    await db.sql`delete from rpg_v3.game_receipts where family_id=${fixture.family}`;
    const semantic = await call('adult', 'ReviewCompletion', { attemptId: p.result.result.id, expectedRevision: 1, decision: 'accept', reason: null });
    expect(semantic.outcome).toBe('already_applied');
    expect((await stored()).settlements).toHaveLength(1);
    expect((await db.sql`select * from rpg_v3.game_claims where family_id=${fixture.family} and kind='settlement'`)).toHaveLength(1);
    await assertMoney();
  });
  it('same idempotency key with a different payload fails without ledger or state changes', async () => {
    const p = await pending(), before = canonical(await stored());
    const changed = JSON.parse(p.raw); changed.payload.note = 'Подмена содержимого';
    await expect(game.dispatch(actors.child, JSON.stringify(changed))).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(canonical(await stored())).toBe(before);
  });
  it('binds quote values and rejects expired or changed real offers before reservation', async () => {
    await earn(4);
    const quote = await rewardQuote(), world = await stored(), offer = world.offers[0];
    await call('adult', 'UpdateRealOffer', { offerId: offer.id, expectedRevision: offer.revision, title: offer.title,
      promise: offer.promise, fulfillmentTerms: offer.fulfillmentTerms, price: '110', eligiblePlayerIds: offer.eligiblePlayerIds });
    await expect(call('child', 'RequestRealReward', { quoteId: quote.result.id, expectedOfferRevision: 1 })).rejects.toMatchObject({ code: 'OFFER_CHANGED' });
    const next = await call('child', 'QuoteRealReward', { offerId: offer.id });
    now = '2026-09-09T10:06:00.000Z';
    await expect(call('child', 'RequestRealReward', { quoteId: next.result.id, expectedOfferRevision: 2 })).rejects.toMatchObject({ code: 'QUOTE_EXPIRED' });
    expect((await stored()).orders).toHaveLength(0);
    await assertMoney();
  });
  it('denies foreign identifiers, direct cross-family ledger insertion and revoked receipt access', async () => {
    await earn();
    await expect(call('child', 'SubmitCompletion', { allocationId: newEntityId(), expectedRevision: 1, performedOn: '2026-09-09', note: null, continuation: { kind: 'first' } }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(db.sql`insert into rpg_v3.game_ledger(id,family_id,player_id,kind,sequence,delta,cause_key,snapshot,operation_id)
      values (${newEntityId()},${fixture.family},${sentinel.child.player},'gold',999,1,'foreign',${db.sql.json({})},${newEntityId()})`)
      .rejects.toMatchObject({ code: '23503' });
    const request = envelope('QuotePurchase', { itemId: 'v3.outfit.traveler' });
    await game.dispatch(actors.child, request);
    await access.revoke(actors.adult, { familyId: fixture.family, kind: 'binding', id: fixture.child.binding, expectedRevision: parseRevision(1) });
    await expect(game.dispatch(actors.child, request)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(game.read(actors.child)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('persisted immutable ledger rejects updates and detects a corrupted cached wallet', async () => {
    await earn(); const original = await stored();
    await expect(db.sql`update rpg_v3.game_ledger set delta=999 where family_id=${fixture.family}`).rejects.toMatchObject({ code: '23514' });
    const corrupt = structuredClone(original); corrupt.progress.find(p => p.playerId === fixture.child.player)!.postedGold = '999';
    await db.sql`update rpg_v3.game_documents set body=${db.sql.json(corrupt as never)} where family_id=${fixture.family}`;
    await expect(game.read(actors.child)).rejects.toMatchObject({ code: 'CONFLICT' });
    await db.sql`update rpg_v3.game_documents set body=${db.sql.json(original as never)} where family_id=${fixture.family}`;
    await assertMoney();
  });
  async function failReceipt(command: string, work: () => Promise<void>) {
    const name = 'failure_' + newEntityId().replaceAll('-', '');
    await db.sql.unsafe(`create function v3_fixture.${name}() returns trigger language plpgsql as $$
      begin if new.family_id='${fixture.family}' and new.command='${command}' then
      raise exception 'synthetic_failure' using errcode='22012'; end if; return new; end $$;`);
    await db.sql.unsafe(`create trigger ${name} before insert on rpg_v3.game_receipts for each row execute function v3_fixture.${name}();`);
    try { await work(); } finally {
      await db.sql.unsafe(`drop trigger ${name} on rpg_v3.game_receipts;`);
      await db.sql.unsafe(`drop function v3_fixture.${name}();`);
    }
  }
  it('a failure after settlement effects rolls back attempt decision, claims, ledger and receipt together', async () => {
    const p = await pending(), before = canonical(await stored());
    const [count] = await db.sql`select count(*)::int as n from rpg_v3.game_claims where family_id=${fixture.family}`;
    await failReceipt('ReviewCompletion', async () => {
      await expect(call('adult', 'ReviewCompletion', { attemptId: p.result.result.id, expectedRevision: 1, decision: 'accept', reason: null }))
        .rejects.toMatchObject({ code: '22012' });
    });
    expect(canonical(await stored())).toBe(before);
    expect(await db.sql`select id from rpg_v3.game_ledger where family_id=${fixture.family}`).toHaveLength(0);
    expect((await db.sql`select count(*)::int as n from rpg_v3.game_claims where family_id=${fixture.family}`)[0].n).toBe(count.n);
  });
  it('a failure after debit and entitlement rolls both back; retry buys once', async () => {
    await earn(2); const quote = await call('child', 'QuotePurchase', { itemId: 'v3.outfit.traveler' });
    const before = canonical(await stored());
    const request = envelope('PurchaseItem', { quoteId: quote.result.id, expectedOfferRevision: 1 });
    await failReceipt('PurchaseItem', async () => { await expect(game.dispatch(actors.child, request)).rejects.toMatchObject({ code: '22012' }); });
    expect(canonical(await stored())).toBe(before);
    await game.dispatch(actors.child, request); await game.dispatch(actors.child, request);
    expect((await stored()).purchases).toHaveLength(1); await assertMoney();
  });

  async function race<T>(actions: (() => Promise<T>)[]) {
    let entered!: (pid: number) => void, release!: () => void;
    const ready = new Promise<number>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const blocker = db.sql.begin(async tx => {
      await tx`select id from rpg_v3.families where id=${fixture.family} for update`;
      entered(Number((await tx`select pg_backend_pid() as pid`)[0].pid)); await gate;
    });
    await ready;
    const promises = actions.map(action => action());
    const outcomes = Promise.allSettled(promises);
    try {
      let count = 0; const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const [row] = await db.sql`select count(*)::int as n from pg_stat_activity
          where datname=current_database() and wait_event_type='Lock' and query like '%rpg_v3.families%'`;
        count = row.n; if (count >= actions.length) break; await delay(10);
      }
      expect(count).toBeGreaterThanOrEqual(actions.length);
    } finally { release(); }
    await blocker; return outcomes;
  }
  it('two reviewers on independent connections settle the same allocation only once', async () => {
    const p = await pending(), secondDb = await connectV3Database(db.config);
    try {
      const secondAccess = createAccessService(secondDb, adapter);
      const secondActor = await secondAccess.authenticate(adapter.credential(fixture.adult.session));
      const secondGame = createGameService(secondAccess, async () => now);
      const payload = { attemptId: p.result.result.id, expectedRevision: 1, decision: 'accept', reason: null };
      const outcomes = await race([() => call('adult', 'ReviewCompletion', payload),
        () => secondGame.dispatch(secondActor, envelope('ReviewCompletion', payload))]);
      expect(outcomes.every(outcome => outcome.status === 'fulfilled')).toBe(true);
      expect((await stored()).settlements).toHaveLength(1);
      expect((await db.sql`select count(*)::int as n from rpg_v3.game_ledger where family_id=${fixture.family} and kind='gold'`)[0].n).toBe(1);
      await assertMoney();
    } finally { await secondDb.close(); }
  });
  it('submit versus cancel has one winner and leaves no partially closed pending allocation', async () => {
    const allocation = await create(), occurrence = (await stored()).occurrences[0];
    const outcomes = await race([
      () => call('child', 'SubmitCompletion', { allocationId: allocation.id, expectedRevision: 1, performedOn: '2026-09-09', note: null, continuation: { kind: 'first' } }),
      () => call('adult', 'CancelOccurrence', { occurrenceId: occurrence.id, expectedRevision: 1, reason: 'Изменились планы' }),
    ]);
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1);
    const world = await stored();
    expect(['submitted', 'cancelled']).toContain(world.allocations[0].status);
    expect(world.attempts.length).toBe(world.allocations[0].status === 'submitted' ? 1 : 0);
    expect(world.ledger).toHaveLength(0);
  });
  it('two purchases cannot spend the same available balance', async () => {
    await earn(4);
    const outfit = await call('child', 'QuotePurchase', { itemId: 'v3.outfit.traveler' }), hand = await call('child', 'QuotePurchase', { itemId: 'v3.item.adventure-kit' });
    const outcomes = await race([
      () => call('child', 'PurchaseItem', { quoteId: outfit.result.id, expectedOfferRevision: 1 }),
      () => call('child', 'PurchaseItem', { quoteId: hand.result.id, expectedOfferRevision: 1 }),
    ]);
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1);
    expect((await stored()).purchases).toHaveLength(1); await assertMoney();
  });
  it('reservation versus purchase shares the same atomic available-balance boundary', async () => {
    await earn(4);
    const reward = await rewardQuote(), outfit = await call('child', 'QuotePurchase', { itemId: 'v3.outfit.traveler' });
    const outcomes = await race([
      () => call('child', 'RequestRealReward', { quoteId: reward.result.id, expectedOfferRevision: 1 }),
      () => call('child', 'PurchaseItem', { quoteId: outfit.result.id, expectedOfferRevision: 1 }),
    ]);
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1);
    const world = await stored(); expect(world.orders.length + world.purchases.length).toBe(1); await assertMoney();
  });
  it('delivery versus adult cancellation resolves to exactly one terminal state', async () => {
    await earn(); const quote = await rewardQuote('20');
    const order = await call('child', 'RequestRealReward', { quoteId: quote.result.id, expectedOfferRevision: 1 });
    await call('adult', 'ReviewRealReward', { orderId: order.result.id, expectedRevision: 1, decision: 'approve', reason: null });
    const outcomes = await race([
      () => call('adult', 'ConfirmRealRewardFulfillment', { orderId: order.result.id, expectedRevision: 2, note: null }),
      () => call('adult', 'CancelApprovedRealRewardByAdult', { orderId: order.result.id, expectedRevision: 2, reason: 'Не получилось' }),
    ]);
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1);
    const world = await stored(), final = world.orders[0];
    expect(['delivered', 'cancelled']).toContain(final.status);
    expect(world.ledger.filter(e => e.causeKey.startsWith('real-delivery:')).length).toBe(final.status === 'delivered' ? 1 : 0);
    await assertMoney();
  });
});
