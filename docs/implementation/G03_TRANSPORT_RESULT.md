# G03-G — результат HTTP transport и синтетических сквозных проверок

Версия 1.0, 2026-09-08. **Пользователь явно разрешил G03-G по карточке;
G3G01–G3G06 выполнены в синтетической серверной среде. Результат на приёмку.**
Основа — [карточка](G03_TRANSPORT_CARD.md), завершённый
[G03-F](G03_RECOVERY_LIFECYCLE_RESULT.md) и новый
[HTTP-контракт](../security/ACCESS_HTTP_CONTRACT.md).

## Реализовано

| ID | Результат | Доказательство |
|---|---|---|
| G3G01 | 31 явный маршрут сервисов identity/setup/session/recovery/invitation/lifecycle и отдельный закрытый bootstrap. Закрытые входы, обязательные поля ответов, явная выдача non-enumerable secrets после commit. Нет метода по клиентскому имени, actorId или сериализации internal/verifier records. | transport/routes.ts, contracts.ts; HTTP projection/extra-field tests; все сервисные маршруты используются сквозными сценариями. |
| G3G02 | Loopback + точные Host/Origin, credential scope/Authorization, строгие JSON/UTF-8/duplicate keys, пределы тела/заголовков и timeout. Cookie/proxy headers/compression/query/неверные методы закрыты. No-store, без ETag, только фиксированные error keys. Audit получает route/status. | 45 transport boundary tests, в том числе raw HTTP для Host/дублирующихся headers и неверного UTF-8; проверки redaction, обязательного bearer, scopes и лишних полей каждого маршрута. |
| G3G03 | Обязательный доверенный gate O01/O09 имеет только закрытое состояние. HTTP bootstrap всегда 503; consent/synthetic/account flags не принимаются. Identity exchange не создаёт семью. | HTTP отказ и SQL counts; семьи/первые bindings создаются только напрямую тестовыми fixtures на собственной временной БД. Production onboarding не открыт. |
| G3G04 | Оба детских входа достигают одного Player; PIN/setup/acknowledgement, потерянные ответы, recovery по коду и другому взрослому, приглашения детей/взрослых, чужие семьи, expiry и cancellation проверены через HTTP. | 18 сквозных PostgreSQL-сценариев; реальный Node Argon2id, искусственные HMAC-векторы и pepper. |
| G3G05 | Два независимых pool/HTTP сервера, гонка consume, read/revoke и read/leave; повтор после пересоздания HTTP factory, rollback SQL trigger и общий лимит отзывов. После отзыва новые чтения отвергаются. | Один result binding/profile/Player, immutable operation receipt после выхода, отозванный bearer не оживает; SQL failure возвращает HTTP-отказ и не оставляет частичный профиль. |
| G3G06 | HTTP-контракт, этот отчёт, machine-readable verification и обновлённый остаток GAT/W11. | docs/security/ACCESS_HTTP_CONTRACT.md, ACCESS_VALIDATION.md, work/g03-g. |

Новый код — [transport/http.ts](../../src/target/transport/http.ts),
[routes.ts](../../src/target/transport/routes.ts),
[contracts.ts](../../src/target/transport/contracts.ts).
Тесты — [граница](../../tests/target/transport-boundary.test.ts) и
[HTTP/PG](../../tests/target/transport-postgres.test.ts).
В target:build добавлен HTTP ESM entrypoint; import-isolation проверяет новый модуль.
Имеющийся target CI job подхватывает bundle и тесты, но удалённый CI не запускался.

## Фактическая проверка

| Проверка | Результат |
|---|---|
| Полная target-регрессия | **352 passed, 17 файлов** на собственной PostgreSQL 18.6. Включает 289 прежних и 63 новых теста. |
| Новые G03-G проверки | **45 HTTP boundary + 18 HTTP/PG e2e passed**. |
| Legacy-регрессия | **250 passed, 9 opt-in PostgreSQL skipped**. |
| npm run lint | PASS, 0 ошибок. |
| target:typecheck / target:build | PASS. |
| Импорт собранного HTTP ESM | PASS; без запуска HTTP/БД. |
| Миграции 0001–0006 | Новых миграций нет, manifest/checksum сохранены; существующие catalog/rollback тесты проходят в общей регрессии. |
| git diff --check | PASS. |
| Cleanup | Harness подтвердил удаление exact ID тестовых и отдельного preview контейнера. |
| Browser probe | CUA **ERR_BLOCKED_BY_CLIENT** для временного HTTP endpoint. Браузерная проверка не PASS. |
| Независимый HTTP probe | curl получил ожидаемый **403 transport.boundary_denied**, no-store и закрытый JSON: navigation без Origin не разрешена. |
| UI / реальные Telegram / устройства / deploy | Не выполнялись и не входят в этот этап. |

Логи и воспроизводимая probe — [work/g03-g](../../work/g03-g/verification.json).
Loopback listen внутри sandbox сначала завершился EPERM; разрешённый запуск
снаружи sandbox прошёл. Это не отключение HTTP-защиты приложения.

Первый полный прогон выявил две неверные предпосылки новых тестов:

- Node fetch заменяет Host, переданный вручную; проверка чужого Host переведена
  на `node:http`, который действительно отправляет нужный заголовок.
- Последовательные revoke session → revoke binding той же пары должны получать
  общий 429 G03-E/F. Проверка теперь требует этот отказ, сохранение доступа и
  успешный отзыв после паузы с новым PIN-подтверждением.

После исправления проверок полный прогон прошёл. Доменная реализация G03-F не
переписывалась; её повторное выполнение было только частью регрессионного suite.
Новых npm dependencies, изменений legacy runtime/БД/UI/ассетов нет. Исходные
незакоммиченные изменения G03-E/F сохранены; package.json, isolation test и документы
дополнены поверх них. Коммит, сброс working tree и deploy не выполнялись.

## Что именно доказано и что осталось

- HTTP подтверждает серверные ветви GAT06–08/10–11/13–22 в пределах перечисленных
  сценариев: повтор/изолированная область, оба способа child access, PIN/fresh proof,
  восстановление, приглашения, отзыв и lifecycle. Это дополнение к более широкой
  service/PG-матрице G03-F, а не утверждение, что каждый GAT полностью закрыт.
- GAT23 частичен: проверены HTTP origin/Host/header/body и redaction. UI/XSS,
  клиентское перенаправление credentials, proxy/HTTPS и telemetry реального
  окружения ещё не проверены. Нет клиентского приложения в этом transport.
- GAT01–05 сохраняют прежние pure adapter/vector доказательства и новые HTTP
  проверки подписанного входа/отказа; реальных Telegram golden bytes нет.
- GAT09: родительский target не становится child; реальные экономические команды,
  покупки и начисления ещё отсутствуют. Доказано сохранение Player, не будущей экономики.
- GAT12/GAT24: фон/reload/закрытие Telegram, iOS/Android/Web и совместимость устройств
  не проверены. Перезапуск в e2e — новые HTTP listener/factory и независимый DB pool
  над тем же committed state; это не kill/crash-recovery PostgreSQL или устройств.
- O01/O09, production security/retention, O13, QDB01 и реальный onboarding остаются
  открыты. HTTP bootstrap намеренно закрыт. `profile/read` — минимальная проекция
  доступа, а не готовый home API; выбор семьи/профилей и UI остаются вне этапа.

**G03-G завершён в границах карточки; весь G03 и W11 не объявляются закрытыми.**
Следующая работа с настоящим Telegram требует отдельного выбора и согласования
среды, домена, бота/ключей и конкретных аккаунтов/устройств. Эти действия сейчас не
разрешены автоматически; их отсутствие не подменяется синтетическими fixtures.
