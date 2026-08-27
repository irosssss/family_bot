-- Migration: Family Roles (Этап R1)
-- Date: 2026-08-21
-- Description: Ролевая модель семьи — родители (admin) и дети

-- 1. Новые колонки
ALTER TABLE users ADD COLUMN IF NOT EXISTS family_role text NOT NULL DEFAULT 'child';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- 2. Миграция существующих: id=1 (Миша) и id=2 (Регина) → child
UPDATE users SET family_role = 'child', is_admin = false WHERE id IN (1, 2);

-- 3. Индексы
CREATE INDEX IF NOT EXISTS idx_users_family_role ON users(family_role);

-- Verification:
-- SELECT id, display_name, family_role, is_admin FROM users;
