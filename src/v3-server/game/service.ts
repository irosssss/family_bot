import { createHash } from 'node:crypto';
import type { GameResponse, GameWorld, OperationResult, PublicMember } from '../../v3-shared/game.js';
import type { createAccessService, VerifiedActor } from '../access/service.js';
import type { V3Transaction } from '../db/client.js';
import { newEntityId } from '../foundation/ids.js';
import { parseInstant } from '../contracts/primitives.js';
import { V3Error } from '../contracts/errors.js';
import { parseGameCommand } from './commands.js';
import { canonical } from './canonical.js';
import { executeGame, operationFor, projectGame } from './engine.js';
import { auditWorld, emptyWorld, synchronizePlayers, type GameContext } from './world.js';
import { GameError, requireGame } from './errors.js';

type AccessPort = Pick<ReturnType<typeof createAccessService>, 'withOperation' | 'withResolvedOperation'>;
type Clock = (tx: V3Transaction) => Promise<string>;
const databaseClock: Clock = async tx => (await tx`select clock_timestamp() as now`)[0].now.toISOString();

async function context(tx: V3Transaction, actor: VerifiedActor, clock: Clock): Promise<GameContext> {
  const rows = await tx`select m.id,m.display_name,m.family_role,m.status,p.id as player_id,p.status as player_status
    from rpg_v3.member_profiles m left join rpg_v3.players p on p.member_id=m.id and p.family_id=m.family_id
    where m.family_id=${actor.familyId} order by m.id`;
  const members: PublicMember[] = rows.map(row => ({
    id: row.id, playerId: row.player_id, name: row.display_name, role: row.family_role,
    active: row.status === 'active', playerStatus: row.player_status,
  }));
  const member = members.find(m => m.id === actor.actingMemberId)!;
  const now = new Date(parseInstant(await clock(tx))).toISOString();
  return { familyId: actor.familyId, memberId: actor.actingMemberId, playerId: actor.actingPlayerId, mode: actor.mode,
    role: member.role, grants: actor.grants.map(g => g.capability), members, now, id: newEntityId };
}
async function loadWorld(tx: V3Transaction, familyId: string): Promise<GameWorld> {
  const [record] = await tx`select body from rpg_v3.game_documents where family_id=${familyId} for update`;
  const world = (record?.body ?? emptyWorld()) as GameWorld;
  requireGame(world.version === 1, 'CONFLICT');
  const ledger = await tx`select snapshot from rpg_v3.game_ledger where family_id=${familyId} order by sequence`;
  requireGame(canonical(ledger.map(row => row.snapshot)) === canonical(world.ledger), 'CONFLICT');
  auditWorld(world);
  return world;
}
type Claim = { kind: string; key: string; id: string; snapshot: object };
function claims(world: GameWorld): Claim[] {
  return [
    ...world.occurrences.map(o => ({ kind: 'occurrence', key: `${o.taskId}:${o.period.id}:${o.assignment === 'shared' ? 'shared' : world.allocations.find(a => a.id === o.allocationIds[0])!.playerId}`, id: o.id, snapshot: o })),
    ...world.attempts.map(a => ({ kind: 'attempt', key: `${a.allocationId}:${a.predecessorId ?? 'first'}`, id: a.id, snapshot: { id: a.id, allocationId: a.allocationId, predecessorId: a.predecessorId, performedOn: a.performedOn, note: a.note, digest: a.digest } })),
    ...world.settlements.map(s => ({ kind: 'settlement', key: s.allocationId, id: s.id, snapshot: s })),
    ...world.owned.map(o => ({ kind: 'ownership', key: `${o.ownerKind}:${o.ownerId}:${o.itemId}`, id: o.id, snapshot: o })),
    ...world.purchases.map(p => ({ kind: 'purchase', key: p.quoteId, id: p.id, snapshot: p })),
    ...world.orders.map(o => ({ kind: 'reward_order', key: o.quoteId, id: o.id, snapshot: { id: o.id, playerId: o.playerId, offerId: o.offerId, terms: o.terms } })),
    ...world.progress.filter(p => p.starterEligible).map(p => ({ kind: 'starter', key: p.playerId, id: p.playerId, snapshot: { playerId: p.playerId, program: 'starter-v1' } })),
    ...world.progress.filter(p => p.starterPetId).map(p => ({ kind: 'starter_choice', key: p.playerId, id: p.starterPetId!, snapshot: { playerId: p.playerId, petId: p.starterPetId } })),
    ...world.pets.filter(p => p.hatched).map(p => ({ kind: 'hatch', key: p.id, id: p.id, snapshot: { id: p.id, hatchedAt: p.hatchedAt } })),
    ...world.trophies.map(t => ({ kind: 'trophy', key: `${t.kind}:${t.sourceId}`, id: t.id, snapshot: t })),
    ...world.corrections.map(c => ({ kind: 'correction', key: c.settlementId, id: c.id, snapshot: c })),
    ...world.corrections.filter(c => c.status === 'restored').map(c => ({ kind: 'restoration', key: c.id, id: c.id, snapshot: { correctionId: c.id, restoredAt: c.restoredAt } })),
  ];
}
async function persist(tx: V3Transaction, ctx: GameContext, before: GameWorld, after: GameWorld, operationId: string) {
  const previous = new Set(claims(before).map(c => `${c.kind}:${c.key}`));
  for (const claim of claims(after)) if (!previous.has(`${claim.kind}:${claim.key}`)) {
    await tx`insert into rpg_v3.game_claims(family_id,kind,business_key,entity_id,snapshot,operation_id)
      values (${ctx.familyId},${claim.kind},${claim.key},${claim.id},${tx.json(claim.snapshot as never)},${operationId})`;
  }
  for (let index = before.ledger.length; index < after.ledger.length; index++) {
    const entry = after.ledger[index];
    await tx`insert into rpg_v3.game_ledger(id,family_id,player_id,kind,sequence,delta,cause_key,settlement_id,original_entry_id,snapshot,operation_id)
      values (${entry.id},${ctx.familyId},${entry.playerId},${entry.kind},${index + 1},${entry.delta},${entry.causeKey},
        ${entry.settlementId},${entry.originalEntryId},${tx.json(entry as never)},${operationId})`;
  }
  const updated = await tx`insert into rpg_v3.game_documents(family_id,revision,body) values (${ctx.familyId},${after.revision},${tx.json(after as never)})
    on conflict(family_id) do update set revision=excluded.revision,body=excluded.body,updated_at=clock_timestamp()
    where rpg_v3.game_documents.revision=${before.revision} returning family_id`;
  requireGame(updated.length === 1, 'CONFLICT');
}
export function createGameService(access: AccessPort, clock: Clock = databaseClock) {
  async function read(actor: VerifiedActor) {
    return access.withOperation(actor, 'ReadFamily', { familyId: actor.familyId }, async tx => {
      const ctx = await context(tx, actor, clock), world = await loadWorld(tx, actor.familyId);
      synchronizePlayers(world, ctx.members);
      return projectGame(world, ctx);
    });
  }
  async function dispatch(actor: VerifiedActor, raw: unknown): Promise<GameResponse> {
    const command = parseGameCommand(raw);
    const digest = createHash('sha256').update(canonical({ command: command.command, version: command.version, payload: command.payload })).digest('hex');
    let ctx!: GameContext, before!: GameWorld;
    return access.withResolvedOperation(actor, actor.familyId, async tx => {
      ctx = await context(tx, actor, clock);
      before = await loadWorld(tx, actor.familyId);
      return operationFor(before, ctx, command);
    }, async tx => {
      const [receipt] = await tx`select * from rpg_v3.game_receipts
        where family_id=${actor.familyId} and account_id=${actor.accountId} and command=${command.command} and request_id=${command.idempotencyKey}`;
      if (receipt) {
        if (receipt.member_id !== actor.actingMemberId) throw new V3Error('FORBIDDEN');
        if (receipt.digest !== digest) throw new GameError('IDEMPOTENCY_KEY_REUSED');
        return { outcome: 'already_applied', operationId: receipt.id, result: receipt.result as OperationResult, projection: projectGame(before, ctx) };
      }
      const operationId = newEntityId();
      const { world, result, changed } = executeGame(before, ctx, command);
      await persist(tx, ctx, before, world, operationId);
      await tx`insert into rpg_v3.game_receipts(id,family_id,account_id,member_id,command,request_id,digest,result,projection_revision)
        values (${operationId},${actor.familyId},${actor.accountId},${actor.actingMemberId},${command.command},${command.idempotencyKey},
          ${digest},${tx.json(result as never)},${world.revision})`;
      return { outcome: changed ? 'committed' : 'already_applied', operationId, result, projection: projectGame(world, ctx) };
    });
  }
  return Object.freeze({ read, dispatch });
}
