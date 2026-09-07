# G03-B — результат реализации Telegram identity

Версия 1.0, 2026-09-07. **Разрешён сообщением «хорошо, тогда продолжим» после исправления legacy-входа и решения оставить сервер в деморежиме. Реализован и проверен; готов к приёмке.** Основа — [карточка G3B01–G3B06](G03_IDENTITY_ADAPTER_CARD.md). Числа SP остаются кандидатами для дальнейших сервисов; G03-B принимает явную тестовую policy и не устанавливает production-настройки.

## 1. Результат

| ID | Реализовано | Где |
|---|---|---|
| G3B01 | Ограничения UTF-8 байтов/числа полей, строгий percent decode один раз, дубли после декодирования, ASCII-имена, CR/LF/NUL и непарные UTF-16 суррогаты | [parse.ts](../../src/target/access/telegram/parse.ts) |
| G3B02 | HMAC с ожидаемым ключом, все поля кроме hash, включая signature, сортировка, timing-safe comparison; без encoded fallback | [index.ts](../../src/target/access/telegram/index.ts) |
| G3B03 | Явные часы, freshness, строгий user.id и закрытая неизменяемая identity; неизвестные атрибуты не получают полномочий | Тот же factory |
| G3B04 | Закрытая конфигурация, snapshot policy, ошибки только ключами, нет process.env/HTTP/DB/логов; import guard | [изоляция](../../tests/target/isolation.test.ts) |
| G3B05 | Независимый Python-vector, два RFC-вектора, граничные и негативные проверки, отдельная ESM-сборка | [77 проверок адаптера](../../tests/target/telegram-identity.test.ts) |
| G3B06 | Отчёт и конкретная следующая карточка | [G03-C](G03_IDENTITY_EXCHANGE_CARD.md) |

Вход factory: botId, botToken, environment, now и policy {id,revision,maxAgeSeconds,futureSkewSeconds,maxBytes,maxFields}. Реальный ключ этим этапом не читается. Секрет нужен только HMAC внутри процесса. Некорректная конфигурация отклоняется с access.telegram_config_invalid; неверный вход возвращает access.identity_invalid; отказ часов — access.verifier_unavailable. Исходные значения и исключения наружу не передаются.

Результат: schema_version, provider, subject, bot_id, environment, verification_method, verification_policy_id/revision, authenticated_at, verified_at, replay_fingerprint. Нет user JSON, имени, role, family_id, Account, Session или bearer. Fingerprint — внутренний ключ будущего одноразового обмена, сам по себе он не запрещает повтор.

Новый JSON-контроль выявляет повторные ключи, в том числе вложенные и записанные через Unicode escape. JSON.parse проверяет синтаксис; дополнительный ограниченный обход проверяет неоднозначность. Исходный числовой token id не позволяет дроби, округлившейся в JavaScript до целого, стать subject. Глубина ограничена 32; технические пределы конфигурации — 1 MiB / 1024 поля. Это пределы ресурсоёмкости реализации, не рекомендуемый размер production-входа; тестовая policy использует 16 KiB / 64 поля. Стоимость собственного обхода покрыта негативными тестами; при дальнейшем изменении JSON-поддержки эти случаи обязательны.

## 2. Доказательства и пределы

| Проверка | Результат |
|---|---|
| npm run target:test | **113 passed / 12 PostgreSQL skipped**. Из них 77 — новые проверки адаптера/криптопримитива. |
| npm test | **250 passed / 9 opt-in PostgreSQL skipped**. |
| npm run lint / target:typecheck | PASS. |
| target:build и импорт собранного adapter | PASS; независимый vector принят собранным ESM. |
| Усиленный import guard после его дополнения | 3 passed. |
| git diff --check | PASS. |
| Браузер localhost:3000 | «Семейный дом — локальная демо» загружается, дерево UI доступно. Это smoke старого демо, не проверка нового входа через Telegram. |

Логи: [target](../../work/g03-b/target-tests.log), [регрессия](../../work/g03-b/regression.log), [lint](../../work/g03-b/lint.log), [typecheck](../../work/g03-b/typecheck.log), [сборка](../../work/g03-b/build.log), [ESM](../../work/g03-b/bundle-import.log), [import guard](../../work/g03-b/isolation-tests.log).

Основания: [Telegram HMAC](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app), [RFC 4231 §4.2–4.3](https://www.rfc-editor.org/info/rfc4231/), [синтетический Python-vector](../../tests/fixtures/telegram-init-data.json) из отдельного исправления legacy. RFC проверяет криптопримитив, Python-vector — канонизацию. Поддельные ключи в тестах — публичный искусственный материал, не credentials настоящих ботов.

GAT01–GAT03/GAT05 проверены в границах чистого адаптера. GAT04 частично: чужой ключ, mismatch botId/token, неподдержанная конфигурация отклонены. **Среда не содержится в HMAC как отдельное доказательство**: environment задаёт доверенный серверный namespace fingerprint, из initData она не выводится. Разделение реальных test/production ключей и deployment остаётся интеграционной проверкой. GAT06–GAT24 не закрыты.

При первой проверке новый негативный тест обнаружил замену непарного UTF-16 суррогата UTF-8-энкодером; добавлен явный отказ, итоговый прогон прошёл. Новых зависимостей, БД/миграций, серверов с реальным BOT_TOKEN и игровых изменений нет. Предыдущая проверка getMe подтвердила действительность сохранённого токена, но не является проверкой Mini App initData и не повторялась этим этапом.
