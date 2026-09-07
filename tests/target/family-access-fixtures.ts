import { randomBytes } from 'node:crypto';
import { newEntityId } from '../../src/target/contracts/ids';
import { parseFamilyAccessRecord, type FamilyAccessRecords } from '../../src/target/contracts/familyAccess';
import { familyPolicyDigest, familyTokenVerifier, type FamilySessionConfig } from '../../src/target/access/familySession';
import { startMs } from './identity-exchange-fixtures';

export const familyConfig = (now: () => number): FamilySessionConfig => ({
  policyId: 'fixture_family_access', policyRevision: 1, ownChildTtlSeconds: 28800,
  retentionId: 'fixture_only', retentionRevision: 1, now,
});
export const at = (ms = startMs) => new Date(ms).toISOString();
export const familyBase = (familyId: string, ms = startMs) => ({
  id: newEntityId(), schema_version: 1, created_at: at(ms), updated_at: at(ms), state_revision: 1,
  family_id: familyId, retention_policy_id: 'fixture_only', retention_policy_revision: 1,
});
export function bindingFixture(familyId: string = newEntityId(), accountId: string = newEntityId(), profileId: string = newEntityId(),
  kind: 'own_child' | 'adult_membership' | 'managed_child' = 'own_child', managerId: string | null = null) {
  return parseFamilyAccessRecord('binding', { ...familyBase(familyId), account_id: accountId, profile_id: profileId,
    profile_role: kind === 'adult_membership' ? 'parent' : 'child', kind, manager_binding_id: managerId,
    manager_kind: kind === 'managed_child' ? 'adult_membership' : null, status: 'active', revoked_at: null, origin_invitation_id: null });
}
// Explicit synthetic context insertion is a test-only substitute for the future PIN issuer.
export function contextFixture(binding: FamilyAccessRecords['binding'], identityId: string = newEntityId(),
  parent: FamilyAccessRecords['session'] | null = null, launchId: string | null = null) {
  const adult = binding.kind === 'adult_membership';
  return parseFamilyAccessRecord('session', { ...familyBase(binding.family_id), account_id: binding.account_id,
    external_identity_id: identityId, profile_id: binding.profile_id, binding_id: binding.id, binding_kind: binding.kind,
    binding_revision: binding.state_revision, mode: adult ? 'adult' : binding.kind,
    parent_session_id: parent?.id ?? null, parent_mode: parent?.mode ?? null,
    parent_binding_id: parent?.binding_id ?? null, parent_binding_kind: parent?.binding_kind ?? null,
    origin_launch_id: launchId, expires_at: at(startMs + 28800000), revoked_at: null,
    adult_verified_at: adult ? at() : null, adult_grant_expires_at: adult ? at(startMs + 1800000) : null,
    adult_idle_expires_at: adult ? at(startMs + 300000) : null, protection_revision: adult ? 1 : null,
    policy_id: 'fixture_family_access', policy_revision: 1, policy_digest: familyPolicyDigest(familyConfig(() => startMs)) });
}
export function verifierFixture(context: FamilyAccessRecords['session']) {
  const bearer = randomBytes(32).toString('base64url');
  return { bearer, record: parseFamilyAccessRecord('verifier', { ...familyBase(context.family_id), session_id: context.id,
    token_verifier: familyTokenVerifier(bearer), verifier_version: 1, retired_at: null }) };
}
