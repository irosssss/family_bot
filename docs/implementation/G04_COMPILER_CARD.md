# G04-B — exact dependencies, frozen lock и compiler

Версия 1.0, 2026-09-08. Пользователь принял G04-A продолжением «дальше».
Объём W13 — поддержанный plain_text LocalizationInput, синтетические пакеты и локальные
кандидаты зависимостей. Production publish/activation относятся к W14 и этому этапу не приписываются.

| Работа | Приёмка |
|---|---|
| Exact resolver | Нет missing/cycle/version conflict, подмены одной revision или неизвестной capability; проверка глубины всего DAG и ресурсных лимитов. |
| Frozen inputs и lock | Снимок данных неизменяемый, только явно выбранные источники; exact package/schema/toolchain/config refs, lock не ссылается на свой собственный digest. |
| Воспроизводимый compiler | JCS с UTF-16 сортировкой ключей, отдельные semantic/public/raw области; runtime по разрешённым полям, manifest привязан к lock; одинаковые входы дают одинаковые байты. |
| Локализация | Exact bundle/revision/locale, отсутствие переводов/ключа имени и fallback cycle/missing блокируют сборку; ICU/arguments не поддержаны, unknown syntax отвергается. |
| Локальный артефакт и отчёт | runtime отделён от private lock/report; запись в новую директорию, без перезаписи; saved-lock mismatch блокирует результат. |

Технические уточнения первого scope v1:

- Localization entries трактуются как lookup по уникальному key; semantic/public массив
  сортируется по key. Массивы общего JCS сохраняют порядок. Status переводчика исключён
  из semantic/public и остаётся в private report. Неизменная семантика при другом
  whitespace/порядке полей не меняет fingerprint; raw input inventory меняется отдельно.
- Локальный каталог состоит из явно перечисленных authoring snapshots. Зависимости
  компилируются топологически; lock/manifest фиксируют exact digest каждого dependency
  candidate. Они не объявляются опубликованными. Production adapter обязан проверять
  опубликованный статус и источник доверия перед выдачей PublishedDependency.
- Кодом зарегистрирован только fixture compatibility profile `fixture:registry/plain_text_compatibility` r1.
  Его semantic body входит в configuration digest. Это встроенный контракт compiler,
  не принятый production art/registry пакет.
- Limits `synthetic_content_build` r1:32пакета, глубина16 (включая root),1024records,
  4MiB всех исходных JSON,4MiB публичного результата; per-file limits G04-A.
  CLI использует тестовый requiredLocale ru; набор production языков O13 не принят.
- Compiler работает с захваченным снимком. Изменение диска требует нового freeze;
  старый план сохраняет прежние байты и не превращается в одобрение нового исходника.

Проверки: CPT05–CPT09/CPT11/CPT12 в рамках JSON/localization, негативные схемы,
tamper/lock, приватность путей, новый output directory, regression/type/build.
Binary/visual compatibility, rights approval, activation/rollback/GC остаются открыты.
