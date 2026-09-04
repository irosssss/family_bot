import { eq } from 'drizzle-orm';
import { db } from './index';
import * as schema from './schema';
import { INITIAL_TASKS, INITIAL_USERS } from '../data/initialData';

export async function seedDatabase() {
  const existingUsers = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (existingUsers.length > 0) {
    console.log('Database already seeded.');
    return;
  }

  console.log('Seeding initial data...');
  await db.transaction(async (tx) => {
    const [family] = await tx
      .insert(schema.families)
      .values({ family_code: 'FAM-1234', name: 'Моя Семья' })
      .onConflictDoUpdate({
        target: schema.families.family_code,
        set: { name: 'Моя Семья' },
      })
      .returning();

    for (const user of INITIAL_USERS) {
      await tx.insert(schema.users).values({
        telegram_id: user.telegram_id || Math.floor(Math.random() * 1_000_000),
        family_id: family.id,
        role: user.family_role === 'parent' ? 'parent' : 'child',
        family_role: user.family_role || 'child',
        is_admin: !!user.is_admin,
        display_name: user.display_name,
        class_type: user.class || 'warrior',
        gold: user.gold || 0,
        xp: user.xp || 0,
        hp: user.hp || 50,
        max_hp: user.max_hp || 50,
        mp: user.mp || 30,
        max_mp: user.max_mp || 30,
        current_streak: user.current_streak || 0,
        best_streak: user.best_streak || 0,
        streak_status: user.streak_status || 'active',
        streak_freeze_available: user.streak_freeze_available || false,
        skill_date: user.skill_date,
        gender: user.gender,
        custom_avatar_url: user.custom_avatar_url,
        character_color: user.character_color || user.color,
        skin_tone: user.skin_tone,
        hair_style: user.hair_style,
        hair_color: user.hair_color,
        eye_color: user.eye_color,
        assignee: user.assignee,
        notify_partner: user.notify_partner || 1,
        age: user.age || 8,
        referral_code: user.referral_code,
        referred_by: user.referred_by,
      }).onConflictDoNothing({ target: schema.users.telegram_id });
    }

    const existingTasks = await tx
      .select({ code: schema.tasks.code })
      .from(schema.tasks)
      .where(eq(schema.tasks.family_id, family.id));
    const existingCodes = new Set(existingTasks.map((task) => task.code));
    for (const task of INITIAL_TASKS) {
      if (existingCodes.has(task.code)) continue;
      await tx.insert(schema.tasks).values({
        family_id: family.id,
        code: task.code,
        title: task.title,
        description: '',
        points: task.points,
        assignee: task.assignee,
        task_type: task.task_type,
        day_of_week: Array.isArray(task.day_of_week) ? null : (task.day_of_week ?? null),
        done: task.done || false,
        category: task.category,
        assignee_type: task.assignee_type,
        age_min: task.age_min,
        age_max: task.age_max,
        schedule_type: task.schedule_type,
        is_required: task.is_required,
        is_repeatable: task.is_repeatable,
        max_daily: task.max_daily,
        icon: task.icon,
        recommended_class: task.recommendedClass,
      });
    }
  });
  console.log('Seeding complete.');
}
