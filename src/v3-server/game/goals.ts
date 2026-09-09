import type { GameWorld, OperationResult } from '../../v3-shared/game.js';
import type { GameCommand } from './commands.js';
import { BALANCE_POLICY_V01 } from '../../v3/model/balance.js';
import { requireGame } from './errors.js';
import { activeMember, expectRevision, find, type GameContext } from './world.js';

export function goalCommand(world: GameWorld, ctx: GameContext, command: GameCommand): OperationResult | null {
  switch (command.command) {
    case 'CreateGoal': {
      const p = command.payload;
      requireGame(new Set(p.roster.map(m => m.playerId)).size === p.roster.length, 'VALIDATION');
      p.roster.forEach(m => activeMember(ctx, m.playerId));
      world.goals.forEach(g => { if (g.active) { g.active = false; g.revision++; } });
      const goal = { id: ctx.id(), revision: 1, title: p.title, roster: structuredClone(p.roster), plannedDays: p.plannedDays,
        target: (p.roster.reduce((sum, m) => sum + BigInt(m.dailyNorm), 0n) * BigInt(p.plannedDays)).toString(),
        earned: '0', active: true, milestoneId: null, createdAt: ctx.now };
      world.goals.push(goal); world.settings.revision++;
      return { kind: 'goal', id: goal.id, revision: goal.revision };
    }
    case 'SelectFamilyGoal': {
      const p = command.payload;
      expectRevision(world.settings.revision, p.expectedSettingsRevision);
      if (p.goalId) find(world.goals, p.goalId);
      world.goals.forEach(goal => {
        const active = goal.id === p.goalId;
        if (goal.active !== active) { goal.active = active; goal.revision++; }
      });
      world.settings.revision++;
      return { kind: 'goal', id: p.goalId, revision: world.settings.revision };
    }
    case 'StartAdventure': {
      const p = command.payload;
      requireGame(!world.adventures.some(a => a.status !== 'won'), 'ACTIVE_ADVENTURE_EXISTS');
      p.roster.forEach(playerId => activeMember(ctx, playerId));
      const adventure = { id: ctx.id(), revision: 1, title: p.title, roster: [...p.roster],
        target: (BigInt(p.roster.length) * BigInt(BALANCE_POLICY_V01.family.defaultDailyContributionNorm) * BigInt(p.plannedDays)).toString(),
        damage: '0', status: 'active' as const, trophyId: null, createdAt: ctx.now };
      world.adventures.push(adventure);
      return { kind: 'adventure', id: adventure.id, revision: adventure.revision };
    }
    case 'SetAdventurePaused': {
      const p = command.payload, adventure = find(world.adventures, p.adventureId);
      expectRevision(adventure.revision, p.expectedRevision);
      requireGame(adventure.status !== 'won', 'CLOSED');
      adventure.status = p.paused ? 'paused' : 'active'; adventure.revision++;
      return { kind: 'adventure', id: adventure.id, revision: adventure.revision };
    }
    default: return null;
  }
}
