import { argon2, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

export async function benchmarkPin() {
  const hash = promisify(argon2);
  // RFC 9106 section 5.3. Public test input, never a user's credential.
  const vector = await hash('argon2id', { message: Buffer.alloc(32, 1),
    memory: 32, passes: 3, parallelism: 4, tagLength: 32, nonce: Buffer.alloc(16, 2),
    secret: Buffer.alloc(8, 3), associatedData: Buffer.alloc(12, 4) });
  if (vector.toString('hex') !== '0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659') {
    throw new Error('benchmark.reference_failed');
  }
  const pepper = randomBytes(32);
  const derive = () => hash('argon2id', { message: '001234', memory: 19456,
    passes: 2, parallelism: 1, tagLength: 32, nonce: randomBytes(16), secret: pepper });
  await derive();
  const samples = [];
  for (let i = 0; i < 12; i++) { const start = performance.now(); await derive(); samples.push(performance.now() - start); }
  const start = performance.now();
  await Promise.all([derive(), derive()]);
  const pairMs = performance.now() - start;
  samples.sort((a,b) => a-b); pepper.fill(0);
  return { schema_version: 1, synthetic_only: true, reference_vector: 'RFC9106-5.3 PASS',
    library: 'node:crypto/argon2id', node: process.version, platform: process.platform, arch: process.arch,
    cpu: cpus()[0]?.model, memoryKiB: 19456, passes: 2, lanes: 1, samples: samples.length,
    medianMs: Math.round(samples[6]), p95Ms: Math.round(samples[11]), pairMs: Math.round(pairMs),
    maxRssKiB: process.resourceUsage().maxRSS, proposedProcessConcurrency: 2,
    caveat: 'Local microbenchmark, not production capacity or a global concurrency guarantee.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  benchmarkPin().then(result => console.log(JSON.stringify(result, null, 2))).catch(() => {
    console.error('benchmark.failed'); process.exitCode = 1;
  });
}
