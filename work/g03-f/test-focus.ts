import { spawn } from 'node:child_process';
import { withTargetTestEnvironment } from '../../scripts/target/test-environment';
await withTargetTestEnvironment(env=>new Promise<void>((resolve,reject)=>{
  const child=spawn(process.execPath,['node_modules/vitest/vitest.mjs','run','--config','vitest.target.config.ts','tests/target/access-lifecycle-postgres.test.ts'],{env,stdio:'inherit'});
  child.once('error',()=>reject(new Error('target.test_spawn_failed')));
  child.once('exit',code=>code===0?resolve():reject(new Error('target.tests_failed')));
}));
