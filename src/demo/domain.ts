import { createDemoUser } from './catalog';
import type { DemoAction, DemoAppearance, DemoBoss, DemoCatalogEntry, DemoClass, DemoCompletion, DemoDecorSlot, DemoItem, DemoPet, DemoState, DemoSubtype, DemoTask, DemoTheme, DemoUser } from './types';

export class DemoError extends Error {
  constructor(message: string, public status = 400, public code = 'INVALID_ACTION') { super(message); }
}
function requireThat(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new DemoError(message, status);
}
export function demoDay(now: Date = new Date(), timezone = 'Europe/Moscow'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function cleanText(value: unknown, label: string, max = 120, optional = false): string {
  requireThat(typeof value === 'string', `${label}: нужен текст`);
  const text = value.trim();
  requireThat((optional || text.length > 0) && text.length <= max, `${label}: от ${optional ? 0 : 1} до ${max} символов`);
  requireThat(!/\p{Extended_Pictographic}/u.test(text), `${label}: используйте текст без эмодзи`);
  return text;
}
function number(value: unknown, label: string, min: number, max: number): number {
  requireThat(typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max, `${label}: целое число от ${min} до ${max}`);
  return value;
}
function enumValue<T extends string>(value: unknown, values: readonly T[], label: string): T {
  requireThat(typeof value === 'string' && values.includes(value as T), `${label}: неизвестное значение`);
  return value as T;
}
function id(value: unknown, label = 'Идентификатор'): string {
  requireThat(typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value), `${label}: неверный формат`);
  return value;
}
function parent(user: DemoUser) { requireThat(user.role === 'parent', 'Это действие доступно взрослому', 403); }
function child(user: DemoUser) { requireThat(user.role === 'child', 'Игровые награды и бои доступны детям', 403); }
function person(state: DemoState, userId: unknown): DemoUser {
  const found = state.users.find(u => u.id === userId && !u.archived);
  requireThat(found, 'Участник семьи не найден', 404);
  return found;
}
function subject(state: DemoState, actor: DemoUser, userId: unknown): DemoUser {
  const target = person(state, userId || actor.id);
  requireThat(actor.id === target.id || actor.role === 'parent', 'Нельзя управлять другим участником', 403);
  return target;
}
function catalogEntry<T extends DemoCatalogEntry>(entries: T[], entryId: unknown, enabled = true): T {
  const entry = entries.find(item => item.id === entryId);
  requireThat(entry && (!enabled || entry.enabled), 'Объект недоступен в каталоге', 404);
  return entry;
}
function spend(state: DemoState, price: number, currency: 'coins' | 'decorativeCredits', actor: DemoUser) {
  if (currency === 'decorativeCredits') parent(actor);
  requireThat(Number.isInteger(price) && price >= 0, 'Неверная цена');
  requireThat(state.wallet[currency] >= price, currency === 'coins' ? 'Пока не хватает семейных монет' : 'Не хватает демонстрационных кристаллов', 409);
  state.wallet[currency] -= price;
}
function compatible(item: DemoItem, appearance: DemoAppearance) {
  requireThat(item.classId === 'all' || item.classId === appearance.classId, 'Эта вещь подходит другому классу', 409);
  if (item.kind !== 'decor' && !/^(starter|rare)-(warrior|mage|healer|rogue)-(body|weapon)$/.test(item.id)) {
    requireThat(item.layerArt && /^\/assets\/game\/[a-zA-Z0-9_./-]+\.png$/.test(item.layerArt)
      && !item.layerArt.includes('..'), 'Для этой вещи не подготовлен совместимый слой изображения', 409);
  }
}
function level(user: DemoUser) { user.level = 1 + Math.floor(user.xp / 100); }
function log(state: DemoState, text: string, now: Date) {
  state.activity.unshift({ id: `event-${state.revision + 1}`, text, at: now.toISOString() });
  state.activity = state.activity.slice(0, 100);
}
function rewardTask(state: DemoState, completion: DemoCompletion) {
  const user = person(state, completion.userId);
  child(user);
  const reward = completion.reward;
  user.xp += reward.xp; user.gold += reward.gold; user.energy = Math.min(100, user.energy + reward.energy);
  state.wallet.coins += reward.coins; level(user);
  // A first useful action earns a known-species egg, never an automatic pet.
  if (state.completions.filter(c => c.userId === user.id && c.status === 'approved').length === 1) {
    const pet = state.catalog.pets.find(p => p.enabled && !user.petIds.includes(p.id) && !user.eggIds.includes(p.id));
    if (pet) user.eggIds.push(pet.id);
  }
}
function rewardSnapshot(state: DemoState, task: DemoTask, user: DemoUser): DemoTask['reward'] {
  const key = `${state.day}:${task.id}`;
  if (!state.taskDayBudgets[key]) {
    const participantIds = state.users.filter(u => !u.archived && u.role === 'child'
      && (!task.assigneeIds.length || task.assigneeIds.includes(u.id))).map(u => u.id);
    state.taskDayBudgets[key] = { participantIds, assigneeIds: [...task.assigneeIds], reward: { ...task.reward }, shared: task.shared, requiresApproval: task.requiresApproval };
  }
  const budget = state.taskDayBudgets[key];
  if (!budget.shared) return { ...budget.reward };
  const index = budget.participantIds.indexOf(user.id);
  requireThat(index >= 0, 'Состав общего задания на сегодня уже определён. Этот участник сможет присоединиться завтра.', 409);
  const share = (value: number) => Math.floor(value / budget.participantIds.length) + (index < value % budget.participantIds.length ? 1 : 0);
  return { xp: share(budget.reward.xp), gold: share(budget.reward.gold), energy: share(budget.reward.energy), coins: share(budget.reward.coins) };
}

function applyAppearance(state: DemoState, user: DemoUser, patch: unknown) {
  requireThat(patch && typeof patch === 'object' && !Array.isArray(patch), 'Не указан образ');
  const change = patch as Partial<DemoAppearance>;
  const appearance = { ...user.appearance };
  if (change.skin !== undefined) appearance.skin = enumValue(change.skin, ['peach', 'warm', 'brown', 'deep'], 'Цвет кожи');
  if (change.hair !== undefined) appearance.hair = enumValue(change.hair, ['short', 'bob', 'long', 'curly', 'ponytail'], 'Причёска');
  if (change.hairColor !== undefined) appearance.hairColor = enumValue(change.hairColor, ['chestnut', 'blond', 'black', 'ginger', 'silver'], 'Цвет волос');
  if (change.beard !== undefined) appearance.beard = enumValue(change.beard, ['none', 'short', 'full'], 'Борода');
  requireThat(user.subtype === 'father' || appearance.beard === 'none', 'Борода доступна только папе', 403);
  if (change.classId !== undefined) {
    const nextClass = enumValue<DemoClass>(change.classId, ['warrior', 'mage', 'healer', 'rogue'], 'Класс');
    if (nextClass !== appearance.classId) {
      appearance.classId = nextClass;
      appearance.bodyId = `starter-${nextClass}-body`;
      appearance.weaponId = `starter-${nextClass}-weapon`;
      for (const starterId of [appearance.bodyId, appearance.weaponId]) {
        const starter = catalogEntry(state.catalog.items, starterId);
        requireThat(starter.price === 0 && starter.currency === 'coins', 'Стартовый комплект класса должен быть бесплатным');
        if (!user.ownedItemIds.includes(starterId)) user.ownedItemIds.push(starterId);
      }
    }
  }
  for (const key of ['bodyId', 'weaponId'] as const) {
    // Normalize unchanged old equipment in a full appearance draft when the class changes.
    const staleOldEquipment = appearance.classId !== user.appearance.classId && change[key] === user.appearance[key];
    const candidate = staleOldEquipment ? appearance[key] : change[key] ?? appearance[key];
    const item = catalogEntry(state.catalog.items, candidate, false);
    requireThat(user.ownedItemIds.includes(item.id), 'Сначала получите эту вещь', 409);
    requireThat(item.kind === (key === 'bodyId' ? 'body' : 'weapon'), 'Эта вещь занимает другой слот');
    compatible(item, appearance); appearance[key] = item.id;
  }
  user.appearance = appearance;
}

function saveCatalog(state: DemoState, action: DemoAction) {
  const kind = enumValue(action.catalog, ['bosses', 'pets', 'items', 'themes'], 'Каталог');
  requireThat(action.entry && typeof action.entry === 'object' && !Array.isArray(action.entry), 'Не передан объект каталога');
  const patch = action.entry;
  const entryId = patch.id === undefined ? `custom-${kind}-${state.revision + 1}` : id(patch.id);
  const entries = state.catalog[kind] as DemoCatalogEntry[];
  const existing = entries.find(e => e.id === entryId);
  const existingData = existing ? { ...existing } : {};
  const merged = { ...existingData, ...patch, id: entryId } as Record<string, unknown>;
  const common: DemoCatalogEntry = {
    id: entryId, name: cleanText(merged.name, 'Название', 80), description: cleanText(merged.description ?? '', 'Описание', 400, true),
    art: cleanText(merged.art, 'Путь изображения', 240), enabled: merged.enabled === undefined ? true : merged.enabled as boolean,
    order: number(merged.order ?? entries.length, 'Порядок', 0, 10000),
  };
  requireThat(typeof common.enabled === 'boolean', 'Видимость должна быть true или false');
  requireThat(/^\/assets\/game\/[a-zA-Z0-9_./-]+\.(png|webp|jpg|jpeg|svg)$/.test(common.art)
    && !common.art.includes('..') && !common.art.includes('//'), 'Разрешены только локальные изображения из /assets/game/');
  if (existing?.reference) common.reference = existing.reference;
  if (existing?.sourceRef) common.sourceRef = existing.sourceRef;
  if (existing?.sourceIndex !== undefined) common.sourceIndex = existing.sourceIndex;
  const active = state.users;
  let next: DemoCatalogEntry;
  if (kind === 'bosses') {
    const boss = common as DemoBoss;
    boss.theme = cleanText(merged.theme ?? 'Семейное приключение', 'Тема', 80);
    boss.hp = number(merged.hp ?? 80, 'Здоровье босса', 30, 5000);
    boss.ability = cleanText(merged.ability ?? 'Побеждаем маленькими полезными делами', 'Особенность', 200);
    const r = merged.reward as Record<string, unknown> | undefined;
    boss.reward = { coins: number(r?.coins ?? 25, 'Монеты за босса', 0, 200), xp: number(r?.xp ?? 20, 'Опыт за босса', 0, 100) };
    if (state.battle.bossId === entryId && !state.battle.rewarded) {
      requireThat(common.enabled, 'Сначала выберите другого босса: этот сейчас на арене', 409);
      requireThat(!existing || boss.hp === (existing as DemoBoss).hp, 'Здоровье активного босса можно изменить после смены соперника', 409);
    }
    next = boss;
  } else if (kind === 'pets') {
    const pet = common as DemoPet;
    pet.eggName = cleanText(merged.eggName ?? `Яйцо: ${common.name}`, 'Название яйца', 100);
    pet.price = number(merged.price ?? 25, 'Цена яйца', 0, 500);
    requireThat(merged.hatchCost === undefined || merged.hatchCost === 0, 'Вылупление бесплатно'); pet.hatchCost = 0;
    requireThat(common.enabled || !active.some(u => u.activePetId === entryId), 'Сначала уберите этого питомца из спутников', 409);
    next = pet;
  } else if (kind === 'items') {
    const item = common as DemoItem;
    item.kind = enumValue(merged.kind, ['body', 'weapon', 'decor'], 'Тип предмета');
    item.classId = enumValue(merged.classId ?? 'all', ['all', 'warrior', 'mage', 'healer', 'rogue'], 'Класс предмета');
    item.price = number(merged.price ?? 25, 'Цена', 0, 1000);
    item.currency = enumValue(merged.currency ?? 'coins', ['coins', 'decorativeCredits'], 'Валюта');
    item.color = cleanText(merged.color ?? '#92775d', 'Цвет', 9);
    requireThat(/^#[a-fA-F0-9]{6}$/.test(item.color), 'Цвет: формат #RRGGBB');
    if (item.kind === 'decor') item.slot = enumValue<DemoDecorSlot>(merged.slot, ['shelf', 'floor', 'wall'], 'Место декора');
    requireThat(item.kind === 'decor' || item.currency === 'coins', 'Демонстрационные кристаллы доступны только для декора');
    if (merged.layerArt !== undefined && merged.layerArt !== '') {
      item.layerArt = cleanText(merged.layerArt, 'Слой одежды', 240);
      requireThat(/^\/assets\/game\/[a-zA-Z0-9_./-]+\.png$/.test(item.layerArt) && !item.layerArt.includes('..'), 'Слой: локальный PNG из /assets/game/');
    }
    if (item.kind !== 'decor' && !/^((starter|rare)-(warrior|mage|healer|rogue)-(body|weapon))$/.test(entryId)) {
      requireThat(item.layerArt, 'Для новой одежды или оружия нужен прозрачный слой 256×320 в layerArt');
    }
    if (entryId.startsWith('starter-')) {
      requireThat(existing && common.enabled && item.price === 0 && item.currency === 'coins'
        && item.classId === (existing as DemoItem).classId && item.kind === (existing as DemoItem).kind, 'Стартовые комплекты должны оставаться бесплатными и доступными', 409);
    }
    for (const user of active) {
      const equippedAs = user.appearance.bodyId === entryId ? 'body' : user.appearance.weaponId === entryId ? 'weapon' : null;
      if (equippedAs) {
        requireThat(common.enabled && item.kind === equippedAs, 'Сначала снимите предмет с персонажей', 409); compatible(item, user.appearance);
      }
    }
    for (const [slot, equipped] of Object.entries(state.home.decor)) if (equipped === entryId) {
      requireThat(common.enabled && item.kind === 'decor' && item.slot === slot, 'Сначала уберите установленный декор', 409);
    }
    next = item;
  } else {
    const theme = common as DemoTheme;
    theme.layoutPresetId = enumValue(merged.layoutPresetId ?? 'fireplace', ['fireplace', 'library', 'conservatory'], 'Расстановка комнаты');
    theme.price = number(merged.price ?? 50, 'Цена комнаты', 0, 1000);
    theme.currency = enumValue(merged.currency ?? 'coins', ['coins', 'decorativeCredits'], 'Валюта');
    theme.palette = cleanText(merged.palette ?? '#96705a', 'Цвет', 9);
    requireThat(/^#[a-fA-F0-9]{6}$/.test(theme.palette), 'Цвет: формат #RRGGBB');
    requireThat(common.enabled || state.home.themeId !== entryId, 'Сначала выберите другую комнату', 409);
    next = theme;
  }
  if (existing) entries[entries.indexOf(existing)] = next; else entries.push(next);
}

/** Pure, clone-first transition. Errors never partially mutate the caller's state. */
export function applyDemoAction(input: DemoState, action: DemoAction, now: Date = new Date()): { state: DemoState; message: string } {
  requireThat(action && typeof action === 'object' && !Array.isArray(action), 'Нужно передать действие');
  const state = structuredClone(input);
  state.day = demoDay(now, state.timezone);
  const actor = person(state, action.actorId);
  const requestId = `${actor.id}:${id(action.requestId, 'Идентификатор запроса')}`;
  if (requestId && state.processedRequestIds.includes(requestId)) return { state, message: 'Это действие уже сохранено' };
  const finish = (message: string) => {
    state.revision += 1;
    state.processedRequestIds.push(requestId);
    return { state, message };
  };
  let message = 'Изменения сохранены';
  switch (action.action) {
    case 'completeTask': {
      const user = subject(state, actor, action.userId); child(user);
      const task = state.tasks.find(t => t.id === action.taskId && t.enabled);
      requireThat(task, 'Задание не найдено', 404);
      const budget = state.taskDayBudgets[`${state.day}:${task.id}`];
      const assignees = budget?.assigneeIds ?? task.assigneeIds;
      requireThat(budget?.shared ? budget.participantIds.includes(user.id) : !assignees.length || assignees.includes(user.id), 'Задание назначено другому участнику либо его состав уже определён на сегодня', 403);
      const existing = state.completions.find(c => c.userId === user.id && c.taskId === task.id && c.day === state.day);
      if (existing && existing.status !== 'rejected') return finish(existing.status === 'pending' ? 'Задание уже ждёт подтверждения' : 'Награда за это задание уже получена сегодня');
      const status = (budget?.requiresApproval ?? task.requiresApproval) && actor.role !== 'parent' ? 'pending' : 'approved';
      const completion: DemoCompletion = { id: existing?.id ?? `${state.day}-${user.id}-${task.id}`, taskId: task.id, userId: user.id, day: state.day,
        status, submittedAt: now.toISOString(), reward: existing?.reward ?? rewardSnapshot(state, task, user),
        ...(status === 'approved' ? { reviewedAt: now.toISOString(), reviewedBy: actor.id } : {}) };
      if (existing) state.completions[state.completions.indexOf(existing)] = completion; else state.completions.push(completion);
      if (status === 'approved') rewardTask(state, completion);
      message = status === 'pending' ? 'Готово! Взрослый проверит и подтвердит награду.' : `Отличная работа! +${completion.reward.coins} семейных монет`;
      log(state, `${user.name}: ${task.title}${status === 'pending' ? ' — ждёт подтверждения' : ' — выполнено'}`, now);
      break;
    }
    case 'approveTask': case 'rejectTask': {
      parent(actor);
      const completion = state.completions.find(c => c.id === action.completionId);
      requireThat(completion, 'Выполнение не найдено', 404);
      if (completion.status !== 'pending') return finish('Это выполнение уже рассмотрено');
      person(state, completion.userId);
      completion.status = action.action === 'approveTask' ? 'approved' : 'rejected';
      completion.reviewedAt = now.toISOString(); completion.reviewedBy = actor.id;
      completion.note = cleanText(action.note ?? (completion.status === 'rejected' ? 'Попробуй ещё раз — мы рядом и поможем.' : ''), 'Комментарий', 240, true);
      if (completion.status === 'approved') rewardTask(state, completion);
      message = completion.status === 'approved' ? `Подтверждено. +${completion.reward.coins} семейных монет` : 'Отправлено на доработку. Ребёнок сможет попробовать снова.';
      log(state, `${actor.name}: ${message}`, now); break;
    }
    case 'claimDaily': {
      if (state.dailyBonusDay === state.day) return finish('Семья уже получила подарок сегодня. Приходите, когда будет удобно.');
      state.dailyBonusDay = state.day; state.wallet.coins += 2;
      message = 'Рады видеть вашу семью. +2 семейные монеты. Пропуски ничего не отнимают.';
      log(state, message, now); break;
    }
    case 'saveAppearance': {
      const user = subject(state, actor, action.userId); applyAppearance(state, user, action.appearance);
      message = `Новый образ ${user.name} сохранён`; break;
    }
    case 'buyItem': {
      const item = catalogEntry(state.catalog.items, action.itemId);
      const user = subject(state, actor, action.userId);
      const owned = item.kind === 'decor' ? state.ownedDecorIds : user.ownedItemIds;
      if (owned.includes(item.id)) return finish('Эта вещь уже есть в коллекции');
      if (item.kind !== 'decor') compatible(item, user.appearance);
      spend(state, item.price, item.currency, actor); owned.push(item.id);
      message = `«${item.name}» теперь в вашей коллекции`; log(state, message, now); break;
    }
    case 'equipItem': {
      const user = subject(state, actor, action.userId);
      const item = catalogEntry(state.catalog.items, action.itemId, false);
      requireThat(item.kind === 'body' || item.kind === 'weapon', 'Декор устанавливается в комнате');
      requireThat(user.ownedItemIds.includes(item.id), 'Сначала получите эту вещь', 409); compatible(item, user.appearance);
      user.appearance[item.kind === 'body' ? 'bodyId' : 'weaponId'] = item.id; message = 'Вещь надета'; break;
    }
    case 'buyTheme': {
      const theme = catalogEntry(state.catalog.themes, action.themeId);
      if (state.ownedThemeIds.includes(theme.id)) return finish('Эта комната уже открыта');
      spend(state, theme.price, theme.currency, actor); state.ownedThemeIds.push(theme.id);
      message = `Комната «${theme.name}» открыта`; log(state, message, now); break;
    }
    case 'equipTheme': {
      const theme = catalogEntry(state.catalog.themes, action.themeId, false);
      requireThat(state.ownedThemeIds.includes(theme.id), 'Сначала откройте эту комнату', 409);
      if (theme.currency === 'decorativeCredits') parent(actor);
      state.home.themeId = theme.id; message = 'Семья переехала в новую комнату'; break;
    }
    case 'equipDecor': {
      const slot = enumValue<DemoDecorSlot>(action.slot, ['shelf', 'floor', 'wall'], 'Место декора');
      if (!action.itemId) { delete state.home.decor[slot]; message = 'Предмет убран в коллекцию'; break; }
      const item = catalogEntry(state.catalog.items, action.itemId, false);
      requireThat(item.kind === 'decor' && item.slot === slot, 'Предмету нужно другое место');
      requireThat(state.ownedDecorIds.includes(item.id), 'Сначала получите этот декор', 409);
      if (item.currency === 'decorativeCredits') parent(actor);
      state.home.decor[slot] = item.id; message = 'Декор установлен. Предыдущий предмет остаётся в коллекции.'; break;
    }
    case 'buyEgg': {
      const user = subject(state, actor, action.userId); child(user);
      const pet = catalogEntry(state.catalog.pets, action.petId);
      if (user.petIds.includes(pet.id) || user.eggIds.includes(pet.id)) return finish('Этот спутник или его яйцо уже есть в коллекции');
      spend(state, pet.price, 'coins', actor); user.eggIds.push(pet.id); message = `Получено яйцо: ${pet.name}`; break;
    }
    case 'hatchEgg': {
      const user = subject(state, actor, action.userId); child(user);
      const pet = catalogEntry(state.catalog.pets, action.petId, false);
      if (user.petIds.includes(pet.id)) return finish('Этот питомец уже вылупился');
      requireThat(user.eggIds.includes(pet.id), 'Сначала получите яйцо этого питомца', 409);
      user.eggIds = user.eggIds.filter(p => p !== pet.id); user.petIds.push(pet.id);
      message = `${pet.name} вылупился! Теперь можно выбрать его спутником.`; log(state, message, now); break;
    }
    case 'equipPet': {
      const user = subject(state, actor, action.userId); child(user);
      if (!action.petId) { user.activePetId = null; message = 'Питомец отдыхает в коллекции'; break; }
      const pet = catalogEntry(state.catalog.pets, action.petId, false);
      requireThat(user.petIds.includes(pet.id), 'Этот питомец ещё не получен', 409);
      user.activePetId = pet.id; message = `${pet.name} теперь рядом`; break;
    }
    case 'attackBoss': {
      child(actor);
      requireThat(!state.battle.rewarded && state.battle.hp > 0, 'Приключение завершено. Взрослый может выбрать следующего соперника.', 409);
      const boss = catalogEntry(state.catalog.bosses, state.battle.bossId);
      requireThat(actor.energy >= 10, 'Для удара нужно 10 энергии. Её дают выполненные дела.', 409);
      actor.energy -= 10; state.battle.hp = Math.max(0, state.battle.hp - 20);
      if (!state.battle.participants.includes(actor.id)) state.battle.participants.push(actor.id);
      message = `Мощный удар! Осталось ${state.battle.hp} сил у соперника.`;
      if (state.battle.hp === 0) {
        state.battle.rewarded = true;
        if (!state.defeatedBossIds.includes(boss.id)) {
          state.defeatedBossIds.push(boss.id); state.wallet.coins += boss.reward.coins;
          for (const participantId of state.battle.participants) {
            const participant = state.users.find(u => u.id === participantId && !u.archived && u.role === 'child');
            if (participant) { participant.xp += boss.reward.xp; level(participant); }
          }
          message = `Вы справились вместе! +${boss.reward.coins} семейных монет, +${boss.reward.xp} опыта участникам.`;
        } else message = 'Тренировка завершена. Награда за этого соперника уже получена.';
        log(state, `${boss.name}: ${message}`, now);
      }
      break;
    }
    case 'selectBoss': {
      parent(actor); const boss = catalogEntry(state.catalog.bosses, action.bossId);
      if (state.battle.bossId === boss.id && !state.battle.rewarded) return finish('Этот соперник уже на арене');
      state.battle = { bossId: boss.id, hp: boss.hp, round: state.battle.round + 1, rewarded: false, participants: [] };
      message = state.defeatedBossIds.includes(boss.id) ? 'Тренировка: повторная победа без награды' : `Новое приключение: ${boss.name}`; break;
    }
    case 'simulatePurchase': {
      parent(actor); requireThat(requestId, 'Для демонстрационной покупки нужен идентификатор запроса');
      state.wallet.decorativeCredits += 120;
      state.simulatedPurchases.push({ id: requestId, at: now.toISOString(), credits: 120, actorId: actor.id });
      message = 'Демо: добавлено 120 декоративных кристаллов. Реальные деньги не списывались.';
      log(state, message, now); break;
    }
    case 'saveUser': {
      parent(actor); const patch = action.user;
      requireThat(patch && typeof patch === 'object', 'Не передан участник семьи');
      const userId = patch.id === undefined ? `member-${state.revision + 1}` : id(patch.id);
      let user = state.users.find(u => u.id === userId);
      const subtype = enumValue<DemoSubtype>(patch.subtype ?? user?.subtype, ['father', 'mother', 'son', 'daughter'], 'Роль в семье');
      const name = cleanText(patch.name ?? user?.name, 'Имя', 32);
      const adult = subtype === 'father' || subtype === 'mother';
      const age = number(patch.age ?? user?.age ?? (adult ? 30 : 8), 'Возраст', adult ? 18 : 1, adult ? 100 : 17);
      if (!user) { user = createDemoUser(userId, name, subtype, age); state.users.push(user); }
      if ((user.role === 'parent') !== adult) {
        requireThat(user.xp === 0 && user.gold === 0 && user.energy === 0 && user.eggIds.length === 0 && user.petIds.length === 0
          && !state.completions.some(c => c.userId === userId), 'Профиль с игровым прогрессом нельзя переводить между взрослым и ребёнком. Создайте отдельного участника; текущий профиль можно скрыть.', 409);
      }
      if (user.role === 'parent' && !adult) requireThat(state.users.some(u => u.id !== userId && u.role === 'parent' && !u.archived), 'В семье должен остаться хотя бы один взрослый', 409);
      if (user.role === 'child' && adult) { user.energy = 0; user.activePetId = null; }
      user.name = name; user.subtype = subtype; user.age = age; user.role = adult ? 'parent' : 'child';
      if (subtype !== 'father') user.appearance.beard = 'none';
      if (patch.archived === false) user.archived = false;
      if (patch.archived === true) {
        requireThat(user.role !== 'parent' || state.users.some(u => u.id !== userId && u.role === 'parent' && !u.archived), 'В семье должен остаться хотя бы один взрослый', 409);
        requireThat(!state.completions.some(c => c.userId === userId && c.status === 'pending'), 'Сначала рассмотрите задания этого участника', 409);
        user.archived = true;
      }
      message = 'Состав семьи сохранён'; break;
    }
    case 'archiveUser': {
      parent(actor); const user = person(state, action.userId);
      requireThat(user.role !== 'parent' || state.users.some(u => u.id !== user.id && u.role === 'parent' && !u.archived), 'В семье должен остаться хотя бы один взрослый', 409);
      requireThat(!state.completions.some(c => c.userId === user.id && c.status === 'pending'), 'Сначала рассмотрите задания этого участника', 409);
      user.archived = true; message = 'Участник скрыт. Его прогресс сохранён, профиль можно вернуть.'; break;
    }
    case 'saveCatalog': parent(actor); saveCatalog(state, action); message = 'Каталог сохранён'; break;
    case 'saveTask': {
      parent(actor); const patch = action.task;
      requireThat(patch && typeof patch === 'object', 'Не передано задание');
      const taskId = patch.id === undefined ? `task-${state.revision + 1}` : id(patch.id);
      const existing = state.tasks.find(t => t.id === taskId); const merged = { ...existing, ...patch };
      const assigneeIds = merged.assigneeIds ?? [];
      requireThat(Array.isArray(assigneeIds) && assigneeIds.length <= 100 && new Set(assigneeIds).size === assigneeIds.length, 'Неверный список участников');
      for (const userId of assigneeIds) child(person(state, userId));
      requireThat(typeof merged.requiresApproval === 'boolean' && typeof merged.shared === 'boolean', 'Укажите тип подтверждения и совместность');
      const task: DemoTask = {
        id: taskId, title: cleanText(merged.title, 'Название', 80), description: cleanText(merged.description ?? '', 'Описание', 300, true),
        category: enumValue(merged.category ?? 'home', ['care', 'home', 'learning', 'together'], 'Категория'),
        requiresApproval: merged.requiresApproval, shared: merged.shared, assigneeIds,
        enabled: merged.enabled ?? true, order: number(merged.order ?? state.tasks.length, 'Порядок', 0, 10000),
        reward: { xp: number(merged.reward?.xp ?? 10, 'Опыт', 0, 100), gold: number(merged.reward?.gold ?? 5, 'Личный вклад', 0, 100),
          energy: number(merged.reward?.energy ?? 10, 'Энергия', 0, 30), coins: number(merged.reward?.coins ?? 5, 'Монеты', 0, 100) },
      };
      requireThat(typeof task.enabled === 'boolean', 'Видимость должна быть true или false');
      if (existing) state.tasks[state.tasks.indexOf(existing)] = task; else state.tasks.push(task);
      message = 'Задание сохранено. Уже отправленные награды не изменились.'; break;
    }
    default: throw new DemoError('Неизвестное действие');
  }
  return finish(message);
}
