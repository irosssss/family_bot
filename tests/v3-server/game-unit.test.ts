import { describe, expect, it } from 'vitest';
import { gameHarness } from './support/game-harness.js';
import { auditWorld, progress } from '../../src/v3-server/game/world.js';
import { projectGame } from '../../src/v3-server/game/engine.js';
import { dayBounds } from '../../src/v3-server/game/calendar.js';
import { parseGameCommand } from '../../src/v3-server/game/commands.js';
import { newEntityId } from '../../src/v3-server/foundation/ids.js';

describe('V3 complete free-cycle transitions', () => {
  it('stops binding new work to a completed goal while preserving older work and its unique milestone',()=>{
    const h=gameHarness();
    const goal=h.run('adult','CreateGoal',{title:'Общий вечер',plannedDays:1,roster:[{playerId:h.member('adult').playerId,dailyNorm:1}]});
    const old=h.create('adult');
    for(let i=0;i<3;i++)h.complete('adult');
    const completed=h.world.goals.find(g=>g.id===goal.id)!;expect(completed.milestoneId).toBeTruthy();
    const milestone=completed.milestoneId,earned=BigInt(completed.earned);
    const fresh=h.create('adult');expect(h.world.occurrences.find(o=>o.id===fresh.occurrenceId)?.goalId).toBeNull();
    h.submit('adult',fresh.id);expect(h.world.goals[0].earned).toBe(String(earned));
    h.submit('adult',old.id);expect(BigInt(h.world.goals[0].earned)).toBeGreaterThan(earned);expect(h.world.goals[0].milestoneId).toBe(milestone);
    const next=h.run('adult','CreateGoal',{title:'Следующий вечер',plannedDays:1,roster:[{playerId:h.member('adult').playerId,dailyNorm:1}]});
    const nextWork=h.create('adult');expect(h.world.occurrences.find(o=>o.id===nextWork.occurrenceId)?.goalId).toBe(next.id);auditWorld(h.world);
  });
  it('mixed shared work conserves its explicit budget and never rewards the reviewer', () => {
    const h = gameHarness();
    h.run('adult', 'CreateTask', { title: 'Общий стол', description: '', assignment: 'shared',
      parts: [{ playerId: h.member('adult').playerId, difficulty: 'easy', label: 'Приборы' }, { playerId: h.member('child').playerId, difficulty: 'hard', label: 'Посуда' }],
      schedule: { kind: 'once', startsOn: '2026-09-09', weekdays: [] } });
    const adult = h.world.allocations.find(a => a.role === 'adult')!, child = h.world.allocations.find(a => a.role === 'child')!;
    expect(h.world.occurrences[0].budget).toEqual({ heroXp: '35', gold: '18', familyContribution: '7', petXp: '0' });
    h.submit('adult', adult.id); const attempt = h.submit('child', child.id);
    expect(progress(h.world, child.playerId).postedGold).toBe('0');
    expect(progress(h.world, adult.playerId).postedGold).toBe('3');
    h.run('adult', 'ReviewCompletion', { attemptId: attempt.id, expectedRevision: 1, decision: 'accept', reason: null });
    h.run('adult', 'ReviewCompletion', { attemptId: attempt.id, expectedRevision: 1, decision: 'accept', reason: null });
    h.submit('adult', adult.id);
    expect(h.world.settlements).toHaveLength(2);
    expect(progress(h.world, adult.playerId).postedGold).toBe('3');
    expect(progress(h.world, child.playerId).postedGold).toBe('15');
    expect(h.world.occurrences[0].status).toBe('complete');
    auditWorld(h.world);
  });
  it('return/resubmit keeps the original attempt and rejects changed first-submit content', () => {
    const h = gameHarness(), allocation = h.create('child');
    const first = h.submit('child', allocation.id);
    h.run('adult', 'ReviewCompletion', { attemptId: first.id, expectedRevision: 1, decision: 'return', reason: 'Нужно закончить часть' });
    expect(h.submit('child', allocation.id).id).toBe(first.id);
    const before = JSON.stringify(h.world);
    expect(() => h.run('child', 'SubmitCompletion', { allocationId: allocation.id, expectedRevision: 3, performedOn: '2026-09-09', note: 'Другая версия', continuation: { kind: 'first' } }))
      .toThrow('другими данными');
    expect(JSON.stringify(h.world)).toBe(before);
    const revision = h.world.allocations[0].revision;
    const second = h.run('child', 'SubmitCompletion', { allocationId: allocation.id, expectedRevision: revision, performedOn: '2026-09-09', note: 'Доделано',
      continuation: { kind: 'after_return', returnedAttemptId: first.id } });
    h.run('adult', 'ReviewCompletion', { attemptId: second.id, expectedRevision: 1, decision: 'accept', reason: null });
    expect(h.world.attempts).toHaveLength(2);
    expect(h.world.attempts[0].decision?.reason).toBe('Нужно закончить часть');
    expect(h.world.settlements).toHaveLength(1);
  });
  it('cannot partially cancel shared work while a submitted part is pending', () => {
    const h = gameHarness(), a = h.create('child'), attempt = h.submit('child', a.id);
    const before = JSON.stringify(h.world), occurrence = h.world.occurrences[0];
    expect(() => h.run('adult', 'CancelOccurrence', { occurrenceId: occurrence.id, expectedRevision: occurrence.revision, reason: 'Планы изменились' })).toThrow('Сначала проверьте');
    expect(JSON.stringify(h.world)).toBe(before);
    h.run('adult', 'ReviewCompletion', { attemptId: attempt.id, expectedRevision: 1, decision: 'return', reason: 'Вернули перед отменой' });
    h.run('adult', 'CancelOccurrence', { occurrenceId: occurrence.id, expectedRevision: h.world.occurrences[0].revision, reason: 'Планы изменились' });
    expect(h.world.allocations[0].status).toBe('cancelled');
    expect(h.world.ledger).toHaveLength(0);
  });
  it('definition edits and repeated opening never rewrite or duplicate today’s promise', () => {
    const h = gameHarness(); h.create('child', 'easy', 'daily');
    const task = h.world.tasks[0], oldOccurrence = structuredClone(h.world.occurrences[0]);
    h.run('adult', 'UpdateTask', { taskId: task.id, expectedRevision: task.revision, title: 'Новое название', description: '', assignment: 'individual',
      parts: [{ ...task.parts[0], difficulty: 'epic' }], schedule: task.schedule });
    h.run('child', 'OpenToday'); h.run('child', 'OpenToday');
    expect(h.world.occurrences).toHaveLength(1);
    expect(h.world.occurrences[0]).toEqual(oldOccurrence);
    h.setNow('2026-09-10T10:00:00.000Z'); h.run('child', 'OpenToday');
    expect(h.world.occurrences).toHaveLength(2);
    expect(h.world.occurrences[1].budget.gold).toBe('30');
    expect(h.world.occurrences[0].budget.gold).toBe('3');
  });
  it('rotating assignments advance when opened, independent of the previous completion', () => {
    const h = gameHarness();
    h.run('adult', 'CreateTask', { title: 'Полить цветок', description: '', assignment: 'rotation',
      parts: h.members.map(m => ({ playerId: m.playerId, difficulty: 'easy', label: 'Полить' })),
      schedule: { kind: 'daily', startsOn: '2026-09-09', weekdays: [] } });
    expect(h.world.allocations[0].playerId).toBe(h.member('adult').playerId);
    h.setNow('2026-09-10T10:00:00.000Z'); h.run('child', 'OpenToday');
    expect(h.world.allocations[1].playerId).toBe(h.member('child').playerId);
    expect(h.world.allocations[0].status).toBe('open');
  });
  it('shared work with an inactive participant opens no partial replacement budget', () => {
    const h = gameHarness();
    h.run('adult', 'CreateTask', { title: 'Совместная работа', description: '', assignment: 'shared',
      parts: h.members.map(m => ({ playerId: m.playerId, difficulty: 'easy', label: 'Часть' })),
      schedule: { kind: 'daily', startsOn: '2026-09-09', weekdays: [] } });
    h.member('child').playerStatus = 'paused'; h.setNow('2026-09-10T10:00:00.000Z'); h.run('adult', 'OpenToday');
    expect(h.world.occurrences).toHaveLength(1);
    expect(h.world.allocations).toHaveLength(2);
  });
  it('late review uses the original goal and frozen rewards even after the participant leaves', () => {
    const h = gameHarness();
    const originalGoal = h.run('adult', 'CreateGoal', { title: 'Первый вечер', plannedDays: 1, roster: [{ playerId: h.member('child').playerId, dailyNorm: 1 }] });
    const a = h.create('child', 'epic'), attempt = h.submit('child', a.id);
    h.run('adult', 'CreateGoal', { title: 'Второй вечер', plannedDays: 1, roster: [{ playerId: h.member('adult').playerId, dailyNorm: 1 }] });
    h.member('child').active = false; h.member('child').playerStatus = 'left'; h.setNow('2026-12-09T10:00:00.000Z');
    h.run('adult', 'ReviewCompletion', { attemptId: attempt.id, expectedRevision: 1, decision: 'accept', reason: null });
    expect(h.world.goals.find(g => g.id === originalGoal.id)?.earned).toBe('12');
    expect(h.world.goals[1].earned).toBe('0');
    expect(h.world.settlements[0].performedOn).toBe('2026-09-09');
    expect(progress(h.world, a.playerId).postedGold).toBe('30');
  });
  it('submission date/window rejection is atomic while a pending review has no expiry', () => {
    const h = gameHarness(), a = h.create('child');
    const before = JSON.stringify(h.world);
    expect(() => h.run('child', 'SubmitCompletion', { allocationId: a.id, expectedRevision: 1, performedOn: '2026-09-10', note: null, continuation: { kind: 'first' } })).toThrow('день выполнения');
    expect(JSON.stringify(h.world)).toBe(before);
    h.setNow('2026-10-01T10:00:00.000Z');
    expect(() => h.submit('child', a.id)).toThrow('день выполнения');
    expect(h.world.attempts).toHaveLength(0);
  });
  it('timezone changes cannot reopen an already seen calendar day', () => {
    const h = gameHarness(); h.create('child', 'easy', 'daily');
    h.run('adult', 'UpdateCalendar', { zone: 'America/Los_Angeles', lateDays: 14, expectedRevision: h.world.settings.revision });
    h.setNow('2026-09-09T22:00:00.000Z'); h.run('child', 'OpenToday');
    expect(h.world.settings.zone).toBe('America/Los_Angeles');
    expect(h.world.occurrences).toHaveLength(1);
    h.setNow('2026-09-10T12:00:00.000Z'); h.run('child', 'OpenToday');
    expect(h.world.occurrences).toHaveLength(2);
    expect(h.world.periods[1].startsAt >= h.world.periods[0].endsAt).toBe(true);
  });
  it.each([['2026-03-29T12:00:00.000Z', 23], ['2026-10-25T12:00:00.000Z', 25]] as const)('calendar handles DST on %s', (now, hours) => {
    const bounds = dayBounds(now, 'Europe/Berlin');
    expect((Date.parse(bounds.endsAt) - Date.parse(bounds.startsAt)) / 3600000).toBe(hours);
  });
  it('free starter choice is permanent; only new work gives XP to the selected egg', () => {
    const h = gameHarness();
    expect(() => h.run('child', 'SelectStarterEgg', { itemId: 'v3.egg.starter-cat' })).toThrow('первого принятого');
    const old = h.create('child', 'epic'); h.complete('child');
    const pet = h.run('child', 'SelectStarterEgg', { itemId: 'v3.egg.starter-cat' });
    expect(h.run('child', 'SelectStarterEgg', { itemId: 'v3.egg.starter-cat' }).id).toBe(pet.id);
    expect(() => h.run('child', 'SelectStarterEgg', { itemId: 'v3.egg.starter-dog' })).toThrow('уже выбран');
    h.run('child', 'SelectPetXpTarget', { petId: pet.id, expectedRevision: progress(h.world, old.playerId).revision });
    const attempt = h.submit('child', old.id); h.run('adult', 'ReviewCompletion', { attemptId: attempt.id, expectedRevision: 1, decision: 'accept', reason: null });
    expect(h.world.pets[0].xp).toBe('0');
    for (let i = 0; i < 7; i++) h.complete('child');
    const balance = progress(h.world, old.playerId).postedGold;
    h.run('child', 'HatchPetEgg', { petId: pet.id, expectedRevision: h.world.pets[0].revision });
    h.run('child', 'HatchPetEgg', { petId: pet.id, expectedRevision: 1 });
    expect(h.world.pets[0].corner).not.toBeNull();
    expect(progress(h.world, old.playerId).postedGold).toBe(balance);
  });
  it('purchase/equip are distinct and permanent ownership blocks a second debit', () => {
    const h = gameHarness(); for (let i = 0; i < 4; i++) h.complete('child');
    const first = h.run('child', 'QuotePurchase', { itemId: 'v3.outfit.traveler' }), second = h.run('child', 'QuotePurchase', { itemId: 'v3.outfit.traveler' });
    const purchase = h.run('child', 'PurchaseItem', { quoteId: first.id, expectedOfferRevision: 1 });
    expect(progress(h.world, h.member('child').playerId).appearance.outfit).toBeNull();
    h.run('child', 'SelectAppearance', { slot: 'outfit', ownedItemId: h.world.owned[0].id, expectedRevision: progress(h.world, h.member('child').playerId).revision });
    expect(h.run('child', 'PurchaseItem', { quoteId: first.id, expectedOfferRevision: 1 }).id).toBe(purchase.id);
    expect(() => h.run('child', 'PurchaseItem', { quoteId: second.id, expectedOfferRevision: 1 })).toThrow('уже получен');
    expect(progress(h.world, h.member('child').playerId).postedGold).toBe('60');
  });
  it('family purchase spends the adult personal wallet and children cannot buy it', () => {
    const h = gameHarness(); for (let i = 0; i < 8; i++) h.complete('adult');
    expect(() => h.run('child', 'QuotePurchase', { itemId: 'v3.home.reading-lamp' })).toThrow();
    const quote = h.run('adult', 'QuotePurchase', { itemId: 'v3.home.reading-lamp' });
    h.run('adult', 'PurchaseItem', { quoteId: quote.id, expectedOfferRevision: 1 });
    expect(h.world.owned[0].ownerId).toBe(h.familyId);
    expect(progress(h.world, h.member('adult').playerId).postedGold).toBe('0');
  });
  it('reserve competes with a purchase, persists after approval and debits once on delivery', () => {
    const h = gameHarness(); for (let i = 0; i < 4; i++) h.complete('child');
    const order = h.order('100'), quote = h.run('child', 'QuotePurchase', { itemId: 'v3.outfit.traveler' });
    expect(() => h.run('child', 'PurchaseItem', { quoteId: quote.id, expectedOfferRevision: 1 })).toThrow('Недостаточно');
    h.run('adult', 'ReviewRealReward', { orderId: order.id, expectedRevision: 1, decision: 'approve', reason: null });
    expect(progress(h.world, h.member('child').playerId).reservedGold).toBe('100');
    h.run('adult', 'ConfirmRealRewardFulfillment', { orderId: order.id, expectedRevision: 2, note: 'Провели занятие' });
    h.run('adult', 'ConfirmRealRewardFulfillment', { orderId: order.id, expectedRevision: 2, note: 'Провели занятие' });
    expect(progress(h.world, h.member('child').playerId)).toMatchObject({ postedGold: '20', reservedGold: '0' });
    expect(h.world.ledger.filter(e => e.causeKey.startsWith('real-delivery:'))).toHaveLength(1);
  });
  it('cancelled quote replay never creates a new reservation or refund entry', () => {
    const h = gameHarness(); h.complete('child'); const order = h.order('20'), quoteId = h.world.orders[0].quoteId;
    h.run('child', 'CancelRealRewardRequest', { orderId: order.id, expectedRevision: 1 });
    const ledgerLength = h.world.ledger.length;
    expect(h.run('child', 'RequestRealReward', { quoteId, expectedOfferRevision: 1 }).id).toBe(order.id);
    expect(h.world.orders).toHaveLength(1);
    expect(progress(h.world, h.member('child').playerId)).toMatchObject({ postedGold: '30', reservedGold: '0' });
    expect(h.world.ledger).toHaveLength(ledgerLength);
  });
  it('pending cancellation blocks delivery; decline and explicit continuation keep the history', () => {
    const h = gameHarness(); h.complete('child'); const order = h.order('20');
    h.run('adult', 'ReviewRealReward', { orderId: order.id, expectedRevision: 1, decision: 'approve', reason: null });
    const first = h.run('child', 'RequestRewardCancellation', { orderId: order.id, expectedRevision: 2, reason: 'Выберу позже', continuation: { kind: 'first' } });
    expect(() => h.run('adult', 'ConfirmRealRewardFulfillment', { orderId: order.id, expectedRevision: 3, note: null })).toThrow('решить запрос отмены');
    h.run('adult', 'ResolveRewardCancellation', { cancellationId: first.id, expectedRevision: 1, decision: 'decline', reason: 'Обсудим время' });
    expect(h.run('child', 'RequestRewardCancellation', { orderId: order.id, expectedRevision: 2, reason: 'Выберу позже', continuation: { kind: 'first' } }).id).toBe(first.id);
    h.run('child', 'RequestRewardCancellation', { orderId: order.id, expectedRevision: h.world.orders[0].revision, reason: 'Решили отменить',
      continuation: { kind: 'after_decline', declinedCancellationId: first.id } });
    h.run('adult', 'CancelApprovedRealRewardByAdult', { orderId: order.id, expectedRevision: h.world.orders[0].revision, reason: 'Не получится выполнить обещание' });
    expect(h.world.cancellations.map(c => c.status)).toEqual(['declined', 'approved']);
    expect(h.world.orders[0].history.map(v => v.kind)).toEqual(['approve', 'cancel_adult']);
    expect(progress(h.world, h.member('child').playerId).reservedGold).toBe('0');
  });
  it('a correction protects reservations and ownership; restore returns only applied, never waived Gold', () => {
    const h = gameHarness(), initial = h.complete('child'); h.complete('child'); h.complete('child');
    const quote = h.run('child', 'QuotePurchase', { itemId: 'v3.outfit.traveler' }); h.run('child', 'PurchaseItem', { quoteId: quote.id, expectedOfferRevision: 1 });
    h.order('22');
    const preview = h.run('adult', 'PreviewCorrection', { settlementId: initial.id, reason: 'Приняли ошибочно' });
    const correction = h.run('adult', 'CorrectSettlement', { previewId: preview.id, expectedRevision: 1 });
    expect(h.world.corrections[0].plan.find(p => p.kind === 'gold')).toMatchObject({ applied: '8', waived: '22' });
    expect(progress(h.world, h.member('child').playerId)).toMatchObject({ postedGold: '22', reservedGold: '22' });
    expect(h.world.owned).toHaveLength(1);
    h.run('adult', 'RestoreCorrection', { correctionId: correction.id, expectedRevision: 1, reason: 'Проверили повторно' });
    h.run('adult', 'RestoreCorrection', { correctionId: correction.id, expectedRevision: 1, reason: 'Проверили повторно' });
    expect(progress(h.world, h.member('child').playerId)).toMatchObject({ postedGold: '30', reservedGold: '22' });
  });
  it('goal/adventure trophies remain unique after correction below target and restoration', () => {
    const h = gameHarness();
    h.run('adult', 'CreateGoal', { title: 'Общий вечер', plannedDays: 1, roster: [{ playerId: h.member('child').playerId, dailyNorm: 13 }] });
    h.run('adult', 'StartAdventure', { title: 'Туман над тропой', roster: [h.member('child').playerId], plannedDays: 1 });
    const first = h.complete('child'); h.complete('child');
    expect(h.world.trophies).toHaveLength(2);
    const preview = h.run('adult', 'PreviewCorrection', { settlementId: first.id, reason: 'Ошибка' });
    const correction = h.run('adult', 'CorrectSettlement', { previewId: preview.id, expectedRevision: 1 });
    expect(h.world.goals[0].earned).toBe('12'); expect(h.world.adventures[0].status).toBe('won');
    h.run('adult', 'RestoreCorrection', { correctionId: correction.id, expectedRevision: 1, reason: 'Верный результат' });
    expect(h.world.trophies).toHaveLength(2);
  });
  it('private projections exclude another player’s wallet, ledger and completion note', () => {
    const h = gameHarness(); h.complete('adult'); h.complete('child');
    h.complete('adult');
    const quote=h.run('adult','QuotePurchase',{itemId:'v3.outfit.traveler'});
    h.run('adult','PurchaseItem',{quoteId:quote.id,expectedOfferRevision:1});
    const adult=progress(h.world,h.member('adult').playerId);
    h.run('adult','SelectAppearance',{slot:'outfit',ownedItemId:h.world.owned[0].id,expectedRevision:adult.revision});
    const projection = projectGame(h.world, h.context('child'));
    expect(projection.progress?.playerId).toBe(h.member('child').playerId);
    expect(projection.ledger.every(e => e.playerId === h.member('child').playerId)).toBe(true);
    expect(projection.attempts.every(a => h.world.allocations.find(v => v.id === a.allocationId)?.playerId === h.member('child').playerId)).toBe(true);
    expect(projection.members.find(m=>m.id===h.member('adult').id)?.visual).toEqual({outfitItemId:'v3.outfit.traveler',handItemId:null,companionSpecies:null,companionState:'pet'});
    expect(projection.owned.some(o=>o.ownerId===h.member('adult').playerId)).toBe(false);
    h.member('child').playerStatus = 'left';
    expect(projectGame(h.world, h.context('child')).progress).toBeNull();
  });
  it('wire commands reject privileged and monetary injection before a transition', () => {
    for (const payload of [{ itemId: 'v3.outfit.traveler', price: '0' }, { itemId: 'v3.outfit.traveler', actor: {} }, { itemId: 'v3.outfit.traveler', ownerKind: 'family' }]) {
      expect(() => parseGameCommand(JSON.stringify({ contract: 'family_life_v3.commands', version: '0.1', command: 'QuotePurchase', idempotencyKey: newEntityId(), payload }))).toThrow();
    }
  });
});
