import type { CorrectionPlan, GameWorld, OperationResult, Settlement } from '../../v3-shared/game.js';
import type { GameCommand } from './commands.js';
import { requireGame } from './errors.js';
import { canonical } from './canonical.js';
import { addLedger, available, expectRevision, find, progress, type GameContext } from './world.js';

function plan(world: GameWorld, settlement: Settlement): CorrectionPlan[] {
  const spendable = available(progress(world, settlement.playerId));
  return settlement.effectIds.map(id => {
    const entry = find(world.ledger, id), total = BigInt(entry.delta);
    const applied = entry.kind === 'gold' && spendable < total ? spendable : total;
    return { entryId: id, kind: entry.kind, applied: applied.toString(), waived: (total - applied).toString() };
  });
}
export function correctionCommand(world: GameWorld, ctx: GameContext, command: GameCommand): OperationResult | null {
  const allowed = (settlement: Settlement) => requireGame(settlement.playerId === ctx.playerId ||
    ctx.members.some(m => m.playerId === settlement.playerId && m.role === 'child'), 'INELIGIBLE');
  switch (command.command) {
    case 'PreviewCorrection': {
      const p = command.payload, settlement = find(world.settlements, p.settlementId);
      allowed(settlement);
      requireGame(!settlement.correctionId, 'ALREADY_CORRECTED');
      const preview = { id: ctx.id(), settlementId: settlement.id, reason: p.reason, plan: plan(world, settlement),
        expiresAt: new Date(new Date(ctx.now).getTime() + 5 * 60000).toISOString() };
      world.correctionPreviews.push(preview);
      return { kind: 'correction_preview', id: preview.id, revision: settlement.revision, details: { ...preview } };
    }
    case 'CorrectSettlement': {
      const p = command.payload, preview = find(world.correctionPreviews, p.previewId), settlement = find(world.settlements, preview.settlementId);
      allowed(settlement);
      const prior = world.corrections.find(c => c.previewId === preview.id);
      if (prior) return { kind: 'correction', id: prior.id, revision: prior.revision };
      requireGame(!settlement.correctionId, 'ALREADY_CORRECTED');
      expectRevision(settlement.revision, p.expectedRevision);
      requireGame(preview.expiresAt > ctx.now && canonical(preview.plan) === canonical(plan(world, settlement)), 'CORRECTION_CHANGED');
      const correctionId = ctx.id(), effectIds: string[] = [];
      for (const part of preview.plan) {
        const original = find(world.ledger, part.entryId);
        const id = addLedger(world, ctx, {
          playerId: original.playerId, kind: original.kind, delta: (-BigInt(part.applied)).toString(),
          causeKey: `correction:${correctionId}:${original.id}`, settlementId: settlement.id, originalEntryId: original.id,
          goalId: original.goalId, petId: original.petId, adventureId: original.adventureId, performedOn: original.performedOn,
        });
        if (id) effectIds.push(id);
      }
      const correction = { id: correctionId, settlementId: settlement.id, previewId: preview.id, revision: 1, reason: preview.reason,
        plan: structuredClone(preview.plan), effectIds, status: 'applied' as const, createdAt: ctx.now, restoredAt: null, restoreReason: null };
      world.corrections.push(correction); settlement.correctionId = correctionId; settlement.revision++;
      return { kind: 'correction', id: correctionId, revision: correction.revision };
    }
    case 'RestoreCorrection': {
      const p = command.payload, correction = find(world.corrections, p.correctionId);
      allowed(find(world.settlements, correction.settlementId));
      if (correction.status === 'restored') {
        requireGame(correction.restoreReason === p.reason, 'ALREADY_RESTORED');
        return { kind: 'correction', id: correction.id, revision: correction.revision };
      }
      expectRevision(correction.revision, p.expectedRevision);
      for (const effectId of correction.effectIds) {
        const original = find(world.ledger, effectId);
        addLedger(world, ctx, {
          playerId: original.playerId, kind: original.kind, delta: (-BigInt(original.delta)).toString(),
          causeKey: `restoration:${correction.id}:${effectId}`, settlementId: original.settlementId, originalEntryId: effectId,
          goalId: original.goalId, petId: original.petId, adventureId: original.adventureId, performedOn: original.performedOn,
        });
      }
      correction.status = 'restored'; correction.restoredAt = ctx.now; correction.restoreReason = p.reason; correction.revision++;
      return { kind: 'correction', id: correction.id, revision: correction.revision };
    }
    default: return null;
  }
}
