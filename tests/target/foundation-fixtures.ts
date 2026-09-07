import { newEntityId } from '../../src/target/contracts/ids';
import { uint } from '../../src/target/contracts/numbers';
import { closedObject, reject } from '../../src/target/contracts/errors';
import { createPayloadParser } from '../../src/target/contracts/payload';
import { parseAccountRecord, parseFamilyRecord, parseMemberProfileRecord, parsePlayerRecord, parseRetentionPolicyRecord } from '../../src/target/contracts/foundation';

export const time = '2026-09-07T12:00:00.123Z';
export const fixturePayloadParser = createPayloadParser([{ contract_id: 'fixture_retention', schema_version: 1, parse: (value, pointer) => {
  const row = closedObject(value, ['disposition', 'exact_probe'], pointer);
  if (row.disposition !== 'delete_with_test_database') reject('fixture.disposition_invalid');
  return Object.freeze({ disposition: 'delete_with_test_database', exact_probe: uint(row.exact_probe) });
} }]);
export const retentionFixture = () => parseRetentionPolicyRecord({ policy_id: 'fixture_only', revision: 1, schema_version: 1,
  purpose: 'synthetic_test', category: 'synthetic_records', trigger: 'test_database_cleanup',
  policy_payload: { contract_id: 'fixture_retention', schema_version: 1,
    value: { disposition: 'delete_with_test_database', exact_probe: '9223372036854775807' } } }, fixturePayloadParser);
export const baseFixture = () => ({ id: newEntityId(), schema_version: 1, created_at: time,
  retention_policy_id: 'fixture_only', retention_policy_revision: 1 });
const mutableFixture = () => ({ ...baseFixture(), updated_at: time, state_revision: 1 });
export const accountFixture = () => parseAccountRecord({ ...mutableFixture(), status: 'active', disabled_at: null });
export const familyFixture = () => parseFamilyRecord({ ...mutableFixture(), display_name: 'Тестовая семья', status: 'active', zone_id: 'Europe/Moscow',
  calendar_revision: 1, membership_revision: 1, recurrence_paused: false, recurrence_paused_at: null, archived_at: null, last_resumed_at: null });
export const profileFixture = (familyId: string, role: 'parent' | 'child' = 'child') => parseMemberProfileRecord({ ...mutableFixture(),
  family_id: familyId, display_name: 'Саша', family_role: role, status: 'active', archived_at: null, left_at: null });
export const playerFixture = (familyId: string, profileId: string) => parsePlayerRecord({ ...baseFixture(), family_id: familyId, profile_id: profileId, role: 'child' });
