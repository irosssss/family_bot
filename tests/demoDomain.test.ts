import { describe, expect, it } from 'vitest';
import { createInitialDemoState } from '../src/demo/catalog';
import { applyDemoAction, demoDay, DemoError } from '../src/demo/domain';
import type { DemoAction, DemoState } from '../src/demo/types';

const NOW = new Date('2026-09-05T10:00:00.000Z');
const initial = () => createInitialDemoState(demoDay(NOW));
let requestCounter = 0;
const run = (state: DemoState, action: DemoAction, now = NOW) => applyDemoAction(state, { requestId: `test-request-${++requestCounter}`, ...action }, now).state;
const business = ({ revision: _revision, processedRequestIds: _requests, ...state }: DemoState) => state;
const user = (state: DemoState, id = 'son') => state.users.find(u => u.id === id)!;
const childComplete = (state: DemoState, taskId = 'teeth', userId = 'son') => run(state, { action: 'completeTask', actorId: userId, taskId });

describe('local demo seed and pure transitions', () => {
  it('preserves all 49 reference boss variants and 28 distinct reference pets', () => {
    const s = initial();
    expect(s.catalog.bosses).toHaveLength(49); expect(new Set(s.catalog.bosses.map(b => b.id)).size).toBe(49);
    expect(s.catalog.bosses.every(b => b.sourceRef && b.sourceIndex !== undefined)).toBe(true);
    expect(s.catalog.pets).toHaveLength(28); expect(s.users).toHaveLength(4);
    expect(s.users.every(u => u.energy === 0 && u.petIds.length === 0 && u.activePetId === null)).toBe(true);
  });
  it('never mutates input, even when a transition fails halfway through', () => {
    const s = initial(); const before = structuredClone(s);
    expect(() => run(s, { actorId: 'son', action: 'saveAppearance', appearance: { classId: 'mage', bodyId: 'rare-mage-body' } })).toThrow();
    expect(s).toEqual(before);
    childComplete(s); expect(s).toEqual(before);
  });
  it('rejects unknown or archived actors', () => {
    expect(() => run(initial(), { actorId: 'nobody', action: 'claimDaily' })).toThrow(DemoError);
    const s = run(initial(), { actorId: 'father', action: 'archiveUser', userId: 'son' });
    expect(() => run(s, { actorId: 'son', action: 'claimDaily' })).toThrow('Участник семьи не найден');
  });
});

describe('task authority, snapshots and deduplication', () => {
  it('trusted completion gives one reward and a known egg, never an automatic pet', () => {
    const s = childComplete(initial());
    expect(s.wallet.coins).toBe(65); expect(user(s).xp).toBe(10); expect(user(s).energy).toBe(10);
    expect(user(s).eggIds).toEqual(['cat']); expect(user(s).activePetId).toBeNull();
    const duplicate = childComplete(s);
    expect(business(duplicate)).toEqual(business(s));
  });
  it('requires parent approval, permits rejection and resubmission, rewards only once', () => {
    let s = childComplete(initial(), 'tidy');
    expect(s.wallet.coins).toBe(60); expect(user(s).energy).toBe(0);
    const completionId = s.completions[0].id;
    expect(() => run(s, { actorId: 'daughter', action: 'approveTask', completionId })).toThrow('Это действие доступно взрослому');
    s = run(s, { actorId: 'father', action: 'rejectTask', completionId, note: 'Давай вместе уберём книги' });
    expect(s.completions[0].status).toBe('rejected'); expect(s.wallet.coins).toBe(60);
    s = childComplete(s, 'tidy'); expect(s.completions).toHaveLength(1);
    s = run(s, { actorId: 'mother', action: 'approveTask', completionId });
    expect(s.wallet.coins).toBe(72); expect(user(s).energy).toBe(15);
    expect(business(run(s, { actorId: 'father', action: 'approveTask', completionId }))).toEqual(business(s));
    expect(business(childComplete(s, 'tidy'))).toEqual(business(s));
  });
  it('freezes pending reward before task price edits and day rollover', () => {
    let s = childComplete(initial(), 'tidy');
    s = run(s, { actorId: 'father', action: 'saveTask', task: { id: 'tidy', reward: { xp: 99, gold: 99, energy: 30, coins: 99 } } });
    s = run(s, { actorId: 'father', action: 'approveTask', completionId: s.completions[0].id }, new Date('2026-09-06T10:00:00Z'));
    expect(s.wallet.coins).toBe(72); expect(user(s).xp).toBe(20); expect(user(s).energy).toBe(15);
  });
  it('splits one shared budget exactly across participants', () => {
    let s = run(initial(), { actorId: 'father', action: 'saveTask', task: { id: 'family-table', reward: { xp: 21, gold: 11, energy: 15, coins: 11 } } });
    s = childComplete(s, 'family-table', 'son'); s = childComplete(s, 'family-table', 'daughter');
    expect(s.completions.map(c => c.reward.coins)).toEqual([6, 5]);
    for (const c of s.completions) s = run(s, { actorId: 'father', action: 'approveTask', completionId: c.id });
    expect(s.wallet.coins).toBe(71); expect(user(s).xp + user(s, 'daughter').xp).toBe(21);
    expect(childComplete(s, 'family-table', 'son').wallet.coins).toBe(71);
  });
  it('keeps the shared participant snapshot if the family grows during the day', () => {
    let s = childComplete(initial(), 'family-table');
    s = run(s, { actorId: 'father', action: 'saveUser', user: { id: 'little', name: 'Саша', subtype: 'son', age: 4 } });
    expect(() => childComplete(s, 'family-table', 'little')).toThrow('состав уже определён');
  });
  it('parent can complete on behalf of a child but cannot award oneself', () => {
    const s = run(initial(), { actorId: 'father', action: 'completeTask', taskId: 'tidy', userId: 'daughter' });
    expect(s.completions[0].status).toBe('approved'); expect(user(s, 'daughter').xp).toBe(20);
    expect(() => run(s, { actorId: 'father', action: 'completeTask', taskId: 'teeth' })).toThrow('Игровые награды');
    expect(() => run(s, { actorId: 'son', action: 'completeTask', taskId: 'teeth', userId: 'daughter' })).toThrow('Нельзя управлять');
  });
  it('a new local day permits a new completion but does not grant another first-action egg', () => {
    const s = childComplete(initial());
    const next = run(s, { actorId: 'son', action: 'completeTask', taskId: 'teeth' }, new Date('2026-09-06T10:00:00Z'));
    expect(next.completions).toHaveLength(2); expect(user(next).eggIds).toEqual(['cat']); expect(next.wallet.coins).toBe(70);
  });
});

describe('family daily gift and local calendar', () => {
  it('changes day at Moscow midnight, not UTC midnight', () => {
    expect(demoDay(new Date('2026-09-05T20:59:59Z'))).toBe('2026-09-05');
    expect(demoDay(new Date('2026-09-05T21:00:00Z'))).toBe('2026-09-06');
  });
  it('uses real calendar days across a daylight-saving timezone transition', () => {
    expect(demoDay(new Date('2026-03-29T00:59:00Z'), 'Europe/Berlin')).toBe('2026-03-29');
    expect(demoDay(new Date('2026-03-29T01:01:00Z'), 'Europe/Berlin')).toBe('2026-03-29');
  });
  it('gives two coins once per family even if another person claims, with no XP or energy', () => {
    let s = run(initial(), { actorId: 'son', action: 'claimDaily' });
    s = run(s, { actorId: 'daughter', action: 'claimDaily' });
    s = run(s, { actorId: 'father', action: 'claimDaily' });
    expect(s.wallet.coins).toBe(62); expect(s.users.every(u => u.xp === 0 && u.energy === 0)).toBe(true);
    expect(s.dailyBonusDay).toBe('2026-09-05');
  });
  it('claim survives serialization/reload and missing several days never confiscates anything', () => {
    let s = run(initial(), { actorId: 'father', action: 'claimDaily' });
    s = JSON.parse(JSON.stringify(s));
    expect(run(s, { actorId: 'son', action: 'claimDaily' }).wallet.coins).toBe(62);
    s = run(s, { actorId: 'son', action: 'claimDaily' }, new Date('2026-09-20T12:00:00Z'));
    expect(s.wallet.coins).toBe(64); expect(s.ownedThemeIds).toEqual(['fireplace']);
  });
});

describe('appearance, ownership and purchases', () => {
  it('father alone can wear a beard and a role change clears it', () => {
    let s = run(initial(), { actorId: 'father', action: 'saveAppearance', appearance: { beard: 'full' } });
    expect(user(s, 'father').appearance.beard).toBe('full');
    expect(() => run(s, { actorId: 'mother', action: 'saveAppearance', appearance: { beard: 'short' } })).toThrow('Борода доступна');
    expect(() => run(s, { actorId: 'son', action: 'saveAppearance', appearance: { beard: 'full' } })).toThrow('Борода доступна');
    s = run(s, { actorId: 'father', action: 'saveUser', user: { id: 'father', subtype: 'mother' } });
    expect(user(s, 'father').appearance.beard).toBe('none');
  });
  it('class change grants free compatible starter equipment without touching progression', () => {
    let s = childComplete(initial()); const before = user(s);
    s = run(s, { actorId: 'son', action: 'saveAppearance', appearance: { classId: 'mage' } });
    expect(user(s).appearance.weaponId).toBe('starter-mage-weapon');
    expect(user(s).ownedItemIds).toContain('starter-mage-body');
    expect(user(s).xp).toBe(before.xp); expect(user(s).energy).toBe(before.energy); expect(s.wallet.coins).toBe(65);
  });
  it('rejects unowned, wrong-class and wrong-slot equipment', () => {
    expect(() => run(initial(), { actorId: 'son', action: 'equipItem', itemId: 'rare-rogue-body' })).toThrow('Сначала получите');
    expect(() => run(initial(), { actorId: 'son', action: 'buyItem', itemId: 'rare-mage-body' })).toThrow('другому классу');
    expect(() => run(initial(), { actorId: 'son', action: 'saveAppearance', appearance: { bodyId: 'starter-rogue-weapon' } })).toThrow('другой слот');
  });
  it('buys once, keeps owned pieces through class change, and does not overspend', () => {
    let s = run(initial(), { actorId: 'son', action: 'buyItem', itemId: 'rare-rogue-body' });
    expect(s.wallet.coins).toBe(10);
    expect(business(run(s, { actorId: 'son', action: 'buyItem', itemId: 'rare-rogue-body' }))).toEqual(business(s));
    expect(() => run(s, { actorId: 'son', action: 'buyItem', itemId: 'rare-rogue-weapon' })).toThrow('не хватает');
    s = run(s, { actorId: 'son', action: 'saveAppearance', appearance: { classId: 'mage' } });
    expect(user(s).ownedItemIds).toContain('rare-rogue-body');
  });
  it('replaces one decor slot while retaining all purchased items', () => {
    let s = initial();
    for (const itemId of ['plant', 'books']) {
      s = run(s, { actorId: 'father', action: 'buyItem', itemId });
      s = run(s, { actorId: 'father', action: 'equipDecor', itemId, slot: 'shelf' });
    }
    expect(s.home.decor).toEqual({ shelf: 'books' }); expect(s.ownedDecorIds).toEqual(['plant', 'books']);
    s = run(s, { actorId: 'father', action: 'equipDecor', slot: 'shelf' }); expect(s.home.decor).toEqual({});
  });
  it('adult-only simulated purchase is replay-safe and cannot buy progression', () => {
    expect(() => run(initial(), { actorId: 'son', action: 'simulatePurchase', requestId: 'payment-1' })).toThrow('доступно взрослому');
    let s = run(initial(), { actorId: 'father', action: 'simulatePurchase', requestId: 'payment-1' });
    s = run(JSON.parse(JSON.stringify(s)), { actorId: 'father', action: 'simulatePurchase', requestId: 'payment-1' });
    expect(s.wallet.decorativeCredits).toBe(120); expect(s.simulatedPurchases).toHaveLength(1);
    expect(s.wallet.coins).toBe(60); expect(s.users.every(u => u.xp === 0 && u.energy === 0)).toBe(true);
    expect(() => run(s, { actorId: 'son', action: 'buyItem', itemId: 'garland' })).toThrow('доступно взрослому');
    s = run(s, { actorId: 'father', action: 'buyItem', itemId: 'garland' }); expect(s.wallet.decorativeCredits).toBe(80);
  });
});

describe('earned pets and finite battle rewards', () => {
  it('egg hatch is free, known, repeat-safe and requires explicit companion selection', () => {
    let s = childComplete(initial()); const coins = s.wallet.coins;
    s = run(s, { actorId: 'son', action: 'hatchEgg', petId: 'cat' });
    expect(s.wallet.coins).toBe(coins); expect(user(s).eggIds).toEqual([]); expect(user(s).petIds).toEqual(['cat']);
    expect(user(s).activePetId).toBeNull(); expect(business(run(s, { actorId: 'son', action: 'hatchEgg', petId: 'cat' }))).toEqual(business(s));
    s = run(s, { actorId: 'son', action: 'equipPet', petId: 'cat' }); expect(user(s).activePetId).toBe('cat');
    expect(() => run(s, { actorId: 'son', action: 'equipPet', petId: 'dog' })).toThrow('ещё не получен');
    expect(() => run(s, { actorId: 'son', action: 'hatchEgg', petId: 'dog' })).toThrow('Сначала получите яйцо');
    expect(business(run(s, { actorId: 'son', action: 'buyEgg', petId: 'cat' }))).toEqual(business(s));
  });
  it('parents cannot earn pets or attack, child needs earned energy', () => {
    expect(() => run(initial(), { actorId: 'father', action: 'buyEgg', petId: 'cat' })).toThrow('доступны детям');
    expect(() => run(initial(), { actorId: 'father', action: 'attackBoss' })).toThrow('доступны детям');
    expect(() => run(initial(), { actorId: 'son', action: 'attackBoss' })).toThrow('10 энергии');
    expect(() => run(initial(), { actorId: 'son', action: 'selectBoss', bossId: 'laziness' })).toThrow('доступно взрослому');
  });
  it('victory rewards once across duplicate attacks and replay training', () => {
    let s = initial();
    for (const taskId of ['teeth', 'bed', 'reading']) s = childComplete(s, taskId);
    const coins = s.wallet.coins;
    for (let n = 0; n < 3; n++) s = run(s, { actorId: 'son', action: 'attackBoss', requestId: `hit-${n}` });
    expect(s.battle.hp).toBe(0); expect(s.battle.rewarded).toBe(true); expect(s.wallet.coins).toBe(coins + 25);
    expect(run(s, { actorId: 'son', action: 'attackBoss', requestId: 'hit-2' })).toEqual(s);
    expect(() => run(s, { actorId: 'son', action: 'attackBoss' })).toThrow('Приключение завершено');
    s = run(s, { actorId: 'father', action: 'selectBoss', bossId: 'procrastination' });
    for (const taskId of ['teeth', 'bed', 'reading']) s = childComplete(s, taskId, 'daughter');
    const beforeTraining = s.wallet.coins;
    for (let n = 0; n < 3; n++) s = run(s, { actorId: 'daughter', action: 'attackBoss' });
    expect(s.wallet.coins).toBe(beforeTraining); expect(s.defeatedBossIds).toEqual(['procrastination']);
  });
});

describe('adult editor and protected references', () => {
  it('allows one-parent and expanding child rosters without replacement placeholders', () => {
    let s = run(initial(), { actorId: 'father', action: 'archiveUser', userId: 'mother' });
    for (let i = 0; i < 4; i++) s = run(s, { actorId: 'father', action: 'saveUser', user: { name: `Ребёнок ${i + 1}`, subtype: 'daughter', age: 5 + i } });
    expect(s.users.filter(u => !u.archived && u.role === 'child')).toHaveLength(6);
    expect(s.users.filter(u => !u.archived && u.role === 'parent')).toHaveLength(1);
    expect(() => run(s, { actorId: 'father', action: 'archiveUser', userId: 'father' })).toThrow('хотя бы один взрослый');
    s = run(s, { actorId: 'father', action: 'saveUser', user: { id: 'mother', archived: false } });
    expect(user(s, 'mother').archived).toBe(false);
  });
  it('child cannot edit catalogs/roster or promote oneself', () => {
    expect(() => run(initial(), { actorId: 'son', action: 'saveUser', user: { id: 'son', subtype: 'father', age: 18 } })).toThrow('доступно взрослому');
    expect(() => run(initial(), { actorId: 'son', action: 'saveCatalog', catalog: 'pets', entry: { id: 'cat', enabled: false } })).toThrow('доступно взрослому');
  });
  it('protects current theme, active boss and equipped items from hiding', () => {
    expect(() => run(initial(), { actorId: 'father', action: 'saveCatalog', catalog: 'themes', entry: { id: 'fireplace', enabled: false } })).toThrow('другую комнату');
    expect(() => run(initial(), { actorId: 'father', action: 'saveCatalog', catalog: 'bosses', entry: { id: 'procrastination', enabled: false } })).toThrow('другого босса');
    expect(() => run(initial(), { actorId: 'father', action: 'saveCatalog', catalog: 'items', entry: { id: 'starter-rogue-body', enabled: false } })).toThrow('Стартовые комплекты');
  });
  it('catalog validation rejects bad amounts, unsafe paths and paid gameplay items', () => {
    expect(() => run(initial(), { actorId: 'father', action: 'saveCatalog', catalog: 'items', entry: { id: 'plant', price: -1 } })).toThrow('Цена');
    expect(() => run(initial(), { actorId: 'father', action: 'saveCatalog', catalog: 'pets', entry: { id: 'cat', art: 'https://example.com/cat.png' } })).toThrow('локальные изображения');
    expect(() => run(initial(), { actorId: 'father', action: 'saveCatalog', catalog: 'items', entry: { id: 'rare-rogue-body', currency: 'decorativeCredits' } })).toThrow('только для декора');
    expect(() => run(initial(), { actorId: 'father', action: 'saveCatalog', catalog: 'pets', entry: { id: 'cat', hatchCost: 10 } })).toThrow('Вылупление бесплатно');
  });
  it('permits reversible hiding and editing of available unused catalog entries', () => {
    let s = run(initial(), { actorId: 'father', action: 'saveCatalog', catalog: 'bosses', entry: { id: 'laziness', enabled: false, order: 300, name: 'Сонный великан' } });
    expect(s.catalog.bosses.find(b => b.id === 'laziness')).toMatchObject({ name: 'Сонный великан', enabled: false, order: 300, sourceRef: '16_10_51' });
    s = run(s, { actorId: 'father', action: 'saveCatalog', catalog: 'bosses', entry: { id: 'laziness', enabled: true } });
    expect(s.catalog.bosses.find(b => b.id === 'laziness')?.enabled).toBe(true);
  });
});

describe('review regression boundaries', () => {
  it('rejects mutations without a request ID and persists successful no-op IDs', () => {
    expect(() => applyDemoAction(initial(), { actorId: 'son', action: 'claimDaily' }, NOW)).toThrow('Идентификатор запроса');
    let s = childComplete(initial(), 'tidy');
    s = run(s, { actorId: 'son', action: 'completeTask', taskId: 'tidy', requestId: 'second-submit' });
    s = run(s, { actorId: 'father', action: 'rejectTask', completionId: s.completions[0].id });
    s = run(s, { actorId: 'son', action: 'completeTask', taskId: 'tidy', requestId: 'second-submit' });
    expect(s.completions[0].status).toBe('rejected');
  });
  it('cannot inflate a shared budget by toggling shared or editing rewards mid-day', () => {
    let s = childComplete(initial(), 'family-table');
    s = run(s, { actorId: 'father', action: 'saveTask', task: { id: 'family-table', shared: false, requiresApproval: false, reward: { xp: 100, gold: 100, energy: 30, coins: 100 } } });
    s = childComplete(s, 'family-table', 'daughter');
    expect(s.completions.map(c => c.reward.coins)).toEqual([5, 5]);
    expect(s.completions.every(c => c.status === 'pending')).toBe(true);
    for (const c of s.completions) s = run(s, { actorId: 'father', action: 'approveTask', completionId: c.id });
    expect(s.wallet.coins).toBe(70);
    s = run(s, { actorId: 'daughter', action: 'completeTask', taskId: 'family-table' }, new Date('2026-09-06T10:00:00Z'));
    expect(s.wallet.coins).toBe(170);
  });
  it('hidden owned eggs can hatch and hidden owned pets, equipment, decor and themes remain usable', () => {
    let s = run(initial(), { actorId: 'son', action: 'buyEgg', petId: 'cat' });
    s = run(s, { actorId: 'father', action: 'saveCatalog', catalog: 'pets', entry: { id: 'cat', enabled: false } });
    s = run(s, { actorId: 'son', action: 'hatchEgg', petId: 'cat' });
    s = run(s, { actorId: 'son', action: 'equipPet', petId: 'cat' }); expect(user(s).activePetId).toBe('cat');
    expect(() => run(s, { actorId: 'daughter', action: 'buyEgg', petId: 'cat' })).toThrow('недоступен');
    s = initial();
    s = run(s, { actorId: 'son', action: 'buyItem', itemId: 'rare-rogue-body' });
    s = run(s, { actorId: 'father', action: 'saveCatalog', catalog: 'items', entry: { id: 'rare-rogue-body', enabled: false } });
    s = run(s, { actorId: 'son', action: 'equipItem', itemId: 'rare-rogue-body' }); expect(user(s).appearance.bodyId).toBe('rare-rogue-body');
    s = initial();
    s = run(s, { actorId: 'father', action: 'buyTheme', themeId: 'library' });
    s = run(s, { actorId: 'father', action: 'saveCatalog', catalog: 'themes', entry: { id: 'library', enabled: false } });
    s = run(s, { actorId: 'father', action: 'equipTheme', themeId: 'library' }); expect(s.home.themeId).toBe('library');
    s = initial();
    s = run(s, { actorId: 'father', action: 'buyItem', itemId: 'plant' });
    s = run(s, { actorId: 'father', action: 'saveCatalog', catalog: 'items', entry: { id: 'plant', enabled: false } });
    s = run(s, { actorId: 'father', action: 'equipDecor', itemId: 'plant', slot: 'shelf' }); expect(s.home.decor.shelf).toBe('plant');
  });
  it('cannot change a progressed child or a child with pending work into a parent', () => {
    for (const taskId of ['teeth', 'tidy']) {
      let s = childComplete(initial(), taskId);
      expect(() => run(s, { actorId: 'father', action: 'saveUser', user: { id: 'son', subtype: 'father', age: 18 } })).toThrow('с игровым прогрессом');
      if (taskId === 'tidy') {
        s = run(s, { actorId: 'father', action: 'approveTask', completionId: s.completions[0].id });
        expect(user(s).xp).toBe(20);
      }
    }
  });
  it('accepts full appearance draft changing class while preserving old IDs and normalizes to the free new class', () => {
    const s = initial();
    const next = run(s, { actorId: 'son', action: 'saveAppearance', appearance: { ...user(s).appearance, classId: 'mage' } });
    expect(user(next).appearance).toMatchObject({ classId: 'mage', bodyId: 'starter-mage-body', weaponId: 'starter-mage-weapon' });
    expect(next.wallet.coins).toBe(60);
  });
  it('requires a local compatible custom costume layer and records theme layout presets', () => {
    const entry = { id: 'autumn-cloak', name: 'Осенний плащ', kind: 'body', classId: 'all', art: '/assets/game/demo/items/warrior-body.png', price: 20 };
    expect(() => run(initial(), { actorId: 'father', action: 'saveCatalog', catalog: 'items', entry })).toThrow('нужен прозрачный слой');
    let s = run(initial(), { actorId: 'father', action: 'saveCatalog', catalog: 'items', entry: { ...entry, layerArt: '/assets/game/demo/items/warrior-body.png' } });
    s = run(s, { actorId: 'son', action: 'buyItem', itemId: 'autumn-cloak' });
    s = run(s, { actorId: 'son', action: 'equipItem', itemId: 'autumn-cloak' }); expect(user(s).appearance.bodyId).toBe('autumn-cloak');
    s = run(s, { actorId: 'father', action: 'saveCatalog', catalog: 'themes', entry: { id: 'winter-library', name: 'Библиотека зимой', art: '/assets/game/demo/home-library.webp', layoutPresetId: 'library' } });
    expect(s.catalog.themes.find(t => t.id === 'winter-library')?.layoutPresetId).toBe('library');
  });
  it('requires an adult both to acquire and apply a premium decorative theme', () => {
    let s = run(initial(), { actorId: 'father', action: 'saveCatalog', catalog: 'themes', entry: {
      id: 'holiday-home', name: 'Праздничный дом', art: '/assets/game/demo/home-fireplace.webp', layoutPresetId: 'fireplace', currency: 'decorativeCredits', price: 40,
    } });
    s = run(s, { actorId: 'father', action: 'simulatePurchase', requestId: 'premium-theme-credits' });
    expect(() => run(s, { actorId: 'son', action: 'buyTheme', themeId: 'holiday-home' })).toThrow('доступно взрослому');
    s = run(s, { actorId: 'father', action: 'buyTheme', themeId: 'holiday-home' });
    expect(() => run(s, { actorId: 'son', action: 'equipTheme', themeId: 'holiday-home' })).toThrow('доступно взрослому');
    s = run(s, { actorId: 'father', action: 'equipTheme', themeId: 'holiday-home' });
    expect(s.home.themeId).toBe('holiday-home'); expect(s.wallet.decorativeCredits).toBe(80);
  });
});
