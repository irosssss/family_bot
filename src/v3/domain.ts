import {OUTFITS, PROMISE_OFFERS} from './content';
/** Synthetic local V3 interaction model. Not authentication or server authority. */
export type MemberId = string;
export type AvatarId = 'father' | 'mother' | 'daughter' | 'son';
export interface Member { id: MemberId; avatar?: AvatarId; name: string; role: 'parent' | 'child'; coins: number; xp: number }
export interface Task { id: string; ownerId: MemberId; title: string; coins: number; xp: number; status: 'todo' | 'pending' | 'approved'; reviewRequired?: boolean; reviewNote?: string }
export interface PromiseRequest { id: string; ownerId: MemberId; title: string; cost: number; status: 'requested' | 'approved' | 'fulfilled' | 'cancelled' }
export interface LedgerEntry { id: string; memberId: MemberId; coins: number; xp: number; title: string }
export interface Campaign { hp: number; strength: Record<string,number>; hits: {id:string;actorId:string;damage:number}[] }
export const FIRST_BOSS_HP=60;
export const TASK_STRENGTH=10;
export interface State { campaign?: Campaign; version: 1; members: Member[]; tasks: Task[]; promises: PromiseRequest[]; ownedOutfits: Record<string, string[]>; equippedOutfits: Record<string, string>; ledger: LedgerEntry[] }
export {OUTFITS, PROMISE_OFFERS} from './content';
export type Command =
  | { type: 'campaign.start' }
  | { type: 'campaign.hit'; hitId: string }
  | { type: 'member.add'; memberId: string; name: string; avatar: AvatarId }
  | { type: 'member.rename'; memberId: string; name: string }
  | { type: 'task.submit' | 'task.approve'; taskId: string }
  | { type: 'task.return'; taskId: string; note?: string }
  | { type: 'task.create'; taskId: string; ownerId: MemberId; title: string; reviewRequired?: boolean }
  | { type: 'outfit.buy' | 'outfit.equip'; outfitId: string }
  | { type: 'promise.request'; promiseId: string; offerId: string }
  | { type: 'promise.approve' | 'promise.fulfill' | 'promise.cancel'; promiseId: string };
export class DomainError extends Error { constructor(public code: string, message: string) { super(message); this.name = 'DomainError'; } }
function fail(code: string, message: string): never { throw new DomainError(code, message); }
export function createInitialState(options: { soloAdult?: boolean } = {}): State {
  const members: Member[] = [
    { id: 'father', name: 'Алексей', role: 'parent', coins: 100, xp: 40 },
    { id: 'mother', name: 'Марина', role: 'parent', coins: 100, xp: 40 },
    { id: 'daughter', name: 'Лиза', role: 'child', coins: 232, xp: 32 },
    { id: 'son', name: 'Миша', role: 'child', coins: 100, xp: 24 },
  ].filter(m => !options.soloAdult || m.id !== 'mother') as Member[];
  return { version: 1, members, tasks: members.flatMap(m => [
    { id: `${m.id}-1`, ownerId: m.id, title: m.role === 'parent' ? 'Приготовить ужин' : 'Убрать игрушки', coins: 8, xp: 8, status: 'todo' as const },
    { id: `${m.id}-2`, ownerId: m.id, title: 'Полить растения', coins: 8, xp: 8, status: 'todo' as const },
  ]), promises: [], ownedOutfits: Object.fromEntries(members.map(m => [m.id, ['basic-1']])), equippedOutfits: Object.fromEntries(members.map(m => [m.id, 'basic-1'])), ledger: [] };
}
export function reservedCoins(state: State, id: string): number { return state.promises.filter(p => p.ownerId === id && p.status === 'requested').reduce((sum, p) => sum + p.cost, 0); }
export function availableCoins(state: State, id: string): number { return (state.members.find(m => m.id === id)?.coins ?? 0) - reservedCoins(state, id); }
export function canReviewTask(state: State, actorId: string, task: Task): boolean {
  const actor = state.members.find(m => m.id === actorId);
  return actor?.role === 'parent' && (actorId !== task.ownerId || state.members.filter(m => m.role === 'parent').length === 1);
}
export function applyCommand(previous: State, command: Command, actorId: string): State {
  const state: State = structuredClone(previous);
  const actor = state.members.find(m => m.id === actorId) ?? fail('actor', 'Участник не найден');
  function adult() { if (actor.role !== 'parent') fail('permission', 'Это действие доступно взрослому'); }
  function record(id: string, memberId: MemberId, coins: number, xp: number, title: string) {
    if (state.ledger.some(e => e.id === id)) fail('duplicate', 'Операция уже учтена');
    const member = state.members.find(m => m.id === memberId) ?? fail('member', 'Участник не найден');
    member.coins += coins; member.xp += xp;
    state.ledger.push({ id, memberId, coins, xp, title });
    if(id.startsWith('task:')&&state.campaign) state.campaign.strength[memberId]=(state.campaign.strength[memberId]??0)+TASK_STRENGTH;
  }
  if(command.type === 'campaign.start') {
    if(state.campaign) fail('started','Приключение уже началось');
    state.campaign={hp:FIRST_BOSS_HP,strength:{},hits:[]};
  } else if(command.type === 'campaign.hit') {
    const campaign=state.campaign;
    if(!campaign) fail('campaign','Сначала начните приключение');
    if(typeof command.hitId!=='string'||!command.hitId.trim()||campaign.hits.some(h=>h.id===command.hitId)) fail('duplicate','Удар уже учтён');
    if(campaign.hp<=0) fail('defeated','Босс уже побеждён');
    const strength=campaign.strength[actorId]??0;
    if(strength<=0) fail('strength','Выполните дело, чтобы получить силу');
    const damage=Math.min(strength,campaign.hp);
    campaign.hp-=damage; campaign.strength[actorId]=strength-damage;
    campaign.hits.push({id:command.hitId,actorId,damage});
  } else if(command.type === 'member.add' || command.type === 'member.rename') {
    adult();
    if(typeof command.name !== 'string' || !command.name.trim() || command.name.trim().length > 40) fail('name','Введите имя до 40 символов');
    if(command.type === 'member.add') {
      if(typeof command.memberId !== 'string' || !/^[a-z0-9-]{1,80}$/.test(command.memberId) || state.members.some(m=>m.id===command.memberId)) fail('member','Участник уже существует или указан неверно');
      if(!['father','mother','daughter','son'].includes(command.avatar)) fail('avatar','Выберите персонажа');
      state.members.push({id:command.memberId,avatar:command.avatar,name:command.name.trim(),role:['father','mother'].includes(command.avatar)?'parent':'child',coins:0,xp:0});
      state.ownedOutfits[command.memberId]=['basic-1'];state.equippedOutfits[command.memberId]='basic-1';
    } else {
      const target=state.members.find(m=>m.id===command.memberId) ?? fail('member','Участник не найден');
      if(target.role==='parent' && target.id!==actor.id) fail('permission','Другой взрослый редактирует своё имя сам');
      target.name=command.name.trim();
    }
  } else if (command.type === 'task.create') {
    adult();
    if(typeof command.title !== 'string' || !command.title.trim() || command.title.trim().length > 100) fail('title', 'Введите название до 100 символов');
    if(typeof command.taskId !== 'string' || !command.taskId.trim() || state.tasks.some(t=>t.id===command.taskId)) fail('duplicate', 'Дело уже существует');
    if(!state.members.some(m=>m.id===command.ownerId)) fail('member', 'Выберите участника семьи');
    if(command.reviewRequired !== undefined && typeof command.reviewRequired !== 'boolean') fail('review', 'Выберите режим проверки');
    state.tasks.push({id:command.taskId,ownerId:command.ownerId,title:command.title.trim(),coins:8,xp:15,status:'todo',reviewRequired:command.reviewRequired ?? true});
  } else if ('taskId' in command) {
    const task = state.tasks.find(t => t.id === command.taskId) ?? fail('task', 'Дело не найдено');
    if (command.type === 'task.submit') {
      if (task.ownerId !== actor.id) fail('permission', 'Отправить можно только своё дело');
      if (task.status !== 'todo') fail('status', 'Дело уже отправлено');
      if(task.reviewRequired === false) { task.status = 'approved'; record(`task:${task.id}`, task.ownerId, task.coins, task.xp, task.title); }
      else task.status = 'pending';
      delete task.reviewNote;
    } else {
      if (!canReviewTask(state, actor.id, task)) fail('permission', 'Это дело должен проверить другой взрослый');
      if (task.status !== 'pending') fail('status', 'Дело не ожидает проверки');
      if (command.type === 'task.return') { task.status = 'todo'; if(command.note!==undefined&&(typeof command.note!=='string'||!command.note.trim()||command.note.length>500))fail('note','Напишите пояснение до 500 символов'); task.reviewNote = command.note?.trim() || 'Нужно немного доработать'; }
      else { task.status = 'approved'; record(`task:${task.id}`, task.ownerId, task.coins, task.xp, task.title); }
    }
  } else if ('outfitId' in command) {
    const outfit = OUTFITS.find(o => o.id === command.outfitId) ?? fail('outfit', 'Комплект не найден');
    const owned = state.ownedOutfits[actor.id];
    if (command.type === 'outfit.equip') {
      if (!owned.includes(outfit.id)) fail('ownership', 'Сначала откройте этот комплект');
      state.equippedOutfits[actor.id] = outfit.id;
    } else {
      if (owned.includes(outfit.id)) fail('owned', 'Этот комплект уже ваш');
      if (availableCoins(state, actor.id) < outfit.price) fail('funds', 'Недостаточно свободных монет');
      record(`outfit:${actor.id}:${outfit.id}`, actor.id, -outfit.price, 0, outfit.title); owned.push(outfit.id);
    }
  } else if (command.type === 'promise.request') {
    if (!command.promiseId.trim() || state.promises.some(p => p.id === command.promiseId)) fail('duplicate', 'Такой запрос уже существует');
    const offer = PROMISE_OFFERS.find(o => o.id === command.offerId) ?? fail('offer', 'Обещание не найдено');
    if (availableCoins(state, actor.id) < offer.cost) fail('funds', 'Недостаточно свободных монет');
    state.promises.push({ id: command.promiseId, ownerId: actor.id, title: offer.title, cost: offer.cost, status: 'requested' });
  } else {
    const promise = state.promises.find(p => p.id === command.promiseId) ?? fail('promise', 'Запрос не найден');
    if (command.type === 'promise.cancel') {
      if (actor.role !== 'parent' && actor.id !== promise.ownerId) fail('permission', 'Нельзя отменить чужой запрос');
      if (promise.status !== 'requested' && promise.status !== 'approved') fail('status', 'Запрос уже завершён');
      if (promise.status === 'approved') record(`refund:${promise.id}`, promise.ownerId, promise.cost, 0, `Возврат: ${promise.title}`);
      promise.status = 'cancelled';
    } else {
      adult();
      if (command.type === 'promise.approve') {
        if (promise.status !== 'requested') fail('status', 'Запрос не ожидает одобрения');
        record(`promise:${promise.id}`, promise.ownerId, -promise.cost, 0, promise.title); promise.status = 'approved';
      } else {
        if (promise.status !== 'approved') fail('status', 'Обещание ещё не одобрено');
        promise.status = 'fulfilled';
      }
    }
  }
  return state;
}
