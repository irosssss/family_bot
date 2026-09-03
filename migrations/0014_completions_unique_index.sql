-- 0014: уникальный индекс completions из runtime-кода перенесён в миграции (DAT-02)
-- Идемпотентность POST /complete: двойной клик / гонка двух вкладок не создают дубль.
CREATE UNIQUE INDEX IF NOT EXISTS uq_completions_user_task_day ON completions (user_id, task_id, completed_at);
