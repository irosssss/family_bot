-- 🗄️ Family Chores RPG Database Schema (PostgreSQL DDL)

-- 1. Семьи (Families)
CREATE TABLE IF NOT EXISTS families (
    id SERIAL PRIMARY KEY,
    family_code VARCHAR(50) UNIQUE NOT NULL, -- Инвайт-код для присоединения
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Пользователи (Users / Parents & Children)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL, -- Идентификатор в Telegram
    family_id INTEGER REFERENCES families(id) ON DELETE SET NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'child', -- 'parent' or 'child'
    display_name VARCHAR(255) NOT NULL,
    class_type VARCHAR(50) DEFAULT 'warrior', -- 'warrior', 'mage'
    gold INTEGER NOT NULL DEFAULT 0,
    xp INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Предметы экипировки и кастомизации (Items)
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'weapon', 'armor', 'helmet', 'background', 'cosmetic'
    sprite_url VARCHAR(512) NOT NULL, -- URL к 32-bit PNG (с прозрачностью)
    stats_modifier JSONB DEFAULT '{}', -- Пример: {"hp": 10, "xp_bonus": 0.05}
    cost_coins INTEGER NOT NULL DEFAULT 0,
    is_premium BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Питомцы (Pets)
CREATE TABLE IF NOT EXISTS pets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    sprite_sheet_url VARCHAR(512) NOT NULL, -- Спрайт-шит для анимации
    evolution_stage INTEGER NOT NULL DEFAULT 1,
    cost_coins INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Инвентарь персонажа (Character Inventory)
CREATE TABLE IF NOT EXISTS character_inventory (
    character_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    is_equipped BOOLEAN DEFAULT FALSE,
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id, item_id)
);

-- 6. Инвентарь питомцев персонажа (Character Pets)
CREATE TABLE IF NOT EXISTS character_pets (
    character_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT FALSE,
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id, pet_id)
);

-- 7. Задачи (Tasks / Chores)
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    reward_coins INTEGER NOT NULL DEFAULT 0,
    reward_xp INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER NOT NULL REFERENCES users(id),
    assigned_to INTEGER REFERENCES users(id), -- NULL если общая задача
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'review', 'completed'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
