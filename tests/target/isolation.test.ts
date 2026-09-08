import { describe, expect, it, vi } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { randomBytes } from 'node:crypto';
import { readTargetConfig } from '../../src/target/config';

vi.mock('postgres', () => ({ default: vi.fn(() => { throw new Error('network factory forbidden'); }) }));
vi.mock('node:net', async importOriginal => {
  const actual = await importOriginal<typeof import('node:net')>();
  return { ...actual, connect: vi.fn(() => { throw new Error('network forbidden'); }) };
});

describe('target import/config boundary (FT01/FT02/FT03/FT12)', () => {
  it('imports application, DB, runner and CLI modules without starting their dependencies', async () => {
    await import('../../src/target/content/input');
    await import('../../scripts/target/content-validate');
    await import('../../src/target/content/compiler');
    await import('../../src/target/content/buildDirectory');
    await import('../../scripts/target/content-build');
    const postgres = (await import('postgres')).default;
    await import('../../src/target/app'); await import('../../src/target/db/client');
    await import('../../src/target/access/telegram');
    await import('../../src/target/access/identityExchange');
    await import('../../src/target/access/familySession');
    await import('../../src/target/access/familyAuthorization');
    await import('../../src/target/access/adultAccess');
    await import('../../src/target/access/accessLifecycle');
    await import('../../src/target/transport/http');
    await import('../../scripts/target/benchmark-pin');
    await import('../../src/target/db/database'); await import('../../src/target/db/schema/foundation');
    await import('../../src/target/db/migrator'); await import('../../scripts/target/dev');
    await import('../../scripts/target/test-environment');
    await import('../../scripts/target/preview');
    expect(postgres).not.toHaveBeenCalled();
  });
  it('rejects legacy-only configuration and malformed target destinations', () => {
    expect(() => readTargetConfig({ SQL_DB_NAME: 'legacy' })).toThrow('target.config_invalid');
    const run = randomBytes(16).toString('hex');
    const env = { RPG_TARGET_RUN_ID: run, RPG_TARGET_DB_HOST: '127.0.0.1', RPG_TARGET_DB_PORT: '15432',
      RPG_TARGET_DB_NAME: `family_rpg_g02_${run}`, RPG_TARGET_DB_USER: 'rpg_test', RPG_TARGET_DB_PASSWORD: randomBytes(32).toString('hex') };
    expect(readTargetConfig(env).database).toBe(env.RPG_TARGET_DB_NAME);
    expect(JSON.stringify(readTargetConfig(env))).not.toContain(env.RPG_TARGET_DB_PASSWORD);
    for (const change of [{ RPG_TARGET_DB_NAME: 'postgres' }, { RPG_TARGET_DB_HOST: 'localhost' },
      { RPG_TARGET_DB_PORT: '5432junk' }, { RPG_TARGET_DB_PORT: '65536' }, { RPG_TARGET_RUN_ID: 'not-a-run' },
      { RPG_TARGET_DB_USER: 'postgres' }, { RPG_TARGET_DB_PASSWORD: undefined }]) {
      expect(() => readTargetConfig({ ...env, ...change })).toThrow('target.config_invalid');
    }
  });
  it('keeps every local import inside target, including dynamic imports and re-exports', async () => {
    const allowedRoots = ['src/target/', 'scripts/target/'].map(p => path.resolve(p) + path.sep);
    async function visit(directory: string): Promise<void> {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) { await visit(file); continue; }
        if (!file.endsWith('.ts')) continue;
        const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
        const external = new Set(['express', 'postgres', 'drizzle-orm', 'drizzle-orm/pg-core', 'drizzle-orm/postgres-js', 'ajv/dist/2020.js']);
        function check(specifier: string) {
          if (file.startsWith(path.join('src', 'target', 'access', 'telegram') + path.sep)) {
            expect(['node:crypto', '../../contracts/errors', './parse']).toContain(specifier);
          }
          if (specifier.startsWith('.')) {
            const resolved = path.resolve(path.dirname(file), specifier);
            expect(allowedRoots.some(root => resolved.startsWith(root)), `${file}: forbidden ${specifier}`).toBe(true);
          } else expect(specifier.startsWith('node:') || external.has(specifier), `${file}: forbidden ${specifier}`).toBe(true);
        }
        function walk(node: ts.Node) {
          if (file.startsWith(path.join('src', 'target', 'access', 'telegram') + path.sep)
            && ts.isIdentifier(node)) {
            expect(['process', 'fetch', 'console', 'setTimeout', 'setInterval']).not.toContain(node.text);
          }
          if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
            expect(ts.isStringLiteral(node.moduleSpecifier)).toBe(true);
            if (ts.isStringLiteral(node.moduleSpecifier)) check(node.moduleSpecifier.text);
          }
          if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === 'require')) {
            expect(node.arguments.length).toBe(1); expect(ts.isStringLiteral(node.arguments[0])).toBe(true);
            if (ts.isStringLiteral(node.arguments[0])) check(node.arguments[0].text);
          }
          ts.forEachChild(node, walk);
        }
        walk(source);
      }
    }
    await visit('src/target'); await visit('scripts/target');
  });
});
