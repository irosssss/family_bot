import { createHash } from 'node:crypto';
import type { Allocation, Attempt, GameWorld, OperationResult, TaskDefinition } from '../../v3-shared/game.js';
import type { GameCommand } from './commands.js';
import { addDays, currentPeriod, localDate, weekday } from './calendar.js';
import { requireGame } from './errors.js';
import { activeMember, addLedger, expectRevision, find, own, progress, REGISTERED_POLICY, rewardFor, sumRewards, type GameContext } from './world.js';

function materialize(world: GameWorld, ctx: GameContext) {
  const period = currentPeriod(world, ctx.now, ctx.id);
  for (const task of world.tasks) {
    if (task.status !== 'active' || task.schedule.startsOn > period.date ||
      (task.schedule.kind === 'weekly' && !task.schedule.weekdays.includes(weekday(period.date))) ||
      world.occurrences.some(o => o.taskId === task.id && (task.schedule.kind === 'once' || o.period.id === period.id || o.scheduledFor >= period.date))) continue;
    // Paused/left participants do not acquire new work. Historical shares remain untouched.
    const eligible = task.parts.filter(part => ctx.members.some(m => m.playerId === part.playerId && m.active && m.playerStatus === 'active'));
    if (eligible.length === 0 || (task.assignment === 'shared' && eligible.length !== task.parts.length)) continue;
    const groups = task.assignment === 'shared' ? [eligible] : task.assignment === 'rotation'
      ? [[eligible[task.rotationIndex % eligible.length]]] : eligible.map(part => [part]);
    const goalId = world.goals.find(goal => goal.active && !goal.milestoneId)?.id ?? null;
    const adventure = world.adventures.find(value => value.status === 'active');
    for (const parts of groups) {
      const occurrenceId = ctx.id();
      const allocations: Allocation[] = parts.map(part => {
        const member = activeMember(ctx, part.playerId);
        const petId = progress(world, part.playerId).petTargetId;
        return { id: ctx.id(), occurrenceId, playerId: part.playerId, memberId: member.id, role: member.role,
          label: part.label, difficulty: part.difficulty, petId, reward: rewardFor(part.difficulty, petId),
          revision: 1, status: 'open', latestAttemptId: null };
      });
      world.allocations.push(...allocations);
      world.occurrences.push({
        id: occurrenceId, taskId: task.id, taskRevision: task.revision, revision: 1, title: task.title, description: task.description,
        assignment: task.assignment, period: structuredClone(period), scheduledFor: period.date, openedAt: ctx.now,
        submissionThrough: addDays(period.date, world.settings.lateDays), goalId,
        adventureId: adventure?.id ?? null, policyRevision: REGISTERED_POLICY.revision, budget: sumRewards(allocations.map(a => a.reward)),
        allocationIds: allocations.map(a => a.id), status: 'open', cancellationReason: null,
      });
    }
    if (task.assignment === 'rotation') task.rotationIndex++;
  }
  return period;
}
function settle(world: GameWorld, allocation: Allocation, attempt: Attempt, ctx: GameContext) {
  const prior = world.settlements.find(s => s.allocationId === allocation.id);
  if (prior) return prior;
  const occurrence = find(world.occurrences, allocation.occurrenceId);
  const settlementId = ctx.id();
  const adventure = occurrence.adventureId ? find(world.adventures, occurrence.adventureId) : null;
  const adventureId = adventure?.roster.includes(allocation.playerId) ? adventure.id : null;
  const settlement = {
    id: settlementId, allocationId: allocation.id, attemptId: attempt.id, playerId: allocation.playerId,
    performedOn: attempt.performedOn, acceptedAt: ctx.now, reward: { ...allocation.reward },
    goalId: occurrence.goalId, petId: allocation.petId, adventureId, effectIds: [] as string[], correctionId: null, revision: 1,
  };
  world.settlements.push(settlement);
  const effects = [
    ['hero_xp', allocation.reward.heroXp], ['gold', allocation.reward.gold],
    ['family_contribution', allocation.reward.familyContribution], ['pet_xp', allocation.reward.petXp],
    ...(adventureId ? [['adventure_damage', allocation.reward.familyContribution]] : []),
  ] as const;
  for (const [kind, delta] of effects) {
    const effectId = addLedger(world, ctx, {
      playerId: allocation.playerId, kind: kind as 'gold' | 'hero_xp' | 'family_contribution' | 'pet_xp' | 'adventure_damage',
      delta, causeKey: `initial:${allocation.id}:${kind}`, settlementId, originalEntryId: null,
      goalId: occurrence.goalId, petId: allocation.petId, adventureId, performedOn: attempt.performedOn,
    });
    if (effectId) settlement.effectIds.push(effectId);
  }
  progress(world, allocation.playerId).starterEligible = true;
  allocation.status = 'settled'; allocation.revision++;
  if (occurrence.allocationIds.every(id => ['settled', 'cancelled'].includes(find(world.allocations, id).status))) occurrence.status = 'complete';
  occurrence.revision++;
  return settlement;
}
export function taskCommand(world: GameWorld, ctx: GameContext, command: GameCommand): OperationResult | null {
  switch (command.command) {
    case 'OpenToday': {
      const period = materialize(world, ctx);
      return { kind: 'period', id: period.id, revision: period.revision };
    }
    case 'UpdateCalendar': {
      const p = command.payload;
      expectRevision(world.settings.revision, p.expectedRevision);
      const period = currentPeriod(world, ctx.now, ctx.id);
      world.settings.lateDays = p.lateDays; world.settings.revision++;
      world.settings.pendingZone = p.zone === world.settings.zone ? null : p.zone;
      world.settings.zoneEffectiveAt = world.settings.pendingZone ? period.endsAt : null;
      return { kind: 'calendar', id: null, revision: world.settings.revision };
    }
    case 'CreateTask':
    case 'UpdateTask': {
      const p = command.payload;
      requireGame(new Set(p.parts.map(part => part.playerId)).size === p.parts.length, 'VALIDATION');
      p.parts.forEach(part => activeMember(ctx, part.playerId));
      requireGame(new Set(p.schedule.weekdays).size === p.schedule.weekdays.length, 'VALIDATION');
      requireGame(p.schedule.kind === 'weekly' ? p.schedule.weekdays.length > 0 : p.schedule.weekdays.length === 0, 'VALIDATION');
      let task: TaskDefinition;
      if ('taskId' in p) {
        task = find(world.tasks, p.taskId);
        expectRevision(task.revision, p.expectedRevision);
        requireGame(task.status === 'active', 'CLOSED');
        Object.assign(task, structuredClone({ title: p.title, description: p.description, parts: p.parts, schedule: p.schedule, assignment: p.assignment }));
        task.revision++;
      } else {
        requireGame(p.schedule.startsOn >= localDate(ctx.now, world.settings.zone), 'VALIDATION');
        task = { ...structuredClone(p), id: ctx.id(), revision: 1, status: 'active', rotationIndex: 0 };
        world.tasks.push(task);
      }
      materialize(world, ctx);
      return { kind: 'task', id: task.id, revision: task.revision };
    }
    case 'RetireTask': {
      const p = command.payload, task = find(world.tasks, p.taskId);
      if (task.status !== 'retired') { expectRevision(task.revision, p.expectedRevision); task.status = 'retired'; task.revision++; }
      return { kind: 'task', id: task.id, revision: task.revision };
    }
    case 'SubmitCompletion': {
      const p = command.payload, allocation = find(world.allocations, p.allocationId);
      own(allocation.playerId, ctx);
      requireGame(allocation.role === ctx.role, 'INELIGIBLE');
      const predecessorId = p.continuation.kind === 'first' ? null : p.continuation.returnedAttemptId;
      const digest = createHash('sha256').update(JSON.stringify({ performedOn: p.performedOn, note: p.note, predecessorId })).digest('hex');
      const prior = world.attempts.find(a => a.allocationId === allocation.id && a.predecessorId === predecessorId);
      if (prior) {
        requireGame(prior.digest === digest, 'SUBMISSION_CONTENT_CONFLICT');
        return { kind: 'attempt', id: prior.id, revision: prior.revision };
      }
      const occurrence = find(world.occurrences, allocation.occurrenceId);
      requireGame(occurrence.status === 'open', 'CLOSED');
      expectRevision(allocation.revision, p.expectedRevision);
      requireGame(predecessorId ? allocation.status === 'returned' && allocation.latestAttemptId === predecessorId &&
        find(world.attempts, predecessorId).status === 'returned' : allocation.status === 'open', 'RETURNED_ATTEMPT_NOT_CURRENT');
      const today = localDate(ctx.now, occurrence.period.zone);
      requireGame(p.performedOn >= localDate(occurrence.openedAt, occurrence.period.zone) &&
        p.performedOn <= today && today <= occurrence.submissionThrough, 'INVALID_PERFORMED_ON');
      const attempt: Attempt = {
        id: ctx.id(), allocationId: allocation.id, predecessorId, performedOn: p.performedOn, note: p.note,
        submittedAt: ctx.now, submittedBy: ctx.memberId, digest, revision: 1, status: 'submitted', decision: null,
      };
      world.attempts.push(attempt); allocation.latestAttemptId = attempt.id; allocation.status = 'submitted'; allocation.revision++;
      occurrence.revision++;
      if (allocation.role === 'adult') {
        attempt.status = 'accepted';
        attempt.decision = { kind: 'adult_self_trusted', actorMemberId: ctx.memberId, result: 'accept', reason: null, decidedAt: ctx.now };
        settle(world, allocation, attempt, ctx);
      }
      return { kind: 'attempt', id: attempt.id, revision: attempt.revision };
    }
    case 'ReviewCompletion': {
      const p = command.payload, attempt = find(world.attempts, p.attemptId), allocation = find(world.allocations, attempt.allocationId);
      requireGame(ctx.role === 'adult' && ctx.mode === 'adult' && allocation.role === 'child' && allocation.memberId !== ctx.memberId, 'INELIGIBLE');
      if (attempt.decision) {
        requireGame(attempt.decision.result === p.decision && attempt.decision.reason === p.reason, 'ATTEMPT_ALREADY_DECIDED');
        return { kind: 'attempt', id: attempt.id, revision: attempt.revision };
      }
      expectRevision(attempt.revision, p.expectedRevision);
      requireGame(attempt.status === 'submitted' && allocation.latestAttemptId === attempt.id, 'CONFLICT');
      requireGame(p.decision !== 'return' || p.reason !== null, 'VALIDATION');
      attempt.status = p.decision === 'accept' ? 'accepted' : 'returned'; attempt.revision++;
      attempt.decision = { kind: 'manual_child_review', actorMemberId: ctx.memberId, result: p.decision, reason: p.reason, decidedAt: ctx.now };
      if (p.decision === 'accept') settle(world, allocation, attempt, ctx);
      else { allocation.status = 'returned'; allocation.revision++; find(world.occurrences, allocation.occurrenceId).revision++; }
      return { kind: 'attempt', id: attempt.id, revision: attempt.revision };
    }
    case 'CancelOccurrence': {
      const p = command.payload, occurrence = find(world.occurrences, p.occurrenceId);
      if (occurrence.status === 'cancelled') {
        requireGame(occurrence.cancellationReason === p.reason, 'CONFLICT');
        return { kind: 'occurrence', id: occurrence.id, revision: occurrence.revision };
      }
      expectRevision(occurrence.revision, p.expectedRevision);
      const parts = occurrence.allocationIds.map(id => find(world.allocations, id));
      requireGame(!parts.some(part => part.status === 'submitted'), 'PENDING_REVIEW_EXISTS');
      requireGame(parts.some(part => part.status === 'open' || part.status === 'returned'), 'CLOSED');
      for (const part of parts) if (part.status !== 'settled') { part.status = 'cancelled'; part.revision++; }
      occurrence.status = 'cancelled'; occurrence.cancellationReason = p.reason; occurrence.revision++;
      return { kind: 'occurrence', id: occurrence.id, revision: occurrence.revision };
    }
    default: return null;
  }
}
