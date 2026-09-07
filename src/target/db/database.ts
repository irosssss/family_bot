import { drizzle } from 'drizzle-orm/postgres-js';
import type { TargetConfig } from '../config';
import { assertTargetDatabase, createTargetClient } from './client';
import { targetSchema } from './schema/accessLifecycle';

/** Own client: Drizzle changes date/JSON serializers, so never attach it to a shared client. */
export async function openTargetDatabase(config: TargetConfig) {
  const client = createTargetClient(config);
  try {
    await assertTargetDatabase(client, config);
    const db = drizzle(client, { schema: targetSchema, logger: false });
    return { db, close: () => client.end({ timeout: 5 }) };
  } catch (error) { await client.end({ timeout: 5 }); throw error; }
}
