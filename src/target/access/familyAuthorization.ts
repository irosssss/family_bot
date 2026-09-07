import { closedObject, reject } from '../contracts/errors';
import { entityId } from '../contracts/ids';

export interface FamilyActor {
  readonly account_id: string; readonly family_id: string; readonly profile_id: string; readonly player_id: string | null;
  readonly session_id: string; readonly session_revision: number; readonly binding_id: string;
  readonly verifier_id: string; readonly verifier_revision: number;
  readonly mode: 'adult' | 'own_child' | 'managed_child';
}
export type FamilyAction = 'home.read' | 'profile.read' | 'child.play' | 'family.manage';
export interface FamilyAccessRequest { readonly action: FamilyAction; readonly family_id: string; readonly profile_id: string | null }

export function parseFamilyAccessRequest(input: unknown): FamilyAccessRequest {
  const row = closedObject(input,['action','family_id','profile_id']);
  if (!['home.read','profile.read','child.play','family.manage'].includes(row.action as string)) reject('family.access_denied');
  entityId(row.family_id); if (row.profile_id !== null) entityId(row.profile_id);
  if ((row.action === 'home.read' || row.action === 'family.manage') !== (row.profile_id === null)) reject('family.access_denied');
  return Object.freeze({ ...row }) as unknown as FamilyAccessRequest;
}
/** Pure policy only. Caller must obtain actor from the bearer inside the same DB transaction. */
export function authorizeFamilyTarget(actor: FamilyActor,request: FamilyAccessRequest): void {
  if (actor.family_id !== request.family_id) reject('family.access_denied');
  if (request.action === 'family.manage' && actor.mode !== 'adult') reject('family.access_denied');
  if (request.action === 'child.play' && (actor.mode === 'adult' || actor.profile_id !== request.profile_id || !actor.player_id)) reject('family.access_denied');
  if (request.action === 'profile.read' && actor.mode !== 'adult' && actor.profile_id !== request.profile_id) reject('family.access_denied');
}
