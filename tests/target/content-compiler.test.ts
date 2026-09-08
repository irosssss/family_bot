import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { canonicalJson, hashBytes, hashJson } from '../../src/target/content/canonical';
import { compileFrozenContent, freezeContentSources, type CompilerConfig } from '../../src/target/content/compiler';
import { SYNTHETIC_BUILD_LIMITS as limits, validateCompiled, type PackageRef } from '../../src/target/content/compilerContracts';
import { writeContentCandidate } from '../../src/target/content/buildDirectory';

const ref = (slug: string, version = '1.0.0') => ({ package_id: `fixture:package/${slug}`, package_version: version });
function source(slug: string, deps: PackageRef[] = [], version = '1.0.0') {
  return {
    manifest: { schema_version: 1, ...ref(slug, version), name_key: `${slug}.name`, purpose: 'core', definition_paths: [], asset_paths: [],
      registry_paths: [], localization_paths: ['private-source.json'], offer_paths: [], credit_paths: [], rights_paths: [],
      depends_on: deps, required_capabilities: [] as string[] },
    records: [{ record_type: 'localization_bundle', schema_version: 1, bundle_id: `fixture:localization/${slug}`, revision: 1,
      locale: 'ru', fallback_locale: null as string | null,
      entries: [{ key: `${slug}.name`, message: `Тест ${slug}`, syntax: 'plain_text', status: 'draft' }] }],
  };
}
type Source = ReturnType<typeof source>;
async function withSources(sources: Source[], run: (context: { root: string; dirs: string[]; config: CompilerConfig; save: (index: number) => Promise<void> }) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), 'rpg-build-'));
  const dirs = sources.map((_, i) => path.join(root, `source-${i}`));
  async function save(index: number) {
    await mkdir(dirs[index], { recursive: true });
    const item = sources[index];
    item.manifest.localization_paths = item.records.map((_, i) => i === 0 ? 'private-source.json' : `locale-${i}.json`);
    await writeFile(path.join(dirs[index], 'package.json'), JSON.stringify(item.manifest));
    for (const [i, record] of item.records.entries()) await writeFile(path.join(dirs[index], item.manifest.localization_paths[i]), JSON.stringify(record));
  }
  try {
    for (let i = 0; i < sources.length; i++) await save(i);
    await run({ root, dirs, save, config: { rootPackage: ref('root'), sources: dirs.map(root => ({ root, ownedNamespaces: ['fixture'] })),
      requiredLocales: ['ru'], limits } });
  } finally { await rm(root, { recursive: true, force: true }); }
}
const build = async (config: CompilerConfig) => compileFrozenContent(await freezeContentSources(config));

describe('JCS serialization (RFC 8785)', () => {
  it('sorts keys by UTF-16 including integer-shaped keys while retaining arrays', () => {
    expect(canonicalJson({ '2': 'two', '10': 'ten', z: [3, 2, 1], a: 0 })).toBe('{"10":"ten","2":"two","a":0,"z":[3,2,1]}');
    expect(canonicalJson({ '\ue000': 'b', '\u{1f600}': 'a' })).toBe('{"\u{1f600}":"a","\ue000":"b"}');
    expect(hashJson([1, 2])).not.toBe(hashJson([2, 1]));
  });
  it('uses ECMAScript numeric/string escapes and preserves Unicode without normalization', () => {
    expect(canonicalJson([333333333.33333329, 1e30, 4.50, 2e-3, 1e-27, -0])).toBe('[333333333.3333333,1e+30,4.5,0.002,1e-27,0]');
    expect(canonicalJson('\u000f\n"\\')).toBe('"\\u000f\\n\\"\\\\"');
    expect(hashJson('e\u0301')).not.toBe(hashJson('\u00e9'));
    expect(canonicalJson({ coins: '9223372036854775807' })).toBe('{"coins":"9223372036854775807"}');
  });
  it.each([NaN, Infinity, -Infinity, undefined, 1n, new Date(), '\ud800', () => 1, { value: undefined }, new Array(2)])('rejects non-JSON input', value => {
    expect(() => canonicalJson(value)).toThrow('NOT_CANONICAL_JSON_INPUT');
  });
  it('rejects cycles, symbols and getters without executing them', () => {
    const circular: unknown[] = []; circular.push(circular);
    expect(() => canonicalJson(circular)).toThrow('NOT_CANONICAL_JSON_INPUT');
    expect(() => canonicalJson({ [Symbol('private')]: 1 })).toThrow('NOT_CANONICAL_JSON_INPUT');
    let calls = 0;
    expect(() => canonicalJson({ get unsafe() { calls++; return 'hidden'; } })).toThrow('NOT_CANONICAL_JSON_INPUT'); expect(calls).toBe(0);
  });
});

describe('exact dependency resolver', () => {
  it('pins dependency candidates and deduplicates a diamond DAG', async () => withSources([
    source('root', [ref('b'), ref('a')]), source('a', [ref('base')]), source('b', [ref('base')]), source('base'),
  ], async ({ config }) => {
    const result = await build(config);
    expect(result.packages).toHaveLength(4); expect(result.manifest.dependencies).toHaveLength(2);
    expect(result.lock.packages.find(pkg => pkg.package_ref.package_id === ref('root').package_id)!.manifest_digest).toBeNull();
    for (const dependency of result.manifest.dependencies) expect(dependency.manifest_digest).toBe(result.packages.find(pkg => pkg.package_ref.package_id === dependency.package_ref.package_id)!.manifest_digest);
    expect(result.lock.records).toHaveLength(4);
  }));
  it('rejects a missing exact version', async () => withSources([source('root', [ref('base')]), source('base', [], '2.0.0')], async ({ config }) => {
    await expect(build(config)).rejects.toThrow('MISSING_DEPENDENCY');
  }));
  it.each([
    [source('root', [ref('root')])],
    [source('root', [ref('a')]), source('a', [ref('b')]), source('b', [ref('root')])],
  ])('rejects required cycles', async (...items) => withSources(items as Source[], async ({ config }) => { await expect(build(config)).rejects.toThrow('REQUIRED_CYCLE'); }));
  it('rejects two reachable versions while allowing an unused retained version', async () => {
    const items = [source('root', [ref('a'), ref('b')]), source('a', [ref('base')]), source('b', [ref('base', '2.0.0')]), source('base'), source('base', [], '2.0.0')];
    await withSources(items, async ({ config, save }) => {
      await expect(build(config)).rejects.toThrow('PACKAGE_VERSION_CONFLICT');
      items[0].manifest.depends_on = [ref('a')]; await save(0);
      const result = await build(config); expect(result.packages).toHaveLength(3);
      expect(result.lock.packages.some(pkg => pkg.package_ref.package_version === '2.0.0')).toBe(false);
    });
  });
  it('rejects duplicate package/version catalogue entries', async () => withSources([source('root'), source('root')], async ({ config }) => {
    await expect(build(config)).rejects.toThrow('PACKAGE_COLLISION');
  }));
  it('bounds longest dependency path even when the shared tail was already visited', async () => withSources([
    source('root', [ref('a'), ref('z')]), source('a', [ref('tail')]), source('z', [ref('y')]), source('y', [ref('tail')]), source('tail'),
  ], async ({ config }) => { await expect(build({ ...config, limits: { ...limits, maxDependencyDepth: 3 } })).rejects.toThrow('DEPENDENCY_DEPTH_LIMIT'); }));
  it('rejects an unknown required handler', async () => {
    const item = source('root'); item.manifest.required_capabilities = ['custom_code'];
    await withSources([item], async ({ config }) => { await expect(build(config)).rejects.toThrow('UNSUPPORTED_CAPABILITY'); });
  });
  it('allows an identical shared revision and rejects rewriting it', async () => {
    const base = source('base'), root = source('root', [ref('base')]);
    root.records = structuredClone(base.records); root.manifest.name_key = base.manifest.name_key;
    await withSources([root, base], async ({ config, save }) => {
      const result = await build(config); expect(result.artifacts.filter(a => a.storage_key.startsWith('localizations/'))).toHaveLength(1);
      root.records[0].entries[0].message = 'Подмена'; await save(0);
      await expect(build(config)).rejects.toThrow('REVISION_REWRITE');
    });
  });
  it('retains two exact revisions without selecting the greatest revision', async () => {
    const root = source('root', [ref('base')]), base = source('base');
    root.records.push({ ...structuredClone(base.records[0]), revision: 2 });
    root.records.push({ ...structuredClone(base.records[0]), revision: 10 });
    await withSources([root, base], async ({ config }) => {
      const result = await build(config); expect(result.lock.records.filter(r => r.ref.bundle_id === base.records[0].bundle_id).map(r => r.ref.revision)).toEqual([1, 2, 10]);
    });
  });
  it.each([
    [{ maxPackages: 1 }, 'PACKAGE_COUNT_LIMIT'], [{ maxRecords: 1 }, 'GRAPH_RECORD_LIMIT'],
    [{ maxTotalInputBytes: 1 }, 'GRAPH_BYTE_LIMIT'], [{ maxOutputBytes: 1 }, 'OUTPUT_BYTE_LIMIT'], [{ maxDependencyDepth: 0 }, 'INVALID_BUILD_LIMITS'],
  ])('enforces graph/build budgets', async (change, code) => withSources([source('root', [ref('base')]), source('base')], async ({ config }) => {
    await expect(build({ ...config, limits: { ...limits, ...change } })).rejects.toThrow(code);
  }));
});

describe('localization compilation', () => {
  it('resolves an explicit fallback and emits exact locale descriptors', async () => {
    const root = source('root'); const english = { ...structuredClone(root.records[0]), locale: 'en' };
    root.records[0].entries = []; root.records[0].fallback_locale = 'en'; root.records.push(english);
    await withSources([root], async ({ config }) => { const result = await build({ ...config, requiredLocales: ['en', 'ru'] }); expect(result.manifest.localizations).toHaveLength(2); });
  });
  it.each(['missing', 'cycle', 'translation', 'name', 'ambiguous'] as const)('rejects %s localization state', async scenario => {
    const root = source('root'); let code: string;
    if (scenario === 'missing') { root.records[0].fallback_locale = 'en'; code = 'MISSING_FALLBACK_LOCALE'; }
    else if (scenario === 'cycle') { root.records[0].fallback_locale = 'en'; root.records.push({ ...structuredClone(root.records[0]), locale: 'en', fallback_locale: 'ru' }); code = 'FALLBACK_CYCLE'; }
    else if (scenario === 'translation') { root.records.push({ ...structuredClone(root.records[0]), locale: 'en', entries: [{ ...root.records[0].entries[0], key: 'additional.text' }] }); code = 'MISSING_TRANSLATION'; }
    else if (scenario === 'name') { root.manifest.name_key = 'missing.name'; code = 'MISSING_TEXT_KEY'; }
    else { root.records.push({ ...structuredClone(root.records[0]), bundle_id: 'fixture:localization/other', entries: [{ ...root.records[0].entries[0], message: 'Другой' }] }); code = 'AMBIGUOUS_TEXT_KEY'; }
    await withSources([root], async ({ config }) => { await expect(build(config)).rejects.toThrow(code); });
  });
  it.each([[], ['ru', 'ru'], ['RU']])('rejects an invalid locale policy', async (...locales) => withSources([source('root')], async ({ config }) => {
    await expect(build({ ...config, requiredLocales: locales as string[] })).rejects.toThrow('INVALID_LOCALE_POLICY');
  }));
  it('validates generated runtime/manifest/lock with closed schemas', async () => withSources([source('root')], async ({ config }) => {
    const result = await build(config), runtime = JSON.parse(result.artifacts.find(a => a.storage_key.startsWith('localizations/'))!.bytes);
    validateCompiled('runtime', runtime); validateCompiled('manifest', result.manifest); validateCompiled('lock', result.lock);
    expect(() => validateCompiled('runtime', { ...runtime, source_path: 'private' })).toThrow('COMPILER_CONTRACT_FAILED');
    expect(() => validateCompiled('manifest', { ...result.manifest, active: true })).toThrow('COMPILER_CONTRACT_FAILED');
  }));
});

describe('frozen input, reproducibility and privacy', () => {
  it('ignores whitespace/object/set ordering, source order and source filename in semantic outputs', async () => {
    const root = source('root', [ref('b'), ref('a')]);
    root.records[0].entries.push({ ...root.records[0].entries[0], key: 'root.extra' });
    await withSources([root, source('a'), source('b')], async ({ config, dirs }) => {
      const before = await build(config);
      root.manifest.depends_on.reverse(); root.manifest.localization_paths = ['renamed.json']; root.records[0].entries.reverse();
      await rename(path.join(dirs[0], 'private-source.json'), path.join(dirs[0], 'renamed.json'));
      await writeFile(path.join(dirs[0], 'renamed.json'), JSON.stringify(Object.fromEntries(Object.entries(root.records[0]).reverse()), null, 2));
      await writeFile(path.join(dirs[0], 'package.json'), JSON.stringify(Object.fromEntries(Object.entries(root.manifest).reverse()), null, 2));
      const after = await build({ ...config, sources: [...config.sources].reverse() });
      expect(after.build_fingerprint).toBe(before.build_fingerprint); expect(after.artifacts).toEqual(before.artifacts);
      expect(after.report.input_inventory_digest).not.toBe(before.report.input_inventory_digest);
    });
  });
  it('keeps a captured snapshot immutable and a saved lock rejects new source semantics', async () => {
    const root = source('root');
    await withSources([root], async ({ config, save }) => {
      const frozen = await freezeContentSources(config), before = compileFrozenContent(frozen);
      expect(Object.isFrozen(before.lock.toolchain)).toBe(true);
      expect(() => { before.lock.packages[0].semantic_digest = 'x'; }).toThrow();
      expect(() => compileFrozenContent({ ...frozen })).toThrow('UNTRUSTED_BUILD_INPUT');
      root.records[0].entries[0].message = 'Изменено'; await save(0);
      expect(compileFrozenContent(frozen).artifacts).toEqual(before.artifacts);
      const next = await freezeContentSources(config);
      expect(compileFrozenContent(next).build_fingerprint).not.toBe(before.build_fingerprint);
      expect(() => compileFrozenContent(next, before.lock)).toThrow('LOCK_CHANGED');
      expect(compileFrozenContent(frozen, JSON.parse(canonicalJson(before.lock))).manifest_digest).toBe(before.manifest_digest);
      const tampered = structuredClone(before.lock); tampered.toolchain.configuration_digest = 'a'.repeat(64);
      expect(() => compileFrozenContent(frozen, tampered)).toThrow('LOCK_CHANGED');
      expect(() => compileFrozenContent(frozen, { ...before.lock, extra: true })).toThrow('COMPILER_CONTRACT_FAILED');
    });
  });
  it('binds compiler configuration and dependency changes to the root fingerprint', async () => {
    const base = source('base');
    await withSources([source('root', [ref('base')]), base], async ({ config, save }) => {
      const before = await build(config);
      expect((await build({ ...config, limits: { ...limits, maxOutputBytes: limits.maxOutputBytes - 1 } })).build_fingerprint).not.toBe(before.build_fingerprint);
      base.records[0].entries[0].message = 'Новая зависимость'; await save(1);
      const after = await build(config); expect(after.manifest_digest).not.toBe(before.manifest_digest);
      expect(after.manifest.dependencies[0].manifest_digest).not.toBe(before.manifest.dependencies[0].manifest_digest);
    });
  });
  it('excludes review status from public/semantic hashes while retaining private review counts', async () => {
    const root = source('root');
    await withSources([root], async ({ config, save }) => {
      const before = await build(config); root.records[0].entries[0].status = 'reviewed'; await save(0); const after = await build(config);
      expect(after.build_fingerprint).toBe(before.build_fingerprint); expect(after.report.unreviewed_messages).toBe(0);
      expect(before.report.unreviewed_messages).toBe(1); expect(after.production_ready).toBe(false);
    });
  });
  it('hashes actual public bytes and excludes local paths, raw inventory and review metadata', async () => withSources([source('root')], async ({ config, root }) => {
    const result = await build(config);
    for (const artifact of result.artifacts) {
      expect(hashBytes(artifact.bytes)).toBe(artifact.digest); expect(Buffer.byteLength(artifact.bytes)).toBe(artifact.byte_size);
      for (const forbidden of [root, 'private-source', 'source_path', 'raw_digest', 'draft', 'unreviewed_messages']) expect(artifact.bytes).not.toContain(forbidden);
    }
    expect(result.lock.records[0].semantic_digest).not.toBe(result.manifest.localizations[0].public_projection_digest);
    expect(JSON.stringify(result.lock)).not.toContain(root);
    expect(result.report.pending_checks).toContain('publication');
  }));
});

describe('local candidate writer and CLI', () => {
  it('writes new runtime/private trees and refuses overwrite or forged results', async () => withSources([source('root')], async ({ config, root }) => {
    const result = await build(config), out = path.join(root, 'candidate');
    const marker = await writeContentCandidate(result, out); expect(marker.status).toBe('local_candidate');
    expect(marker.manifest_digest).toBe(result.manifest_digest);
    for (const artifact of result.artifacts) expect(await readFile(path.join(out, 'runtime', artifact.storage_key), 'utf8')).toBe(artifact.bytes);
    expect((await stat(path.join(out, 'private'))).mode & 0o777).toBe(0o700);
    await expect(writeContentCandidate(result, out)).rejects.toThrow('OUTPUT_DIRECTORY_UNAVAILABLE');
    await expect(writeContentCandidate({ ...result }, path.join(root, 'forged'))).rejects.toThrow('UNTRUSTED_COMPILER_RESULT');
    expect(await readdir(root)).not.toContain('forged');
  }));
  it('builds in fresh processes with a saved lock, then rejects a changed source before writing', async () => {
    const rootSource = source('root');
    await withSources([rootSource], async ({ config, root, dirs, save }) => {
      const exec = promisify(execFile);
      const command = (out: string, lock?: string) => exec(process.execPath, ['--import', 'tsx', 'scripts/target/content-build.ts', out,
        config.rootPackage.package_id, config.rootPackage.package_version, 'fixture', ...dirs,
        ...(lock ? ['--check-lock', lock] : [])], { cwd: process.cwd(), env: { PATH: process.env.PATH }, timeout: 20000 });
      const one = path.join(root, 'one'), two = path.join(root, 'two');
      const first = JSON.parse((await command(one)).stdout), second = JSON.parse((await command(two, path.join(one, 'private/lock.json'))).stdout);
      expect(first.build_fingerprint).toBe(second.build_fingerprint); expect(first.candidate_id).not.toBe(second.candidate_id);
      expect(await readFile(path.join(one, 'private/lock.json'), 'utf8')).toBe(await readFile(path.join(two, 'private/lock.json'), 'utf8'));
      rootSource.records[0].entries[0].message = 'Другой кандидат'; await save(0);
      await expect(command(path.join(root, 'three'), path.join(one, 'private/lock.json'))).rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('LOCK_CHANGED') });
      expect(await readdir(root)).not.toContain('three');
    });
  });
});
