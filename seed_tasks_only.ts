import { db } from './src/db/index';
import { tasks, families } from './src/db/schema';
import { INITIAL_TASKS } from './src/data/initialData';

async function main() {
  try {
    const existingTasks = await db.select().from(tasks);
    if (existingTasks.length === 0) {
      const allFamilies = await db.select().from(families);
      if (allFamilies.length > 0) {
        const family = allFamilies[0];
        for (const t of INITIAL_TASKS) {
          await db.insert(tasks).values({
            family_id: family.id,
            code: t.code,
            title: t.title,
            description: '',
            points: t.points,
            assignee: t.assignee,
            task_type: t.task_type,
            day_of_week: t.day_of_week,
            done: t.done || false
          });
        }
        console.log('Seeded tasks');
      }
    }
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
main();
