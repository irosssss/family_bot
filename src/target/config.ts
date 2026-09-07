import { reject } from './contracts/errors';

export interface TargetConfig {
  readonly host: '127.0.0.1';
  readonly port: number;
  readonly database: string;
  readonly username: 'rpg_test';
  readonly password: string;
  readonly runId: string;
}

/** G02-A supports only task-owned local instances. No production adapter or legacy fallback. */
export function readTargetConfig(env: Readonly<Record<string, string | undefined>>): TargetConfig {
  const runId = env.RPG_TARGET_RUN_ID;
  const portText = env.RPG_TARGET_DB_PORT;
  const password = env.RPG_TARGET_DB_PASSWORD;
  if (!runId || !/^[a-f0-9]{32}$/.test(runId) || env.RPG_TARGET_DB_HOST !== '127.0.0.1'
    || env.RPG_TARGET_DB_NAME !== `family_rpg_g02_${runId}` || env.RPG_TARGET_DB_USER !== 'rpg_test'
    || !portText || !/^[1-9][0-9]{3,4}$/.test(portText) || Number(portText) < 1024 || Number(portText) > 65535
    || !password || password.length < 32 || password.length > 256) return reject('target.config_invalid');
  const config = { host: '127.0.0.1' as const, port: Number(portText), database: env.RPG_TARGET_DB_NAME,
    username: 'rpg_test' as const, runId } as TargetConfig;
  // Accidental JSON serialization must not expose this process-local credential.
  Object.defineProperty(config, 'password', { value: password, enumerable: false });
  return Object.freeze(config);
}
