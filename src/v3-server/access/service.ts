import type { V3Database, V3Transaction } from '../db/client.js';
import { V3Error, ValidationError } from '../contracts/errors.js';
import { parseClosedRecord, parseEntityId, parseRevision, type EntityId, type Revision } from '../contracts/primitives.js';
import { CAPABILITY_SCOPES, type Capability, type CapabilityScope, parseFamilyRole } from './capabilities.js';
import { memberFromRow, playerFromRow, type MemberProfile, type Player } from '../foundation/records.js';

// Implementations are trusted server dependencies. No adapter is bundled into this module.
export interface IdentityAdapter<Credential> {
  verify(credential: Credential): Promise<Readonly<{ sessionId: EntityId }>>;
}
type Grant = Readonly<{ id: EntityId; capability: Capability; scope: CapabilityScope; revision: Revision }>;
declare const verifiedBrand: unique symbol;
export type VerifiedActor = Readonly<{
  accountId: EntityId; sessionId: EntityId; bindingId: EntityId; familyId: EntityId;
  actingMemberId: EntityId; actingPlayerId: EntityId | null; mode: 'adult' | 'own_child' | 'managed_child';
  sessionRevision: Revision; capabilityRevision: Revision; grants: readonly Grant[];
  [verifiedBrand]: true;
}>;
const operations = {
  ReadFamily: ['family.read', 'family_read'],
  ManageFamily: ['family.manage', 'admin'],
  ManageTasks: ['tasks.manage', 'admin'],
  SubmitSelf: ['completion.submit_self', 'self'],
  ReviewChild: ['completion.review_child', 'child_review'],
  PurchaseSelf: ['shop.purchase_self', 'self'],
  PurchaseFamilyItem: ['shop.purchase_family_item', 'family_purchase'],
  SelectAppearance: ['appearance.select_self', 'self'],
  RequestRealRewardSelf: ['real_reward.request_self', 'self_child'],
  ReviewRealRewardChild: ['real_reward.review_child', 'child_review'],
  CancelRealRewardChild: ['real_reward.cancel_child', 'child_review'],
  DeliverRealRewardChild: ['real_reward.deliver_child', 'child_review'],
  ReadSelfHistory: ['family.read', 'history'],
} as const satisfies Record<string, readonly [Capability, string]>;
export type FoundationOperation = keyof typeof operations;
export type OperationTarget = Readonly<{ familyId: EntityId; playerId?: EntityId }>;
export type Authorization = Readonly<{
  member: MemberProfile; player: Player | null; beneficiary: Player | null;
  decision: 'adult_self_trusted' | 'child_requires_adult' | 'manual_child_review' | null;
}>;
type Context = {
  actor: VerifiedActor; fingerprint: string; member: MemberProfile; player: Player | null;
};
const deny = (): never => { throw new V3Error('FORBIDDEN'); };
function revision(value: unknown): Revision { return parseRevision(Number(value)); }

async function loadContext(tx: V3Transaction, sessionId: EntityId): Promise<Context> {
  const locate = async () => (await tx`
    select s.family_id, s.binding_id, b.account_id, b.member_id, b.player_id
    from rpg_v3.sessions s join rpg_v3.access_bindings b on b.id=s.binding_id and b.family_id=s.family_id
    where s.id=${sessionId}`)[0];
  const initial = await locate();
  if (!initial) return deny();
  const [family] = await tx`select * from rpg_v3.families where id=${initial.family_id} for update`;
  const [account] = await tx`select * from rpg_v3.accounts where id=${initial.account_id} for update`;
  const [member] = await tx`select * from rpg_v3.member_profiles where id=${initial.member_id} and family_id=${initial.family_id} for update`;
  const player = initial.player_id === null ? null : (await tx`
    select * from rpg_v3.players where id=${initial.player_id} and family_id=${initial.family_id} and member_id=${initial.member_id} for update`)[0];
  const [binding] = await tx`select * from rpg_v3.access_bindings where id=${initial.binding_id} for update`;
  const [session] = await tx`select *, expires_at > clock_timestamp() as unexpired from rpg_v3.sessions where id=${sessionId} for update`;
  const current = await locate();
  if (!current || JSON.stringify(initial) !== JSON.stringify(current) ||
      !family || !account || !member || !binding || !session ||
      [family, account, member, binding, session].some(row => row.status !== 'active') || !session.unexpired ||
      (initial.player_id !== null && !player)) return deny();
  const familyRole = parseFamilyRole(member.family_role);
  if ((binding.mode !== 'adult' || familyRole !== 'adult') &&
      (!['own_child', 'managed_child'].includes(binding.mode) || familyRole !== 'child')) return deny();
  const grantRows = await tx`select * from rpg_v3.capability_grants
    where family_id=${initial.family_id} and member_id=${initial.member_id} order by id for update`;
  const grants = Object.freeze(grantRows.filter(row => row.status === 'active').map(row => {
    const capability = row.capability as Capability;
    if (!Object.hasOwn(CAPABILITY_SCOPES, capability) || CAPABILITY_SCOPES[capability] !== row.scope) return deny();
    return Object.freeze({ id: parseEntityId(row.id), capability, scope: row.scope as CapabilityScope, revision: revision(row.revision) });
  }));
  const actor = Object.freeze({
    accountId: parseEntityId(account.id), sessionId, bindingId: parseEntityId(binding.id), familyId: parseEntityId(family.id),
    actingMemberId: parseEntityId(member.id), actingPlayerId: player ? parseEntityId(player.id) : null,
    mode: binding.mode as VerifiedActor['mode'], sessionRevision: revision(session.revision),
    capabilityRevision: revision(member.capability_revision), grants,
  }) as VerifiedActor;
  return {
    actor, member: memberFromRow(member), player: player ? playerFromRow(player) : null,
    fingerprint: JSON.stringify([actor, familyRole, account.revision, family.revision, member.revision, player?.revision ?? null, binding.revision]),
  };
}

function parseTarget(operation: FoundationOperation, target: OperationTarget): OperationTarget {
  if (!Object.hasOwn(operations, operation)) throw new ValidationError();
  const category = operations[operation][1];
  const needsPlayer = ['self', 'self_child', 'history', 'child_review'].includes(category);
  return needsPlayer ? parseClosedRecord(target, { familyId: parseEntityId, playerId: parseEntityId }) :
    parseClosedRecord(target, { familyId: parseEntityId });
}

async function authorize(tx: V3Transaction, context: Context, operation: FoundationOperation, target: OperationTarget): Promise<Authorization> {
  const { actor, member, player } = context;
  if (target.familyId !== actor.familyId) return deny();
  const [capability, category] = operations[operation];
  if (!actor.grants.some(grant => grant.capability === capability && grant.scope === CAPABILITY_SCOPES[capability])) return deny();
  let beneficiary: Player | null = null;
  let decision: Authorization['decision'] = null;
  if (category === 'admin' || category === 'child_review' || category === 'family_purchase') {
    if (actor.mode !== 'adult' || member.familyRole !== 'adult') return deny();
  }
  if (category === 'family_purchase') {
    if (!player || player.status !== 'active' || player.memberId !== member.id) return deny();
    beneficiary = player;
  }
  if (['self', 'self_child', 'history'].includes(category)) {
    if (!player || target.playerId !== player.id || player.memberId !== member.id ||
        (category === 'history' ? !['active', 'paused'].includes(player.status) : player.status !== 'active')) return deny();
    beneficiary = player;
    if (category === 'self_child' && member.familyRole !== 'child') throw new V3Error('CHILD_ONLY');
    if (operation === 'SubmitSelf') decision = member.familyRole === 'adult' ? 'adult_self_trusted' : 'child_requires_adult';
  }
  if (category === 'child_review') {
    const [row] = await tx`select p.*, m.family_role from rpg_v3.players p
      join rpg_v3.member_profiles m on m.id=p.member_id and m.family_id=p.family_id
      where p.id=${target.playerId!} and p.family_id=${actor.familyId} for update of p, m`;
    if (!row) return deny();
    if (row.member_id === member.id || row.id === actor.actingPlayerId) throw new V3Error('SELF_REVIEW_FORBIDDEN');
    if (row.family_role !== 'child') throw new V3Error('CHILD_ONLY');
    beneficiary = playerFromRow(row);
    decision = 'manual_child_review';
  }
  return Object.freeze({ member, player, beneficiary, decision });
}

export function createAccessService<Credential>(database: V3Database, adapter: IdentityAdapter<Credential>) {
  const issued = new WeakMap<VerifiedActor, string>();
  async function authenticate(credential: Credential): Promise<VerifiedActor> {
    const identity = await adapter.verify(credential);
    const sessionId = parseEntityId(identity.sessionId);
    const context = await database.sql.begin(tx => loadContext(tx, sessionId));
    issued.set(context.actor, context.fingerprint);
    return context.actor;
  }
  async function withOperation<T>(actor: VerifiedActor, operation: FoundationOperation, target: OperationTarget,
    effect: (tx: V3Transaction, authorization: Authorization) => Promise<T>): Promise<T> {
    const safeTarget = parseTarget(operation, target);
    const fingerprint = actor && issued.get(actor);
    if (!fingerprint) return deny();
    if (safeTarget.familyId !== actor.familyId) return deny();
    return await database.sql.begin(async tx => {
      const context = await loadContext(tx, actor.sessionId);
      if (context.fingerprint !== fingerprint) throw new V3Error('STALE_ACTOR');
      const authorization = await authorize(tx, context, operation, safeTarget);
      return await effect(tx, authorization);
    }) as T;
  }
  async function readSelfProjection(actor: VerifiedActor, target: OperationTarget) {
    return withOperation(actor, 'ReadSelfHistory', target, async (_tx, authorization) =>
      Object.freeze({ member: authorization.member, player: authorization.player! }));
  }
  async function withResolvedOperation<T>(actor: VerifiedActor, familyId: EntityId,
    resolve: (tx: V3Transaction) => Promise<{ operation: FoundationOperation; target: OperationTarget }>,
    effect: (tx: V3Transaction, authorization: Authorization) => Promise<T>): Promise<T> {
    parseEntityId(familyId);
    const fingerprint = actor && issued.get(actor);
    if (!fingerprint || familyId !== actor.familyId) return deny();
    return await database.sql.begin(async tx => {
      const context = await loadContext(tx, actor.sessionId);
      if (context.fingerprint !== fingerprint) throw new V3Error('STALE_ACTOR');
      // Resolver is trusted server code. It reads the resource under the same family guard,
      // so the beneficiary used for authorization cannot change before the transition.
      const resolved = await resolve(tx);
      const target = parseTarget(resolved.operation, resolved.target);
      const authorization = await authorize(tx, context, resolved.operation, target);
      return effect(tx, authorization);
    }) as T;
  }
  async function revoke(actor: VerifiedActor, input: Readonly<{
    familyId: EntityId; kind: 'binding' | 'session' | 'grant'; id: EntityId; expectedRevision: Revision;
  }>): Promise<void> {
    // This is an internal service port, not a command payload or HTTP route.
    const payload = parseClosedRecord(input, {
      familyId: parseEntityId, id: parseEntityId, expectedRevision: parseRevision,
      kind: (value: unknown): 'binding' | 'session' | 'grant' => {
        if (value !== 'binding' && value !== 'session' && value !== 'grant') throw new ValidationError();
        return value;
      },
    });
    await withOperation(actor, 'ManageFamily', { familyId: payload.familyId }, async tx => {
      const rows = payload.kind === 'binding' ? await tx`update rpg_v3.access_bindings set status='revoked', revision=revision+1
        where id=${payload.id} and family_id=${payload.familyId} and status='active' and revision=${payload.expectedRevision} returning *`
        : payload.kind === 'session' ? await tx`update rpg_v3.sessions set status='revoked', revision=revision+1
        where id=${payload.id} and family_id=${payload.familyId} and status='active' and revision=${payload.expectedRevision} returning *`
        : await tx`update rpg_v3.capability_grants set status='revoked', revision=revision+1
        where id=${payload.id} and family_id=${payload.familyId} and status='active' and revision=${payload.expectedRevision} returning *`;
      if (rows.length !== 1) throw new V3Error('CONFLICT');
      if (payload.kind === 'grant') await tx`update rpg_v3.member_profiles set capability_revision=capability_revision+1
        where id=${rows[0].member_id} and family_id=${payload.familyId}`;
    });
  }
  return Object.freeze({ authenticate, withOperation, withResolvedOperation, readSelfProjection, revoke });
}
export type AccessService = ReturnType<typeof createAccessService>;
