import { pathToFileURL } from 'node:url';
import { createTargetApp } from '../../src/target/app';
import { readTargetConfig } from '../../src/target/config';
import { assertTargetDatabase, createTargetClient } from '../../src/target/db/client';

export async function startTargetServer(env: NodeJS.ProcessEnv) {
  const config = readTargetConfig(env);
  const sql = createTargetClient(config);
  const port = env.RPG_TARGET_HTTP_PORT ?? '3101';
  if (!/^[1-9][0-9]{3,4}$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
    await sql.end(); throw new Error('target.http_port_invalid');
  }
  try {
    await assertTargetDatabase(sql, config);
    const app = createTargetApp({ checkReadiness: () => assertTargetDatabase(sql, config) });
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
      const server = app.listen(Number(port), '127.0.0.1', () => resolve(server));
      server.once('error', reject);
    });
    let closing: Promise<void> | undefined;
    const close = () => closing ??= (async () => {
      try { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
      finally { await sql.end({ timeout: 5 }); }
    })();
    return { server, close };
  } catch (error) { await sql.end({ timeout: 5 }); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startTargetServer(process.env).then(({ close }) => {
    console.info('Target health server listening on loopback');
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
      close().catch(() => { console.error('target.close_failed'); process.exitCode = 1; });
    });
  }).catch(() => { console.error('target.start_failed'); process.exitCode = 1; });
}
