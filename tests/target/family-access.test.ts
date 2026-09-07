import { describe, expect, it } from 'vitest';
import { parseFamilyAccessRecord } from '../../src/target/contracts/familyAccess';
import { newEntityId } from '../../src/target/contracts/ids';
import { parseFamilyAccessRequest } from '../../src/target/access/familyAuthorization';
import { bindingFixture, contextFixture, verifierFixture } from './family-access-fixtures';

describe('closed family access records and requests', () => {
  it('accepts own/adult/managed records, freezes them and separates verifier state', () => {
    const adult = bindingFixture(undefined, undefined, undefined, 'adult_membership');
    const managed = bindingFixture(adult.family_id, adult.account_id, undefined, 'managed_child', adult.id);
    const parent = contextFixture(adult), child = contextFixture(managed, undefined, parent);
    expect(Object.isFrozen(child)).toBe(true);
    expect(verifierFixture(parent).record).not.toHaveProperty('parent_session_id');
    expect(contextFixture(bindingFixture(), undefined, null, newEntityId()).mode).toBe('own_child');
  });
  it.each([
    { profile_role: 'parent' }, { manager_kind: 'adult_membership' }, { manager_binding_id: newEntityId() },
    { kind: 'admin' }, { status: 'revoked' }, { origin_invitation_id: newEntityId() }, { actorId: newEntityId() },
  ])('rejects malformed binding %j', change => {
    expect(() => parseFamilyAccessRecord('binding', { ...bindingFixture(), ...change })).toThrow();
  });
  it.each([
    { origin_launch_id: null }, { parent_mode: 'adult' }, { protection_revision: 1 }, { policy_digest: 'raw token' },
    { binding_kind: 'adult_membership' }, { expires_at: 'infinity' }, { binding_revision: 0 }, { bearer: 'secret' },
  ])('rejects malformed child context %j', change => {
    const row = contextFixture(bindingFixture(), undefined, null, newEntityId());
    expect(() => parseFamilyAccessRecord('session', { ...row, ...change })).toThrow();
  });
  it.each(['adult_verified_at', 'adult_grant_expires_at', 'adult_idle_expires_at', 'protection_revision'])('requires adult proof field %s', field => {
    const row = contextFixture(bindingFixture(undefined, undefined, undefined, 'adult_membership'));
    expect(() => parseFamilyAccessRecord('session', { ...row, [field]: null })).toThrow();
  });
  it('rejects client actors, permissions and unknown operations', () => {
    const row = { action: 'home.read', family_id: newEntityId(), profile_id: null };
    expect(parseFamilyAccessRequest(row)).toEqual(row);
    for (const change of [{ actorId: newEntityId() }, { mode: 'adult' }, { action: 'anything' }, { profile_id: newEntityId() }]) {
      expect(() => parseFamilyAccessRequest({ ...row, ...change })).toThrow();
    }
  });
});
