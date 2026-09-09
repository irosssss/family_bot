// Local development tool only. No imports from the game or environment loader.
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile, lstat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const version = '1.0.5';
const base = path.join(root, 'work/v3-tools/tgrep');
const destination = path.join(base, version);
const executable = path.join(destination, 'tgrep');
// Published release digests: https://github.com/microsoft/tgrep/releases/expanded_assets/v1.0.5
const releases = {
  'darwin:x64': ['x86_64-apple-darwin', 'a0352e5648ae4c744e344cead5d3b87e7ab3a12c060928db87c379c12036a210'],
  'darwin:arm64': ['aarch64-apple-darwin', 'aa7644819d3a6e0202013e6c7c2be2623d5a2bef710249c0b31cc00aa80e19ad'],
};

function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  return result;
}

async function install() {
  const release = releases[`${process.platform}:${process.arch}`];
  if (!release) throw new Error('Этот локальный установщик поддерживает macOS x64/arm64. Другие платформы: docs/v3/TOOLING.md.');
  const [target, digest] = release;
  const filename = `tgrep-v${version}-${target}.tar.gz`;
  const url = `https://github.com/microsoft/tgrep/releases/download/v${version}/${filename}`;
  const archive = path.join(base, 'downloads', filename);
  await mkdir(path.dirname(archive), { recursive: true });
  let bytes;
  try { bytes = await readFile(archive); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Загрузка tgrep: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (createHash('sha256').update(bytes).digest('hex') !== digest) throw new Error('SHA-256 архива tgrep не совпадает с релизом. Установка остановлена.');
  await writeFile(archive, bytes, { mode: 0o600 });
  const stage = await mkdtemp(path.join(base, 'install-'));
  try {
    const extract = run('tar', ['-xzf', archive, '-C', stage, './tgrep', './README.md']);
    if (extract.status !== 0) throw new Error('Не удалось распаковать официальный архив tgrep.');
    const candidate = path.join(stage, 'tgrep');
    if (!(await lstat(candidate)).isFile()) throw new Error('Ожидался обычный исполняемый файл tgrep.');
    await chmod(candidate, 0o755);
    const check = run(candidate, ['--version']);
    if (check.status !== 0 || check.stdout.trim() !== `tgrep ${version}`) throw new Error('Проверка версии tgrep не прошла.');
    await mkdir(destination, { recursive: true });
    await rename(candidate, executable);
    await rename(path.join(stage, 'README.md'), path.join(destination, 'README.md'));
    await writeFile(path.join(destination, 'provenance.json'), `${JSON.stringify({ version, target, url, archiveSha256: digest }, null, 2)}\n`);
    console.log(`tgrep ${version} установлен локально: work/v3-tools/tgrep/${version}/tgrep; SHA-256 проверен.`);
  } finally { await rm(stage, { recursive: true, force: true }); }
}

try {
  const args = process.argv.slice(2);
  if (args[0] === '--install-local') {
    if (args.length !== 1) throw new Error('--install-local не принимает дополнительные аргументы.');
    await install();
  } else {
    try { await lstat(executable); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      throw new Error('tgrep ещё не установлен. Выполните npm run v3:tgrep:install.');
    }
    const result = run(executable, args.length ? args : ['--help'], { stdio: 'inherit' });
    process.exitCode = result.status ?? 2;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
