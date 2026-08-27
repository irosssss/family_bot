-- Migration: Update Streak System with Freeze and Status
-- Date: 2024-01-12 v2
-- Description: Complete streak system with freeze mechanics and status tracking

-- Drop old columns if they exist
ALTER TABLE users DROP COLUMN IF EXISTS streak;
ALTER TABLE users DROP COLUMN IF EXISTS last_activity_date;

-- Add new streak columns
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS streak_freeze_available BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS streak_freeze_last_used TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_streak_update TEXT;

-- Update existing users (if migrating from old schema)
UPDATE users 
SET best_streak = COALESCE(current_streak, 0) 
WHERE best_streak = 0 AND current_streak > 0;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_streak_status ON users(streak_status);
CREATE INDEX IF NOT EXISTS idx_users_last_streak_update ON users(last_streak_update);

-- Verification query (optional, run after migration)
-- SELECT id, display_name, current_streak, best_streak, streak_status, streak_freeze_available FROM users;
