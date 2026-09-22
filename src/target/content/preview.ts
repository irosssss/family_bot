import type { compileFrozenContent } from './compiler';
import { assertCompilerResult } from './artifactAuthority';
import { canonicalJson, freezeJson, hashBytes, hashJson } from './canonical';
import { COMPATIBILITY_PROFILE, schemaRegistry, validateCompiled } from './compilerContracts';
import { ContentInputError } from './json';

type Build = ReturnType<typeof compileFrozenContent>;
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/** Local inspection of the exact immutable compiler output. No publication authority. */
export function previewContentCandidate(build: Build) {
  assertCompilerResult(build);
  const sections: string[] = [];
  const manifests: string[] = [];
  let entryCount = 0;
  for (const pkg of build.packages) {
    const artifact = build.artifacts.find(item => item.storage_key === `manifests/${pkg.manifest_digest}.json`);
    if (!artifact || hashBytes(artifact.bytes) !== pkg.manifest_digest) throw new ContentInputError('PREVIEW_MANIFEST_MISMATCH', '');
    const manifest = JSON.parse(artifact.bytes) as Build['manifest'];
    validateCompiled('manifest', manifest);
    const runtimeRef = schemaRegistry.filter(ref => ref.contract_id === COMPATIBILITY_PROFILE.runtime_schema);
    if (canonicalJson(manifest.runtime_schema_refs) !== canonicalJson(runtimeRef)
      || canonicalJson(manifest.compatibility_contract) !== canonicalJson({ registry_id: COMPATIBILITY_PROFILE.registry_id, revision: COMPATIBILITY_PROFILE.revision })
      || canonicalJson(manifest.required_capabilities) !== canonicalJson(['plain_text_localization'])) {
      throw new ContentInputError('PREVIEW_UNSUPPORTED_CONTRACT', '');
    }
    manifests.push(pkg.manifest_digest);
    for (const descriptor of manifest.localizations) {
      const data = build.artifacts.find(item => item.storage_key === descriptor.storage_key);
      if (!data || hashBytes(data.bytes) !== descriptor.public_projection_digest || Buffer.byteLength(data.bytes) !== descriptor.byte_size) {
        throw new ContentInputError('PREVIEW_ARTIFACT_MISMATCH', '');
      }
      const runtime = JSON.parse(data.bytes) as { bundle_id: string; locale: string; entries: { key: string; message: string }[] };
      validateCompiled('runtime', runtime);
      entryCount += runtime.entries.length;
      sections.push(`<section><h2>${escape(runtime.bundle_id)} · ${escape(runtime.locale)}</h2>${runtime.entries.map(entry => `<article><code>${escape(entry.key)}</code><p>${escape(entry.message)}</p></article>`).join('')}</section>`);
    }
  }
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Проверка контентного пакета</title><style>body{font:16px/1.5 system-ui;margin:0;background:#f6f3ed;color:#28251f}main{max-width:850px;margin:auto;padding:20px}h1{font-size:26px}h2{font-size:18px;overflow-wrap:anywhere}code{overflow-wrap:anywhere;font-size:12px}article{background:white;border:1px solid #d6cfc3;border-radius:8px;padding:14px;margin:10px 0}p{white-space:pre-wrap;overflow-wrap:anywhere}.note{border-left:4px solid #866342;padding-left:12px}</style></head><body><main><h1>Проверка контентного пакета</h1><p class="note">Локальный кандидат. Тексты показаны без выполнения разметки. Просмотр не означает одобрение или публикацию.</p><p>${escape(build.root_package.package_id)} · ${escape(build.root_package.package_version)}</p><p>Manifest: <code>${build.manifest_digest}</code><br>Build: <code>${build.build_fingerprint}</code></p>${sections.join('')}</main></body></html>`;
  const report = freezeJson({ schema_version: 1, preview_version: 'plain_text_preview_v1',
    build_fingerprint: build.build_fingerprint, manifest_digest: build.manifest_digest, lock_digest: build.lock_digest,
    compiler_report_digest: hashJson(build.report), rendered_manifest_digests: manifests, entry_count: entryCount,
    html_digest: hashBytes(html), status: 'generated_not_reviewed', production_ready: false,
    pending_checks: [...build.report.pending_checks, 'human_preview_review', 'visual_compatibility_not_applicable_to_plain_text'] });
  return Object.freeze({ html, report });
}
