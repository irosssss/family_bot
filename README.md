# Family Life — V3

V3 — единственная рабочая версия приложения. Принятые правила: [V3_BASELINE](docs/V3_BASELINE.md).

## Запуск

Node.js 24, затем `npm ci` и `npm run dev`.
Открыть http://127.0.0.1:3217/ . Для локального интерфейса не нужны БД или Telegram token.

`npm run build` собирает V3. `npm start` открывает собранное приложение на
http://127.0.0.1:3000/ . Это локальное тестовое приложение: данные хранятся в браузере,
реальная регистрация и совместная серверная игра пока не подключены.

## Проверки

- `npm run lint`
- `npm run content:v3:validate`
- `npm test`
- `npm run target:typecheck` и `npm run target:test`
- `npm run v3:server:typecheck` и `npm run v3:server:test`
- `npm run build`

Тесты PostgreSQL требуют отдельного подготовленного окружения; unit-тесты не заменяют их.

## Структура

- `src/v3/` — действующий интерфейс, правила локальной игры и сохранения.
- `content-source/v3/` — определения предметов, локаций, боссов и ресурсов с постоянными ID.
- `public/assets/game/` — только 36 ресурсов действующего каталога V3.
- `src/preview/wardrobePilot/` — инструмент проверки исходных комплектов V3.
- `src/target/`, `src/v3-server/`, `src/v3-shared/`, `migrations/` — подготовленные серверные основания. Они не подключены к текущей игре; назначение и ограничения — [здесь](docs/maintenance/PREPARED_MODULES.md).
- `docs/` — принятые правила, планы и аудиты. Исторические документы не переопределяют V3.
- `.agents/skills/` — установленные проектные навыки с лицензией и закреплённой версией.

Добавление контента: [V3_AUTHORING](docs/content/V3_AUTHORING.md).
Объединение и очистка: [V3_CONSOLIDATION](docs/maintenance/V3_CONSOLIDATION.md).
Предыдущие приложения и ассеты доступны в истории Git, а не в текущем runtime.
