-- Migration: Add age field to users (Этап 7 — генератор задач)
-- Date: 2026-08-21
-- Description: Возраст критичен для генерации ежедневных задач (возрастные лимиты)

ALTER TABLE users ADD COLUMN IF NOT EXISTS age INTEGER DEFAULT 8;

-- Установить разумные дефолты для существующих пользователей:
-- Миша (id=1) — старший, Регина (id=2) — младшая (пример для теста)
UPDATE users SET age = 10 WHERE id = 1 AND age IS NULL;
UPDATE users SET age = 6 WHERE id = 2 AND age IS NULL;

-- Verification query (optional):
-- SELECT id, display_name, age FROM users;
