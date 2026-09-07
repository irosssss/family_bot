import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { writeFile } from 'node:fs/promises';
import * as schema from '../../src/target/db/schema/foundation';
const before = generateDrizzleJson({ rpg: schema.rpg });
const after = generateDrizzleJson(schema.foundationSchema, before.id);
const statements = await generateMigration(before, after);
await writeFile('migrations/target/0002_family_foundation.sql', '-- G02-B: generated from the target Drizzle schema; reviewed before disposable execution.\n' + statements.join('\n\n') + '\n');
await writeFile('work/g02-b/schema-snapshot.json', JSON.stringify(after, null, 2) + '\n');
console.log(`Generated ${statements.length} statements; no DB connection.`);
