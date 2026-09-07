import { describe,expect,it } from 'vitest';
import { argon2 } from 'node:crypto';
import { promisify } from 'node:util';
import { parsePin,createPinKdf,newRecoveryCode,recoveryVerifier,equalDigest,newBearer,withSecret,isBearer } from '../../src/target/access/adultCrypto';
import { parseAdultConfig } from '../../src/target/access/adultPolicy';
import { parseAdultRecord } from '../../src/target/contracts/adultProtection';
import { adultConfig,syntheticPepper } from './adult-fixtures';
import { bindingFixture,at } from './family-access-fixtures';
import { newEntityId } from '../../src/target/contracts/ids';

describe('adult crypto boundary', () => {
  it('matches the independent RFC9106 Argon2id vector including pepper and associated data', async () => {
    const result = await promisify(argon2)('argon2id',{ message:Buffer.alloc(32,1),nonce:Buffer.alloc(16,2),secret:Buffer.alloc(8,3),
      associatedData:Buffer.alloc(12,4),memory:32,passes:3,parallelism:4,tagLength:32 });
    expect(result.toString('hex')).toBe('0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659');
  });
  it('preserves leading zeros and differentiates PIN, salt and pepper', async () => {
    const pepper = syntheticPepper(),kdf = createPinKdf(pepper),salt = 'ab'.repeat(16);
    const expected = await kdf.derive('001234',salt);
    pepper.fill(0);
    expect(await kdf.derive('001234',salt)).toBe(expected);
    expect(await kdf.derive('101234',salt)).not.toBe(expected);
    expect(await kdf.derive('001234','cd'.repeat(16))).not.toBe(expected);
    expect(await createPinKdf(new Uint8Array(32).fill(8)).derive('001234',salt)).not.toBe(expected);
  });
  it.each([123456,'12345','1234567','１２３４５６','123 45',' 123456',null])('rejects invalid PIN %j', value => {
    expect(() => parsePin(value)).toThrow('adult.pin_invalid');
  });
  it('fails closed on missing pepper and malformed verifier parameters', async () => {
    expect(() => createPinKdf(new Uint8Array(0))).toThrow('adult.pepper_required');
    await expect(createPinKdf(syntheticPepper()).derive('001234','not-salt')).rejects.toThrow('adult.verifier_invalid');
  });
  it('encodes twenty random bytes without losing entropy and verifies a checksum', () => {
    const code = newRecoveryCode(() => new Uint8Array(20));
    expect(code).toMatch(/^(AAAA-){8}[A-Z2-7]$/);
    expect(recoveryVerifier(code)).toMatch(/^[a-f0-9]{64}$/);
    expect(() => recoveryVerifier(code.slice(0,-1)+(code.endsWith('A') ? 'B' : 'A'))).toThrow('adult.recovery_invalid');
    expect(() => newRecoveryCode(() => new Uint8Array(19))).toThrow();
    expect(newRecoveryCode()).not.toBe(newRecoveryCode());
  });
  it('keeps bearer secrets out of ordinary JSON and rejects malformed encodings', () => {
    const bearer = newBearer(),result = withSecret({ok:true},'bearer',bearer);
    expect(JSON.stringify(result)).toBe('{"ok":true}'); expect(result.bearer).toBe(bearer);
    expect(isBearer(bearer)).toBe(true); expect(isBearer(bearer+'=')).toBe(false);
    expect(() => newBearer(() => new Uint8Array(1))).toThrow();
    expect(equalDigest('bad','bad')).toBe(false);
  });
  it('rejects unknown policy fields and inconsistent limits', () => {
    const cfg = adultConfig(() => 1700000000000);
    expect(Object.isFrozen(parseAdultConfig(cfg).family)).toBe(true);
    for (const change of [{pin:true},{freshSeconds:2000},{failedShortMax:30},{sourceWindowSeconds:86401}]) {
      expect(() => parseAdultConfig({...cfg,...change})).toThrow();
    }
  });
});

describe('closed adult records', () => {
  const b = bindingFixture(undefined,undefined,undefined,'adult_membership');
  const row = { id:newEntityId(),schema_version:1,created_at:at(),updated_at:at(),state_revision:1,
    retention_policy_id:'fixture_only',retention_policy_revision:1,family_id:b.family_id,account_id:b.account_id,profile_id:b.profile_id,
    binding_id:b.id,binding_kind:'adult_membership',credential_revision:1,status:'pending',kdf_id:'argon2id_v19_19m_t2_p1',
    pin_salt:'ab'.repeat(16),pin_verifier:'cd'.repeat(32),pepper_key_id:'fixture_pepper',recovery_ack_at:null,revoked_at:null };
  it('accepts an explicit pending protection', () => { expect(Object.isFrozen(parseAdultRecord('protection',row))).toBe(true); });
  it.each([{pin:'001234'},{status:'active'},{binding_kind:'own_child'},{credential_revision:0},{pin_salt:'abc'},
    {pin_verifier:'plaintext'},{kdf_id:'arbitrary'},{pepper_key_id:''},{revoked_at:at()},{schema_version:2}])('rejects malformed protection %j', change => {
    expect(() => parseAdultRecord('protection',{...row,...change})).toThrow();
  });
});
