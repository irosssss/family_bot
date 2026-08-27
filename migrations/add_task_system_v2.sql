-- Migration: New Task System (core/personal/quest)
-- Date: 2026-08-20
-- Description: Этап 6 — добавляет поля новой системы задач с сохранением обратной совместимости

-- 1. Новые колонки (если не существуют)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_type TEXT NOT NULL DEFAULT 'any';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS age_min INTEGER NOT NULL DEFAULT 4;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS age_max INTEGER NOT NULL DEFAULT 13;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS schedule_type TEXT NOT NULL DEFAULT 'flexible';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_repeatable BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS max_daily INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recommended_class TEXT;

-- 2. Миграция существующих данных (task_type — text, поэтому простой UPDATE)
-- daily → schedule_type='daily', task_type='core'
UPDATE tasks SET schedule_type = 'daily', task_type = 'core' WHERE task_type = 'daily';
-- weekly → schedule_type='weekly', task_type='core'
UPDATE tasks SET schedule_type = 'weekly', task_type = 'core' WHERE task_type = 'weekly';
-- todo → schedule_type='once', task_type='personal'
UPDATE tasks SET schedule_type = 'once', task_type = 'personal' WHERE task_type = 'todo';

-- 3. Индекс для выборки по новым полям
CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_type ON tasks(assignee_type);
CREATE INDEX IF NOT EXISTS idx_tasks_schedule_type ON tasks(schedule_type);

-- 4. Проверка (запустить после миграции):
-- SELECT id, code, title, task_type, schedule_type, assignee_type FROM tasks;
