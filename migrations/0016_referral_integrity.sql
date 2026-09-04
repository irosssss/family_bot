DELETE FROM referrals older
USING referrals newer
WHERE older.referee_id = newer.referee_id
  AND older.id > newer.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_referrals_referee_id
  ON referrals (referee_id);
