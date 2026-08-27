-- Migration: Add Milestone Rewards Tracking
-- Date: 2024-01-20
-- Description: Prevents duplicate milestone rewards (BUG #2)

CREATE TABLE IF NOT EXISTS milestone_rewards_given (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone_day INTEGER NOT NULL CHECK (milestone_day IN (3, 7, 10)),
  rewarded_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, milestone_day)
);

CREATE INDEX IF NOT EXISTS idx_milestone_rewards_user ON milestone_rewards_given(user_id);

-- Add timezone field to users table (BUG #4)
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- Verification query (optional, run after migration)
-- SELECT * FROM milestone_rewards_given;
