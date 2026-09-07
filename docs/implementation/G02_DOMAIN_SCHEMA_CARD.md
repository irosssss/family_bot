# G02-B — базовые семейные таблицы и ограничения

Версия 1.0, 2026-09-07. **Пользователь принял G02-A и разрешил эту карточку ответом «да, продолжай». G02-B реализован, проверен и принят последующим сообщением «дальше давай»; [результат](G02_DOMAIN_SCHEMA_RESULT.md).** Основа: [G02-A](G02_FOUNDATION_RESULT.md), [PDB](../data/PHYSICAL_SCHEMA.md), [runtime-словарь](../data/RUNTIME_DICTIONARY.md). Базовый объём W06/W07 выполнен; [G03-A](G03_ACCESS_PROTOCOL_CARD.md) затем разрешён и подготовлен к приёмке.

## 1. Конкретный результат

Ожидаемый результат после разрешения: в собственной временной PostgreSQL созданы базовые families/member_profiles/players/accounts и реестр retention-политик; Drizzle-схема и SQL согласованы, семейные FK и ограничения ролей проверены реальными отрицательными вставками. Приложение по-прежнему не обслуживает настоящие семьи.

| Область | Поля / результат | Проверка |
|---|---|---|
| Общие I/M/R | UUIDv7 id, created_at, updated_at/state_revision, ссылки на retention_policy_id/revision по DAT/PDB | Типы и диапазоны, отсутствие неявного бессрочного retention. |
| `rpg.retention_policy_revisions` | policy_id/revision, purpose/category/trigger/schema_version и закрытый payload | В тестах только явно синтетическая политика. Production сроки O09 не назначаются. |
| `rpg.accounts` | status/disabled_at и общие поля, без family role и кошелька | Согласование статуса/времени, неизвестные состояния отвергнуты. |
| `rpg.families` | display_name/status/zone_id/calendar_revision/membership_revision, pause/archive/resume поля | Независимые ревизии, проверки status/timestamp; смена календаря/QDB01 не реализуется. |
| `rpg.member_profiles` | family_id, display_name, family_role, status/archive/left поля, общие поля | FK семьи, U(family_id,id), U(family_id,id,family_role), согласование статусов. |
| `rpg.players` | PDB-проекция только child-профилей | Составной FK на child-профиль той же семьи; родителя нельзя создать игроком обходом API. |
| Migration tooling | Следующая неизменная миграция + checksum/manifest, Drizzle schema | Повтор/конкурентный запуск через G02-A runner, отсутствие diff между ожидаемым DDL и фактической схемой. |
| Test fixtures | Две синтетические семьи, взрослые и дети, отдельные account | Попытка FK другой семьи, parent→player, неправильный status/revision и нарушенные связи отклоняется БД. |

Точные колонки/constraints сначала оформляются в reviewable SQL/Drizzle diff по полному принятому словарю, затем исполняются только на разрешённой disposable-среде. Семейный профиль не объявляется аккаунтом; rows не являются настоящими users и не создают доступ. AccessBinding/Session/Invite/PIN/recovery сохраняют зависимость O09/G03; не вводить фиктивные секреты/TTL ради заполнения схемы.

## 2. Границы работ

Новые файлы `src/target/db/schema/`, следующая миграция `migrations/target/`, закрытые DTO и тесты в target, точечные дополнения runner/harness для type-safe Drizzle и проверки схемы. Реальные public-таблицы, old migration journal, server.ts/main.tsx и графика не меняются. Полные content-таблицы — G04; wallets/effects/tasks — G07; эта карточка не разрешает их ускоренный неоговорённый выпуск.

Drizzle подключается через target factory, без импорта старого `src/db`. Известное влияние Drizzle на JSON serialization проверяется отдельным roundtrip. Новая таблица не должна подключать seed или обработчик запросов на уровне импорта.

## 3. Критерии завершения

| ID | Доказательство |
|---|---|
| FB01 | Чистое создание всех базовых таблиц и повтор без новых эффектов. |
| FB02 | PostgreSQL отвергает межсемейный FK и parent→player напрямую через SQL; DBT14 в этом срезе. |
| FB03 | Неправильные status/timestamp/revision/UUID отклоняются на соответствующей границе; имена профилей могут совпадать. |
| FB04 | Drizzle/SQL типы, JSONB и точные значения проходят roundtrip, схема проверена introspection на своей БД. |
| FB05 | Сбой новой миграции не оставляет часть таблиц/ложный applied; старый bootstrap сохраняется. |
| FB06 | lint/target typecheck/релевантная регрессия, journal/checksum evidence и cleanup собственного контейнера. |

После этого — результат G02-B и конкретная карточка протокола доступа G03 с оставшимися O01/O09. Перенос настоящих семей и подключение пользователей требуют последующих разрешённых этапов.
