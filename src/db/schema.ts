import { pgTable, serial, text, integer, bigint, boolean, timestamp, jsonb, primaryKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const families = pgTable('families', {
  id: serial('id').primaryKey(),
  family_code: text('family_code').unique().notNull(),
  name: text('name').notNull(),
  created_at: timestamp('created_at').defaultNow(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  telegram_id: bigint('telegram_id', { mode: 'number' }).unique().notNull(),
  family_id: integer('family_id').references(() => families.id, { onDelete: 'set null' }),
  role: text('role').notNull().default('child'),
  display_name: text('display_name').notNull(),
  class_type: text('class_type').default('warrior'),
  gold: integer('gold').notNull().default(0),
  xp: integer('xp').notNull().default(0),
  crystals: integer('crystals').notNull().default(0),
  hp: integer('hp').notNull().default(50),
  max_hp: integer('max_hp').notNull().default(50),
  mp: integer('mp').notNull().default(30),
  max_mp: integer('max_mp').notNull().default(30),
  streak: integer('streak').notNull().default(0),
  skill_date: text('skill_date'),
  gender: text('gender'),
  custom_avatar_url: text('custom_avatar_url'),
  character_color: text('character_color'),
  skin_tone: text('skin_tone'),
  hair_style: text('hair_style'),
  hair_color: text('hair_color'),
  eye_color: text('eye_color'),
  assignee: text('assignee').default('both'),
  notify_partner: integer('notify_partner').default(1),
  referral_code: text('referral_code'),
  referred_by: integer('referred_by'),
  created_at: timestamp('created_at').defaultNow(),
});

export const items = pgTable('items', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  sprite_url: text('sprite_url').notNull(), // Локальный путь к картинке в public/
  layer_z_index: integer('layer_z_index').default(10), // z-index for rendering
  stats_modifier: jsonb('stats_modifier').default({}),
  cost_coins: integer('cost_coins').notNull().default(0),
  is_premium: boolean('is_premium').default(false),
  created_at: timestamp('created_at').defaultNow(),
});

export const pets = pgTable('pets', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  sprite_sheet_url: text('sprite_sheet_url').notNull(), // Локальный путь к спрайт-листу
  animation_frames: integer('animation_frames').notNull().default(4), // frames in sprite sheet
  evolution_stage: integer('evolution_stage').notNull().default(1),
  cost_coins: integer('cost_coins').notNull().default(0),
  created_at: timestamp('created_at').defaultNow(),
});

export const character_inventory = pgTable('character_inventory', {
  character_id: integer('character_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  item_id: integer('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  is_equipped: boolean('is_equipped').default(false),
  purchased_at: timestamp('purchased_at').defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.character_id, t.item_id] })
]);

export const character_pets = pgTable('character_pets', {
  character_id: integer('character_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  pet_id: integer('pet_id').notNull().references(() => pets.id, { onDelete: 'cascade' }),
  is_active: boolean('is_active').default(false),
  purchased_at: timestamp('purchased_at').defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.character_id, t.pet_id] })
]);

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  family_id: integer('family_id').notNull().references(() => families.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  points: integer('points').notNull().default(0),
  assignee: text('assignee').default('both'),
  task_type: text('task_type').default('todo'),
  day_of_week: integer('day_of_week'),
  done: boolean('done').default(false),
  created_at: timestamp('created_at').defaultNow(),
});

export const completions = pgTable('completions', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  task_id: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  completed_at: text('completed_at').notNull(),
  completed_at_ts: text('completed_at_ts').notNull(),
  points: integer('points'),
});

export const rewards = pgTable('rewards', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  cost: integer('cost').notNull(),
  reward_type: text('reward_type').notNull().default('personal'),
  active: integer('active').default(1),
});

export const purchases = pgTable('purchases', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reward_id: integer('reward_id').notNull().references(() => rewards.id, { onDelete: 'cascade' }),
  reward_title: text('reward_title'),
  created_at: text('created_at').notNull(),
});

export const achievements = pgTable('achievements', {
  id: serial('id').primaryKey(),
  code: text('code').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  bonus: integer('bonus').notNull().default(0),
});

export const user_achievements = pgTable('user_achievements', {
  user_id: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  achievement_id: integer('achievement_id').notNull().references(() => achievements.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.user_id, t.achievement_id] })
]);

export const bosses = pgTable('bosses', {
  id: serial('id').primaryKey(),
  week_key: text('week_key').notNull(),
  name: text('name').notNull(),
  emoji: text('emoji').notNull(),
  sprite_url: text('sprite_url'), // Локальный путь к боссу
  max_hp: integer('max_hp').notNull().default(100),
  hp: integer('hp').notNull(),
  damage: integer('damage').notNull().default(0),
  defeated: integer('defeated').notNull().default(0),
});

export const challenges = pgTable('challenges', {
  code: text('code').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  target: integer('target').notNull(),
  bonus: integer('bonus').notNull(),
});

export const perfect_days = pgTable('perfect_days', {
  user_id: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  day: text('day').notNull(),
}, (t) => [
  primaryKey({ columns: [t.user_id, t.day] })
]);

export const feed_entries = pgTable('feed_entries', {
  id: serial('id').primaryKey(),
  user_name: text('user_name').notNull(),
  user_id: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  task_title: text('task_title').notNull(),
  points: integer('points').notNull(),
  date: text('date').notNull(),
  timestamp: text('timestamp').notNull(),
});

export const referrals = pgTable('referrals', {
  id: serial('id').primaryKey(),
  referrer_id: integer('referrer_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  referee_id: integer('referee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  referee_name: text('referee_name').notNull(),
  created_at: text('created_at').notNull(),
  bonus_gold: integer('bonus_gold').notNull().default(0),
  bonus_crystals: integer('bonus_crystals').notNull().default(0),
});
