import postgres from 'postgres';
import { readTargetConfig, type TargetConfig } from '../config';
import { reject } from '../contracts/errors';

export function createTargetClient(config: TargetConfig) {
  // Revalidate even when a caller bypassed the TypeScript factory.
  readTargetConfig({ RPG_TARGET_RUN_ID: config.runId, RPG_TARGET_DB_HOST: config.host,
    RPG_TARGET_DB_PORT: String(config.port), RPG_TARGET_DB_NAME: config.database,
    RPG_TARGET_DB_USER: config.username, RPG_TARGET_DB_PASSWORD: config.password });
  return postgres({ host: config.host, port: config.port, database: config.database, username: config.username,
    password: config.password, ssl: false, max: 4, connect_timeout: 3, idle_timeout: 5,
    connection: { application_name: `family-rpg-g02-${config.runId}`, statement_timeout: 10000 },
    onnotice: () => undefined });
}

export async function assertTargetDatabase(sql: postgres.Sql, config: TargetConfig): Promise<void> {
  const [row] = await sql`SELECT current_database() AS db, current_user AS username,
    current_setting('cluster_name') AS marker, current_setting('server_version_num')::integer AS version`;
  if (!row || row.db !== config.database || row.username !== config.username
    || row.marker !== `rpg_g02_${config.runId}` || Math.floor(row.version / 10000) !== 18) {
    reject('target.database_identity_mismatch');
  }
}
