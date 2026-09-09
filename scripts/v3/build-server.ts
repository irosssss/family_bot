import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { V3_MIGRATION_MANIFEST } from '../../migrations/v3/manifest.ts';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

/** Build artifacts only. Importing this module does not build, connect or migrate. */
export async function buildV3Server(): Promise<void> {
  const migrations = await Promise.all(V3_MIGRATION_MANIFEST.map(async entry => {
    const filename = `${entry.name}.sql`;
    if (entry.file.protocol !== 'file:' || basename(fileURLToPath(entry.file)) !== filename) {
      throw new Error('v3.build_migration_path_invalid');
    }
    const bytes = await readFile(entry.file);
    if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) {
      throw new Error('v3.build_migration_checksum_mismatch');
    }
    return { filename, bytes };
  }));
  const outdir = join(projectRoot, 'work/v3-server-build');
  const result = await build({
    absWorkingDir: projectRoot,
    entryPoints: [
      'src/v3-server/access/service.ts', 'src/v3-server/foundation/service.ts',
      'src/v3-server/db/client.ts', 'src/v3-server/db/migrate.ts',
    ],
    bundle: true, platform: 'node', format: 'esm', packages: 'external',
    outdir, metafile: true, logLevel: 'info',
  });
  await mkdir(join(outdir, 'db'), { recursive: true });
  // import.meta.url in the bundled manifest is relative to db/migrate.js.
  // Write the verified bytes, avoiding a read/copy race against source edits.
  await Promise.all([
    ...migrations.map(entry => writeFile(join(outdir, 'db', entry.filename), entry.bytes)),
    writeFile(join(outdir, 'metafile.json'), JSON.stringify(result.metafile, null, 2) + '\n'),
  ]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildV3Server();
}
