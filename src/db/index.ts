import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const user = process.env.SQL_USER;
const password = process.env.SQL_PASSWORD;
const database = process.env.SQL_DB_NAME;
const host = process.env.SQL_HOST; // this is a unix socket path, e.g. /app/cloudsql/instance-name

// When using postgres.js with a Unix Domain Socket, we specify host as the socket directory path.
const client = postgres({
  host: host,
  user: user,
  password: password,
  database: database,
  ssl: false,
});

export const db = drizzle(client, { schema });
