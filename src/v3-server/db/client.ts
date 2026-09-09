import postgres from 'postgres';
import { parseV3DatabaseConfig, type V3DatabaseConfig } from './config';

export type V3Sql = postgres.Sql;
export type V3Transaction = postgres.TransactionSql;
export interface V3DatabaseIdentity {
  readonly database: string;
  readonly user: string;
  readonly clusterName: string;
  readonly serverVersion: number;
}
export interface V3Database {
  readonly sql: V3Sql;
  readonly config: V3DatabaseConfig;
  readonly identity: V3DatabaseIdentity;
  close(): Promise<void>;
}

export async function assertV3Database(sql: V3Sql | V3Transaction, input: V3DatabaseConfig): Promise<V3DatabaseIdentity> {
  const config = parseV3DatabaseConfig(input);
  const [row] = await sql<{ database_name: string; user_name: string; cluster_name: string; server_version: string }[]>`
    SELECT current_database() AS database_name, current_user AS user_name,
      current_setting('cluster_name') AS cluster_name,
      current_setting('server_version_num') AS server_version`;
  const version = Number(row?.server_version);
  if (row?.database_name !== config.database || row?.user_name !== config.user ||
      row?.cluster_name !== config.clusterName || !Number.isSafeInteger(version) || version < 180000 || version >= 190000) {
    throw new Error('v3.database_identity_mismatch');
  }
  return Object.freeze({ database: row.database_name, user: row.user_name, clusterName: row.cluster_name, serverVersion: version });
}

/** No defaults, dotenv, startup migrations or background service. */
export async function connectV3Database(input: V3DatabaseConfig): Promise<V3Database> {
  const config = parseV3DatabaseConfig(input);
  const sql = postgres({
    host: config.host, port: config.port, database: config.database, username: config.user, password: config.password,
    ssl: false, max: 5, prepare: false, connect_timeout: 2, idle_timeout: 10,
    connection: { application_name: 'family-v3-31', search_path: 'pg_catalog', statement_timeout: 15000, lock_timeout: 10000 },
    onnotice: () => {},
  });
  try {
    const identity = await assertV3Database(sql, config);
    return Object.freeze({ sql, config, identity, close: async () => { await sql.end({ timeout: 5 }); } });
  } catch {
    await sql.end({ timeout: 1 }).catch(() => {});
    // A connection error may carry credentials or a query; expose only the classification.
    throw new Error('v3.database_connection_rejected');
  }
}
