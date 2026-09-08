import { readContentPackage } from './input';
import { canonicalJson, compareText, freezeJson, hashBytes, hashJson } from './canonical';
import { ContentInputError } from './json';
import { type LocalizationInput } from './schemas';
import { registerCompilerResult } from './artifactAuthority';
export { writeContentCandidate } from './buildDirectory';
export { createLocalReleaseService } from './localRelease';
export { createLocalArtifactStore, openLocalArtifactStore } from './localStorage';
import { checkedBuildLimits, COMPATIBILITY_PROFILE, packageRef, schemaRegistry, validateCompiled,
  type BuildLimits, type PackageRef } from './compilerContracts';

type Source = Awaited<ReturnType<typeof readContentPackage>>;
export interface CompilerConfig {
  rootPackage: PackageRef;
  sources: { root: string; ownedNamespaces: readonly string[] }[];
  limits: BuildLimits;
  requiredLocales: readonly string[];
}
export interface FrozenContentInput {
  readonly root_package: Readonly<PackageRef>;
  readonly input_inventory_digest: string;
}
interface Snapshot { sources: Source[]; root: PackageRef; limits: BuildLimits; locales: string[]; inventory: unknown[] }
const snapshots = new WeakMap<FrozenContentInput, Snapshot>();
const fail = (code: string, file = '', pointer = ''): never => { throw new ContentInputError(code, file, pointer); };
const refKey = (ref: PackageRef) => `${ref.package_id}@${ref.package_version}`;
const sourceRef = (source: Source) => packageRef({ package_id: source.package.package_id, package_version: source.package.package_version });
const recordRef = (record: LocalizationInput) => ({ bundle_id: record.bundle_id, revision: record.revision, locale: record.locale });
const recordRefCompare = (a: { bundle_id: string; revision: number; locale: string }, b: { bundle_id: string; revision: number; locale: string }) =>
  compareText(a.bundle_id, b.bundle_id) || a.revision - b.revision || compareText(a.locale, b.locale);
const recordKey = (record: LocalizationInput) => canonicalJson(recordRef(record));
const refCompare = (a: PackageRef, b: PackageRef) => compareText(a.package_id, b.package_id) || (() => {
  const av = a.package_version.split('.'), bv = b.package_version.split('.');
  for (let i = 0; i < 3; i++) { const order = av[i].length - bv[i].length || compareText(av[i], bv[i]); if (order) return order; }
  return 0;
})();

/** Capture explicit local sources once. Later compilation reads only these frozen values. */
export async function freezeContentSources(config: CompilerConfig): Promise<FrozenContentInput> {
  const limits = checkedBuildLimits(config.limits), root = packageRef(config.rootPackage);
  if (!Array.isArray(config.sources) || !config.sources.length || config.sources.length > limits.maxPackages) return fail('PACKAGE_COUNT_LIMIT');
  const requested = config.sources.map(source => ({ root: source.root, ownedNamespaces: [...source.ownedNamespaces] }));
  const locales = [...config.requiredLocales];
  if (!locales.length || locales.length > 16 || new Set(locales).size !== locales.length) return fail('INVALID_LOCALE_POLICY');
  for (const locale of locales) {
    try { if (typeof locale !== 'string' || Intl.getCanonicalLocales(locale)[0] !== locale) return fail('INVALID_LOCALE_POLICY'); }
    catch { return fail('INVALID_LOCALE_POLICY'); }
  }
  locales.sort(compareText);
  const sources: Source[] = [], keys = new Set<string>();
  let total = 0, records = 0;
  for (const source of requested) {
    const parsed = await readContentPackage({ ...source, limits: limits.input });
    total += parsed.total_bytes; records += parsed.records.length;
    if (total > limits.maxTotalInputBytes) return fail('GRAPH_BYTE_LIMIT');
    if (records > limits.maxRecords) return fail('GRAPH_RECORD_LIMIT');
    const key = refKey(sourceRef(parsed));
    if (keys.has(key)) return fail('PACKAGE_COLLISION');
    keys.add(key); sources.push(freezeJson(parsed));
  }
  sources.sort((a, b) => refCompare(sourceRef(a), sourceRef(b)));
  const inventory = sources.flatMap(source => source.inputs.map(input => ({ package_ref: sourceRef(source), ...input })))
    .sort((a, b) => refCompare(a.package_ref, b.package_ref) || compareText(a.path, b.path));
  const token = freezeJson({ root_package: root, input_inventory_digest: hashJson(inventory) });
  snapshots.set(token, freezeJson({ sources, root, limits, locales, inventory }));
  return token;
}

function projected(record: LocalizationInput) {
  return { schema_version: 1 as const, bundle_id: record.bundle_id, revision: record.revision, locale: record.locale,
    fallback_locale: record.fallback_locale,
    // Text entries are keyed lookup data, not an ordered sequence of actions/layers.
    entries: record.entries.map(entry => ({ key: entry.key, message: entry.message, syntax: entry.syntax }))
      .sort((a, b) => compareText(a.key, b.key)) };
}
function semantic(record: LocalizationInput) {
  return { hash_scope_version: 1, record_type: 'localization_bundle', ...projected(record) };
}
function packageSemantic(source: Source) {
  return { hash_scope_version: 1, package: sourceRef(source), name_key: source.package.name_key, purpose: source.package.purpose,
    depends_on: [...source.package.depends_on].sort(refCompare), required_capabilities: [...source.package.required_capabilities].sort(compareText),
    records: source.records.map(({ value }) => ({ ref: recordRef(value), semantic_digest: hashJson(semantic(value)) }))
      .sort((a, b) => recordRefCompare(a.ref, b.ref)) };
}

function resolveGraph(snapshot: Snapshot) {
  const catalogue = new Map(snapshot.sources.map(source => [refKey(sourceRef(source)), source]));
  const activeVersion = new Map<string, string>(), state = new Map<string, 'visiting' | 'done'>();
  const ordered: Source[] = [], heights = new Map<string, number>();
  function visit(ref: PackageRef): number {
    const key = refKey(ref), source = catalogue.get(key);
    if (!source) return fail('MISSING_DEPENDENCY');
    if (state.get(key) === 'visiting') return fail('REQUIRED_CYCLE');
    const selected = activeVersion.get(ref.package_id);
    if (selected && selected !== ref.package_version) return fail('PACKAGE_VERSION_CONFLICT');
    activeVersion.set(ref.package_id, ref.package_version);
    if (state.get(key) === 'done') return heights.get(key)!;
    state.set(key, 'visiting');
    // Bound recursion before traversing; longest-path height below also handles shared DAG tails.
    if ([...state.values()].filter(value => value === 'visiting').length > snapshot.limits.maxDependencyDepth) return fail('DEPENDENCY_DEPTH_LIMIT');
    if (source.package.required_capabilities.some(capability => capability !== 'plain_text_localization')) return fail('UNSUPPORTED_CAPABILITY', 'package.json', '/required_capabilities');
    const ids = new Set<string>(); let height = 1;
    for (const dependency of [...source.package.depends_on].sort(refCompare)) {
      if (ids.has(dependency.package_id)) return fail('PACKAGE_VERSION_CONFLICT', 'package.json', '/depends_on');
      ids.add(dependency.package_id); height = Math.max(height, 1 + visit(dependency));
    }
    if (height > snapshot.limits.maxDependencyDepth) return fail('DEPENDENCY_DEPTH_LIMIT');
    state.set(key, 'done'); heights.set(key, height); ordered.push(source); return height;
  }
  visit(snapshot.root);
  const definitions = new Map<string, string>();
  for (const source of ordered) for (const { path, value } of source.records) {
    const key = recordKey(value), digest = hashJson(semantic(value)), previous = definitions.get(key);
    if (previous && previous !== digest) return fail('REVISION_REWRITE', path);
    definitions.set(key, digest);
  }
  function closure(source: Source): Source[] {
    const found = new Map<string, Source>();
    function add(item: Source) {
      const key = refKey(sourceRef(item)); if (found.has(key)) return;
      found.set(key, item);
      for (const dependency of item.package.depends_on) add(catalogue.get(refKey(dependency))!);
    }
    add(source); return [...found.values()].sort((a, b) => refCompare(sourceRef(a), sourceRef(b)));
  }
  return { ordered, closure };
}

function validateLocalization(source: Source, graph: Source[], locales: string[]) {
  const groups = new Map<string, Map<string, LocalizationInput>>();
  for (const item of graph) for (const { value } of item.records) {
    const key = canonicalJson([value.bundle_id, value.revision]);
    if (!groups.has(key)) groups.set(key, new Map());
    groups.get(key)!.set(value.locale, value);
  }
  for (const group of groups.values()) {
    function chain(locale: string): LocalizationInput[] {
      const seen = new Set<string>(), result: LocalizationInput[] = [];
      let current: string | null = locale;
      while (current !== null) {
        if (seen.has(current)) return fail('FALLBACK_CYCLE');
        seen.add(current);
        const bundle = group.get(current);
        if (!bundle) return fail('MISSING_FALLBACK_LOCALE');
        result.push(bundle); current = bundle.fallback_locale;
      }
      return result;
    }
    for (const locale of group.keys()) chain(locale);
    const allKeys = new Set([...group.values()].flatMap(record => record.entries.map(entry => entry.key)));
    for (const locale of locales) {
      const available = new Set(chain(locale).flatMap(record => record.entries.map(entry => entry.key)));
      for (const key of allKeys) if (!available.has(key)) return fail('MISSING_TRANSLATION');
    }
  }
  for (const locale of locales) {
    const messages = new Set<string>();
    for (const group of groups.values()) {
      let bundle = group.get(locale);
      while (bundle) {
        const entry = bundle.entries.find(entry => entry.key === source.package.name_key);
        if (entry) { messages.add(entry.message); break; }
        bundle = bundle.fallback_locale === null ? undefined : group.get(bundle.fallback_locale);
      }
    }
    if (!messages.size) return fail('MISSING_TEXT_KEY', 'package.json', '/name_key');
    if (messages.size > 1) return fail('AMBIGUOUS_TEXT_KEY', 'package.json', '/name_key');
  }
}

export interface OutputArtifact { storage_key: string; bytes: string; digest: string; byte_size: number }
type BuiltPackage = ReturnType<typeof buildPackage>;
function buildPackage(source: Source, graph: Source[], built: ReadonlyMap<string, { manifest_digest: string }>, snapshot: Snapshot) {
  validateLocalization(source, graph, snapshot.locales);
  const configDigest = hashJson({ limits: snapshot.limits, locales: snapshot.locales, compatibility: COMPATIBILITY_PROFILE });
  const lock = {
    schema_version: 1, root_package: sourceRef(source),
    packages: graph.map(item => ({ package_ref: sourceRef(item), semantic_digest: hashJson(packageSemantic(item)),
      manifest_digest: item === source ? null : built.get(refKey(sourceRef(item)))!.manifest_digest })),
    records: graph.flatMap(item => item.records.map(({ value }) => ({ kind: 'localization_bundle', ref: recordRef(value),
      semantic_digest: hashJson(semantic(value)), supplier: sourceRef(item) })))
      .sort((a, b) => recordRefCompare(a.ref, b.ref) || refCompare(a.supplier, b.supplier)),
    binary_inputs: [], schema_refs: schemaRegistry,
    toolchain: { compiler: 'family_content_plain_text', compiler_version: '1.0.0', exporter_version: '1.0.0',
      canonicalization: 'rfc8785', hash_scope_version: 1, ajv_version: '8.20.0', node_version: process.versions.node,
      unicode_version: process.versions.unicode, icu_version: process.versions.icu, configuration_digest: configDigest },
    optional_resolutions: [],
  };
  validateCompiled('lock', lock);
  const lockBytes = canonicalJson(lock), lockDigest = hashBytes(lockBytes);
  const artifacts: OutputArtifact[] = [];
  const mappings = source.records.map(({ value, path }) => {
    const runtime = projected(value); validateCompiled('runtime', runtime);
    const bytes = canonicalJson(runtime), digest = hashBytes(bytes), storageKey = `localizations/${digest}.json`;
    const byteSize = Buffer.byteLength(bytes);
    artifacts.push({ storage_key: storageKey, bytes, digest, byte_size: byteSize });
    return { descriptor: { ref: recordRef(value), public_projection_digest: digest, storage_key: storageKey,
      byte_size: byteSize, digest_scope: 'jcs_sha256' }, semantic_digest: hashJson(semantic(value)), source_path: path };
  }).sort((a, b) => recordRefCompare(a.descriptor.ref, b.descriptor.ref));
  const manifest = {
    schema_version: 1, package: sourceRef(source), lock_digest: lockDigest,
    runtime_schema_refs: schemaRegistry.filter(ref => ref.contract_id === COMPATIBILITY_PROFILE.runtime_schema),
    required_capabilities: ['plain_text_localization'],
    compatibility_contract: { registry_id: COMPATIBILITY_PROFILE.registry_id, revision: COMPATIBILITY_PROFILE.revision },
    dependencies: [...source.package.depends_on].sort(refCompare).map(ref => ({ package_ref: ref, manifest_digest: built.get(refKey(ref))!.manifest_digest })),
    records: [], assets: [], localizations: mappings.map(item => item.descriptor), attribution: [], migration_refs: [],
  };
  validateCompiled('manifest', manifest);
  const manifestBytes = canonicalJson(manifest), manifestDigest = hashBytes(manifestBytes);
  artifacts.push({ storage_key: `manifests/${manifestDigest}.json`, bytes: manifestBytes,
    digest: manifestDigest, byte_size: Buffer.byteLength(manifestBytes) });
  return { package_ref: sourceRef(source), lock, lock_bytes: lockBytes, lock_digest: lockDigest,
    manifest, manifest_bytes: manifestBytes, manifest_digest: manifestDigest, artifacts, mappings };
}

/** No filesystem, network, database or publication here. Only module-created immutable snapshots. */
export function compileFrozenContent(input: FrozenContentInput, expectedLock?: unknown) {
  const snapshot = snapshots.get(input);
  if (!snapshot) return fail('UNTRUSTED_BUILD_INPUT');
  const graph = resolveGraph(snapshot), built = new Map<string, BuiltPackage>();
  for (const source of graph.ordered) built.set(refKey(sourceRef(source)), buildPackage(source, graph.closure(source), built, snapshot));
  const root = built.get(refKey(snapshot.root))!;
  if (expectedLock !== undefined) {
    validateCompiled('lock', expectedLock);
    if (canonicalJson(expectedLock) !== root.lock_bytes) return fail('LOCK_CHANGED');
  }
  const outputs = new Map<string, OutputArtifact>();
  for (const pkg of built.values()) for (const artifact of pkg.artifacts) {
    const previous = outputs.get(artifact.storage_key);
    if (previous && previous.bytes !== artifact.bytes) return fail('OUTPUT_COLLISION');
    outputs.set(artifact.storage_key, artifact);
  }
  const artifacts = [...outputs.values()].sort((a, b) => compareText(a.storage_key, b.storage_key));
  const outputBytes = artifacts.reduce((sum, artifact) => sum + artifact.byte_size, 0);
  if (outputBytes > snapshot.limits.maxOutputBytes) return fail('OUTPUT_BYTE_LIMIT');
  const packages = [...built.values()].sort((a, b) => refCompare(a.package_ref, b.package_ref));
  const fingerprint = hashJson({ schema_version: 1, root_package: snapshot.root, lock_digest: root.lock_digest,
    manifest_digest: root.manifest_digest, toolchain: root.lock.toolchain });
  const result = freezeJson({ schema_version: 1, stage: 'local_candidate', production_ready: false, build_fingerprint: fingerprint,
    root_package: snapshot.root, lock: root.lock, lock_digest: root.lock_digest, manifest: root.manifest, manifest_digest: root.manifest_digest,
    artifacts, packages: packages.map(pkg => ({ package_ref: pkg.package_ref, lock: pkg.lock, lock_digest: pkg.lock_digest, manifest_digest: pkg.manifest_digest })),
    report: { schema_version: 1, build_fingerprint: fingerprint, input_inventory_digest: input.input_inventory_digest,
      output_inventory_digest: hashJson(artifacts.map(({ storage_key, digest, byte_size }) => ({ storage_key, digest, byte_size }))),
      input_inventory: snapshot.inventory, output_bytes: outputBytes,
      mappings: packages.flatMap(pkg => pkg.mappings.map(mapping => ({ package_ref: pkg.package_ref, ...mapping }))),
      pending_checks: ['art_review', 'rights_review', 'release_approval', 'production_limits', 'publication', 'activation'],
      unreviewed_messages: graph.ordered.reduce((sum, source) => sum + source.records.reduce((n, record) => n + record.value.entries.filter(entry => entry.status !== 'reviewed').length, 0), 0) },
  });
  registerCompilerResult(result);
  return result;
}
