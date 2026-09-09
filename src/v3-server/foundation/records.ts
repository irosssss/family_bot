import { ValidationError } from '../contracts/errors.js';
import { parseEntityId, parseRevision, type EntityId, type Revision } from '../contracts/primitives.js';
import { parseFamilyRole } from '../access/capabilities.js';

export type MemberProfile = Readonly<{
  id: EntityId; familyId: EntityId; familyRole: 'adult' | 'child'; displayName: string;
  status: 'active' | 'left' | 'archived'; revision: Revision;
}>;
export type Player = Readonly<{
  id: EntityId; familyId: EntityId; memberId: EntityId;
  status: 'active' | 'paused' | 'left' | 'archived'; revision: Revision;
}>;
export function parseDisplayName(value: unknown): string {
  if (typeof value !== 'string' || value !== value.trim() || value.length < 1 || value.length > 80 ||
      /[\p{Cc}\p{Cf}\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(value)) throw new ValidationError();
  return value;
}
// Rows are selected explicitly. Wire parsers reject unknown keys before any SQL.
export function memberFromRow(row: Record<string, unknown>): MemberProfile {
  if (!['active', 'left', 'archived'].includes(row.status as string)) throw new ValidationError();
  return Object.freeze({
    id: parseEntityId(row.id), familyId: parseEntityId(row.family_id), familyRole: parseFamilyRole(row.family_role),
    displayName: parseDisplayName(row.display_name), status: row.status as MemberProfile['status'],
    revision: parseRevision(Number(row.revision)),
  });
}
export function playerFromRow(row: Record<string, unknown>): Player {
  if (!['active', 'paused', 'left', 'archived'].includes(row.status as string)) throw new ValidationError();
  return Object.freeze({
    id: parseEntityId(row.id), familyId: parseEntityId(row.family_id), memberId: parseEntityId(row.member_id),
    status: row.status as Player['status'], revision: parseRevision(Number(row.revision)),
  });
}
