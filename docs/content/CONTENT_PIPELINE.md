# Family Chores RPG — контентный конвейер

Версия 1.0, 2026-09-07. **PIPE01–PIPE08 приняты пользователем как проект конвейера.** ART01–ART08 приняты как спецификация с будущей визуальной проверкой; размеры/палитра/состав пилота остаются проверяемыми кандидатами. Все нынешние изображения — демо. Ниже — полный проект конвейера. Реализованные локальные срезы: [G04-A](../implementation/G04_AUTHORING_INPUT_RESULT.md) [G04-B](../implementation/G04_COMPILER_RESULT.md) для plain_text пакетов и [G04-C](../implementation/G04_RELEASE_RESULT.md) для локальной публикации/активации fixture набора. Основные ассеты, production-каталог и публикация не выполнены.

Состав: этот процесс; [авторские контракты и манифесты](AUTHORING_CONTRACTS.md); [выпуск, активация, откат](RELEASE_OPERATIONS.md). Основа: [контентные данные](../data/CONTENT_DICTIONARY.md), [физическая модель](../data/PHYSICAL_SCHEMA.md), [Asset Bible](../art/ASSET_BIBLE.md), [производственный план](../art/ART_PRODUCTION.md).

## 1. Принятые решения проекта

| ID | Решение | Результат / стоимость сопровождения |
|---|---|---|
| PIPE01 | Разделить редактируемые исходники, описания контента, сборочные результаты и runtime-файлы. Все пространства имён явные. | Демо/референсы/частные материалы не попадают в публичный пакет случайно; переименование папки не меняет ContentId. |
| PIPE02 | Для MVP зависимости пакетов задаются точными стабильными SemVer; release хранит полный lock и digest. | Нет неявного latest и необходимости сложного solver диапазонов. Диапазоны можно добавить позже отдельной версией авторской схемы. |
| PIPE03 | JSON Schema 2020-12 для структуры плюс отдельные ссылочные, игровые, визуальные и лицензионные проверки. | Типизация TypeScript не заменяет валидацию; отсутствие обязательного проверяющего контракта блокирует выпуск. |
| PIPE04 | Детерминированная сборка из зафиксированных входов; JCS для канонического JSON, SHA-256 для заявленных областей байтов. | Можно сравнить выпуски и повторить сборку без генерации нового art; хеш не выдаётся за подпись или лицензию. |
| PIPE05 | Предпросмотр работает на exact candidate и синтетических fixtures; отчёт привязан к его digest и профилям. | Нельзя принять один PNG, а выпустить незаметно изменённый другой; визуальная приёмка не подменяется schema PASS. |
| PIPE06 | Publish и activate — разные разрешаемые операции; каталог читается согласованным activation snapshot. | Неполная загрузка не становится витриной; конкурентные активации проверяют ожидаемую ревизию. |
| PIPE07 | Откат проверяет зависимости и уже выданные права; старые артефакты удаляются только после анализа достижимости. | Снятие продаж не отнимает покупки. Откат контента не откатывает кошельки, результаты дел и миграции БД. |
| PIPE08 | У каждого изменения есть машиночитаемый результат проверок, происхождение, полномочия и карта влияния. | Процесс развивается от файлов/CLI к редактору 2.0 без смены правил публикации; история содержит минимум необходимых данных. |

## 2. Независимая оценка

| Проблема | Решение в конвейере |
|---|---|
| «Добавить запись и картинку» недостаточно для готового предмета | Проверить тип, точную ревизию, совместимость, ключи текста, права, preview и доступность обработчика. Для нового объекта поддержанного типа код игры не меняется; новая механика требует кода/контракта. |
| Слишком ранний универсальный редактор дорого поддерживать | MVP — авторские JSON, редактируемые art-исходники, сборка и отчёты. UI-редактор позже использует те же схемы и команды. |
| Диапазоны версий создают неоднозначность | MVP exact dependencies; полный снимок уже разрешённого графа. Конфликтующие ревизии одного канонического ID не переписываются другой библиотекой. |
| Детерминированная сборка не гарантирует повторяемую внешнюю генерацию | Источник сборки — сохранённый одобренный бинарный файл и recipe/tool versions. Генератор изображений не вызывается внутри build/rebuild. |
| Отдельные переключатели пакетов могут дать смесь разных выпусков | Activation snapshot содержит согласованный набор package refs и digest; обновление набора атомарно. |
| Визуальный вариант имеет больше деталей, чем строковый ключ | variant_key — ключ зарегистрированного tuple body/pose/view/palette; runtime не разбирает семантику имени файла. |
| Источники прав и промпты могут содержать частные данные | Во внешнем runtime-манифесте только разрешённые поля. Полный production report/rights evidence остаётся в ограниченной области. |

## 3. Папки, владение файлами и нейминг

Это целевая структура после отдельного разрешения реализации. Созданы только документы в docs/content; перечисленных ниже authoring/build/runtime-папок с новым контентом сейчас нет.

```text
content-source/
  schemas/<contract-id>/<schema-version>.schema.json
  registries/<namespace>/<registry-slug>/r<revision>.json
  packages/<namespace>/<package-slug>/
    package.json
    definitions/<kind>/<slug>/definition.json
    definitions/<kind>/<slug>/r<content-revision>.json
    assets/<asset-slug>/r<asset-revision>.json
    localization/<bundle-slug>/<locale>/r<revision>.json
    offers/                    # только поддержанные общие предложения
    credits/                   # сведения об источниках
    rights/                    # закрытые записи проверки прав
    reviews/                   # ссылки на одобрения, не публичный экспорт
art-source/<namespace>/<asset-slug>/
  source/
  references/
  exports/<variant-key>/
  review/
content-build/<candidate-id>/
  lock.json
  manifest-body.json
  release-record.json
  runtime/
  reports/
public/assets/game/<namespace>/<package-slug>/<package-version>/
  assets/<asset-slug>__<variant-key>__r<asset-revision>.png
  manifests/<manifest-digest>.json
docs/content/
```

Добавление namespace в путь уточняет функциональное дерево ART и предотвращает столкновение двух пакетов с одинаковым slug. Одно и то же AssetRef в разных релизах может ссылаться на прежний immutable storage_key без копирования байтов. Физический dedup по digest допустим внутри сборки, но не объединяет разные права/атрибуции и не превращает digest в ContentId.

| Элемент | Правило |
|---|---|
| ContentId | `namespace:kind/slug`, по DATA_CONTRACT; ID хранится явно, не вычисляется из папки. |
| Namespace/kind/slug/variant_key | Lowercase ASCII snake_case, без emoji, пробелов, личных имён и слова final вместо revision. |
| Revision | Положительное целое в данных; `rN` только файловая запись. |
| Package version MVP | Точная `major.minor.patch`, без prerelease/build metadata в production v1 схемы; кандидаты различаются candidate_id. Это выбранное подмножество SemVer. |
| Пути внутри пакета | Относительные POSIX-пути; без `..`, пустых сегментов, обратных слешей, абсолютного пути, query/fragment или URL. |
| Case/symlink | Проверять совпадение регистра на case-sensitive сборке; symlink не может выйти из разрешённого source root. Коллизии после нормализации отклоняются. |
| Demo | Отдельная явно выбранная область запуска; production allowlist не включает демо автоматически по имени папки или наличию локального файла. |
| Git/runtime | Авторские JSON и recipes versioned; binary storage выбирается по объёму. В public только реальные runtime-артефакты; новый файл фиксируется в ASSET_MANIFEST. |

Сроки хранения production reports, исходных reference uploads и персональных данных не объединяются с политикой долгого хранения неперсонального art. Секреты/API-ключи не входят ни в recipe, ни в manifest, ни в error output.

## 4. Этапы и артефакты

| Этап | Вход | Выход | Блокирующее условие |
|---|---|---|---|
| Авторство | Принятый тип/профиль, отдельные одобренные файлы | JSON records, текстовые ключи, links на credits | Неизвестный тип или неподтверждённое право использования. |
| Parse | Authoring tree | Структурированные объекты с указанием file/pointer | Duplicate JSON keys, некорректный Unicode, traversal, неоднозначные ID. |
| Validate structure | Закрытый schema registry | Structural report | Неизвестная версия, лишнее поле, invalid null/enum/range, неизвестный TypedPayload contract. |
| Resolve | Exact refs + package dependencies | Полный lock и граф | Missing/cycle/conflict; required asset отсутствует; optional не имеет явной политики отсутствия. |
| Validate meaning | Resolved graph | Semantic/compatibility report | Неверный collection_key, нет бесплатной базы, конфликтующие slots/anchors, потеря acquired revision. |
| Compile | Frozen inputs/lock/toolchain | Immutable runtime projections + manifest body | Неразрешённая capability, утечка закрытых полей, несовпадение файлов/metadata. |
| Verify build | Скомпилированные файлы | Hash/bytes/roundtrip report | Повторная сборка меняет артефакт при тех же входах; точные суммы округлены. |
| Preview | Exact candidate + synthetic fixtures | Страницы/листы и visual evidence | Отсутствует требуемый визуальный сценарий; reviewer смотрел другой digest. |
| Approve | Reports + evidence + changelog | CandidateApproval | Не приняты art/права/совместимость; статус pending не PASS. |
| Publish | Одобренный exact candidate | PackageRelease + verified stored artifacts | Иной digest под тем же version; частичная загрузка; неразрешённая публикация. |
| Activate | Published set + expected activation revision | Новый ActivationSnapshot | Неподдержанный client/server, неготовая миграция, unresolved dependency, нет права активации. |
| Observe/retire | Активный set + фактические ошибки/ссылки | Диагностика, stop-new-sales/rollback plan | Нельзя вылечить ошибку удалением купленного права или перезаписью history. |

Это функциональные команды будущего инструмента, не уже существующие npm scripts. Preview/validate не публикуют и не изменяют семейные таблицы. Сборка не запускает SQL и не исполняет произвольные JS/hooks из пакета.

## 5. Матрица валидации

| ID | Проверка | Результат отказа |
|---|---|---|
| VAL01 | Файл/путь/формат | FILE_OUTSIDE_ROOT, DUPLICATE_KEY, INVALID_JSON; никакого тихого fallback на соседний файл. |
| VAL02 | ID и revision | ID_COLLISION, REVISION_REWRITE, NAMESPACE_NOT_OWNED. |
| VAL03 | JSON Schema | UNKNOWN_CONTRACT, UNSUPPORTED_SCHEMA, INVALID_FIELD; точный file + JSON Pointer. |
| VAL04 | Граф content/package | MISSING_REFERENCE, REQUIRED_CYCLE, INCONSISTENT_REVISION. |
| VAL05 | Binary | DIGEST_MISMATCH, MEDIA_TYPE_MISMATCH, INVALID_ALPHA, ANIMATION_FORBIDDEN, SIZE_MISMATCH. |
| VAL06 | Геометрия | OUT_OF_BOUNDS, MISSING_ANCHOR, CANVAS_MISMATCH, OCCLUSION_CONFLICT. |
| VAL07 | Полнота вариантов | MISSING_SUPPORTED_VARIANT; untested не превращается в supported. |
| VAL08 | Игровой смысл | EGG_RESULT_MISMATCH, MISSING_FREE_CORNER, OWNERSHIP_KEY_CHANGED, UNKNOWN_HANDLER. |
| VAL09 | Локализация | MISSING_TEXT_KEY, ARGUMENT_MISMATCH, INVALID_MESSAGE, FALLBACK_CYCLE. |
| VAL10 | Происхождение/права | UNREVIEWED_CREDIT, MISSING_REQUIRED_ATTRIBUTION; reviewer и evidence привязаны к revision. |
| VAL11 | Runtime projection | PRIVATE_FIELD_EXPOSED, UNSUPPORTED_CAPABILITY; серверные правила не принимаются из доверия клиенту. |
| VAL12 | Производительность/визуальная приёмка | BUDGET_UNDEFINED/BUDGET_EXCEEDED, VISUAL_REVIEW_PENDING; неизвестный бюджет не считается пройденным. |
| VAL13 | Воспроизводимость | NONDETERMINISTIC_OUTPUT, LOCK_CHANGED; сравниваются заявленные области digest. |
| VAL14 | Совместимость сохранений | ACQUIRED_REFERENCE_UNRESOLVED, UNSAFE_MIGRATION, ROLLBACK_NOT_SUPPORTED. |
| VAL15 | Активация | STALE_ACTIVATION, INCOMPLETE_UPLOAD, UNAPPROVED_CANDIDATE. |

Severity: error блокирует зависимый этап; warning требует классифицированного решения; info сообщает факты. Структурные/ссылочные/правовые/приватностные ошибки не пропускаются универсальной кнопкой «всё равно выпустить». Для допустимого warning waiver нужен конкретный код, revision кандидата, причина, ответственный и область действия; изменение кандидата отменяет waiver. Техническая недоступность валидатора — failed/pending, не отсутствие ошибок.

## 6. Рост системы и следующий этап

MVP использует ограниченный реестр типов и exact dependencies; 1.1 добавляет только проверенные контракты ухода/боссов; 2.0 получает удобный редактор тех же данных и отчётов. Сезоны/города выпускаются пакетами поддержанных типов. Новые модели поведения и incompatible visual profiles требуют версии схемы/кода и плана совместимости.

PIPE01–PIPE08 приняты пользователем. Принят [единый план реализации IMP01–IMP08](../IMPLEMENTATION_PLAN.md) с зависимостями, конкретными контрольными точками и условиями разрешения работ. Финальные art-файлы, закрытые схемы ещё не реализованных игровых механик, security/retention, числовой баланс и конкретный импорт остаются видимыми зависимостями. Эта документация не объявляет их решёнными конвейером.
