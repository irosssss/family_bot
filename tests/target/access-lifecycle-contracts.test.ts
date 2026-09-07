import { describe,expect,it } from 'vitest';
import { parseLifecycleRecord,lifecycleRecordToDto } from '../../src/target/contracts/accessLifecycle';
import { newEntityId } from '../../src/target/contracts/ids';
import { at } from './family-access-fixtures';
import { startMs } from './identity-exchange-fixtures';

export function recoveryRecordFixture() {
  return {id:newEntityId(),schema_version:1,created_at:at(),updated_at:at(),state_revision:1,retention_policy_id:'fixture_only',retention_policy_revision:1,
    family_id:newEntityId(),kind:'recovery',state:'claimed',policy_revision:1,request_digest:'ab'.repeat(32),expires_at:at(startMs+600000),closed_at:null,
    target_binding_id:newEntityId(),target_revision:1,target_profile_id:newEntityId(),target_profile_revision:1,protection_id:newEntityId(),protection_revision:1,
    issuer_binding_id:null,issuer_revision:null,issuer_protection_revision:null,invite_verifier:null,candidate_verifier:'cd'.repeat(32),
    candidate_account_id:newEntityId(),candidate_identity_id:newEntityId(),candidate_launch_id:newEntityId(),basis:null,basis_credential_id:null,
    approver_binding_id:null,approver_revision:null,approver_protection_revision:null,approved_at:null,result_binding_id:null};
}
describe('closed lifecycle storage records',()=>{
  it('accepts and freezes an explicit recovery candidate and normalizes database timestamps',()=>{
    const r=recoveryRecordFixture();expect(Object.isFrozen(parseLifecycleRecord('request',r))).toBe(true);
    expect(lifecycleRecordToDto('request',{...r,created_at:r.created_at.replace('T',' ').replace('Z','+00')})).toEqual(r);
  });
  it.each([{pin:'001234'},{candidate_verifier:null},{candidate_account_id:null},{state:'approved'},
    {kind:'anything'},{target_binding_id:null},{target_profile_id:null},{target_revision:0},{protection_revision:null},
    {issuer_binding_id:newEntityId()},{basis:'code'},{basis:'adult',approved_at:at()},{state:'consumed'},
    {expires_at:at()},{updated_at:at(startMs-1)},{candidate_verifier:'plaintext'},{policy_revision:0},{schema_version:2}])('rejects inconsistent record %j',change=>{
    expect(()=>parseLifecycleRecord('request',{...recoveryRecordFixture(),...change})).toThrow();
  });
  it('rejects accessors, symbols and prototype-based fields at the record boundary',()=>{
    const r=recoveryRecordFixture();Object.defineProperty(r,'kind',{get(){throw new Error('getter must not run');}});
    expect(()=>parseLifecycleRecord('request',r)).toThrow('contract.fields_invalid');
    expect(()=>parseLifecycleRecord('request',{...recoveryRecordFixture(),[Symbol('hidden')]:true})).toThrow();
    expect(()=>parseLifecycleRecord('request',Object.create(recoveryRecordFixture()))).toThrow();
  });
  it('closes the audit event shape and outcome vocabulary',()=>{
    const r={id:newEntityId(),schema_version:1,created_at:at(),retention_policy_id:'fixture_only',retention_policy_revision:1,
      family_id:newEntityId(),request_id:newEntityId(),actor_binding_id:null,candidate_account_id:newEntityId(),action:'code',outcome:'denied',
      policy_revision:1,operation_id:null,request_digest:'ab'.repeat(32)};
    expect(parseLifecycleRecord('event',r)).toEqual(r);
    expect(()=>parseLifecycleRecord('event',{...r,raw_code:'secret'})).toThrow();
    expect(()=>parseLifecycleRecord('event',{...r,outcome:'unknown'})).toThrow();
  });
});
