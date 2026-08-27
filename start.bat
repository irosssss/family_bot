@echo off
rem ==========================================
rem Family Chores RPG - автозапуск (Windows)
rem   1. Проверяет/поднимает PostgreSQL
rem   2. Применяет миграции (drizzle-kit push)
rem   3. Запускает dev-сервер (tsx watch)
rem ==========================================
chcp 65001 >nul
cd /d "%~dp0"

rem --- 1. .env ---
if not exist .env (
  echo Внимание: .env не найден - создаю из .env.example. Заполни BOT_TOKEN!
  copy .env.example .env >nul
)

rem --- 2. PostgreSQL ---
echo Проверяю PostgreSQL на 5432...
node -e "const s=require('net').connect(5432,'127.0.0.1');s.on('connect',()=>{console.log('up');process.exit(0)});s.on('error',()=>{console.log('down');process.exit(1)});setTimeout(()=>{console.log('down');process.exit(1)},3000)" | findstr /C:"up" >nul
if errorlevel 1 (
  echo PostgreSQL не запущен. Пробую docker compose...
  docker compose up -d postgres
  echo Жду готовности базы...
  timeout /t 5 /nobreak >nul
  node -e "const s=require('net').connect(5432,'127.0.0.1');s.on('connect',()=>{console.log('up');process.exit(0)});s.on('error',()=>{console.log('down');process.exit(1)});setTimeout(()=>{console.log('down');process.exit(1)},3000)" | findstr /C:"up" >nul
  if errorlevel 1 (
    echo ОШИБКА: PostgreSQL недоступен на 127.0.0.1:5432.
    echo Варианты:
    echo   - Установи PostgreSQL и запусти сервис
    echo   - Либо запусти Docker Desktop и выполни: docker compose up -d postgres
    pause
    exit /b 1
  )
)
echo OK: PostgreSQL доступен

rem --- 3. Миграции ---
echo Применяю миграции (npm run db:push)...
call npm run db:push

rem --- 4. Dev server ---
echo Запускаю dev-сервер на http://localhost:3000
call npm run dev
