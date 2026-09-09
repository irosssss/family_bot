import { getCatalogItem } from '../../v3/model/catalog.js';
import type { GameProjection, GameWorld, OperationResult } from '../../v3-shared/game.js';
import { CAPABILITY_SCOPES } from '../access/capabilities.js';
import type { FoundationOperation, OperationTarget } from '../access/service.js';
import { parseEntityId, parseRevision } from '../contracts/primitives.js';
import { GameError, requireGame } from './errors.js';
import type { GameCommand } from './commands.js';
import { auditWorld, find, synchronizePlayers, type GameContext } from './world.js';
import { localDate } from './calendar.js';
import { taskCommand } from './tasks.js';
import { collectionCommand } from './collection.js';
import { goalCommand } from './goals.js';
import { rewardCommand } from './rewards.js';
import { correctionCommand } from './corrections.js';

export function operationFor(world: GameWorld, ctx: GameContext, command: GameCommand): { operation: FoundationOperation; target: OperationTarget } {
  const familyId = parseEntityId(ctx.familyId);
  const family = (operation: FoundationOperation) => ({ operation, target: { familyId } });
  const self = (operation: FoundationOperation) => {
    requireGame(ctx.playerId, 'WRONG_OWNER');
    return { operation, target: { familyId, playerId: parseEntityId(ctx.playerId) } };
  };
  const review = (operation: FoundationOperation, playerId: string) => ({ operation, target: { familyId, playerId: parseEntityId(playerId) } });
  switch (command.command) {
    case 'OpenToday': return family('ReadFamily');
    case 'CreateTask': case 'UpdateTask': case 'RetireTask': case 'CancelOccurrence': return family('ManageTasks');
    case 'UpdateCalendar': case 'CreateGoal': case 'SelectFamilyGoal':
    case 'CreateRealOffer': case 'UpdateRealOffer': case 'RetireRealOffer':
    case 'PreviewCorrection': case 'CorrectSettlement': case 'RestoreCorrection':
    case 'StartAdventure': case 'SetAdventurePaused': return family('ManageFamily');
    case 'SubmitCompletion': return self('SubmitSelf');
    case 'ReviewCompletion':
      return review('ReviewChild', find(world.allocations, find(world.attempts, command.payload.attemptId).allocationId).playerId);
    case 'QuotePurchase':
      return getCatalogItem(command.payload.itemId)?.ownership === 'family' ? family('PurchaseFamilyItem') : self('PurchaseSelf');
    case 'PurchaseItem':
      return find(world.quotes, command.payload.quoteId).ownerKind === 'family' ? family('PurchaseFamilyItem') : self('PurchaseSelf');
    case 'SelectStarterEgg': return self('PurchaseSelf');
    case 'SelectAppearance': case 'SelectPetXpTarget': case 'SelectCompanion': case 'HatchPetEgg': case 'SavePetCorner': return self('SelectAppearance');
    case 'QuoteRealReward': case 'RequestRealReward': case 'CancelRealRewardRequest': case 'RequestRewardCancellation': return self('RequestRealRewardSelf');
    case 'ReviewRealReward': return review('ReviewRealRewardChild', find(world.orders, command.payload.orderId).playerId);
    case 'ResolveRewardCancellation':
      return review('ReviewRealRewardChild', find(world.orders, find(world.cancellations, command.payload.cancellationId).orderId).playerId);
    case 'CancelApprovedRealRewardByAdult': return review('CancelRealRewardChild', find(world.orders, command.payload.orderId).playerId);
    case 'ConfirmRealRewardFulfillment': return review('DeliverRealRewardChild', find(world.orders, command.payload.orderId).playerId);
  }
}
/** Pure transition: failure never mutates the supplied state. Database guard is an additional boundary. */
export function executeGame(before: GameWorld, ctx: GameContext, command: GameCommand): { world: GameWorld; result: OperationResult; changed: boolean } {
  const world = structuredClone(before);
  synchronizePlayers(world, ctx.members);
  const scope = operationFor(world, ctx, command);
  const required = {
    ReadFamily: 'family.read', ManageTasks: 'tasks.manage', ManageFamily: 'family.manage', SubmitSelf: 'completion.submit_self',
    ReviewChild: 'completion.review_child', PurchaseSelf: 'shop.purchase_self', PurchaseFamilyItem: 'shop.purchase_family_item',
    SelectAppearance: 'appearance.select_self', RequestRealRewardSelf: 'real_reward.request_self',
    ReviewRealRewardChild: 'real_reward.review_child', CancelRealRewardChild: 'real_reward.cancel_child', DeliverRealRewardChild: 'real_reward.deliver_child',
  } as const;
  const capability = required[scope.operation as keyof typeof required];
  requireGame(capability && ctx.grants.includes(capability), 'INELIGIBLE');
  const selfCategory = CAPABILITY_SCOPES[capability] === 'self' || scope.operation === 'PurchaseFamilyItem';
  if (selfCategory) requireGame(ctx.members.some(m => m.id === ctx.memberId && m.playerId === ctx.playerId && m.active && m.playerStatus === 'active'), 'INELIGIBLE');
  if (CAPABILITY_SCOPES[capability] !== 'self' && scope.operation !== 'ReadFamily') requireGame(ctx.role === 'adult' && ctx.mode === 'adult', 'INELIGIBLE');
  const result = taskCommand(world, ctx, command) ?? collectionCommand(world, ctx, command) ?? goalCommand(world, ctx, command) ??
    rewardCommand(world, ctx, command) ?? correctionCommand(world, ctx, command);
  if (!result) throw new GameError('VALIDATION');
  const changed = JSON.stringify(world) !== JSON.stringify(before);
  if (changed) world.revision = parseRevision(world.revision + 1);
  auditWorld(world);
  // History already present at the beginning of a transaction is immutable.
  requireGame(JSON.stringify(world.ledger.slice(0, before.ledger.length)) === JSON.stringify(before.ledger), 'CONFLICT');
  for (const attempt of before.attempts) {
    const next = find(world.attempts, attempt.id);
    const stable = ({ status: _status, revision: _revision, decision: _decision, ...data }: typeof attempt) => data;
    requireGame(JSON.stringify(stable(attempt)) === JSON.stringify(stable(next)) &&
      (!attempt.decision || JSON.stringify(attempt.decision) === JSON.stringify(next.decision)), 'CONFLICT');
  }
  return { world, result, changed };
}
export function projectGame(world: GameWorld, ctx: GameContext): GameProjection {
  const can = (capability: string) => ctx.role === 'adult' && ctx.mode === 'adult' && ctx.grants.includes(capability);
  const current = ctx.members.find(member => member.id === ctx.memberId);
  const selfAllowed = current?.active && ['active', 'paused'].includes(current.playerStatus ?? '');
  const ownPlayer = selfAllowed ? ctx.playerId : null;
  const ownOccurrences = new Set(world.allocations.filter(a => a.playerId === ownPlayer).map(a => a.occurrenceId));
  const childPlayers = new Set(ctx.members.filter(m => m.role === 'child').map(m => m.playerId));
  const visibleAllocations = world.allocations.filter(a => a.playerId === ownPlayer ||
    (ownOccurrences.has(a.occurrenceId) && find(world.occurrences, a.occurrenceId).assignment === 'shared') ||
    can('tasks.manage') || (can('completion.review_child') && childPlayers.has(a.playerId)));
  const visibleOccurrences = new Set(visibleAllocations.map(a => a.occurrenceId));
  const visibleTaskIds = new Set(world.occurrences.filter(o => visibleOccurrences.has(o.id)).map(o => o.taskId));
  const canSeeSettlement = (playerId: string) => playerId === ownPlayer || (can('family.manage') && childPlayers.has(playerId));
  const visibleOrders = world.orders.filter(o => o.playerId === ownPlayer ||
    (childPlayers.has(o.playerId) && ['real_reward.review_child', 'real_reward.cancel_child', 'real_reward.deliver_child'].some(can)));
  return structuredClone({
    revision: world.revision, serverTime: ctx.now, today: localDate(ctx.now, world.settings.zone), familyId: ctx.familyId,
    memberId: ctx.memberId, playerId: ctx.playerId, role: ctx.role, capabilities: [...ctx.grants],
    members: ctx.members.map(member=>{
      const p=world.progress.find(p=>p.playerId===member.playerId);
      return {...member,visual:{
        outfitItemId:world.owned.find(o=>o.id===p?.appearance.outfit)?.itemId??null,
        handItemId:world.owned.find(o=>o.id===p?.appearance.hand)?.itemId??null,
        companionSpecies:world.pets.find(pet=>pet.id===p?.companionId)?.species??null,
        companionState:world.pets.find(pet=>pet.id===p?.companionId)?.grown?'companion':'pet',
      }};
    }), settings: world.settings,
    tasks: world.tasks.filter(t => can('tasks.manage') || visibleTaskIds.has(t.id)).map(t => ({
      ...t, parts: !can('tasks.manage') && t.assignment !== 'shared' ? t.parts.filter(p => p.playerId === ownPlayer) : t.parts,
    })),
    occurrences: world.occurrences.filter(o => visibleOccurrences.has(o.id)), allocations: visibleAllocations,
    attempts: world.attempts.filter(a => {
      const playerId = find(world.allocations, a.allocationId).playerId;
      return playerId === ownPlayer || (can('completion.review_child') && childPlayers.has(playerId));
    }),
    progress: world.progress.find(p => p.playerId === ownPlayer) ?? null,
    ledger: world.ledger.filter(e => e.playerId === ownPlayer),
    settlements: world.settlements.filter(s => canSeeSettlement(s.playerId)),
    owned: world.owned.filter(o => (o.ownerKind === 'family' && o.ownerId === ctx.familyId) || (o.ownerKind === 'player' && o.ownerId === ownPlayer)),
    pets: world.pets.filter(p => p.playerId === ownPlayer), purchases: world.purchases.filter(p => p.playerId === ownPlayer),
    goals: world.goals, offers: world.offers.filter(o => can('family.manage') || o.eligiblePlayerIds.includes(ownPlayer!)),
    orders: visibleOrders, cancellations: world.cancellations.filter(c => visibleOrders.some(o => o.id === c.orderId)),
    corrections: world.corrections.filter(c => canSeeSettlement(find(world.settlements, c.settlementId).playerId)),
    adventures: world.adventures, trophies: world.trophies,
  });
}
