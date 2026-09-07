import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { writeFile } from 'node:fs/promises';
import { foundationSchema } from '../../src/target/db/schema/foundation';
import { targetSchema } from '../../src/target/db/schema/access';
const before = generateDrizzleJson(foundationSchema);
const after = generateDrizzleJson(targetSchema, before.id);
const statements = await generateMigration(before, after);
await writeFile('migrations/target/0003_identity_exchange.sql', '-- G03-C: generated target access schema; reviewed before disposable execution.\n' + statements.join('\n\n') + '\n');
console.log(`Generated ${statements.length} statements without a DB connection.`);
