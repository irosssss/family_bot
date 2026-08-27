-- Insert default family + quest tasks (БАГ #4)
INSERT INTO families (family_code, name) VALUES ('FAM-1234', 'Моя Семья')
ON CONFLICT (family_code) DO NOTHING;

INSERT INTO tasks (family_id, code, title, description, points, assignee, task_type, day_of_week, done, category, assignee_type, age_min, age_max, schedule_type, is_required, is_repeatable, max_daily, icon, recommended_class) VALUES
(1, 'quest_family_clean', 'Семейный квест: уборка кухни вместе', '', 80, 'both', 'quest', 6, false, 'family', 'both', 4, 13, 'weekly', false, false, NULL, '/assets/game/backgrounds/Previews/chest.png', 'healer'),
(1, 'quest_help_parent', 'Помочь родителям с крупным делом', '', 60, 'both', 'quest', NULL, false, 'family', 'both', 6, 13, 'flexible', false, true, 1, '/assets/game/backgrounds/Previews/chest.png', 'rogue'),
(1, 'quest_perfect_day', 'Идеальный день: все задачи без напоминаний', '', 100, 'both', 'quest', NULL, false, 'health', 'both', 8, 13, 'flexible', false, false, NULL, '/assets/game/backgrounds/Previews/coin.png', 'mage'),
(1, 'quest_family_outing', 'Семейный квест: организовать выходной', '', 70, 'both', 'quest', NULL, false, 'family', 'both', 6, 13, 'weekend', false, false, NULL, '/assets/game/backgrounds/Previews/chest.png', 'rogue'),
(1, 'quest_pet_care', 'Квест: полный уход за питомцем', '', 50, 'both', 'quest', NULL, false, 'pet', 'individual', 8, 13, 'weekly', false, false, NULL, '/assets/game/entities/pets/Previews/animal-cat.png', 'healer');
