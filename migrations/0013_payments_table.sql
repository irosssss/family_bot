-- DAT-01 FIX: таблица платежей с UNIQUE(charge_id)
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  charge_id TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  sku TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'XTR',
  status TEXT NOT NULL DEFAULT 'credited',
  created_at TIMESTAMP DEFAULT NOW()
);
