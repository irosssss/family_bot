# G03-G — контракт синтетического HTTP transport

Версия 1.0, 2026-09-08. Серверные сервисы G03-B–F подключены через
`src/target/transport/{http,routes,contracts}.ts`. Это локальный target-контур:
настоящие Telegram/device, HTTPS/proxy, пользовательский UI и production onboarding
не входят в доказанный объём.

## 1. Подключение и граница запроса

`startTargetAccessServer(services, { bootstrapGate: closedBootstrapGate, audit })`
принимает явно созданные `exchange` и `lifecycle`, слушает случайный свободный порт
только на `127.0.0.1` и возвращает `{ origin, server, close }`. Импорт не запускает
сервер, не читает env, не открывает БД и не активирует политики. Проверка владения БД,
миграции, retention fixtures и activation выполняются существующим test harness и
тестовой композицией до открытия HTTP. Health-only `target:dev` и legacy/demo не меняются.

Все маршруты — **POST**, точный путь `/access/v1/<маршрут>` без query, завершающего
слеша, алиасов или нормализации регистра. Даже чтения передают закрытый JSON body.
Обязательные заголовки:

- `Host` равен host:port, возвращённому сервером; соединение приходит с loopback.
- `Origin` точно равен возвращённому `origin`. Нет wildcard CORS или исключения для
  отсутствующего/null Origin; синтетический HTTP-клиент передаёт его явно.
- `Content-Type: application/json`, допускается только `charset=utf-8`.
- `Content-Length`: десятичная длина тела, не более 24576 байт. JSON декодируется
  строгим UTF-8; вложенность не более 8; повторные декодированные ключи запрещены
  на любом уровне. Общий лимит заголовков — 8192 байта; timeout соединения/запроса
  10 секунд, headersTimeout 5 секунд. Chunked и compressed requests закрыты.
- `X-RPG-Credential`: область из таблицы ниже. Для `none` Authorization отсутствует;
  для остальных — единственный `Authorization: Bearer <43 символа base64url>`.
  Область — только указатель протокола, не доказательство полномочий. Сервис сам
  проверяет domain-separated verifier и живые источники в БД.

Дубли заголовков, Cookie, Forwarded/X-Forwarded-*, Content-Encoding, Expect,
X-HTTP-Method-Override и чужой Sec-Fetch-Site отвергаются. Неизвестные поля body,
клиентские actorId/account DTO и секреты в URL не принимаются. UUID проверяются
существующим `entityId`, revisions — существующим `revision`, PIN — ровно 6 ASCII
цифр. Строки не допускают NUL/одиночный surrogate. Дополнительные правила сущностей
сохраняются в сервисах; HTTP не заменяет транзакционные guards предварительно
закешированным actor.

## 2. Маршруты и закрытые DTO

Каждое перечисленное поле запроса обязательно. `null` разрешён только там, где это
указано. У чтений без полей body равен `{}`. Все успешные ответы содержат `ok: true`;
таблица перечисляет остальные поля. Внутренние records, verifier ID/hash, digest,
PIN salt, pepper, protection records и policy activation никогда не выдаются.

Сокращения ответа:

- `launch`: `id, account_id, expires_at`.
- `setup`: `id, revision, state, expires_at`; чтение добавляет `family_id, binding_id`.
- `session`: `id, family_id, profile_id, expires_at`; adult/managed также `mode`.
- `actor`: `family_id, profile_id, player_id, session_id, session_revision,
  token_revision, binding_id, mode`. `token_revision` — публичная CAS-версия для
  retire, без verifier ID/hash.
- `request`: `id, revision, kind, state, family_id, target_profile_id,
  candidate_account_id, result_binding_id, completed_operation_id, expires_at`.
- `confirmation`: `null` для собственного отзыва, иначе закрытый объект
  `{ proof_bearer, operation_id }`.

| Маршрут | Credential | Поля body | Дополнительные поля успеха |
|---|---|---|---|
| identity/exchange | none | init_data | launch, bearer |
| setup/begin | launch | family_id, binding_id | setup, bearer |
| setup/read | setup | — | setup с family_id/binding_id |
| setup/prepare | setup | expected_revision, pin, pin_confirmation | setup_revision, recovery_locator, recovery_code |
| setup/rotate-recovery | setup | expected_revision | setup_revision, recovery_locator, recovery_code |
| setup/acknowledge | setup | expected_revision, recovery_code | — |
| session/own-child | launch | family_id, binding_id | session, bearer |
| session/login | launch | family_id, binding_id, pin | session, bearer |
| session/read | session | — | actor |
| session/switch | session | pin, target_mode (adult/managed_child), target_binding_id, expected_session_revision | session, bearer |
| session/confirm | session | pin, action (revoke_session/revoke_binding), target_id, expected_revision, operation_id | expires_at, operation_id, proof_bearer |
| session/revoke | session | session_id, expected_revision, confirmation | replayed при подтверждённом повторе |
| binding/revoke | session | binding_id, expected_revision, confirmation | replayed при подтверждённом повторе |
| session/retire | session | expected_revision (token_revision) | — |
| profile/read | session | family_id, profile_id | value: family_id, profile_id, player_id (null при чтении взрослым чужого профиля) |
| recovery/begin | launch | family_id, binding_id | request, bearer |
| recovery/code | candidate | expected_revision, recovery_code | request |
| recovery/approve | session | request_id, expected_revision, candidate_account_id, pin, operation_id | — |
| recovery/complete | candidate | expected_revision, pin, pin_confirmation | binding_id, setup_revision, recovery_locator, recovery_code |
| invitation/issue | session | kind (invite_child/invite_adult), profile_id (UUID/null соответственно), pin, operation_id | request, invite_secret; при replay только ok |
| invitation/claim | launch | invite_secret | request, bearer |
| invitation/approve | session | request_id, expected_revision, candidate_account_id, pin, operation_id | — |
| invitation/consume | candidate | expected_revision, display_name | binding_id |
| lifecycle/read | candidate | — | request |
| lifecycle/inspect | session | request_id | request, candidate: null или account_id/provider/subject |
| lifecycle/cancel | session | request_id, expected_revision, pin, operation_id | — |
| lifecycle/operation | launch | operation_id | operation_id, request_id, action, outcome |
| lifecycle/leave | session | pin, expected_binding_revision, operation_id | — |
| lifecycle/exclusion | session | pin, target_binding_id, expected_revision, operation_id | request; при replay только ok |
| lifecycle/consent-exclusion | session | pin, request_id, expected_revision, operation_id | — |
| lifecycle/revoke-adult-sessions | session | pin, target_binding_id, expected_revision, operation_id | — |
| family/bootstrap | launch | — | Всегда отказ 503 transport.bootstrap_closed |

`profile/read` — минимальная серверная проекция внутри `withFamilyAccess`, а не
игровой home/UI API. Она проверяет семейную и профильную область до callback;
player_id берётся из живого resolver. Игровых команд или начислений в transport нет.
Каждая команда связана отдельной серверной функцией; клиентское имя метода не
используется для вызова свойства объекта сервиса.

## 3. Bootstrap и O01/O09

Обязательная доверенная конфигурация gate содержит только
`{ state: 'closed', blockers: ['O01', 'O09'] }`. Открытого варианта в этом этапе нет.
Синтетический или настоящий валидный Telegram HMAC сам не разрешает создание семьи,
parent profile или binding. HTTP consent/age/environment/synthetic flags не входят
в DTO и не открывают gate. Успешный identity exchange создаёт ограниченный launch,
но не семью.

Для e2e тестовый код напрямую создаёт synthetic family/profile/binding на собственной
временной БД. Это не endpoint, пользовательское согласие, регистрация настоящей
семьи или доступный production seed. Семейные identifiers для сценариев берутся
из этих fixtures; UI поиска/выбора семей этим этапом не реализован. Решения O01/O09
и реализация допуска/первого onboarding остаются отдельной зависимой работой.

## 4. Ошибки, секреты и повторы

Ошибка всегда закрыта: `{ ok: false, error_key }`, без exception.message, SQL, body,
headers или stack. 400 — некорректный контракт; 401 — отсутствующий/недействующий
credential; 403 — scope/права/lifecycle denial; 404/405 — путь/метод; 409 — replay
identity либо CAS/conflict; 413/415 — размер/тип; 429 — подтверждённый лимит;
503 — закрытый bootstrap, unavailable либо неизвестная ошибка зависимости.
`access.lifecycle_denied` сохраняет общий 403 сервиса G03-F, в том числе при rollback:
он не раскрывает, был ли причиной отказа SQL или состояние процесса. Это никогда
не успешный HTTP-ответ. Ошибка parser в Node до Express также получает 400/no-store
с пустым телом и закрытием соединения.

Все ответы имеют no-store/no-cache, nosniff, no-referrer и CSP default-src none;
ETag, cookies и CORS allow headers отсутствуют. Никакого response/request логгера
нет. Необязательный audit callback получает только фиксированное имя маршрута
(либо `unmatched`) и числовой статус. Даже URL/query и request ID из клиента не
попадают в audit. Выданные non-enumerable secrets копируются в JSON только явной
проекцией конкретного endpoint и только после завершения сервисной транзакции.
Отсутствующее обязательное поле ответа даёт 503 вместо частичного успеха.

Потерянный ответ не обещает универсальный повтор всех операций:

- identity exchange одноразовый; потерянный launch требует нового подписанного
  запуска. TTL и replay receipt проверяет G03-C.
- setup читается через setup/read; потерянный recovery_code заменяется CAS-ротацией,
  затем новый код подтверждается.
- claim приглашения повторяется новым launch того же verified candidate, выдаёт
  новый bearer и revision, гасит прежний. Чужой candidate не подменяет его.
- consume приглашения возвращает тот же binding после commit/restart; профиль
  повторно не создаётся. Issue replay не раскрывает потерянный invite_secret:
  нужен новый процесс приглашения, прежний не получает новых прав автоматически.
- после complete recovery прежний candidate bearer становится ограниченным setup
  bearer; setup/read/rotate восстанавливают получение кода. Обычный login возможен
  после acknowledge и нового launch. beginSetup не обходит recovery setup.
- выход отзывает bearer. Receipt своей операции читается с новым launch того же
  Account через lifecycle/operation; повтор с отозванным bearer остаётся отказом.
- сервисные operation UUID, intent и CAS сохраняются в БД. HTTP не добавляет
  memory-only dedupe, не кеширует actor и не запускает команду повторно после ошибки.

Ориентиры: [OWASP REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
для проверки методов/входов/типов/прав и [OWASP Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
для исключения authentication secrets из логов. HTTP здесь разрешён исключительно
для синтетического loopback; эти проверки не заменяют будущую HTTPS/proxy/device
валидацию и production rate-limit/capacity review.
