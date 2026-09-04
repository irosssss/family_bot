-- Complete, idempotent baseline for a fresh PostgreSQL database.
-- Historical ad-hoc migrations are retained for audit history; this file is the
-- canonical bootstrap and is also safe to run against an existing installation.

CREATE TABLE IF NOT EXISTS families (
  id SERIAL PRIMARY KEY,
  family_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  family_hp INTEGER NOT NULL DEFAULT 100,
  max_family_hp INTEGER NOT NULL DEFAULT 100,
  exhausted_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL UNIQUE,
  family_id INTEGER REFERENCES families(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'child',
  family_role TEXT NOT NULL DEFAULT 'child',
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  display_name TEXT NOT NULL,
  class_type TEXT DEFAULT 'warrior',
  gold INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  crystals INTEGER NOT NULL DEFAULT 0,
  hp INTEGER NOT NULL DEFAULT 50,
  max_hp INTEGER NOT NULL DEFAULT 50,
  mp INTEGER NOT NULL DEFAULT 30,
  max_mp INTEGER NOT NULL DEFAULT 30,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  streak_status TEXT NOT NULL DEFAULT 'active',
  streak_freeze_available BOOLEAN NOT NULL DEFAULT FALSE,
  streak_freeze_last_used TIMESTAMP,
  last_streak_update TEXT,
  skill_date TEXT,
  family_pro_until TIMESTAMP,
  gender TEXT,
  custom_avatar_url TEXT,
  character_color TEXT,
  skin_tone TEXT,
  hair_style TEXT,
  hair_color TEXT,
  eye_color TEXT,
  habitica_equipped JSONB DEFAULT '{}'::jsonb,
  assignee TEXT DEFAULT 'both',
  notify_partner INTEGER DEFAULT 1,
  timezone TEXT DEFAULT 'UTC',
  age INTEGER DEFAULT 8,
  referral_code TEXT,
  referred_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  type TEXT NOT NULL,
  sprite_url TEXT NOT NULL,
  layer_z_index INTEGER DEFAULT 10,
  stats_modifier JSONB DEFAULT '{}'::jsonb,
  cost_coins INTEGER NOT NULL DEFAULT 0,
  is_premium BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pets (
  id SERIAL PRIMARY KEY,
  code TEXT,
  name TEXT NOT NULL,
  sprite_sheet_url TEXT NOT NULL,
  animation_frames INTEGER NOT NULL DEFAULT 4,
  evolution_stage INTEGER NOT NULL DEFAULT 1,
  cost_coins INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  assignee TEXT DEFAULT 'both',
  task_type TEXT DEFAULT 'todo',
  day_of_week INTEGER,
  done BOOLEAN DEFAULT FALSE,
  category TEXT,
  assignee_type TEXT NOT NULL DEFAULT 'any',
  age_min INTEGER NOT NULL DEFAULT 4,
  age_max INTEGER NOT NULL DEFAULT 13,
  schedule_type TEXT NOT NULL DEFAULT 'flexible',
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_repeatable BOOLEAN NOT NULL DEFAULT FALSE,
  max_daily INTEGER,
  icon TEXT,
  recommended_class TEXT,
  value DOUBLE PRECISION DEFAULT 0,
  last_completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS completions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL,
  completed_at_ts TEXT NOT NULL,
  points INTEGER,
  effects JSONB
);

CREATE TABLE IF NOT EXISTS rewards (
  id SERIAL PRIMARY KEY,
  family_id INTEGER REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  cost INTEGER NOT NULL,
  reward_type TEXT NOT NULL DEFAULT 'personal',
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_id INTEGER NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  reward_title TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS character_inventory (
  character_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  is_equipped BOOLEAN DEFAULT FALSE,
  purchased_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (character_id, item_id)
);

CREATE TABLE IF NOT EXISTS character_pets (
  character_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT FALSE,
  feed_points INTEGER NOT NULL DEFAULT 0,
  purchased_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (character_id, pet_id)
);

CREATE TABLE IF NOT EXISTS achievements (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  bonus INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id INTEGER NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS bosses (
  id SERIAL PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  week_key TEXT NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '',
  sprite_url TEXT,
  max_hp INTEGER NOT NULL DEFAULT 100,
  hp INTEGER NOT NULL,
  damage INTEGER NOT NULL DEFAULT 0,
  defeated INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS challenges (
  code TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  target INTEGER NOT NULL,
  bonus INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS family_challenges (
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  challenge_code TEXT NOT NULL REFERENCES challenges(code) ON DELETE CASCADE,
  progress INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (family_id, challenge_code)
);

CREATE TABLE IF NOT EXISTS perfect_days (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS feed_entries (
  id SERIAL PRIMARY KEY,
  user_name TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_title TEXT NOT NULL,
  points INTEGER NOT NULL,
  date TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS referrals (
  id SERIAL PRIMARY KEY,
  referrer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referee_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  referee_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  bonus_gold INTEGER NOT NULL DEFAULT 0,
  bonus_crystals INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS milestone_rewards_given (
  id SERIAL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone_day INTEGER NOT NULL,
  rewarded_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, milestone_day)
);

CREATE TABLE IF NOT EXISTS habits (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  icon TEXT,
  value DOUBLE PRECISION NOT NULL DEFAULT 0,
  up_points INTEGER NOT NULL DEFAULT 10,
  down_damage INTEGER NOT NULL DEFAULT 5,
  counter_up INTEGER NOT NULL DEFAULT 0,
  counter_down INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS habit_scores (
  id SERIAL PRIMARY KEY,
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  scored_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  charge_id TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  sku TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'XTR',
  status TEXT NOT NULL DEFAULT 'credited',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Bring older installations to the fields represented by the current schema.
ALTER TABLE families ADD COLUMN IF NOT EXISTS family_hp INTEGER NOT NULL DEFAULT 100;
ALTER TABLE families ADD COLUMN IF NOT EXISTS max_family_hp INTEGER NOT NULL DEFAULT 100;
ALTER TABLE families ADD COLUMN IF NOT EXISTS exhausted_until TIMESTAMP;

ALTER TABLE users ADD COLUMN IF NOT EXISTS family_role TEXT NOT NULL DEFAULT 'child';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS crystals INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS best_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_freeze_available BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_freeze_last_used TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_streak_update TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS family_pro_until TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS habitica_equipped JSONB DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';
ALTER TABLE users ADD COLUMN IF NOT EXISTS age INTEGER DEFAULT 8;

ALTER TABLE items ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE character_pets ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE;
ALTER TABLE character_pets ADD COLUMN IF NOT EXISTS feed_points INTEGER NOT NULL DEFAULT 0;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_type TEXT NOT NULL DEFAULT 'any';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS age_min INTEGER NOT NULL DEFAULT 4;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS age_max INTEGER NOT NULL DEFAULT 13;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS schedule_type TEXT NOT NULL DEFAULT 'flexible';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_repeatable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS max_daily INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recommended_class TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS value DOUBLE PRECISION DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_completed_at TIMESTAMP;
ALTER TABLE completions ADD COLUMN IF NOT EXISTS effects JSONB;

ALTER TABLE rewards ADD COLUMN IF NOT EXISTS family_id INTEGER REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE bosses ADD COLUMN IF NOT EXISTS family_id INTEGER REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE bosses ADD COLUMN IF NOT EXISTS sprite_url TEXT;

UPDATE bosses
SET family_id = (SELECT id FROM families ORDER BY id LIMIT 1)
WHERE family_id IS NULL AND EXISTS (SELECT 1 FROM families);

CREATE UNIQUE INDEX IF NOT EXISTS uq_completions_user_task_day
  ON completions (user_id, task_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_users_family_id ON users (family_id);
CREATE INDEX IF NOT EXISTS idx_tasks_family_id ON tasks (family_id);
CREATE INDEX IF NOT EXISTS idx_rewards_family_id ON rewards (family_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pets_code ON pets (code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bosses_family_id
  ON bosses (family_id) WHERE family_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits (user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON purchases (user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals (referrer_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_referrals_referee_id ON referrals (referee_id);
