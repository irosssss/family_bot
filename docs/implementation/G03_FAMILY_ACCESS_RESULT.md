# G03-D — результат семейных привязок и сессий

Версия 1.0, 2026-09-07. **Разрешён ответом «да». G3D01–G3D06 реализованы и проверены в указанных ниже границах; результат на приёмку.** Основа — [карточка G03-D](G03_FAMILY_ACCESS_CARD.md). Следующий блок на разрешение — [G03-E](G03_ADULT_PROTECTION_CARD.md).

## 1. Реализованный объём

| Область | Результат | Основные файлы |
|---|---|---|
| Привязки | Account → семейный профиль с kind own_child/adult_membership/managed_child; активные own_child и principal уникальны в нужной области. Managed manager принадлежит той же семье и Account и является взрослой привязкой. | [Схема](../../src/target/db/schema/familyAccess.ts) |
| Контексты | Отдельные server-side SessionContext и SessionTokenVerifier с I/M/F/R, policy digest/revision, source identity и binding revision. Parent lineage ограничена взрослым родителем; циклы/вторая ступень детей не допускаются. | [Миграция 0004](../../migrations/target/0004_family_access.sql) |
| Контракты | Закрытые records/requests, UUID, enum, версии, FK-идентификаторы, digest, временные условия, обязательные adult proof-поля. Неизвестные actorId/mode/поля отвергаются. | [Records](../../src/target/contracts/familyAccess.ts) |
| Own-child issuer | Действующий одноразовый launch + существующая активная own_child binding + существующий Player. Атомарная запись контекста/verifier; профиль, игрок, прогресс и награды не создаются. | [Сервис сессий](../../src/target/access/familySession.ts) |
| Resolver/guard | Bearer → живые identity/account/family/profile/binding/session; серверный actor. Взрослому запрещён child.play, ребёнку — чужой profile и family.manage. Запрос к другой семье не расширяет доступ. | [Политика целей](../../src/target/access/familyAuthorization.ts) |
| Транзакционные команды | withFamilyAccess проверяет права и исполняет доверенный DB-handler в одной транзакции под family lock. Отзыв сериализован с командой. Ошибка handler откатывает его запись. | [Сервис сессий](../../src/target/access/familySession.ts) |
| Отзыв | CAS для сессии/привязки/verifier; parent session revoke отзывает managed descendants и их токены. Own-child binding revoke сохраняет независимый managed-доступ и сам игровой профиль. | [PG-проверки](../../tests/target/family-access-postgres.test.ts) |

В приложении ещё нет экрана или HTTP-маршрута этого входа. Разрешена только серверная выдача own_child из заранее существующей привязки. Создание привязок пользователем и приглашения — будущие авторизованные сервисы.

## 2. Ключевые решения и границы гарантии

| Решение | Причина и долгосрочное следствие |
|---|---|
| Verifier хранится отдельно от lineage | Погашение взрослого bearer при передаче устройства не удаляет источник управляемой детской сессии. Явный отзыв родителя, его binding или protection revision прекращает managed-доступ. Короткий adult grant сам по себе ребёнка не разлогинивает. |
| Reverse FK вместо дублирующего token_verifier_ref | SessionTokenVerifier содержит session_id + family_id; partial unique разрешает один непогашенный verifier на session. Взаимной циклической ссылки и двух источников истины нет. |
| Потребление launch через unique origin_launch_id | Сессия — доказательство потребления. Повтор/гонка, включая две семьи, не выдаёт второй bearer. Внутренний lockLaunch композиционно используется в общей транзакции; resolveLaunch после потребления отказывает. Будущий cleanup не должен удалять это доказательство раньше полной непригодности исходного launch; при иных сроках потребуется tombstone. |
| Append-only 0004 | 0001–0003 и их checksums сохранены. Новая schema/familyAccess экспортирует полный targetSchema, прежняя schema/access сохраняет историческую модель 0003 для воспроизводимого DDL-теста. |
| origin_invitation_id пока только NULL | Таблица приглашений ещё не реализована. Вместо разрешения висячего ID закрытая запись и SQL CHECK запрещают ненулевое значение. Позже ограничение заменяется следующей миграцией с настоящим FK. |
| Источник launch проверяет issuer | Account/identity сессии связаны composite FK; соответствие им origin launch повторно проверяется сервисом под блокировкой. SQL launch FK удерживает существование и одноразовость, но сам по себе не доказывает право выдачи. Прямые записи в auth-таблицы не являются публичным API; ограничения DB-ролей обязательны до запуска. |
| Family lock даже при проверке чтения | Для небольших семей получаем ясный порядок команд/отзыва между процессами. Длительные KDF, сеть и внешние эффекты нельзя помещать в callback. Оптимизация чтений потребует измерений и сохранения этих гарантий. Разные семьи не используют один общий exclusive lock. |
| Политика фиксируется в factory и сессии | Изменённый digest/ID/revision отвергает старый контекст в новом экземпляре сервиса. Согласованная активация семейной security policy между старыми/новыми процессами ещё нужна в G03-E; текущий digest не заменяет её. |
| Default-deny для взрослой защиты | Нет взрослого/managed issuer. Hooks — только доверенные серверные зависимости, по умолчанию отказ; тесты явно вставляют синтетические контексты и подключают fixture hooks. Реальные PIN, fresh proof, лимиты A15 и audit этим не реализованы. |
| Adult membership нельзя отозвать общим revokeBinding | Возвращается family.adult_lifecycle_required. Выход/исключение требует A14/A16, согласий и last-adult проверки. Тест прямого отзыва manager binding доказывает отказ resolver, а не реализованную процедуру исключения. |

Токены: 32 случайных байта, canonical base64url; в БД SHA-256 с разделением назначения family_session_v1. Bearer отдаётся после commit, non-enumerable при обычном JSON.stringify; будущий transport должен формировать ответ явно и запрещать логирование секрета. Public session ID и launch bearer не аутентифицируют семейные команды. Ошибки наружу — только разрешённые ключи локализации, без внутренних исключений.

## 3. Проверки и доказательства

| Проверка | Результат / доказательство |
|---|---|
| Полный target-набор на собственной PostgreSQL 18.6 | Финальный результат: 193 passed, 11 файлов. В G03-D добавлены 21 контрактная и 25 PG-проверок. [Лог](../../work/g03-d/target-pg-final.log). |
| Целостность миграций | Генерация 0004 совпадает побайтово; типы/required/constraints/индексы сверены с реальным каталогом. Проверены прямые SQL нарушения FK/CHECK/unique и атомарный rollback четвёртой миграции с повторным применением. |
| Гонки/отказы | Два независимых DB pool: однократная выдача в одной/двух семьях; отзыв ждёт начатую команду, последующие команды отвергаются. Сбой entropy/INSERT полностью откатывает сессию и сохраняет пригодность launch. |
| Границы доступа | Подмена family/profile/account/actor/mode, отсутствие Player, неактивные источники и binding revision, public ID, expiry, policy drift, CAS, чужой revoke — проверены. |
| Adult/managed | Только fixtures: default-deny, отказ взрослому в игре, погашение токена без отзыва lineage, grant expiry, protection revision, parent expiry/revoke, сохранение независимого own-child. Реального PIN-переключения нет. |
| TypeScript / сборка | npm run lint, target:typecheck, target:build — PASS; отдельный ESM familySession импортируется без startup/DB подключения. [Lint](../../work/g03-d/lint.log), [typecheck](../../work/g03-d/typecheck.log), [build](../../work/g03-d/build.log), [import](../../work/g03-d/import.log). |
| Регрессия приложения | 250 passed; 9 opt-in PG skipped. [Лог](../../work/g03-d/legacy-tests.log). |
| Очистка | Оба собственных тестовых контейнера удалены harness после проверки exact ID/owner. targetCleanup=passed в логах каждого прогона. Настоящие аккаунты, БД и BOT_TOKEN не использованы. |
| Браузер localhost:3000 | НЕ PASS: CUA вернул ERR_CONNECTION_REFUSED; отдельный curl health подтвердил отсутствие ответа. Сервер не запускался этим этапом. UI/ассеты не менялись; эта проверка не подтверждает доступность демо. |

GAT07/GAT08/GAT09 проверены на уровне сервисных границ с ограничениями: нет onboarding HTTP, минимальной home-проекции, настоящих покупок/начислений. GAT10/GAT11/GAT14 частично подтверждены моделью/fixtures. Полный G03/W09/W10/W11 не завершён.

## 4. Что требует следующего этапа

[G03-E](G03_ADULT_PROTECTION_CARD.md): взрослый PIN и recovery setup, измеренный KDF, устойчивые лимиты, security policy activation, свежие доказательства действий, настоящая выдача adult/managed контекстов и атомарное переключение. Приглашения, полное восстановление/смена Account, взрослый lifecycle, HTTP/UI и интеграция настоящего Telegram сохраняют отдельные зависимые этапы. Production retention/security, страны/возрасты/согласия и реальные данные переноса остаются открытыми решениями.
