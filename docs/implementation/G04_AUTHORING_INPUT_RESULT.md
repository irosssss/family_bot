# G04-A — результат безопасного входа контентного конвейера

Версия 1.0, 2026-09-08. Выполнена [карточка G04-A](G04_AUTHORING_INPUT_CARD.md):
первый блок W12. Полный G04 остаётся открытым.

## Реализовано

- `src/target/content/json.ts`: ограниченный parser, fatal UTF-8, NFC/lone-surrogate
  проверки, дубликаты декодированных ключей, JSON Pointer, точность чисел до преобразования.
  Объекты без прототипа; ошибки не содержат значения полей. JSON числа — точные small integers,
  большие суммы — существующие decimal-string UInt/Int. Дроби, exponent и -0 отвергаются.
- `schemas.ts`: закрытые JSON Schema 2020-12 PackageInput/LocalizationInput v1,
  зарегистрированный plain_text handler; неизвестные типы и версии отвергаются.
  Нет динамической загрузки `$ref` или исполнения схем/кода из пакета.
  Ajv8.20.0 закреплён как прямая dependency (та же версия уже была транзитивно в toolchain).
  Выбор отдельного класса Ajv2020 соответствует [документации Ajv](https://ajv.js.org/json-schema.html#draft-2020-12).
- `input.ts`: только явно перечисленные файлы, строгие POSIX-пути/регистр,
  запрет symlink/hardlink/необычных файлов, проверки namespace и повторной ревизии,
  ограниченное чтение через файловый handle, aggregate budget и raw SHA-256.
- `scripts/target/content-validate.ts`: standalone structural report, exit1 при отказе,
  `production_ready:false`; CLI импортируется без запуска. Синтетический пакет
  `tests/fixtures/content/g04-a` содержит один bundle с текстом «Тестовый пакет».

Команда примера: `npm run target:content:validate -- tests/fixtures/content/g04-a fixture`.
Собранный ESM CLI выдаёт те же input digests, что исходный CLI.

## Проверки

| Проверка | Результат |
|---|---|
| 58 новых content-input сценариев | PASS |
| Полная target-регрессия с собственной PostgreSQL18.6 | 410 passed = 352 прежних + 58 новых |
| Очистка временной PostgreSQL | PASS, проверен exact container ID |
| Существующая игра + Telegram preview, Vitest | 251 passed, 9 opt-in PostgreSQL skipped |
| lint / target:typecheck | PASS, 0 ошибок |
| target:build / ESM import без startup / compiled CLI | PASS |
| Изоляция после добавления CLI import guard | 3 passed |
| git diff --check | PASS |
| Браузер временной HTTPS-игры | Загрузился ожидаемый экран «откройте через Telegram»; UI этим этапом не менялся |

Входная часть CPT01/CPT03/CPT04 проверена для поддержанного типа. CPT02 проверен
на уровне parser + существующего UInt, а не несуществующего authoring shop-контракта.
Полная CPT01–CPT20 не закрыта. Подтверждение пользователем работы Telegram preview
зафиксировано отдельно и не заменяет целевые GAT/PIN/recovery проверки.

## Границы и следующий шаг

Только structural validation: зависимости/capabilities ещё не разрешаются, нет lock,
semantic/public digests, compiler, approval, publish/activation/rollback. Raw SHA-256
в отчёте не объявлен semantic digest. Namespace allowlist задаёт доверенный вызывающий
код; CLI — локальный тест, не сервис выдачи production полномочий. Лимиты синтетические,
O13 не принят. Корень должен быть стабильным снимком без враждебных параллельных writers;
переносимого openat-подобного confinement для такой среды этот Node adapter не обещает.

W12 выполнен для PackageInput и plain_text LocalizationInput. Схемы asset/content/registry/
offers/rights и ICU добавляются только вместе с поддержанными контрактами/handlers.
Следующий блок **G04-B / W13** — exact resolver, frozen schema/input lock и воспроизводимый
compiler для зарегистрированного типа. Далее W14/W15 — локальный release/activation
adapter и exact candidate preview с проверкой несовместимости.
