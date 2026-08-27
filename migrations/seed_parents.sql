-- Seed родителей (Этап R1)
-- Синхронизируем sequence, чтобы serial не конфликтовал с ручными вставками
SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT COALESCE(MAX(id), 0) FROM users), true);

INSERT INTO users (telegram_id, family_id, role, family_role, is_admin, display_name, class_type, gold, xp, crystals, hp, max_hp, mp, max_mp, current_streak, best_streak, streak_status, gender, assignee, notify_partner, age) VALUES
(1003, 1, 'parent', 'parent', true, 'Папа', '', 0, 0, 0, 50, 50, 30, 30, 0, 0, 'paused', 'male', 'both', 1, 40),
(1004, 1, 'parent', 'parent', true, 'Мама', '', 0, 0, 0, 50, 50, 30, 30, 0, 0, 'paused', 'female', 'both', 1, 37)
ON CONFLICT (telegram_id) DO NOTHING;
