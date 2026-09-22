import { describe, expect, it } from 'vitest';
import { applyCommand, availableCoins, createInitialState, DomainError, reservedCoins } from '../src/v3/domain';

describe('V3 local synthetic interaction model', () => {
  it('grants a free first outfit to every member with personal balances', () => {
    const s = createInitialState();
    for (const m of s.members) expect(s.ownedOutfits[m.id]).toEqual(['basic-1']);
    const purchased = applyCommand(s, { type: 'outfit.buy', outfitId: 'basic-2' }, 'mother');
    expect(availableCoins(purchased, 'mother')).toBe(52);
    expect(availableCoins(purchased, 'father')).toBe(100);
    expect(s.members.find(m => m.id === 'mother')?.coins).toBe(100);
    expect(() => applyCommand(purchased, { type: 'outfit.buy', outfitId: 'basic-2' }, 'mother')).toThrow(DomainError);
    expect(() => applyCommand(purchased, { type: 'outfit.equip', outfitId: 'seasonal-1' }, 'mother')).toThrow(DomainError);
    expect(applyCommand(purchased, { type: 'outfit.equip', outfitId: 'basic-2' }, 'mother').equippedOutfits.mother).toBe('basic-2');
  });
  it('requires another adult and credits only the task owner once', () => {
    const pending = applyCommand(createInitialState(), { type: 'task.submit', taskId: 'father-1' }, 'father');
    expect(() => applyCommand(pending, { type: 'task.approve', taskId: 'father-1' }, 'father')).toThrow(DomainError);
    expect(() => applyCommand(pending, { type: 'task.approve', taskId: 'father-1' }, 'son')).toThrow(DomainError);
    const done = applyCommand(pending, { type: 'task.approve', taskId: 'father-1' }, 'mother');
    expect(availableCoins(done, 'father')).toBe(108);
    expect(done.members.find(m => m.id === 'father')?.xp).toBe(48);
    expect(availableCoins(done, 'mother')).toBe(100);
    expect(() => applyCommand(done, { type: 'task.approve', taskId: 'father-1' }, 'mother')).toThrow(DomainError);
    expect(done.ledger).toHaveLength(1);
  });
  it('sole adult still needs separate submit and approve actions', () => {
    const initial = createInitialState({ soloAdult: true });
    expect(() => applyCommand(initial, { type: 'task.approve', taskId: 'father-1' }, 'father')).toThrow(DomainError);
    const pending = applyCommand(initial, { type: 'task.submit', taskId: 'father-1' }, 'father');
    expect(availableCoins(pending, 'father')).toBe(100);
    expect(availableCoins(applyCommand(pending, { type: 'task.approve', taskId: 'father-1' }, 'father'), 'father')).toBe(108);
  });
  it('returns work without reward and forbids submitting someone else’s task', () => {
    const s = createInitialState();
    expect(() => applyCommand(s, { type: 'task.submit', taskId: 'son-1' }, 'daughter')).toThrow(DomainError);
    const pending = applyCommand(s, { type: 'task.submit', taskId: 'son-1' }, 'son');
    const returned = applyCommand(pending, { type: 'task.return', taskId: 'son-1' }, 'mother');
    expect(returned.tasks.find(t => t.id === 'son-1')?.status).toBe('todo');
    expect(returned.ledger).toHaveLength(0);
  });
  it('reserves money, prevents overspend, debits on approval, fulfills without second debit', () => {
    const requested = applyCommand(createInitialState(), { type: 'promise.request', promiseId: 'p1', offerId: 'family-walk' }, 'daughter');
    expect(reservedCoins(requested, 'daughter')).toBe(120);
    expect(availableCoins(requested, 'daughter')).toBe(112);
    expect(() => applyCommand(requested, { type: 'outfit.buy', outfitId: 'seasonal-1' }, 'daughter')).toThrow(DomainError);
    const approved = applyCommand(requested, { type: 'promise.approve', promiseId: 'p1' }, 'mother');
    expect(availableCoins(approved, 'daughter')).toBe(112);
    expect(reservedCoins(approved, 'daughter')).toBe(0);
    expect(() => applyCommand(approved, { type: 'promise.approve', promiseId: 'p1' }, 'father')).toThrow(DomainError);
    const fulfilled = applyCommand(approved, { type: 'promise.fulfill', promiseId: 'p1' }, 'father');
    expect(availableCoins(fulfilled, 'daughter')).toBe(112);
    expect(fulfilled.ledger).toHaveLength(1);
  });
  it('releases a reservation or refunds a debit exactly once', () => {
    const requested = applyCommand(createInitialState(), { type: 'promise.request', promiseId: 'p1', offerId: 'family-walk' }, 'daughter');
    const released = applyCommand(requested, { type: 'promise.cancel', promiseId: 'p1' }, 'daughter');
    expect(availableCoins(released, 'daughter')).toBe(232);
    expect(released.ledger).toHaveLength(0);
    const approved = applyCommand(requested, { type: 'promise.approve', promiseId: 'p1' }, 'mother');
    const refunded = applyCommand(approved, { type: 'promise.cancel', promiseId: 'p1' }, 'mother');
    expect(availableCoins(refunded, 'daughter')).toBe(232);
    expect(refunded.ledger).toHaveLength(2);
    expect(() => applyCommand(refunded, { type: 'promise.cancel', promiseId: 'p1' }, 'father')).toThrow(DomainError);
  });
  it('rejects duplicate request IDs and child approval without mutating input', () => {
    const s = applyCommand(createInitialState(), { type: 'promise.request', promiseId: 'p1', offerId: 'family-walk' }, 'daughter');
    const before = JSON.stringify(s);
    expect(() => applyCommand(s, { type: 'promise.request', promiseId: 'p1', offerId: 'movie-night' }, 'son')).toThrow(DomainError);
    expect(() => applyCommand(s, { type: 'promise.approve', promiseId: 'p1' }, 'daughter')).toThrow(DomainError);
    expect(JSON.stringify(s)).toBe(before);
  });
});

it('allows an adult to create a personal task and preserves return feedback',()=>{
 let s=createInitialState();
 const cmd={type:'task.create',taskId:'new-task',ownerId:'son',title:' Убрать книги '} as const;
 expect(()=>applyCommand(s,cmd,'son')).toThrow();
 s=applyCommand(s,cmd,'mother');
 expect(s.tasks.find(t=>t.id==='new-task')?.title).toBe('Убрать книги');
 expect(()=>applyCommand(s,cmd,'father')).toThrow();
 s=applyCommand(s,{type:'task.submit',taskId:'new-task'},'son');
 s=applyCommand(s,{type:'task.return',taskId:'new-task',note:'На полу остались две книги'},'father');
 expect(s.tasks.find(t=>t.id==='new-task')?.reviewNote).toBe('На полу остались две книги');
 expect(availableCoins(s,'son')).toBe(100);
 s=applyCommand(s,{type:'task.submit',taskId:'new-task'},'son');
 s=applyCommand(s,{type:'task.approve',taskId:'new-task'},'mother');
 expect(availableCoins(s,'son')).toBe(108);
});

it('awards an unchecked task once on completion, without a reviewer',()=>{
 let s=createInitialState();
 s=applyCommand(s,{type:'task.create',taskId:'unchecked',ownerId:'son',title:'Сложить книги',reviewRequired:false},'father');
 expect(()=>applyCommand(s,{type:'task.submit',taskId:'unchecked'},'daughter')).toThrow();
 s=applyCommand(s,{type:'task.submit',taskId:'unchecked'},'son');
 expect(s.tasks.find(t=>t.id==='unchecked')?.status).toBe('approved');
 expect(availableCoins(s,'son')).toBe(108);
 expect(s.members.find(m=>m.id==='son')?.xp).toBe(39);
 expect(()=>applyCommand(s,{type:'task.submit',taskId:'unchecked'},'son')).toThrow();
 expect(()=>applyCommand(s,{type:'task.approve',taskId:'unchecked'},'father')).toThrow();
 expect(s.ledger).toHaveLength(1);
});
it('keeps review on by default and rejects a malformed review mode',()=>{
 const command={type:'task.create',taskId:'checked',ownerId:'father',title:'Ужин'} as const;
 let s=applyCommand(createInitialState(),command,'mother');
 expect(s.tasks.find(t=>t.id==='checked')?.reviewRequired).toBe(true);
 s=applyCommand(s,{type:'task.submit',taskId:'checked'},'father');
 expect(availableCoins(s,'father')).toBe(100);
 expect(()=>applyCommand(s,{...command,taskId:'bad',reviewRequired:'false'} as never,'mother')).toThrow();
});

it('adds multiple independent profiles with a free outfit and applies edit permissions',()=>{
 let s=createInitialState();
 const add={type:'member.add',memberId:'test-child',name:'Тест',avatar:'son'} as const;
 expect(()=>applyCommand(s,add,'daughter')).toThrow();
 s=applyCommand(s,add,'mother');
 expect(s.ownedOutfits['test-child']).toEqual(['basic-1']);
 expect(availableCoins(s,'test-child')).toBe(0);
 s=applyCommand(s,{type:'member.add',memberId:'second-child',name:'Другой',avatar:'son'},'mother');
 s=applyCommand(s,{type:'member.rename',memberId:'test-child',name:' Новое имя '},'father');
 expect(s.members.find(m=>m.id==='test-child')?.name).toBe('Новое имя');
 expect(s.members.find(m=>m.id==='second-child')?.name).toBe('Другой');
 expect(()=>applyCommand(s,{type:'member.rename',memberId:'father',name:'Подмена'},'mother')).toThrow();
 s=applyCommand(s,{type:'task.create',taskId:'new-member-task',ownerId:'test-child',title:'Книги',reviewRequired:false},'father');
 s=applyCommand(s,{type:'task.submit',taskId:'new-member-task'},'test-child');
 expect(availableCoins(s,'test-child')).toBe(8);
 expect(availableCoins(s,'son')).toBe(100);
});
