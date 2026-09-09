import type { GameWorld, OperationResult, RewardOrder } from '../../v3-shared/game.js';
import type { GameCommand } from './commands.js';
import { requireGame } from './errors.js';
import { activeMember, addLedger, available, expectRevision, find, own, progress, type GameContext } from './world.js';

function release(world: GameWorld, order: RewardOrder) {
  requireGame(order.reserve === 'active', 'ORDER_STATE_CONFLICT');
  const player = progress(world, order.playerId);
  player.reservedGold = (BigInt(player.reservedGold) - BigInt(order.terms.price)).toString();
  player.revision++; order.reserve = 'released';
}
const orderResult = (order: RewardOrder): OperationResult => ({ kind: 'reward_order', id: order.id, revision: order.revision });
export function rewardCommand(world: GameWorld, ctx: GameContext, command: GameCommand): OperationResult | null {
  switch (command.command) {
    case 'CreateRealOffer':
    case 'UpdateRealOffer': {
      const p = command.payload;
      for (const playerId of p.eligiblePlayerIds) requireGame(activeMember(ctx, playerId).role === 'child', 'INELIGIBLE');
      if ('offerId' in p) {
        const offer = find(world.offers, p.offerId);
        expectRevision(offer.revision, p.expectedRevision);
        requireGame(offer.active, 'INELIGIBLE');
        Object.assign(offer, structuredClone({ title: p.title, promise: p.promise, fulfillmentTerms: p.fulfillmentTerms, price: p.price, eligiblePlayerIds: p.eligiblePlayerIds }));
        offer.revision++;
        return { kind: 'real_offer', id: offer.id, revision: offer.revision };
      }
      const offer = { ...structuredClone(p), id: ctx.id(), revision: 1, active: true };
      world.offers.push(offer);
      return { kind: 'real_offer', id: offer.id, revision: offer.revision };
    }
    case 'RetireRealOffer': {
      const p = command.payload, offer = find(world.offers, p.offerId);
      if (offer.active) { expectRevision(offer.revision, p.expectedRevision); offer.active = false; offer.revision++; }
      return { kind: 'real_offer', id: offer.id, revision: offer.revision };
    }
    case 'QuoteRealReward': {
      const offer = find(world.offers, command.payload.offerId);
      requireGame(ctx.role === 'child' && offer.active && offer.eligiblePlayerIds.includes(ctx.playerId!), 'INELIGIBLE');
      const quote = { id: ctx.id(), playerId: ctx.playerId!, offerId: offer.id, offerRevision: offer.revision,
        expiresAt: new Date(new Date(ctx.now).getTime() + 5 * 60000).toISOString(),
        terms: { title: offer.title, promise: offer.promise, fulfillmentTerms: offer.fulfillmentTerms, price: offer.price } };
      world.rewardQuotes.push(quote);
      return { kind: 'reward_quote', id: quote.id, revision: quote.offerRevision, details: { ...quote } };
    }
    case 'RequestRealReward': {
      const p = command.payload, quote = find(world.rewardQuotes, p.quoteId);
      own(quote.playerId, ctx); requireGame(ctx.role === 'child', 'INELIGIBLE');
      const prior = world.orders.find(order => order.quoteId === quote.id);
      if (prior) return orderResult(prior);
      requireGame(quote.expiresAt > ctx.now, 'QUOTE_EXPIRED');
      const offer = find(world.offers, quote.offerId);
      requireGame(offer.revision === quote.offerRevision && offer.revision === p.expectedOfferRevision && offer.active, 'OFFER_CHANGED');
      requireGame(offer.eligiblePlayerIds.includes(quote.playerId), 'INELIGIBLE');
      requireGame(!world.orders.some(o => o.playerId === quote.playerId && o.offerId === offer.id && o.reserve === 'active'), 'ACTIVE_ORDER_EXISTS');
      const player = progress(world, quote.playerId);
      requireGame(available(player) >= BigInt(quote.terms.price), 'INSUFFICIENT_GOLD');
      const order: RewardOrder = {
        id: ctx.id(), revision: 1, quoteId: quote.id, playerId: quote.playerId, offerId: offer.id, terms: structuredClone(quote.terms),
        status: 'pending_approval', reserve: 'active', requestedAt: ctx.now, decidedAt: null, decisionBy: null, decisionReason: null,
        deliveredAt: null, deliveredBy: null, deliveryNote: null, history: [],
      };
      world.orders.push(order); player.reservedGold = (BigInt(player.reservedGold) + BigInt(order.terms.price)).toString(); player.revision++;
      return orderResult(order);
    }
    case 'ReviewRealReward': {
      const p = command.payload, order = find(world.orders, p.orderId);
      const prior = order.history.find(h => h.kind === 'approve' || h.kind === 'reject');
      if (prior) {
        requireGame(prior.kind === p.decision && prior.reason === p.reason, 'ORDER_STATE_CONFLICT');
        return orderResult(order);
      }
      expectRevision(order.revision, p.expectedRevision);
      requireGame(order.status === 'pending_approval', 'ORDER_STATE_CONFLICT');
      requireGame(p.decision !== 'reject' || p.reason !== null, 'VALIDATION');
      order.status = p.decision === 'approve' ? 'approved_awaiting_delivery' : 'rejected';
      order.decidedAt = ctx.now; order.decisionBy = ctx.memberId; order.decisionReason = p.reason; order.revision++;
      order.history.push({ kind: p.decision, actorId: ctx.memberId, reason: p.reason, at: ctx.now });
      if (p.decision === 'reject') release(world, order);
      return orderResult(order);
    }
    case 'CancelRealRewardRequest': {
      const p = command.payload, order = find(world.orders, p.orderId); own(order.playerId, ctx);
      if (order.history.some(h => h.kind === 'cancel_pending')) return orderResult(order);
      expectRevision(order.revision, p.expectedRevision);
      requireGame(order.status === 'pending_approval', 'ORDER_STATE_CONFLICT');
      release(world, order); order.status = 'cancelled'; order.revision++;
      order.history.push({ kind: 'cancel_pending', actorId: ctx.memberId, reason: null, at: ctx.now });
      return orderResult(order);
    }
    case 'RequestRewardCancellation': {
      const p = command.payload, order = find(world.orders, p.orderId); own(order.playerId, ctx);
      const predecessorId = p.continuation.kind === 'first' ? null : p.continuation.declinedCancellationId;
      const prior = world.cancellations.find(c => c.orderId === order.id && c.predecessorId === predecessorId);
      if (prior) {
        requireGame(prior.reason === p.reason, 'CANCELLATION_CONTENT_CONFLICT');
        return { kind: 'cancellation', id: prior.id, revision: prior.revision };
      }
      expectRevision(order.revision, p.expectedRevision);
      requireGame(order.status === 'approved_awaiting_delivery', 'ORDER_STATE_CONFLICT');
      const last = world.cancellations.filter(c => c.orderId === order.id).at(-1);
      requireGame(predecessorId ? last?.id === predecessorId && last.status === 'declined' : !last, 'DECLINED_CANCELLATION_NOT_CURRENT');
      const cancellation = { id: ctx.id(), orderId: order.id, predecessorId, revision: 1, reason: p.reason, status: 'pending' as const,
        requestedAt: ctx.now, requestedBy: ctx.memberId, decidedBy: null, decidedAt: null, decisionReason: null };
      world.cancellations.push(cancellation); order.revision++;
      return { kind: 'cancellation', id: cancellation.id, revision: cancellation.revision };
    }
    case 'ResolveRewardCancellation': {
      const p = command.payload, cancellation = find(world.cancellations, p.cancellationId), order = find(world.orders, cancellation.orderId);
      const resulting = p.decision === 'approve' ? 'approved' : 'declined';
      if (cancellation.status !== 'pending') {
        requireGame(cancellation.status === resulting && cancellation.decisionReason === p.reason, 'ORDER_STATE_CONFLICT');
        return { kind: 'cancellation', id: cancellation.id, revision: cancellation.revision };
      }
      expectRevision(cancellation.revision, p.expectedRevision);
      requireGame(order.status === 'approved_awaiting_delivery' && order.reserve === 'active', 'ORDER_STATE_CONFLICT');
      requireGame(p.decision !== 'decline' || p.reason !== null, 'VALIDATION');
      cancellation.status = resulting; cancellation.decidedBy = ctx.memberId; cancellation.decidedAt = ctx.now; cancellation.decisionReason = p.reason; cancellation.revision++;
      order.revision++;
      if (p.decision === 'approve') {
        release(world, order); order.status = 'cancelled';
        order.history.push({ kind: 'cancel_resolved', actorId: ctx.memberId, reason: p.reason, at: ctx.now });
      }
      return { kind: 'cancellation', id: cancellation.id, revision: cancellation.revision };
    }
    case 'CancelApprovedRealRewardByAdult': {
      const p = command.payload, order = find(world.orders, p.orderId);
      const prior = order.history.find(h => h.kind === 'cancel_adult');
      if (prior) { requireGame(prior.reason === p.reason, 'ORDER_STATE_CONFLICT'); return orderResult(order); }
      expectRevision(order.revision, p.expectedRevision);
      requireGame(order.status === 'approved_awaiting_delivery', order.status === 'delivered' ? 'REWARD_ALREADY_DELIVERED' : 'ORDER_STATE_CONFLICT');
      const pending = world.cancellations.find(c => c.orderId === order.id && c.status === 'pending');
      if (pending) {
        pending.status = 'approved'; pending.decidedBy = ctx.memberId; pending.decidedAt = ctx.now;
        pending.decisionReason = p.reason; pending.revision++;
      }
      release(world, order); order.status = 'cancelled'; order.revision++;
      order.history.push({ kind: 'cancel_adult', actorId: ctx.memberId, reason: p.reason, at: ctx.now });
      return orderResult(order);
    }
    case 'ConfirmRealRewardFulfillment': {
      const p = command.payload, order = find(world.orders, p.orderId);
      if (order.status === 'delivered') { requireGame(order.deliveryNote === p.note, 'ORDER_STATE_CONFLICT'); return orderResult(order); }
      expectRevision(order.revision, p.expectedRevision);
      requireGame(order.status === 'approved_awaiting_delivery' && order.reserve === 'active', 'ORDER_STATE_CONFLICT');
      requireGame(!world.cancellations.some(c => c.orderId === order.id && c.status === 'pending'), 'CANCELLATION_PENDING');
      const player = progress(world, order.playerId);
      player.reservedGold = (BigInt(player.reservedGold) - BigInt(order.terms.price)).toString();
      player.revision++; order.reserve = 'captured';
      addLedger(world, ctx, { playerId: order.playerId, kind: 'gold', delta: (-BigInt(order.terms.price)).toString(),
        causeKey: `real-delivery:${order.id}`, settlementId: null, originalEntryId: null, goalId: null, petId: null, adventureId: null, performedOn: null });
      order.status = 'delivered'; order.deliveredBy = ctx.memberId; order.deliveredAt = ctx.now; order.deliveryNote = p.note; order.revision++;
      order.history.push({ kind: 'deliver', actorId: ctx.memberId, reason: p.note, at: ctx.now });
      return orderResult(order);
    }
    default: return null;
  }
}
