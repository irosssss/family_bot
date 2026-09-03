import { pgTable, serial, text, integer, bigint, doublePrecision, boolean, timestamp, jsonb, primaryKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const families = pgTable('families', {
  id: serial('id').primaryKey(),
  family_code: text('family_code').unique().notNull(),
  name: text('name').notNull(),
  // Family HP (Этап 9): ночная контратака босса за пропущенные обязательные дела
  family_hp: integer('family_hp').notNull().default(100),
  max_family_hp: integer('max_family_hp').notNull().default(100),
  exhausted_until: timestamp('exhausted_until'),
  created_at: timestamp('created_at').defaultNow(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  telegram_id: bigint('telegram_id', { mode: 'number' }).unique().notNull(),
  family_id: integer('family_id').references(() => families.id, { onDelete: 'set null' }),
  role: text('role').notNull().default('child'),
  family_role: text('family_role').notNull().default('child'),
  is_admin: boolean('is_admin').notNull().default(false),
  display_name: text('display_name').notNull(),
  class_type: text('class_type').default('warrior'),
  gold: integer('gold').notNull().default(0),
  xp: integer('xp').notNull().default(0),
  crystals: integer('crystals').notNull().default(0),
  hp: integer('hp').notNull().default(50),
  max_hp: integer('max_hp').notNull().default(50),
  mp: integer('mp').notNull().default(30),
  max_mp: integer('max_mp').notNull().default(30),
  current_streak: integer('current_streak').notNull().default(0),
  best_streak: integer('best_streak').notNull().default(0),
  streak_status: text('streak_status').notNull().default('active'),
  streak_freeze_available: boolean('streak_freeze_available').notNull().default(false),
  streak_freeze_last_used: timestamp('streak_freeze_last_used'),
  last_streak_update: text('last_streak_update'),
  skill_date: text('skill_date'),
  // Family Pro (Stars): до какой даты действует подписка
  family_pro_until: timestamp('family_pro_until'),
  gender: text('gender'),
  custom_avatar_url: text('custom_avatar_url'),
  character_color: text('character_color'),
  skin_tone: text('skin_tone'),
  hair_style: text('hair_style'),
  hair_color: text('hair_color'),
  eye_color: text('eye_color'),
  habitica_equipped: jsonb('habitica_equipped').default({}),
  assignee: text('assignee').default('both'),
  notify_partner: integer('notify_partner').default(1),
  timezone: text('timezone').default('UTC'),
  age: integer('age').default(8),
  referral_code: text('referral_code'),
  referred_by: integer('referred_by'),
  created_at: timestamp('created_at').defaultNow(),
});

export const items = pgTable('items', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  // Устойчивый slug из initialData (leather_armor_shop, sword...) — ключ
  // визуального маппинга «предмет → образ аватара» (см. SHOP_TORSO_MAP).
  code: text('code'),
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
  // Habitica зоопарк (Этап 5): 0-99 = малыш, 100+ = маунт
  feed_points: integer('feed_points').notNull().default(0),
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
  // --- Совместимость со старой системой (не удалять!) ---
  assignee: text('assignee').default('both'),
  task_type: text('task_type').default('todo'),
  day_of_week: integer('day_of_week'),
  done: boolean('done').default(false),
  // --- Новая система задач (Этап 6) ---
  category: text('category'),
  assignee_type: text('assignee_type').notNull().default('any'),
  age_min: integer('age_min').notNull().default(4),
  age_max: integer('age_max').notNull().default(13),
  schedule_type: text('schedule_type').notNull().default('flexible'),
  is_required: boolean('is_required').notNull().default(false),
  is_repeatable: boolean('is_repeatable').notNull().default(false),
  max_daily: integer('max_daily'),
  icon: text('icon'),
  recommended_class: text('recommended_class'),
  // Habitica Task Value Decay (Этап 4): динамическая ценность -10..+10
  value: doublePrecision('value').default(0),
  last_completed_at: timestamp('last_completed_at'),
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

export const milestone_rewards_given = pgTable('milestone_rewards_given', {
  id: serial('id'),
  user_id: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  milestone_day: integer('milestone_day').notNull(),
  rewarded_at: timestamp('rewarded_at').defaultNow(),
}, (t) => [
  // Составной первичный ключ: один milestone на пользователя
  primaryKey({ columns: [t.user_id, t.milestone_day] })
]);

// ============ HABITICA: ПРИВЫЧКИ (+/-) — Этап 3 ============
export const habits = pgTable('habits', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  icon: text('icon'),                                  // Kenney-иконка (опционально)
  value: doublePrecision('value').notNull().default(0), // Task Value Decay: -10..+10
  up_points: integer('up_points').notNull().default(10),   // золото за [+]
  down_damage: integer('down_damage').notNull().default(5),// урон HP за [-]
  counter_up: integer('counter_up').notNull().default(0),
  counter_down: integer('counter_down').notNull().default(0),
  created_at: timestamp('created_at').defaultNow(),
});

export const habit_scores = pgTable('habit_scores', {
  id: serial('id').primaryKey(),
  habit_id: integer('habit_id').notNull().references(() => habits.id, { onDelete: 'cascade' }),
  user_id: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  direction: text('direction').notNull(), // 'up' | 'down'
  scored_at: timestamp('scored_at').defaultNow(),
});

// ============ ПЛАТЕЖИ (DAT-01 FIX): дедупликация на уровне БД ============
// UNIQUE(charge_id) — повторная доставка вебхука Telegram НЕ начислит дважды,
// даже после рестарта сервера (Set в памяти больше не единственный барьер).
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  charge_id: text('charge_id').notNull().unique(),  // provider_payment_charge_id
  user_id: integer('user_id').notNull(),
  sku: text('sku').notNull(),
  amount: integer('amount').notNull(),              // в XTR (Stars)
  currency: text('currency').notNull().default('XTR'),
  status: text('status').notNull().default('credited'),
  created_at: timestamp('created_at').defaultNow(),
});
