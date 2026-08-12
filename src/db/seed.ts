import { db } from './index';
import { users as usersTable, families as familiesTable } from './schema';
import { INITIAL_USERS } from '../data/initialData';

export async function seedDatabase() {
  try {
    const existingUsers = await db.select().from(usersTable);
    if (existingUsers.length === 0) {
      console.log('Seeding initial data...');
      
      // Seed Family
      const [family] = await db.insert(familiesTable).values({
        family_code: 'FAM-1234',
        name: 'Моя Семья'
      }).returning();
      
      // Seed Users
      for (const u of INITIAL_USERS) {
        await db.insert(usersTable).values({
          telegram_id: u.telegram_id || (Math.floor(Math.random() * 1000000)),
          family_id: family.id,
          role: u.assignee === 'both' ? 'parent' : 'child',
          display_name: u.display_name,
          class_type: u.class || 'warrior',
          gold: u.gold || 0,
          xp: u.xp || 0,
          hp: u.hp || 50,
          max_hp: u.max_hp || 50,
          mp: u.mp || 30,
          max_mp: u.max_mp || 30,
          streak: u.streak || 0,
          skill_date: u.skill_date,
          gender: u.gender,
          custom_avatar_url: u.custom_avatar_url,
          character_color: u.character_color || u.color,
          skin_tone: u.skin_tone,
          hair_style: u.hair_style,
          hair_color: u.hair_color,
          eye_color: u.eye_color,
          assignee: u.assignee,
          notify_partner: u.notify_partner || 1,
          referral_code: u.referral_code,
          referred_by: u.referred_by,
        });
      }
      // Seed Tasks
      const { INITIAL_TASKS } = require('../data/initialData');
      for (const t of INITIAL_TASKS) {
        await db.insert(require('./schema').tasks).values({
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
      console.log('Seeding complete.');
    } else {
      console.log('Database already seeded.');
    }
  } catch (e) {
    console.error('Error seeding database:', e);
  }
}
