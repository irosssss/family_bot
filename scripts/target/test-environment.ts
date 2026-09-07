import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { readTargetConfig } from '../../src/target/config';
import { assertTargetDatabase, createTargetClient } from '../../src/target/db/client';

const exec = promisify(execFile);
const OWNER = 'family-rpg-g02';
const IMAGE = 'postgres@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2';
const LABEL = 'org.family-rpg.g02-run';

function baseEnvironment(): NodeJS.ProcessEnv {
  // Do not propagate ambient application credentials or Node preload hooks.
  return Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'DOCKER_HOST', 'DOCKER_CONTEXT']
    .flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
}

async function docker(args: string[], env = baseEnvironment()): Promise<string> {
  try { return (await exec('docker', args, { env, timeout: 30000, maxBuffer: 1024 * 1024 })).stdout.trim(); }
  catch { throw new Error('target.docker_command_failed'); } // Never forward command/env/stderr credentials.
}

interface OwnedContainer { id: string; runId: string }

export async function assertOwnedContainer(container: OwnedContainer): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(container.id) || !/^[a-f0-9]{32}$/.test(container.runId)) {
    throw new Error('target.cleanup_identity_invalid');
  }
  const label = await docker(['inspect', '--format', `{{index .Config.Labels "${LABEL}"}}`, container.id]);
  const owner = await docker(['inspect', '--format', '{{index .Config.Labels "org.family-rpg.owner"}}', container.id]);
  if (label !== container.runId || owner !== OWNER) throw new Error('target.cleanup_owner_mismatch');
}

export async function withTargetTestEnvironment(work: (env: NodeJS.ProcessEnv) => Promise<void>): Promise<void> {
  await docker(['version', '--format', '{{.Server.Version}}']);
  const imageId = await docker(['image', 'inspect', IMAGE, '--format', '{{.Id}}']);
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId)) throw new Error('target.image_invalid');
  const runId = randomBytes(16).toString('hex');
  const database = `family_rpg_g02_${runId}`;
  // Fresh ephemeral credential exists only in process memory and child environments.
  const password = randomBytes(32).toString('hex');
  let container: OwnedContainer | undefined;
  let interrupted = false;
  const onSignal = () => { interrupted = true; };
  process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
  try {
    const id = await docker(['create', '--name', `family-rpg-g02-${runId}`,
      '--label', `${LABEL}=${runId}`, '--label', `org.family-rpg.owner=${OWNER}`,
      '--publish', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql:rw,size=536870912',
      '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_USER', '--env', 'POSTGRES_DB',
      // Repeated schema/rollback suites generate WAL faster than the default
      // checkpoint budget fits into a small disposable tmpfs. Keep durability on.
      imageId, 'postgres', '-c', `cluster_name=rpg_g02_${runId}`,
      '-c', 'min_wal_size=32MB', '-c', 'max_wal_size=64MB'],
    { ...baseEnvironment(), POSTGRES_PASSWORD: password, POSTGRES_USER: 'rpg_test', POSTGRES_DB: database });
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('target.container_id_invalid');
    container = { id, runId };
    await assertOwnedContainer(container);
    if (interrupted) throw new Error('target.interrupted');
    await docker(['start', id]);
    const binding = await docker(['port', id, '5432/tcp']);
    const match = /^127\.0\.0\.1:([0-9]+)$/.exec(binding);
    if (!match) throw new Error('target.binding_invalid');
    const env: NodeJS.ProcessEnv = { ...baseEnvironment(),
      RPG_TARGET_RUN_ID: runId, RPG_TARGET_DB_HOST: '127.0.0.1', RPG_TARGET_DB_PORT: match[1],
      RPG_TARGET_DB_NAME: database, RPG_TARGET_DB_USER: 'rpg_test', RPG_TARGET_DB_PASSWORD: password,
      RPG_TARGET_PG_TESTS: '1', RPG_TARGET_CONTAINER_ID: id,
    };
    const config = readTargetConfig(env);
    const client = createTargetClient(config);
    try {
      let ready = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        if (interrupted) throw new Error('target.interrupted');
        try { await assertTargetDatabase(client, config); ready = true; break; }
        catch { await new Promise(resolve => setTimeout(resolve, 250)); }
      }
      if (!ready) throw new Error('target.database_not_ready');
      const [version] = await client`SELECT current_setting('server_version') AS version`;
      console.info(JSON.stringify({ targetTestEnvironment: { runId, containerId: id, imageId, database, version: version.version } }));
    } finally { await client.end({ timeout: 5 }); }
    if (interrupted) throw new Error('target.interrupted');
    try { await work(env); }
    catch (error) {
      // Report only classified infrastructure facts, never raw PostgreSQL statements or parameters.
      const state=await docker(['inspect','--format','{{.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled}}',id]);
      const output=await exec('docker',['logs',id],{env:baseEnvironment(),timeout:30000,maxBuffer:8*1024*1024}).catch(()=>null);
      const logs=output ? output.stdout+output.stderr : '';
      console.info(JSON.stringify({targetFailureDiagnostics:{state,diskFull:/No space left on device/.test(logs),
        sharedMemoryFailure:/could not (?:resize|create) shared memory/.test(logs),terminated:/terminated by signal/.test(logs)}}));
      throw error;
    }
  } finally {
    // Keep signal handlers during teardown so a normal interruption still reaches cleanup.
    try {
      if (container) {
        await assertOwnedContainer(container);
        await docker(['rm', '--force', '--volumes', container.id]);
        const remaining = await docker(['ps', '--all', '--quiet', '--no-trunc', '--filter', `id=${container.id}`]);
        if (remaining) throw new Error('target.cleanup_failed');
        console.info(JSON.stringify({ targetCleanup: 'passed', containerId: container.id }));
      }
    } finally { process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  withTargetTestEnvironment(env => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.target.config.ts'],
      { env, stdio: 'inherit' });
    const stop = () => { child.kill('SIGTERM'); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    child.once('error', () => reject(new Error('target.test_spawn_failed')));
    child.once('exit', code => {
      process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
      if (code === 0) resolve(); else reject(new Error('target.tests_failed'));
    });
  })).catch(error => { console.error(error instanceof Error ? error.message : 'target.harness_failed'); process.exitCode = 1; });
}
