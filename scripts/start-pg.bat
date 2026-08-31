@echo off
setlocal
rem PostgreSQL 18 в реальной консоли: окно открыто = БД работает, закрыл окно = БД остановлена.
rem НЕ запускать через pg_ctl start из git-bash/фона — там возникает error 487.
set PG_BIN=C:\Users\poddu\Downloads\postgresql-18.6-1-windows-x64-binaries\pgsql\bin
set PGDATA=C:\Users\poddu\Downloads\postgresql-data
echo PostgreSQL 18 starting (close this window to stop the DB)...
"%PG_BIN%\postgres.exe" -D "%PGDATA%" -p 5432
