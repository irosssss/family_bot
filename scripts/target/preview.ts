import { pathToFileURL } from 'node:url';
import { startTargetServer } from './dev';
import { withTargetTestEnvironment } from './test-environment';

/** Short-lived browser inspection on the same guarded disposable DB; no gameplay routes. */
export async function previewTarget() {
  await withTargetTestEnvironment(async env => {
    const { close } = await startTargetServer(env);
    console.info('Target preview: http://127.0.0.1:3101/health and /ready (automatic shutdown in 90 seconds)');
    try {
      await new Promise<void>(resolve => {
        const finish = () => { clearTimeout(timer); process.removeListener('SIGINT', finish); process.removeListener('SIGTERM', finish); resolve(); };
        const timer = setTimeout(finish, 90000);
        process.once('SIGINT', finish); process.once('SIGTERM', finish);
      });
    } finally { await close(); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  previewTarget().catch(() => { console.error('target.preview_failed'); process.exitCode = 1; });
}
