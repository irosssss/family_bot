# G04-B — результат resolver, lock и compiler

Версия 1.0, 2026-09-08. Выполнена [карточка G04-B](G04_COMPILER_CARD.md),
W13 в рамках зарегистрированных plain_text/local candidates. G04-A принят продолжением «дальше».
Полный G04 не закрыт: W14/W15 — отдельные следующие блоки.

## Что работает

| Часть | Результат |
|---|---|
| Freeze | Явные source roots/namespace policy, лимиты и required locales; deep-frozen снимки JSON и private raw inventory. Только module-created token допускается к compiler. |
| Resolver | Exact package versions, missing/cycle/conflict, diamond DAG, longest-path budget, запрет revision rewrite и unsupported capability. Unused retained version не становится активной зависимостью. |
| Lock | Root без собственного manifest digest; exact dependency candidate digests, semantic records, immutable schema registry, compiler/exporter/Node/ICU/Unicode/config versions. |
| Canonicalization | RFC8785: UTF-16 сортировка ключей, ECMAScript primitives, без toJSON/getters/coercion; порядок обычных массивов сохраняется. Множества конкретного контракта сортируются отдельно. |
| Localization | Exact bundle/revision/locale, missing/fallback-cycle checks, требуемые переводы и name_key; только plain_text, без ICU arguments. |
| Compiler | Разрешённые runtime-поля, отдельные semantic/public digests, immutable manifest и runtime descriptors с точными byte_size/digest. |
| Output | Новый local candidate directory: runtime отдельно от private lock/report, private permissions0700/0600, completion marker последним. Existing directory и чужой compiler result не перезаписываются. |
| CLI/rebuild | Сохранённый lock проверяется до записи результата; source и compiled CLI, единый compiled library entry дают одинаковые runtime bytes. |

Код: `src/target/content/{canonical,compilerContracts,compiler,buildDirectory,artifactAuthority,schemaValidator}.ts`,
команда `scripts/target/content-build.ts`. Библиотечный bundle `src/target/content/compiler.js`
экспортирует freeze/compile/write вместе, сохраняя module-local provenance.

Найден и исправлен runtime-дефект G04-A: стандартный `uniqueItems` в Ajv8.20.0
использовал fast-deep-equal, который вызывал `valueOf` у null-prototype записей парсера.
Две объектные зависимости приводили к TypeError. Общий schema factory теперь проверяет
уникальность безопасным сравнением JSON-значений; стандартная семантика uniqueItems сохранена.
Добавлен отрицательный тест ключей valueOf/constructor и duplicate objects с разным порядком полей.

## Проверки и воспроизведение

| Проверка | Фактический результат |
|---|---|
| Полная target-регрессия, собственная PostgreSQL18.6 | **456 passed**, 19 test files: 410 предыдущих + 45 compiler + 1 parser/schema regression |
| Exact-ID cleanup PostgreSQL | PASS |
| Общая игра и Telegram preview | **251 passed**, 9 opt-in PostgreSQL skipped |
| lint / target:typecheck | PASS, 0 ошибок |
| target:build / imports без startup | PASS |
| Два отдельных CLI процесса + compiled library API | 2 пакета, 4 артефакта; одинаковые lock/fingerprint/runtime bytes |
| Saved lock после изменения source | LOCK_CHANGED; output directory не создан |
| Whitespace, порядок JSON полей/sets, relocation/source filenames | Публичные байты и fingerprint неизменны; private raw inventory меняется |
| Browser после lint | HTTPS-версия загружается; ожидаемый гостевой экран требует Telegram. UI этим этапом не менялся |

Машиночитаемое доказательство: `work/g04-b/verification.json`.
Пример исходников: `tests/fixtures/content/g04-b/{root,base}`.

Команда (OUT — ещё не существующая директория с существующим родителем):

```bash
npm run target:content:build -- OUT fixture:package/root_texts 1.0.0 fixture tests/fixtures/content/g04-b/root tests/fixtures/content/g04-b/base
```

Для повторной сборки добавить `--check-lock PREVIOUS_OUT/private/lock.json` и выбрать новый OUT.
`private/candidate.json` содержит новый ID/время; они не участвуют в fingerprint.
Эталонный root manifest digest:
`09fc4ad715d00388c5162b4185a75613467f62475ea3b78b800f53f17393ff48`.
Значение относится к зафиксированной в lock версии toolchain/config, не к любому Node/runtime.

## Матрица и границы

CPT05/06/08/09 проверены на local JSON graph; CPT11/12 — в пределах plain_text,
fallback и исключения private metadata. CPT07 имеет только JSON-аналог изменения источника;
binary/art/rights и полная CPT-матрица не закрыты. JCS проверен по правилам
[RFC8785](https://www.rfc-editor.org/rfc/rfc8785.html), включая integer-shaped keys,
UTF-16, числовые/escape примеры; общие массивы не сортируются как множества.

Зависимости — локальные кандидаты, **не опубликованные production releases**.
Fixture compatibility profile встроен в compiler и закреплён configuration digest;
production art/registry support не принят. Required locales/limits синтетические, O13 открыт.
Status переводчика не является доверенным CandidateApproval; отчёт сохраняет pending gates,
даже если source сам заявляет reviewed. Фильтрация private полей не является распознаванием
персональных сведений внутри произвольного текста: UGC не должен попадать в authoring packages.

Freeze работает со стабильным source root по условиям G04-A. Изменение диска требует
нового freeze; старый token компилирует ровно прежний захваченный снимок. Failed output
может оставаться неполным, но без completion marker и без active pointer.
Основная БД/миграции, бот, публичный deploy и графика не менялись.

Следующий блок **G04-C / W14**: локальный release/activation adapter,
явный допуск exact candidate, immutable storage, ActivationSnapshot/Head/Change,
CAS/head-lock и конкурентные/аварийные проверки. W15 затем добавит exact candidate preview.
