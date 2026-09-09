import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { connectV3Database, type V3Database } from '../../src/v3-server/db/client';
import { parseV3DatabaseConfig } from '../../src/v3-server/db/config';
import { loadV3Migrations, migrateV3Database } from '../../src/v3-server/db/migrate';

const exec = promisify(execFile);
export const V3_TEST_IMAGE = 'postgres@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2';
const OWNER = 'family-v3-31';
const OWNER_LABEL = 'org.family-v3.owner';
const RUN_LABEL = 'org.family-v3.run';

export interface V3OwnedContainer { readonly id: string; readonly runId: string }
export type V3DockerCommand = (args: string[], env?: NodeJS.ProcessEnv) => Promise<string>;

/** Deliberate allowlist: no SQL_*, PG*, dotenv, NODE_OPTIONS or application credentials. */
export function v3FoundationChildEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'DOCKER_HOST', 'DOCKER_CONTEXT']
    .flatMap(key => source[key] ? [[key, source[key]!]] : []));
}

async function docker(args: string[], env = v3FoundationChildEnvironment(process.env)): Promise<string> {
  try { return (await exec('docker', args, { env, timeout: 30000, maxBuffer: 1024 * 1024 })).stdout.trim(); }
  catch { throw new Error('v3.docker_command_failed'); }
}

export function validateV3ContainerOwnership(container: V3OwnedContainer, record: unknown): void {
  if (!/^[a-f0-9]{64}$/.test(container.id) || !/^[a-f0-9]{32}$/.test(container.runId)) {
    throw new Error('v3.cleanup_identity_invalid');
  }
  if (!record || typeof record !== 'object') throw new Error('v3.cleanup_owner_mismatch');
  const info = record as { Id?: unknown; Config?: { Labels?: Record<string, unknown> } };
  if (info.Id !== container.id || info.Config?.Labels?.[OWNER_LABEL] !== OWNER ||
      info.Config?.Labels?.[RUN_LABEL] !== container.runId) throw new Error('v3.cleanup_owner_mismatch');
}

export async function assertV3OwnedContainer(container: V3OwnedContainer, run: V3DockerCommand = docker): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(container.id)) throw new Error('v3.cleanup_identity_invalid');
  let record: unknown;
  // Inspect only identity/labels; the complete Config contains the disposable credential.
  try {
    const value = await run(['inspect', '--format', '{{json .Id}} {{json .Config.Labels}}', container.id]);
    const separator = value.indexOf(' ');
    record = { Id: JSON.parse(value.slice(0, separator)), Config: { Labels: JSON.parse(value.slice(separator + 1)) } };
  } catch { throw new Error('v3.cleanup_inspect_failed'); }
  validateV3ContainerOwnership(container, record);
}

export async function cleanupV3OwnedContainer(container: V3OwnedContainer, run: V3DockerCommand = docker): Promise<void> {
  await assertV3OwnedContainer(container, run);
  await run(['rm', '--force', '--volumes', container.id]);
  const remaining = await run(['ps', '--all', '--quiet', '--no-trunc', '--filter', `id=${container.id}`]);
  if (remaining) throw new Error('v3.cleanup_failed');
}

export async function withV3FoundationTestEnvironment(work: (env: NodeJS.ProcessEnv) => Promise<void>): Promise<void> {
  await docker(['version', '--format', '{{.Server.Version}}']);
  const imageId = await docker(['image', 'inspect', V3_TEST_IMAGE, '--format', '{{.Id}}']);
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId)) throw new Error('v3.image_invalid');
  const runId = randomBytes(16).toString('hex');
  const database = `family_v3_31_${runId}`;
  const clusterName = `family-v3-31-${runId}`;
  const password = randomBytes(32).toString('hex');
  let container: V3OwnedContainer | undefined;
  let db: V3Database | undefined;
  let interrupted = false;
  const onSignal = () => { interrupted = true; };
  process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
  try {
    const id = await docker(['create', '--name', `${OWNER}-${runId}`,
      '--label', `${OWNER_LABEL}=${OWNER}`, '--label', `${RUN_LABEL}=${runId}`,
      '--publish', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql:rw,size=536870912',
      '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_USER', '--env', 'POSTGRES_DB',
      imageId, 'postgres', '-c', `cluster_name=${clusterName}`,
      '-c', 'min_wal_size=32MB', '-c', 'max_wal_size=64MB'],
    { ...v3FoundationChildEnvironment(process.env), POSTGRES_PASSWORD: password, POSTGRES_USER: 'family_v3_31', POSTGRES_DB: database });
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('v3.container_id_invalid');
    container = Object.freeze({ id, runId });
    await assertV3OwnedContainer(container);
    if (interrupted) throw new Error('v3.interrupted');
    await docker(['start', id]);
    const binding = /^127\.0\.0\.1:([0-9]+)$/.exec(await docker(['port', id, '5432/tcp']));
    if (!binding) throw new Error('v3.binding_invalid');
    const config = parseV3DatabaseConfig({ mode: 'synthetic', host: '127.0.0.1', port: Number(binding[1]),
      database, user: 'family_v3_31', password, runId, clusterName });
    for (let attempt = 0; attempt < 40; attempt++) {
      if (interrupted) throw new Error('v3.interrupted');
      try { db = await connectV3Database(config); break; }
      catch { await new Promise(resolveWait => setTimeout(resolveWait, 250)); }
    }
    if (!db) throw new Error('v3.database_not_ready');
    if (db.identity.serverVersion !== 180006) throw new Error('v3.pinned_postgres_version_mismatch');
    // A control outside rpg_v3 proves migrations/fixture cleanup leave their neighboring schema intact.
    await db.sql`CREATE TABLE public.v3_runner_sentinel (id text PRIMARY KEY, value text NOT NULL)`;
    const sentinel = randomBytes(16).toString('hex');
    await db.sql`INSERT INTO public.v3_runner_sentinel (id, value) VALUES (${runId}, ${sentinel})`;
    const migrations = await loadV3Migrations();
    const failingSql = `${migrations[0].sql}\nSELECT 1 / 0;`;
    let initialFailure = false;
    try { await migrateV3Database(db, [{ ...migrations[0], sql: failingSql, sha256: createHash('sha256').update(failingSql).digest('hex') }]); }
    catch (error) { initialFailure = (error as { code?: string }).code === '22012'; }
    const [rollback] = await db.sql`SELECT to_regnamespace('rpg_v3')::text AS schema_name`;
    if (!initialFailure || rollback.schema_name !== null) throw new Error('v3.initial_migration_rollback_failed');
    const parallel = await connectV3Database(config);
    try {
      const results = await Promise.all([migrateV3Database(db), migrateV3Database(parallel)]);
      if (results.some(result => result.version !== 1) || results.map(result => result.applied.length).sort().join(',') !== '0,1') {
        throw new Error('v3.migration_serialization_failed');
      }
    } finally { await parallel.close(); }
    console.info(JSON.stringify({ v3InitialMigrationRollback: 'passed', v3ConcurrentMigration: 'passed' }));
    console.info(JSON.stringify({ v3FoundationEnvironment: { runId, containerId: id, imageId,
      database, clusterName, serverVersion: db.identity.serverVersion } }));
    try {
      if (interrupted) throw new Error('v3.interrupted');
      await work({ ...v3FoundationChildEnvironment(process.env), V3_FOUNDATION_TEST_CONFIG: JSON.stringify(config) });
    } finally {
      const rows = await db.sql`SELECT id, value FROM public.v3_runner_sentinel`;
      if (rows.length !== 1 || rows[0].id !== runId || rows[0].value !== sentinel) throw new Error('v3.sentinel_changed');
      console.info(JSON.stringify({ v3NeighborSentinel: 'passed' }));
    }
    if (interrupted) throw new Error('v3.interrupted');
  } finally {
    try {
      await db?.close();
    } finally {
      try {
        if (container) {
          await cleanupV3OwnedContainer(container);
          console.info(JSON.stringify({ v3FoundationCleanup: 'passed', containerId: container.id }));
        }
      } finally { process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal); }
    }
  }
}

export async function runV3FoundationTests(): Promise<void> {
  await withV3FoundationTestEnvironment(env => new Promise<void>((resolveDone, reject) => {
    // Same command as v3:server:test, invoked directly to preserve the child environment allowlist.
    const child = spawn(process.execPath, [resolve('node_modules/vitest/vitest.mjs'), 'run', '--config', 'vitest.v3-server.config.ts'],
      { env, stdio: 'inherit' });
    const stop = () => { child.kill('SIGTERM'); };
    const detach = () => { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    child.once('error', () => { detach(); reject(new Error('v3.test_spawn_failed')); });
    child.once('exit', code => { detach(); code === 0 ? resolveDone() : reject(new Error('v3.tests_failed')); });
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runV3FoundationTests().catch(error => {
    const message = error instanceof Error && /^v3\.[a-z_]+$/.test(error.message) ? error.message : 'v3.foundation_harness_failed';
    console.error(message); process.exitCode = 1;
  });
}
