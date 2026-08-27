-- Migration: Add Streak System Fields
-- Date: 2024-01-12
-- Description: Adds last_activity_date and best_streak to users table for streak tracking

-- Add last_activity_date column (stores YYYY-MM-DD format)
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS last_activity_date TEXT;

-- Add best_streak column (stores maximum streak achieved)
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS best_streak INTEGER NOT NULL DEFAULT 0;

-- Update existing users to have best_streak = current streak
UPDATE users 
SET best_streak = streak 
WHERE best_streak = 0 AND streak > 0;

-- Add index on last_activity_date for faster queries
CREATE INDEX IF NOT EXISTS idx_users_last_activity_date ON users(last_activity_date);

-- Verification query (optional, run after migration)
-- SELECT id, display_name, streak, last_activity_date, best_streak FROM users;
