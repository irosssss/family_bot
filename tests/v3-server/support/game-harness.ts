import { CAPABILITY_SCOPES } from '../../../src/v3-server/access/capabilities.js';
import { newEntityId } from '../../../src/v3-server/foundation/ids.js';
import { parseGameCommand, type GameCommand } from '../../../src/v3-server/game/commands.js';
import { executeGame } from '../../../src/v3-server/game/engine.js';
import { emptyWorld, synchronizePlayers, type GameContext } from '../../../src/v3-server/game/world.js';
import { localDate } from '../../../src/v3-server/game/calendar.js';
import type { Difficulty, GameWorld, PublicMember } from '../../../src/v3-shared/game.js';

export function gameHarness() {
  const familyId = newEntityId();
  const members: PublicMember[] = ['adult', 'child'].map(role => ({ id: newEntityId(), playerId: newEntityId(),
    name: role === 'adult' ? 'Взрослый фикстуры' : 'Ребёнок фикстуры', role: role as 'adult' | 'child', active: true, playerStatus: 'active' }));
  let world = emptyWorld(), now = '2026-09-09T10:00:00.000Z';
  synchronizePlayers(world, members);
  const member = (role: 'adult' | 'child') => members.find(m => m.role === role)!;
  const context = (role: 'adult' | 'child'): GameContext => ({
    familyId, memberId: member(role).id, playerId: member(role).playerId!, role, mode: role === 'adult' ? 'adult' : 'own_child',
    grants: Object.keys(CAPABILITY_SCOPES).filter(cap => role === 'adult' || CAPABILITY_SCOPES[cap as keyof typeof CAPABILITY_SCOPES] === 'self' || cap === 'family.read'),
    members, now, id: newEntityId,
  });
  const run = (role: 'adult' | 'child', command: GameCommand['command'], payload: object = {}) => {
    const parsed = parseGameCommand(JSON.stringify({ contract: 'family_life_v3.commands', version: '0.1', command, idempotencyKey: newEntityId(), payload }));
    const next = executeGame(world, context(role), parsed); world = next.world; return next.result;
  };
  const create = (role: 'adult' | 'child', difficulty: Difficulty = 'normal', scheduleKind: 'once' | 'daily' = 'once') => {
    const result = run('adult', 'CreateTask', { title: 'Проверяемое дело', description: 'Условия до работы', assignment: 'individual',
      parts: [{ playerId: member(role).playerId, difficulty, label: 'Моя часть' }],
      schedule: { kind: scheduleKind, startsOn: localDate(now, world.settings.zone), weekdays: [] } });
    return world.allocations.find(a => world.occurrences.find(o => o.id === a.occurrenceId)?.taskId === result.id)!;
  };
  const submit = (role: 'adult' | 'child', allocationId: string) => {
    const allocation = world.allocations.find(a => a.id === allocationId)!;
    return run(role, 'SubmitCompletion', { allocationId, expectedRevision: allocation.revision,
      performedOn: localDate(now, world.settings.zone), note: null, continuation: { kind: 'first' } });
  };
  const complete = (role: 'adult' | 'child', difficulty: Difficulty = 'epic') => {
    const allocation = create(role, difficulty), attempt = submit(role, allocation.id);
    if (role === 'child') run('adult', 'ReviewCompletion', { attemptId: attempt.id, expectedRevision: 1, decision: 'accept', reason: null });
    return world.settlements.find(s => s.allocationId === allocation.id)!;
  };
  const offer = (price: string) => run('adult', 'CreateRealOffer', { title: 'Семейное занятие', promise: 'Ребёнок выбирает занятие',
    fulfillmentTerms: 'В удобный для семьи день', price, eligiblePlayerIds: [member('child').playerId] });
  const order = (price: string) => {
    const configured = offer(price);
    const quote = run('child', 'QuoteRealReward', { offerId: configured.id });
    return run('child', 'RequestRealReward', { quoteId: quote.id, expectedOfferRevision: quote.revision });
  };
  return { run, create, submit, complete, offer, order, context, member, members, familyId,
    get world() { return world; }, setWorld(value: GameWorld) { world = value; }, setNow(value: string) { now = value; } };
}
