import { generateDrizzleJson,generateMigration } from 'drizzle-kit/api';
import { writeFile } from 'node:fs/promises';
import { targetSchema as identitySchema } from '../../src/target/db/schema/access';
import { targetSchema } from '../../src/target/db/schema/familyAccess';
const before = generateDrizzleJson(identitySchema);
const statements = await generateMigration(before,generateDrizzleJson(targetSchema,before.id));
await writeFile('migrations/target/0004_family_access.sql','-- G03-D: generated target family access schema; reviewed before disposable execution.\n'+statements.join('\n\n')+'\n');
console.log(`Generated ${statements.length} statements without a DB connection.`);
