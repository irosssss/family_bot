import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import vector from '../fixtures/telegram-init-data.json';
import { createTelegramIdentityVerifier, type TelegramVerifierConfig } from '../../src/target/access/telegram';

const policy = { id: 'test_access_policy', revision: 1, maxAgeSeconds: 300,
  futureSkewSeconds: 30, maxBytes: 16384, maxFields: 64 };
const config = (): TelegramVerifierConfig => ({ botId: '7000000000', botToken: vector.botToken,
  environment: 'test', policy: { ...policy }, now: () => vector.nowMs });
const golden = `${vector.query}&hash=${vector.hash}`;
const invalid = { ok: false, error_key: 'access.identity_invalid' };

// Mutation cases only. Positive interoperability is anchored by the saved Python-vector.
function signed(fields: Record<string, string>, token = vector.botToken): string {
  const key = createHmac('sha256', 'WebAppData').update(token).digest();
  const data = Object.keys(fields).sort().map(name => `${name}=${fields[name]}`).join('\n');
  const hash = createHmac('sha256', key).update(data).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}
const fields = () => Object.fromEntries(new URLSearchParams(vector.query));

describe('Telegram HMAC identity (G3B01–G3B04)', () => {
  it('accepts an independent Python-vector and returns only the closed identity', () => {
    const verify = createTelegramIdentityVerifier(config());
    const result = verify(golden);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected independent vector success');
    expect(result.identity).toEqual({
      schema_version: 1, provider: 'telegram', subject: '69513172', bot_id: '7000000000', environment: 'test',
      verification_method: 'telegram_hmac_sha256_v1', verification_policy_id: policy.id,
      verification_policy_revision: 1, authenticated_at: '2023-11-14T22:13:20.000Z',
      verified_at: '2023-11-14T22:13:20.000Z', replay_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.identity)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(vector.botToken);
    expect(JSON.stringify(result)).not.toContain('Семён');
  });

  it('normalizes equivalent encodings and hash case to one replay fingerprint', () => {
    const verify = createTelegramIdentityVerifier(config());
    const reordered = golden.split('&').reverse().join('&').replace(/\+/g, '%20').replace(vector.hash, vector.hash.toUpperCase());
    expect(verify(reordered)).toEqual(verify(golden));
    expect(verify(golden.replace(/%[a-f0-9]{2}/gi, escape => escape.toLowerCase()))).toEqual(verify(golden));
    expect(verify(golden.replace('auth_date=', '%61uth_date='))).toEqual(verify(golden));
    // This pure adapter deliberately does not consume the fingerprint.
    expect(verify(golden)).toEqual(verify(golden));
  });

  it('rejects the old encoded-pair algorithm and wrong bot credentials', () => {
    expect(createTelegramIdentityVerifier(config())(`${vector.query}&hash=${vector.legacyEncodedHash}`)).toEqual(invalid);
    const foreign = { ...config(), botToken: '7000000000:' + randomBytes(24).toString('hex') };
    expect(createTelegramIdentityVerifier(foreign)(golden)).toEqual(invalid);
  });

  it('covers every external field, including signature, without JSON normalization', () => {
    const verify = createTelegramIdentityVerifier(config());
    for (const change of [
      (p: URLSearchParams) => p.delete('signature'),
      (p: URLSearchParams) => p.set('signature', 'other'),
      (p: URLSearchParams) => p.set('future_flag', 'true'),
      (p: URLSearchParams) => p.set('user', JSON.stringify(JSON.parse(p.get('user')!))),
    ]) {
      const p = new URLSearchParams(golden); change(p);
      expect(verify(p.toString())).toEqual(invalid);
    }
  });

  it('allows signed extension fields without granting role/profile/family', () => {
    const result = createTelegramIdentityVerifier(config())(signed({ ...fields(),
      role: 'parent', family_id: 'foreign', future_flag: 'true',
      user: '{"id":1,"role":"parent","nested":[{"x":1},{"x":2}],"name":"50% + & %26"}',
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected extension success');
    expect(result.identity.subject).toBe('1');
    expect(result.identity).not.toHaveProperty('role');
    expect(result.identity).not.toHaveProperty('family_id');
    expect(result.identity).not.toHaveProperty('user');
  });

  it('scopes replay fingerprints by trusted environment', () => {
    const a = createTelegramIdentityVerifier(config())(golden);
    const b = createTelegramIdentityVerifier({ ...config(), environment: 'production' })(golden);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.identity.replay_fingerprint).not.toBe(b.identity.replay_fingerprint);
  });

  it.each([undefined, null, 123, {}, '', '&', 'user', 'user=x&', '=x', '?user=x'])('rejects malformed input %j', input => {
    expect(createTelegramIdentityVerifier(config())(input)).toEqual(invalid);
  });

  it.each(['user', '%75ser', 'auth_date', 'hash', '%68ash', 'signature'])('rejects duplicate decoded field %s', name => {
    const original = new URLSearchParams(golden).get(decodeURIComponent(name))!;
    expect(createTelegramIdentityVerifier(config())(`${golden}&${name}=${encodeURIComponent(original)}`)).toEqual(invalid);
  });

  it.each(['%', '%GG', '%C3%28', '%FF', '\ud800'])('rejects malformed UTF-8 / escape %j', raw => {
    const replacement = new URLSearchParams(`extra=${raw}`).get('extra')!;
    const input = signed({ ...fields(), extra: replacement });
    const hash = new URLSearchParams(input).get('hash');
    expect(createTelegramIdentityVerifier(config())(`${vector.query}&extra=${raw}&hash=${hash}`)).toEqual(invalid);
  });

  it.each(['extra\nuser', 'extra=user', 'extra\r', 'é'])('rejects ambiguous/non-ASCII field name %j', name => {
    expect(createTelegramIdentityVerifier(config())(signed({ ...fields(), [name]: 'x' }))).toEqual(invalid);
  });

  it.each(['x\ny=z', 'x\r', 'x\0'])('rejects signed field delimiters %j', extra => {
    expect(createTelegramIdentityVerifier(config())(signed({ ...fields(), extra }))).toEqual(invalid);
  });

  it.each(['', 'f'.repeat(63), 'f'.repeat(65), 'z'.repeat(64), vector.hash + 'broken'])('rejects malformed hash %s', hash => {
    expect(createTelegramIdentityVerifier(config())(`${vector.query}&hash=${hash}`)).toEqual(invalid);
  });

  it('enforces byte and field limits before invoking the clock', () => {
    const now = vi.fn(() => vector.nowMs);
    const cfg = { ...config(), now, policy: { ...policy, maxBytes: Buffer.byteLength(golden) } };
    expect(createTelegramIdentityVerifier(cfg)(golden).ok).toBe(true);
    expect(createTelegramIdentityVerifier({ ...cfg, policy: { ...policy, maxFields: 5 } })(golden).ok).toBe(true);
    now.mockClear();
    expect(createTelegramIdentityVerifier({ ...cfg, policy: { ...cfg.policy, maxBytes: cfg.policy.maxBytes - 1 } })(golden)).toEqual(invalid);
    expect(createTelegramIdentityVerifier({ ...cfg, policy: { ...policy, maxFields: 4 } })(golden)).toEqual(invalid);
    expect(now).not.toHaveBeenCalled();
    // Raw Unicode counts as multiple UTF-8 bytes, not JS characters.
    const rawUnicode = golden.replace('%D0%A1', 'С');
    expect(createTelegramIdentityVerifier({ ...cfg, policy: { ...policy, maxBytes: rawUnicode.length } })(rawUnicode)).toEqual(invalid);
  });

  it.each(['', '0', '-1', '1.5', '1e9', '01700000000', '9007199254740993', '253402300800'])('rejects invalid auth_date %s', auth_date => {
    expect(createTelegramIdentityVerifier(config())(signed({ ...fields(), auth_date }))).toEqual(invalid);
  });

  it('enforces exact millisecond freshness boundaries using only the injected clock', () => {
    const at = (deltaMs: number) => createTelegramIdentityVerifier({ ...config(), now: () => vector.nowMs + deltaMs })(golden);
    expect(at(300000).ok).toBe(true);
    expect(at(300001)).toEqual(invalid);
    expect(at(-30000).ok).toBe(true);
    expect(at(-30001)).toEqual(invalid);
  });

  it.each(['null', '[]', '{}', '{"id":null}', '{"id":true}', '{"id":"1"}', '{"id":-1}', '{"id":0}',
    '{"id":1.1}', '{"id":1.0000000000000001}', '{"id":1e3}', '{"id":9007199254740993}',
    '{"id":1,"id":2}', '{"id":1,"\\u0069d":2}', '{"id":1,"extra":{"x":1,"x":2}}',
    '{"id":1,"extra":[{"x":1,"\\u0078":2}]}', '{"id":1,}',
  ])('rejects malformed/ambiguous user %s', user => {
    expect(createTelegramIdentityVerifier(config())(signed({ ...fields(), user }))).toEqual(invalid);
  });

  it('handles escaped keys, quotes, whitespace, nested arrays and safe integer IDs', () => {
    const user = ' { "\\u0069d" : 4503599627370495, "x" : {"a\\\"b": [true, false, null, 2.5, {}, []]} } ';
    const result = createTelegramIdentityVerifier(config())(signed({ ...fields(), user }));
    expect(result.ok && result.identity.subject).toBe('4503599627370495');
  });

  it('bounds nested JSON and rejects missing required fields', () => {
    const tooDeep = '{"id":1,"nested":' + '['.repeat(33) + '0' + ']'.repeat(33) + '}';
    expect(createTelegramIdentityVerifier(config())(signed({ ...fields(), user: tooDeep }))).toEqual(invalid);
    for (const missing of ['auth_date', 'user']) {
      const data = fields(); delete data[missing];
      expect(createTelegramIdentityVerifier(config())(signed(data))).toEqual(invalid);
    }
  });

  it('snapshots policy; never returns or logs key/input, including clock exceptions', () => {
    const cfg = { ...config(), policy: { ...policy }, now: () => vector.nowMs + 200000 };
    const verify = createTelegramIdentityVerifier(cfg);
    cfg.policy.maxAgeSeconds = 1;
    cfg.botToken = 'changed';
    expect(verify(golden).ok).toBe(true);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = createTelegramIdentityVerifier({ ...config(), now: () => { throw new Error(vector.botToken); } })(golden);
      expect(result).toEqual({ ok: false, error_key: 'access.verifier_unavailable' });
      expect(JSON.stringify(result)).not.toContain(vector.botToken);
      expect(log).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });

  it.each([NaN, Infinity, -1, 1.5, 253402300800000])('fails closed for invalid clock %s', time => {
    expect(createTelegramIdentityVerifier({ ...config(), now: () => time })(golden))
      .toEqual({ ok: false, error_key: 'access.verifier_unavailable' });
  });

  it('rejects unsupported/incomplete configuration without echoing values', () => {
    const cfg = config();
    for (const bad of [null, {}, { ...cfg, extra: 'x' }, { ...cfg, botToken: '' },
      { ...cfg, botId: '1' }, { ...cfg, environment: 'unknown' }, { ...cfg, now: null },
      { ...cfg, policy: { ...policy, maxAgeSeconds: 0 } }, { ...cfg, policy: { ...policy, futureSkewSeconds: -1 } },
      { ...cfg, policy: { ...policy, maxFields: 2 } }, { ...cfg, policy: { ...policy, maxBytes: 1048577 } },
      { ...cfg, policy: { ...policy, revision: 1.5 } }, { ...cfg, policy: { ...policy, arbitrary: 'x' } },
    ]) expect(() => createTelegramIdentityVerifier(bad as TelegramVerifierConfig)).toThrow('access.telegram_config_invalid');
    const getter = vi.fn(() => { throw new Error(vector.botToken); });
    expect(() => createTelegramIdentityVerifier(Object.defineProperty({ ...cfg }, 'botToken', { get: getter })))
      .toThrow('access.telegram_config_invalid');
    expect(getter).not.toHaveBeenCalled();
  });
});

describe('HMAC-SHA256 primitive baseline (RFC 4231 §4.2/4.3; not Telegram canonicalization)', () => {
  it.each([
    [Buffer.alloc(20, 0x0b), 'Hi There', 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'],
    [Buffer.from('Jefe'), 'what do ya want for nothing?', '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'],
  ])('matches RFC digest', (key, data, hash) => {
    expect(createHmac('sha256', key).update(data).digest('hex')).toBe(hash);
  });
});
