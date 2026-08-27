#!/usr/bin/env bash
# ==========================================
# Family Chores RPG — автозапуск (Linux/macOS/Git Bash)
#   1. Проверяет/поднимает PostgreSQL
#   2. Применяет миграции (drizzle-kit push)
#   3. Запускает dev-сервер (tsx watch)
# ==========================================
set -e
cd "$(dirname "$0")"

# --- 1. .env ---
if [ ! -f .env ]; then
  echo "⚠️  .env не найден — создаю из .env.example. Заполни BOT_TOKEN!"
  cp .env.example .env
fi
set -a; source .env; set +a

# --- 2. PostgreSQL ---
echo "🔍 Проверяю PostgreSQL на 5432..."
DB_UP=$(node -e "const s=require('net').connect(5432,'127.0.0.1');s.on('connect',()=>{console.log('up');process.exit(0)});s.on('error',()=>{console.log('down');process.exit(1)});setTimeout(()=>{console.log('down');process.exit(1)},3000)")

if [ "$DB_UP" != "up" ]; then
  echo "PostgreSQL не запущен. Пробую docker compose..."
  if command -v docker >/dev/null 2>&1; then
    docker compose up -d postgres
    echo "⏳ Жду готовности базы..."
    for i in $(seq 1 20); do
      DB_UP=$(node -e "const s=require('net').connect(5432,'127.0.0.1');s.on('connect',()=>{console.log('up');process.exit(0)});s.on('error',()=>{console.log('down');process.exit(1)});setTimeout(()=>{console.log('down');process.exit(1)},1500)" 2>/dev/null || echo down)
      [ "$DB_UP" = "up" ] && break
      sleep 1
    done
  fi
  if [ "$DB_UP" != "up" ]; then
    echo "❌ PostgreSQL недоступен на 127.0.0.1:5432."
    echo "   Варианты:"
    echo "   - Установи PostgreSQL и запусти сервис (пароль пользователя app_user = \$DB_PASSWORD)"
    echo "   - Либо запусти Docker Desktop и выполни: docker compose up -d postgres"
    exit 1
  fi
fi
echo "✅ PostgreSQL доступен"

# --- 3. Миграции ---
echo "🗄️  Применяю миграции (npm run db:push)..."
npm run db:push

# --- 4. Dev server ---
echo "🚀 Запускаю dev-сервер на http://localhost:3000"
npm run dev
