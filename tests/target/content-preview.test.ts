import { describe, it, expect } from 'vitest';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compileFrozenContent, freezeContentSources } from '../../src/target/content/compiler';
import { SYNTHETIC_BUILD_LIMITS } from '../../src/target/content/compilerContracts';
import { previewContentCandidate } from '../../src/target/content/preview';
import { writeContentCandidate } from '../../src/target/content/buildDirectory';
import { hashBytes, hashJson } from '../../src/target/content/canonical';

async function fixture(run: (root: string, build: () => Promise<ReturnType<typeof compileFrozenContent>>) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), 'rpg-preview-'));
  try {
    await cp('tests/fixtures/content/g04-b', path.join(root, 'sources'), { recursive: true });
    await run(root, async () => compileFrozenContent(await freezeContentSources({
      rootPackage: { package_id: 'fixture:package/root_texts', package_version: '1.0.0' },
      sources: ['root', 'base'].map(name => ({ root: path.join(root, 'sources', name), ownedNamespaces: ['fixture'] })),
      limits: SYNTHETIC_BUILD_LIMITS, requiredLocales: ['ru'],
    })));
  } finally { await rm(root, { recursive: true, force: true }); }
}

describe('G04-D exact candidate preview', () => {
  it('binds root, dependencies and rendered bytes to the compiler result deterministically', async () => fixture(async (_, build) => {
    const compiled = await build(), preview = previewContentCandidate(compiled);
    expect(preview).toEqual(previewContentCandidate(compiled));
    expect(preview.report.manifest_digest).toBe(compiled.manifest_digest);
    expect(preview.report.compiler_report_digest).toBe(hashJson(compiled.report));
    expect(preview.report.html_digest).toBe(hashBytes(preview.html));
    expect(preview.report.rendered_manifest_digests).toEqual(compiled.packages.map(p => p.manifest_digest));
    expect(preview.html).toContain('Подтвердить');
    expect(preview.report.production_ready).toBe(false);
    expect(preview.report.status).toBe('generated_not_reviewed');
  }));
  it('escapes text entities and keeps the frozen candidate unchanged after source edits', async () => fixture(async (root, build) => {
    const file = path.join(root, 'sources/base/texts.json');
    const input = JSON.parse(await readFile(file, 'utf8'));
    input.entries[1].message = 'Текст &lt;script&gt; & "кавычки"';
    await writeFile(file, JSON.stringify(input));
    const compiled = await build();
    const before = previewContentCandidate(compiled);
    expect(before.html).not.toContain('<script>');
    expect(before.html).not.toContain('<img');
    expect(before.html).toContain('&amp;lt;script&amp;gt;');
    expect(before.html).toContain("default-src 'none'");
    input.entries[1].message = 'Другая сборка'; await writeFile(file, JSON.stringify(input));
    expect(previewContentCandidate(compiled)).toEqual(before);
    expect(previewContentCandidate(await build()).report.manifest_digest).not.toBe(before.report.manifest_digest);
  }));
  it('rejects a copied or modified result without compiler provenance', async () => fixture(async (_, build) => {
    const compiled = await build();
    expect(() => previewContentCandidate({ ...compiled })).toThrow('UNTRUSTED_COMPILER_RESULT');
  }));
  it.each(['schema', 'variant', 'handler', 'markup'])('blocks unsupported %s before creating a candidate', async variant => fixture(async (root, build) => {
    const file = path.join(root, 'sources/base/texts.json');
    const input = JSON.parse(await readFile(file, 'utf8'));
    if (variant === 'markup') input.entries[0].message = '<script>alert(1)</script>';
    if (variant === 'schema') input.schema_version = 999;
    if (variant === 'variant') input.entries[0].syntax = 'html';
    if (variant === 'handler') input.record_type = 'unknown_handler';
    await writeFile(file, JSON.stringify(input));
    await expect(build()).rejects.toThrow();
  }));
  it('writes private preview evidence before the candidate completion marker and refuses overwrite', async () => fixture(async (root, build) => {
    const compiled = await build(), destination = path.join(root, 'candidate');
    const candidate = await writeContentCandidate(compiled, destination);
    const report = JSON.parse(await readFile(path.join(destination, 'private/preview-report.json'), 'utf8'));
    const html = await readFile(path.join(destination, 'private/preview.html'), 'utf8');
    expect(report.manifest_digest).toBe(candidate.manifest_digest);
    expect(report.build_fingerprint).toBe(candidate.build_fingerprint);
    expect(report.html_digest).toBe(hashBytes(html));
    await expect(writeContentCandidate(compiled, destination)).rejects.toThrow('OUTPUT_DIRECTORY_UNAVAILABLE');
  }));
});
