import { closedObject, reject } from './errors';
import { entityId, revision } from './ids';
import type { createPayloadParser } from './payload';

export function key(value: unknown, pointer = ''): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]*$/.test(value)) return reject('contract.key_invalid', pointer);
  return value;
}
export function instant(value: unknown, pointer = ''): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) return reject('contract.instant_invalid', pointer);
  return value;
}
function nullableInstant(value: unknown, pointer: string) { return value === null ? null : instant(value, pointer); }
function text(value: unknown, pointer: string): string {
  if (typeof value !== 'string' || value.includes('\0')) return reject('contract.text_invalid', pointer);
  return value; // Field-specific UX limits belong to the G03 input contract, not this storage record.
}
export function zoneId(value: unknown, pointer = ''): string {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(value)) return reject('contract.zone_invalid', pointer);
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(0); }
  catch { return reject('contract.zone_invalid', pointer); }
  return value;
}
function enumeration<const T extends readonly string[]>(value: unknown, values: T, pointer: string): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) return reject('contract.enum_invalid', pointer);
  return value;
}
const identityKeys = ['id', 'schema_version', 'created_at', 'retention_policy_id', 'retention_policy_revision'] as const;
const mutableKeys = ['state_revision', 'updated_at'] as const;
function identity(row: Record<string, unknown>) {
  if (row.schema_version !== 1) reject('contract.schema_unsupported', '/schema_version');
  return { id: entityId(row.id, '/id'), schema_version: 1 as const, created_at: instant(row.created_at, '/created_at'),
    retention_policy_id: key(row.retention_policy_id, '/retention_policy_id'),
    retention_policy_revision: revision(row.retention_policy_revision, '/retention_policy_revision') };
}
function mutable(row: Record<string, unknown>) {
  const base = identity(row);
  const updated_at = instant(row.updated_at, '/updated_at');
  if (updated_at < base.created_at) reject('contract.time_order_invalid', '/updated_at');
  return { ...base, updated_at, state_revision: revision(row.state_revision, '/state_revision') };
}
function eventTime(row: Record<string, unknown>, field: string, base: ReturnType<typeof mutable>) {
  const time = nullableInstant(row[field], `/${field}`);
  if (time !== null && (time < base.created_at || time > base.updated_at)) reject('contract.time_order_invalid', `/${field}`);
  return time;
}
export function parseAccountRecord(input: unknown) {
  const row = closedObject(input, [...identityKeys, ...mutableKeys, 'status', 'disabled_at']);
  const base = mutable(row), status = enumeration(row.status, ['active', 'disabled', 'erasure_pending'], '/status');
  const disabled_at = eventTime(row, 'disabled_at', base);
  if ((status === 'active' && disabled_at !== null) || (status === 'disabled' && disabled_at === null)) reject('contract.account_state_invalid');
  return Object.freeze({ ...base, status, disabled_at });
}
export function parseFamilyRecord(input: unknown) {
  const row = closedObject(input, [...identityKeys, ...mutableKeys, 'display_name', 'status', 'zone_id', 'calendar_revision',
    'membership_revision', 'recurrence_paused', 'recurrence_paused_at', 'archived_at', 'last_resumed_at']);
  const base = mutable(row), status = enumeration(row.status, ['active', 'archived'], '/status');
  const recurrence_paused_at = eventTime(row, 'recurrence_paused_at', base), archived_at = eventTime(row, 'archived_at', base);
  if (typeof row.recurrence_paused !== 'boolean') reject('contract.boolean_invalid', '/recurrence_paused');
  if (row.recurrence_paused !== (recurrence_paused_at !== null) || (status === 'archived' && archived_at === null)) reject('contract.family_state_invalid');
  return Object.freeze({ ...base, status, display_name: text(row.display_name, '/display_name'), zone_id: zoneId(row.zone_id, '/zone_id'),
    calendar_revision: revision(row.calendar_revision, '/calendar_revision'), membership_revision: revision(row.membership_revision, '/membership_revision'),
    recurrence_paused: row.recurrence_paused, recurrence_paused_at, archived_at, last_resumed_at: eventTime(row, 'last_resumed_at', base) });
}
export function parseMemberProfileRecord(input: unknown) {
  const row = closedObject(input, [...identityKeys, ...mutableKeys, 'family_id', 'display_name', 'family_role', 'status', 'archived_at', 'left_at']);
  const base = mutable(row), status = enumeration(row.status, ['active', 'archived', 'left'], '/status');
  const archived_at = eventTime(row, 'archived_at', base), left_at = eventTime(row, 'left_at', base);
  if ((status === 'archived') !== (archived_at !== null) || (status === 'left') !== (left_at !== null)) reject('contract.profile_state_invalid');
  return Object.freeze({ ...base, family_id: entityId(row.family_id, '/family_id'), display_name: text(row.display_name, '/display_name'),
    family_role: enumeration(row.family_role, ['parent', 'child'], '/family_role'), status, archived_at, left_at });
}
export function parsePlayerRecord(input: unknown) {
  const row = closedObject(input, [...identityKeys, 'family_id', 'profile_id', 'role']);
  return Object.freeze({ ...identity(row), family_id: entityId(row.family_id, '/family_id'), profile_id: entityId(row.profile_id, '/profile_id'),
    role: enumeration(row.role, ['child'], '/role') });
}
export function parseRetentionPolicyRecord(input: unknown, parsePayload: ReturnType<typeof createPayloadParser>) {
  const row = closedObject(input, ['policy_id', 'revision', 'purpose', 'category', 'trigger', 'schema_version', 'policy_payload']);
  if (row.schema_version !== 1) reject('contract.schema_unsupported', '/schema_version');
  const policy_payload = parsePayload(row.policy_payload, '/policy_payload');
  if (policy_payload.value === null || typeof policy_payload.value !== 'object' || Array.isArray(policy_payload.value)) reject('contract.object_required', '/policy_payload/value');
  return Object.freeze({ policy_id: key(row.policy_id, '/policy_id'), revision: revision(row.revision, '/revision'),
    purpose: key(row.purpose, '/purpose'), category: key(row.category, '/category'), trigger: key(row.trigger, '/trigger'),
    schema_version: 1 as const, policy_payload });
}

/** DB adapter only. Normalize PostgreSQL timestamp strings, then validate the complete closed wire record. */
export function foundationRecordToDto(kind: 'account' | 'family' | 'member_profile' | 'player', input: Record<string, unknown>) {
  const row = { ...input };
  const fields = ['created_at', 'updated_at', 'disabled_at', 'recurrence_paused_at', 'archived_at', 'last_resumed_at', 'left_at'];
  for (const field of fields) if (Object.hasOwn(row, field) && row[field] !== null) {
    const value = row[field];
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) reject('contract.instant_invalid', `/${field}`);
    row[field] = new Date(value).toISOString();
  }
  const parsers = { account: parseAccountRecord, family: parseFamilyRecord, member_profile: parseMemberProfileRecord, player: parsePlayerRecord };
  if (!Object.hasOwn(parsers, kind)) return reject('contract.record_kind_invalid');
  return parsers[kind](row);
}
