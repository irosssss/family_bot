/** Explicit synthetic destination. Importing this module never reads the environment. */
export interface V3DatabaseConfig {
  readonly mode: 'synthetic';
  readonly host: '127.0.0.1';
  readonly port: number;
  readonly database: string;
  readonly user: 'family_v3_31';
  readonly password: string;
  readonly runId: string;
  readonly clusterName: string;
}

const fields = ['mode', 'host', 'port', 'database', 'user', 'password', 'runId', 'clusterName'];

export function parseV3DatabaseConfig(input: unknown): V3DatabaseConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new Error('v3.database_config_invalid');
  const value = input as Record<string, unknown>;
  if (Reflect.ownKeys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key)) ||
      Object.values(Object.getOwnPropertyDescriptors(value)).some(descriptor => !('value' in descriptor))) {
    throw new Error('v3.database_config_invalid');
  }
  if (value.mode !== 'synthetic' || value.host !== '127.0.0.1' || value.user !== 'family_v3_31' ||
      !Number.isSafeInteger(value.port) || (value.port as number) < 1 || (value.port as number) > 65535 ||
      typeof value.runId !== 'string' || !/^[a-f0-9]{32}$/.test(value.runId) ||
      value.database !== `family_v3_31_${value.runId}` || value.clusterName !== `family-v3-31-${value.runId}` ||
      typeof value.password !== 'string' || !/^[a-f0-9]{64}$/.test(value.password)) {
    throw new Error('v3.database_destination_rejected');
  }
  return Object.freeze({ ...value }) as unknown as V3DatabaseConfig;
}

export function readV3FoundationTestConfig(env: Readonly<Record<string, string | undefined>>): V3DatabaseConfig {
  const serialized = env.V3_FOUNDATION_TEST_CONFIG;
  if (!serialized) throw new Error('v3.foundation_test_config_required');
  let input: unknown;
  try { input = JSON.parse(serialized); }
  catch { throw new Error('v3.foundation_test_config_invalid'); }
  return parseV3DatabaseConfig(input);
}
