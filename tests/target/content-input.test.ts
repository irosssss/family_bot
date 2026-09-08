import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm, symlink, mkdir, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseContentJson, SYNTHETIC_INPUT_LIMITS as limits, ContentInputError } from '../../src/target/content/json';
import { readContentPackage, validateSourcePath } from '../../src/target/content/input';
import { validatePackage, validateRecord } from '../../src/target/content/schemas';
import { uint } from '../../src/target/contracts/numbers';

const parse = (text: string, overrides = {}) => parseContentJson(Buffer.from(text), 'fixture.json', { ...limits, ...overrides });
const packageInput = () => ({ schema_version: 1, package_id: 'fixture:package/texts', package_version: '1.0.0', name_key: 'fixture.package.name', purpose: 'core',
  definition_paths: [], asset_paths: [], registry_paths: [], localization_paths: ['texts.json'], offer_paths: [], credit_paths: [], rights_paths: [],
  depends_on: [], required_capabilities: [] });
const localization = () => ({ record_type: 'localization_bundle', schema_version: 1, bundle_id: 'fixture:localization/interface', revision: 1,
  locale: 'ru', fallback_locale: null, entries: [{ key: 'fixture.package.name', message: 'Тестовый пакет', syntax: 'plain_text', status: 'draft' }] });
const read = (root: string, overrides = {}) => readContentPackage({ root, ownedNamespaces: ['fixture'], limits, ...overrides });
async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), 'rpg-content-'));
  try { await writeFile(path.join(root, 'package.json'), JSON.stringify(packageInput())); await writeFile(path.join(root, 'texts.json'), JSON.stringify(localization())); await run(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}
describe('bounded authoring JSON', () => {
  it.each([
    ['{"key":1,"key":2}', 'DUPLICATE_KEY'], ['{"key":1,"\\u006bey":2}', 'DUPLICATE_KEY'],
    ['{"nested":{"x":1,"x":2}}', 'DUPLICATE_KEY'], ['"\\ud800"', 'INVALID_UNICODE'], ['"e\\u0301"', 'INVALID_UNICODE'],
    ['{"coins":9007199254740993}', 'UNSAFE_NUMBER'], ['-0', 'UNSAFE_NUMBER'], ['1.2', 'INVALID_JSON_NUMBER'],
    ['1e3', 'INVALID_JSON_NUMBER'], ['[1,]', 'INVALID_JSON_NUMBER'], ['{"x":1,}', 'INVALID_JSON'],
    ['{} trailing', 'INVALID_JSON'], ['\ufeff{}', 'INVALID_JSON_NUMBER'], ['"\\x00"', 'INVALID_JSON'],
  ])('rejects malformed input %s', (input, code) => { expect(() => parse(input)).toThrow(code); });
  it('rejects invalid raw UTF-8', () => { expect(() => parseContentJson(new Uint8Array([0xc0, 0xaf]), 'x', limits)).toThrow('INVALID_UNICODE'); });
  it('keeps int64 decimal strings exact and handles prototype-shaped keys safely', () => {
    const value = parse('{"coins":"9223372036854775807","__proto__":{"safe":true},"s":"\\ud83d\\ude00"}') as Record<string, unknown>;
    expect(uint(value.coins)).toBe('9223372036854775807'); expect(Object.getPrototypeOf(value)).toBeNull();
    expect(Object.hasOwn(value, '__proto__')).toBe(true);
  });
  it.each([
    ['"abcd"', { maxStringLength: 3 }, 'STRING_TOO_LONG'], ['[[[0]]]', { maxDepth: 2 }, 'DEPTH_LIMIT'],
    ['[1,2]', { maxNodes: 2 }, 'NODE_LIMIT'], ['{}', { maxFileBytes: 1 }, 'FILE_TOO_LARGE'],
    ['{}', { maxDepth: 0 }, 'INVALID_LIMITS'],
  ])('bounds resources', (input, overrides, code) => { expect(() => parse(input, overrides)).toThrow(code); });
  it('reports escaped JSON pointer without the value', () => {
    try { parse('{"a/b":{"~":1,"~":"private"}}'); throw new Error('accepted'); }
    catch (error) { expect(error).toBeInstanceOf(ContentInputError); expect((error as ContentInputError).pointer).toBe('/a~1b/~0'); expect(JSON.stringify(error)).not.toContain('private'); }
  });
});
describe('closed 2020-12 authoring schemas', () => {
  it('checks uniqueItems on parsed null-prototype dependencies without invoking prototype-shaped keys', () => {
    const first = { package_id: 'fixture:package/one', package_version: '1.0.0' };
    const second = { package_id: 'fixture:package/two', package_version: '1.0.0' };
    const input = (depends_on: unknown[]) => parse(JSON.stringify({ ...packageInput(), depends_on }));
    expect(validatePackage(input([first, second]), 'x').depends_on).toHaveLength(2);
    expect(() => validatePackage(input([first, { package_version: '1.0.0', package_id: first.package_id }]), 'x')).toThrow('INVALID_FIELD');
    expect(() => validatePackage(input([{ ...first, valueOf: 'not callable' }, second]), 'x')).toThrow('INVALID_FIELD');
    expect(() => validatePackage(input([{ ...first, constructor: 'private' }, second]), 'x')).toThrow('INVALID_FIELD');
  });
  it('accepts only the registered localization contract', () => { expect(validateRecord(localization(), 'x').locale).toBe('ru'); });
  it.each(['fixture:pet/interface', 'fixture:package/interface', 'fixture:registry/interface'])('rejects the wrong bundle ID kind: %s', bundle_id => {
    expect(() => validateRecord({ ...localization(), bundle_id }, 'texts.json')).toThrow('INVALID_FIELD');
  });
  it.each(['\u{1f1f7}\u{1f1fa}', '1\uFE0F\u20E3', '#\u20E3', '*\uFE0F\u20E3', '\u{1f3fd}'])('rejects emoji components and sequences %j', message => {
    expect(() => validateRecord({ ...localization(), entries: [{ ...localization().entries[0], message }] }, 'texts.json')).toThrow('INVALID_MESSAGE');
  });
  it('retains ordinary numbers and punctuation in plain text', () => {
    const message = 'Задание #1: 2 * 3 = 6. Готово!';
    expect(validateRecord({ ...localization(), entries: [{ ...localization().entries[0], message }] }, 'texts.json').entries[0].message).toBe(message);
  });
  it.each([
    [{ record_type: 'boss' }, 'UNKNOWN_CONTRACT'], [{ schema_version: 2 }, 'UNSUPPORTED_SCHEMA'],
    [{ digest: 'pretend' }, 'INVALID_FIELD'], [{ revision: '1' }, 'INVALID_FIELD'], [{ locale: 'RU' }, 'INVALID_LOCALE'],
    [{ fallback_locale: 'ru' }, 'FALLBACK_CYCLE'], [{ entries: [{ ...localization().entries[0], syntax: 'icu' }] }, 'INVALID_FIELD'],
    [{ entries: [{ ...localization().entries[0], message: '<script>x</script>' }] }, 'INVALID_FIELD'],
    [{ entries: [{ ...localization().entries[0], message: '\u{1f600}' }] }, 'INVALID_MESSAGE'],
    [{ entries: [...localization().entries, { ...localization().entries[0], message: 'Другой текст' }] }, 'DUPLICATE_TEXT_KEY'],
  ])('rejects unsupported record properties', (change, code) => { expect(() => validateRecord({ ...localization(), ...change }, 'x')).toThrow(code); });
  it.each([{ published_at: null }, { package_version: '^1.0.0' }, { schema_version: 2 }, { depends_on: [{ package_id: 'fixture:package/base', package_version: 'latest' }] }])('rejects invalid package', change => {
    expect(() => validatePackage({ ...packageInput(), ...change }, 'package.json')).toThrow('INVALID_FIELD');
  });
});
describe('explicit local source boundary', () => {
  it.each(['../secret', '/tmp/x', 'a//b', 'a/./b', 'a/../b', 'a\\b', 'https://x', 'a?b', 'a#b', 'a%2fb', ''])('rejects path %s', file => { expect(() => validateSourcePath(file)).toThrow('INVALID_PATH'); });
  it('reads explicit inputs only and returns reproducible raw digests', async () => fixture(async root => {
    await writeFile(path.join(root, 'ignored.json'), 'not JSON');
    const result = await read(root); expect(result.inputs).toHaveLength(2); expect(result.records).toHaveLength(1);
    expect((await read(root)).inputs).toEqual(result.inputs);
  }));
  it('rejects unowned namespaces', async () => fixture(async root => { await expect(read(root, { ownedNamespaces: ['other'] })).rejects.toThrow('NAMESPACE_NOT_OWNED'); }));
  it('rejects record namespace substitution', async () => fixture(async root => {
    await writeFile(path.join(root, 'texts.json'), JSON.stringify({ ...localization(), bundle_id: 'other:localization/interface' }));
    await expect(read(root)).rejects.toThrow('NAMESPACE_NOT_OWNED');
  }));
  it('rejects symlinks and hardlinks before reading their content', async () => fixture(async root => {
    const target = path.join(root, 'texts.json'); await rm(target); await symlink('/etc/hosts', target);
    await expect(read(root)).rejects.toThrow('SYMLINK_FORBIDDEN');
    await rm(target); await link(path.join(root, 'package.json'), target);
    await expect(read(root)).rejects.toThrow('REGULAR_FILE_REQUIRED');
  }));
  it('rejects symlink ancestors', async () => fixture(async root => {
    await symlink('/etc', path.join(root, 'outside'));
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ ...packageInput(), localization_paths: ['outside/hosts'] }));
    await expect(read(root)).rejects.toThrow('SYMLINK_FORBIDDEN');
  }));
  it('rejects directories and wrong case', async () => fixture(async root => {
    await rm(path.join(root, 'texts.json')); await mkdir(path.join(root, 'texts.json'));
    await expect(read(root)).rejects.toThrow('REGULAR_FILE_REQUIRED');
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ ...packageInput(), localization_paths: ['TEXTS.json'] }));
    await expect(read(root)).rejects.toThrow('PATH_CASE_OR_MISSING');
  }));
  it('rejects case collisions and group reuse before records are opened', async () => fixture(async root => {
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ ...packageInput(), asset_paths: ['TEXTS.json'] }));
    await expect(read(root)).rejects.toThrow('PATH_COLLISION');
  }));
  it('rejects duplicate identity/revision with altered content', async () => fixture(async root => {
    await writeFile(path.join(root, 'two.json'), JSON.stringify({ ...localization(), entries: [] }));
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ ...packageInput(), localization_paths: ['texts.json', 'two.json'] }));
    await expect(read(root)).rejects.toThrow('REVISION_REWRITE');
  }));
  it('rejects records filed in the wrong group', async () => fixture(async root => {
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ ...packageInput(), localization_paths: [], registry_paths: ['texts.json'] }));
    await expect(read(root)).rejects.toThrow('WRONG_RECORD_GROUP');
  }));
  it('enforces aggregate file and byte limits', async () => fixture(async root => {
    await expect(read(root, { limits: { ...limits, maxFiles: 1 } })).rejects.toThrow('FILE_COUNT_LIMIT');
    await expect(read(root, { limits: { ...limits, maxTotalBytes: 8 } })).rejects.toThrow('SOURCE_CHANGED_OR_LIMIT');
  }));
});
