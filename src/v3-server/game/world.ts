import type { GameWorld, Id, LedgerEntry, PlayerProgress, PublicMember, Reward } from '../../v3-shared/game.js';
import { BALANCE_POLICY_V01, getTaskReward, type DifficultyV01 } from '../../v3/model/balance.js';
import { parseInt as parseDelta, parseUInt } from '../contracts/primitives.js';
import { GameError, requireGame } from './errors.js';

export type GameContext = {
  familyId: Id; memberId: Id; playerId: Id | null; role: 'adult' | 'child'; mode: 'adult' | 'own_child' | 'managed_child';
  grants: string[]; members: PublicMember[]; now: string; id: () => Id;
};
export const REGISTERED_POLICY = Object.freeze({ id: 'family-life-v3.free-cycle', revision: 1, source: BALANCE_POLICY_V01.id });
export function emptyWorld(): GameWorld {
  return {
    version: 1, revision: 1, settings: { zone: 'Europe/Moscow', lateDays: 14, revision: 1, pendingZone: null, zoneEffectiveAt: null },
    periods: [], tasks: [], occurrences: [], allocations: [], attempts: [], settlements: [], ledger: [], progress: [],
    owned: [], pets: [], quotes: [], purchases: [], goals: [], offers: [], rewardQuotes: [], orders: [], cancellations: [],
    correctionPreviews: [], corrections: [], adventures: [], trophies: [],
  };
}
export function synchronizePlayers(world: GameWorld, members: PublicMember[]) {
  for (const member of members) if (member.playerId && !world.progress.some(p => p.playerId === member.playerId)) {
    world.progress.push({ playerId: member.playerId, revision: 1, heroXp: '0', postedGold: '0', reservedGold: '0',
      starterEligible: false, starterPetId: null, petTargetId: null, companionId: null, appearance: { outfit: null, hand: null } });
  }
}
export function find<T extends { id: Id }>(items: T[], id: Id): T {
  const item = items.find(value => value.id === id);
  requireGame(item, 'NOT_FOUND'); return item;
}
export function progress(world: GameWorld, playerId: Id | null): PlayerProgress {
  const player = world.progress.find(value => value.playerId === playerId);
  requireGame(player, 'WRONG_OWNER'); return player;
}
export function available(player: PlayerProgress): bigint { return BigInt(player.postedGold) - BigInt(player.reservedGold); }
export function expectRevision(actual: number, expected: number) { requireGame(actual === expected, 'CONFLICT'); }
export function own(playerId: Id, ctx: GameContext) { requireGame(playerId === ctx.playerId, 'WRONG_OWNER'); }
export function activeMember(ctx: GameContext, playerId: Id) {
  const member = ctx.members.find(m => m.playerId === playerId);
  requireGame(member?.active && member.playerStatus === 'active', 'INELIGIBLE'); return member;
}
export function rewardFor(difficulty: DifficultyV01, petId: Id | null): Reward {
  const value = getTaskReward(difficulty);
  return { heroXp: String(value.heroXp), gold: String(value.gold), familyContribution: String(value.familyContribution), petXp: petId ? String(value.petXp) : '0' };
}
export function sumRewards(rewards: Reward[]): Reward {
  const sum = (key: keyof Reward) => parseUInt(rewards.reduce((total, reward) => total + BigInt(reward[key]), 0n).toString());
  return { heroXp: sum('heroXp'), gold: sum('gold'), familyContribution: sum('familyContribution'), petXp: sum('petXp') };
}
export function addLedger(world: GameWorld, ctx: GameContext, input: Omit<LedgerEntry, 'id' | 'postedAt'>): Id | null {
  const delta = BigInt(parseDelta(input.delta));
  if (delta === 0n) return null;
  requireGame(!world.ledger.some(entry => entry.causeKey === input.causeKey), 'CONFLICT');
  const player = progress(world, input.playerId);
  const add = (current: string) => parseUInt((BigInt(current) + delta).toString());
  if (input.kind === 'gold') {
    requireGame(BigInt(player.postedGold) + delta >= BigInt(player.reservedGold), 'INSUFFICIENT_GOLD');
    player.postedGold = add(player.postedGold);
  } else if (input.kind === 'hero_xp') player.heroXp = add(player.heroXp);
  else if (input.kind === 'pet_xp') {
    const pet = find(world.pets, input.petId!);
    requireGame(pet.playerId === input.playerId, 'WRONG_OWNER');
    pet.xp = add(pet.xp); pet.revision++;
    if (pet.hatched && BigInt(pet.xp) >= BigInt(BALANCE_POLICY_V01.pet.hatchXp + BALANCE_POLICY_V01.pet.firstGrowthAdditionalXp)) pet.grown = true;
  } else if (input.kind === 'family_contribution' && input.goalId) {
    const goal = find(world.goals, input.goalId); goal.earned = add(goal.earned); goal.revision++;
    if (!goal.milestoneId && BigInt(goal.earned) >= BigInt(goal.target)) {
      goal.milestoneId = ctx.id();
      world.trophies.push({ id: goal.milestoneId, kind: 'goal', sourceId: goal.id, title: goal.title, earnedAt: ctx.now });
    }
  } else if (input.kind === 'adventure_damage' && input.adventureId) {
    const adventure = find(world.adventures, input.adventureId); adventure.damage = add(adventure.damage); adventure.revision++;
    if (!adventure.trophyId && BigInt(adventure.damage) >= BigInt(adventure.target)) {
      adventure.trophyId = ctx.id(); adventure.status = 'won';
      world.trophies.push({ id: adventure.trophyId, kind: 'adventure', sourceId: adventure.id, title: adventure.title, earnedAt: ctx.now });
    }
  }
  player.revision++;
  const id = ctx.id(); world.ledger.push({ ...input, id, postedAt: ctx.now }); return id;
}
/** Validate conservation at persistence, not only in individual command branches. */
export function auditWorld(world: GameWorld) {
  const unique = (values: string[]) => requireGame(new Set(values).size === values.length, 'CONFLICT');
  unique(world.ledger.map(e => e.causeKey));
  unique(world.settlements.map(s => s.allocationId));
  unique(world.attempts.map(a => `${a.allocationId}:${a.predecessorId ?? 'first'}`));
  unique(world.owned.map(o => `${o.ownerKind}:${o.ownerId}:${o.itemId}`));
  unique(world.purchases.map(p => p.quoteId));
  unique(world.orders.map(o => o.quoteId));
  unique(world.trophies.map(t => `${t.kind}:${t.sourceId}`));
  unique(world.cancellations.filter(c => c.status === 'pending').map(c => c.orderId));
  unique(world.orders.filter(o => o.reserve === 'active').map(o => `${o.playerId}:${o.offerId}`));
  for (const player of world.progress) {
    const gold = world.ledger.filter(e => e.playerId === player.playerId && e.kind === 'gold').reduce((sum, e) => sum + BigInt(e.delta), 0n);
    const reserved = world.orders.filter(o => o.playerId === player.playerId && o.reserve === 'active').reduce((sum, o) => sum + BigInt(o.terms.price), 0n);
    const xp = world.ledger.filter(e => e.playerId === player.playerId && e.kind === 'hero_xp').reduce((sum, e) => sum + BigInt(e.delta), 0n);
    requireGame(gold === BigInt(player.postedGold) && reserved === BigInt(player.reservedGold) && gold >= reserved && xp === BigInt(player.heroXp), 'CONFLICT');
    parseUInt(player.postedGold); parseUInt(player.reservedGold); parseUInt(player.heroXp);
  }
  for (const order of world.orders) {
    requireGame((['pending_approval', 'approved_awaiting_delivery'].includes(order.status) && order.reserve === 'active') ||
      (['rejected', 'cancelled'].includes(order.status) && order.reserve === 'released') ||
      (order.status === 'delivered' && order.reserve === 'captured'), 'CONFLICT');
  }
  for (const pet of world.pets) requireGame(BigInt(pet.xp) === world.ledger.filter(e => e.kind === 'pet_xp' && e.petId === pet.id).reduce((sum,e) => sum + BigInt(e.delta),0n), 'CONFLICT');
  for (const goal of world.goals) requireGame(BigInt(goal.earned) === world.ledger.filter(e => e.kind === 'family_contribution' && e.goalId === goal.id).reduce((sum,e) => sum + BigInt(e.delta),0n), 'CONFLICT');
  for (const adventure of world.adventures) requireGame(BigInt(adventure.damage) === world.ledger.filter(e => e.kind === 'adventure_damage' && e.adventureId === adventure.id).reduce((sum,e) => sum + BigInt(e.delta),0n), 'CONFLICT');
  for (const occurrence of world.occurrences) {
    const sum = sumRewards(occurrence.allocationIds.map(id => find(world.allocations, id).reward));
    requireGame((Object.keys(sum) as (keyof Reward)[]).every(key => sum[key] === occurrence.budget[key]), 'CONFLICT');
  }
  if (world.goals.filter(g => g.active).length > 1 || world.adventures.filter(a => a.status !== 'won').length > 1) throw new GameError('CONFLICT');
}
