import { db } from './src/db/index';
import { users } from './src/db/schema';

async function main() {
  try {
    const data = await db.select().from(users);
    console.log("DB DATA:", data);
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
main();
