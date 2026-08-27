-- 002_family_hp.sql — Этап 9: ночная контратака босса
-- Добавляет полоску Family HP (общая для семьи) и статус «Истощение» на 24ч.
-- Если family_hp падает до 0, устанавливается exhausted_until = now + 24h,
-- все заработанные монеты -15% до конца этого периода.

ALTER TABLE families
  ADD COLUMN IF NOT EXISTS family_hp integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS max_family_hp integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS exhausted_until timestamp;
