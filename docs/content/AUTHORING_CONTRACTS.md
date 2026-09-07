# Family Chores RPG — авторские контракты, lock и манифест

Версия 1.0, 2026-09-07. **PIPE01–PIPE04 приняты пользователем как проект конвейера.** Связан с [конвейером](CONTENT_PIPELINE.md) и [CONTENT_DICTIONARY](../data/CONTENT_DICTIONARY.md). Все схемы ниже — документальная спецификация; schema registry/CLI в репозитории ещё не реализованы. Примеры не означают наличие production-каталога или файлов art.

## 1. Три представления данных

| Представление | Что содержит | Кто задаёт |
|---|---|---|
| Authoring | Определения, ревизии, пути к ресурсам, exact refs, ключи текста, declarative properties | Автор в пределах своего namespace; исходники проверяет конвейер. |
| Canonical catalogue | Проверенные определения/ревизии/ссылки, технические метаданные, provenance | Compiler + publication service по принятой модели; автор не назначает себе published/approved. |
| Runtime projection | Только разрешённые приложению данные, ссылки на exact публичные ресурсы и поддержанные профили | Версионированный compiler; не сериализация всей БД, исходников и private reports. |

Семейный UGC — задачи, обещания, имена/заметки — не включается в глобальные source packages. Семейное RewardOffer хранится через доменные команды. Общий пакет может содержать шаблон, но его выпуск не создаёт обещание взрослого и не публикует личные цены/историю семьи.

## 2. Реестр закрытых схем

Каждая схема имеет `$schema=https://json-schema.org/draft/2020-12/schema`, стабильный `$id` вида `urn:family-rpg:schema:<contract-id>:<schema-version>`. `$ref` разрешается только через локальный frozen registry/lock. Сборка не ходит по произвольным внешним URL из контентного файла.

| Группа схем | Нормативные поля / источник | Дополнительная проверка |
|---|---|---|
| Primitives / refs | ContentId, Key, TextKey, UInt/Int/Revision, ContentRef/AssetRef/RegistryRef по DATA_CONTRACT | Точная семантика числа, valid dates, существование ссылки; серверный bigint предел не теряется при JSON parsing. |
| PackageInput | Полная схема ниже | Совпадение namespace/ownership, отсутствие конфликтов имён/версий; file paths внутри package root. |
| DefinitionInput | id/kind/schema_version; декларативные метаданные определения | Status/current_published_revision создаёт lifecycle service; source не может переиспользовать retired ID. |
| RevisionInput | ContentRevision без служебных state_revision/created_at/published_at/digest | Category/subcategory/tags, text keys, properties, visuals/dependencies/compatibility обязательны по типу. Service fields во входе запрещены. |
| AssetInput | asset_id/asset_revision/schema_version, role, source_path, visual_profile, geometry, source_credit_refs, derivation | Byte size/hash/MIME/dimensions/frame count/alpha вычисляются из файла; несовпадающие ожидаемые параметры блокируют сборку. |
| RegistryInput | registry_id/revision/schema_version/registry_kind/payload | Payload по закрытой схеме данного registry_kind, не универсальное any. |
| LocalizationInput | bundle_id/revision/schema_version/locale/fallback_locale/entries | message syntax/arguments/review state, нет UGC или приватных значений аргументов. |
| ShopOfferTemplateInput | exact content, price UInt, availability и eligibility по принятому типу | Не создаёт purchase/wallet; конкретные баланс и eligibility contract должны быть приняты. |
| Rights/credits | Поля SourceCredit/RightsRecord из Content Dictionary | Приватные evidence refs остаются внутри; публичная attribution компилируется разрешённым списком полей. |
| Lock / Manifest / ReleaseRecord / BuildReport | Поля разделов 4–6 | Сортировка множеств, scope digest, полнота dependencies, соответствие candidate review. |

Каждый авторский файл записи из таблицы, кроме отдельно известного `package.json`, содержит обязательные `record_type` и `schema_version`. Закрытый dispatcher выбирает схему по этой паре, а не по имени папки: definition, content_revision, asset_revision, registry_revision, localization_bundle, shop_offer_template, source_credit или rights_record. Неизвестная пара блокирует сборку. `record_type` — поле authoring DTO; в canonical запись оно не копируется, если её контракт не предусматривает его. Отдельный envelope не нужен; произвольный `$schema` во входе не может переопределить схему из lock. Таблица задаёт дополнительные поля каждого типа; полные исполняемые схемы всех типов предстоит реализовать и проверить.

Каждый объект закрывается `additionalProperties:false`; при композиции через allOf используется согласованное `unevaluatedProperties:false`, а не конфликтующие запреты внутри расширяемой основы. Required/nullable следуют DAT: свойство canonical DTO присутствует, null допустим только явно. Authoring DTO имеет собственный закрытый список, поэтому отсутствие служебного published_at у автора не нарушает правило полного canonical объекта.

TypedPayload проверяется двумя шагами: закрытый конверт `{contract_id,schema_version,value}`, затем точная схема value из frozen registry. Само `type:object` у value не считается полной валидацией. Для каждого публикуемого kind схема и обработчик должны существовать; отсутствие схемы ещё не реализованного boss/food-контракта не заменяется разрешением неизвестных полей. Будущие механики могут оставаться вне active пакетов до собственной приёмки.

## 3. Две опорные JSON Schema

ContentRef — полный минимальный контракт ссылки. Он не проверяет, существует ли данная ревизия в каталоге.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:family-rpg:schema:content-ref:1",
  "type": "object",
  "additionalProperties": false,
  "required": ["definition_id", "content_revision"],
  "properties": {
    "definition_id": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*/[a-z][a-z0-9_]*$"
    },
    "content_revision": {
      "type": "integer",
      "minimum": 1,
      "maximum": 2147483647
    }
  }
}
```

PackageInput v1 намеренно требует точные обязательные зависимости. Optional dependencies и диапазоны будущей authoring v2 не включаются молча. Пустые списки разрешены структурно; полноту для конкретного purpose проверяет semantic validator.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:family-rpg:schema:package-input:1",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version", "package_id", "package_version", "name_key", "purpose",
    "definition_paths", "asset_paths", "registry_paths", "localization_paths",
    "offer_paths", "credit_paths", "rights_paths",
    "depends_on", "required_capabilities"
  ],
  "properties": {
    "schema_version": { "const": 1 },
    "package_id": { "$ref": "#/$defs/packageId" },
    "package_version": { "$ref": "#/$defs/stableVersion" },
    "name_key": { "type": "string", "minLength": 1 },
    "purpose": { "enum": ["core", "season", "city", "mode", "expansion"] },
    "definition_paths": { "$ref": "#/$defs/pathList" },
    "asset_paths": { "$ref": "#/$defs/pathList" },
    "registry_paths": { "$ref": "#/$defs/pathList" },
    "localization_paths": { "$ref": "#/$defs/pathList" },
    "offer_paths": { "$ref": "#/$defs/pathList" },
    "credit_paths": { "$ref": "#/$defs/pathList" },
    "rights_paths": { "$ref": "#/$defs/pathList" },
    "depends_on": {
      "type": "array",
      "uniqueItems": true,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["package_id", "package_version"],
        "properties": {
          "package_id": { "$ref": "#/$defs/packageId" },
          "package_version": { "$ref": "#/$defs/stableVersion" }
        }
      }
    },
    "required_capabilities": {
      "type": "array", "uniqueItems": true,
      "items": { "type": "string", "pattern": "^[a-z][a-z0-9_]*$" }
    }
  },
  "$defs": {
    "packageId": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*:package/[a-z][a-z0-9_]*$"
    },
    "stableVersion": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$"
    },
    "pathList": {
      "type": "array", "uniqueItems": true,
      "items": { "type": "string", "minLength": 1 }
    }
  }
}
```

Paths требуют отдельной проверки CONTENT_PIPELINE; regex числа версии не проверяет совместимость. UniqueItems не запрещает два разных version одного package_id: resolver дополнительно отклоняет такой конфликт active graph. Ограничения размера файлов/строк/длины версии и глубины графа — обязательный versioned LimitsProfile перед запуском обработки недоверенных пакетов; конкретные бюджеты O13 ещё не приняты. Эти две схемы не объявляются полным реализованным набором всех игровых payload.

Списки `*_paths` перечисляют все входные JSON явно относительно корня пакета. Неуказанный файл не включается по glob; повторное включение одного пути в разные группы блокируется. Definition paths могут содержать definition и content_revision; остальные группы допускают только соответствующий record_type. Общий registry вне пакета приходит через точную ссылку на зафиксированную запись реестра, а не через выход пути за корень.

`AssetInput.source_path` имеет другой явно заданный корень: `art-source/<namespace>/`, где namespace взят из проверенного asset_id. Он относительный и подчиняется тем же ограничениям traversal/symlink. Автор не задаёт произвольный filesystem root. Compiler фиксирует разрешённый locator и raw digest в lock. Evidence references прав разрешаются отдельно через закрытое хранилище; они не являются путями публичного экспорта.

## 4. Разрешение зависимостей и lock

| Поле LockBody | Тип / правило |
|---|---|
| schema_version | Positive Revision; lock schema1 для первого формата. |
| root_package | Exact PackageReleaseRef планируемого выпуска. |
| packages | Set<LockedPackage>; package_id/package_version + manifest_digest для уже опубликованных зависимостей. Root не содержит своего manifest_digest, чтобы не образовывался цикл. |
| records | Set<LockedRecord>; kind, stable ID, revision, semantic digest, supplier package ref. |
| binary_inputs | Set<LockedInput>; asset ID/revision, raw SHA-256, байтовый размер, source locator внутри разрешённой области. |
| schema_refs | Exact contract ID/schema_version + schema digest. |
| toolchain | Exact compiler/exporter versions/configuration digest; конкретные имена библиотек выбираются при реализации. |
| optional_resolutions | Только явные решения необязательных content-ссылок, если контракт поддерживает их; список пуст при отсутствии. |

Resolver обходит транзитивные ссылки и отклоняет обязательные циклы/отсутствия. Exact PackageInput depends_on превращается в dependency_requirements с точным version_constraint и optional=false, согласованным с существующей моделью PackageRelease. Одновременно активный граф MVP содержит одну версию каждого package_id; это не запрещает хранить более старые выпуски и обслуживать приобретённые в них revision.

Одна пара (record ID,revision) всегда имеет один semantic digest независимо от пакета-поставщика. Две различные content_revision одного definition_id могут сосуществовать в графе для pinned прав/старых визуальных ссылок. Они не объединяются по имени и не заменяются максимальной revision. Root definitions публичной витрины задаёт явная проекция active set.

Optional content edge допускается только с зарегистрированной политикой отсутствия. Required visual binding нельзя объявить optional ради прохождения сборки. Системные локализованные ошибки/названия не исчезают через optional-resolution. Установить пакет наугад вместо неразрешённой зависимости resolver не имеет права.

## 5. Manifest body и публичные данные

| Объект / поле | Тип | Обязательность / назначение |
|---|---|---|
| ManifestBody.schema_version | Revision | Обязателен, версия runtime-манифеста. |
| ManifestBody.package | PackageReleaseRef | Точный ID/версия root. |
| ManifestBody.lock_digest | Digest | Привязка к разрешённому набору входов; закрытые locators самого lock не публикуются. |
| ManifestBody.runtime_schema_refs | Set<SchemaRef> | Поддерживаемые форматы чтения; schema IDs не команда скачать неизвестный валидатор из сети. |
| ManifestBody.required_capabilities | Set<Key> | Из разрешённых handlers; требуемые версии/поддержка связаны с compatibility_contract. |
| ManifestBody.compatibility_contract | RegistryRef | Проверенная матрица client/server/build/profile. Заявления клиента о capability не дают игровых прав. |
| ManifestBody.dependencies | Set<PublishedDependency> | Package ref + exact manifest_digest. |
| ManifestBody.records | Set<RuntimeRecordDescriptor> | Kind, ID/revision, public_projection_digest, storage_key, byte_size. |
| ManifestBody.assets | Set<RuntimeAssetDescriptor> | AssetRef, digest, storage_key, media_type, bytes, width/height, profile_ref; без art-source пути. |
| ManifestBody.localizations | Set<LocalizationBundleDescriptor> | BundleRef, public_projection_digest, storage_key, bytes. |
| ManifestBody.attribution | List<PublicCredit> | Только разрешённые attribution text/source link; договоры и private evidence refs не публикуются. |
| ManifestBody.migration_refs | List<RegistryRef> | Разрешённые процедуры совместимости, не код/SQL внутри файла. |
| ReleaseRecord | package_ref, manifest_digest, manifest_storage_key, published_at, publication_operation_id | Закрытая управляющая запись публикации; точное тело манифеста неизменно. |

RuntimeRecordDescriptor и вложенные Ref используют закрытые поля этого перечня и DATA_CONTRACT; nullable для отсутствующего поля не подставляется там, где оно вообще запрещено типом. Definition/current pointer в БД не считывается во время рендера вместо descriptor выбранного snapshot.

Canonical content digest и public_projection_digest — разные области. Первый фиксирует смысловой контент вместе с закрытыми проверяемыми ссылками по его контракту; второй вычисляется по действительно публикуемым байтам/полям. Нельзя удалить private поля из объекта и оставить прежний digest как будто он относится к сокращённому объекту. Проверенная сборка хранит отображение semantic→public в ограниченном BuildReport.

Манифест не доверяется только потому, что хеши совпали: источник manifest/control API и права публикации определяет deployment/security-проект. Хеш обеспечивает проверку содержимого против уже доверенного descriptor. Offline-подпись, ротация ключей и внешний marketplace не вводятся автоматически этим пакетом.

## 6. Канонизация и воспроизводимость

| Область хеша | Точные правила |
|---|---|
| Raw binary digest | SHA-256 исходных публикуемых байтов, без декодирования/нормализации PNG. |
| Semantic record digest | JCS-байты versioned semantic body: ID/revision, properties, refs, visuals, l10n keys, compatibility. Исключены вычисленный digest, created_at/published_at, draft state_revision и служебный review. Набор полей фиксирует схема hash_scope_version, а не ad hoc удаление полей. |
| Lock digest | JCS(LockBody), без внешнего digest envelope; source locators ограничены относительными логическими путями, не именем компьютера/домашней папки. |
| Public projection digest | SHA-256/JCS выбранного сериализованного JSON body; способ отмечен digest_scope. Для binary только raw bytes. |
| Manifest digest | SHA-256(JCS(ManifestBody)); digest хранится в ReleaseRecord/доверенном pointer, не входит сам в собственное тело. |
| Build fingerprint | Хеш canonical набора source semantic digests, raw binary digests, lock/toolchain/config digests. Не содержит времени запуска, случайного ID кандидата или пути рабочей машины. |

Множества перед JCS сортируются по явно заданному tuple kind/ID/revision или package_id/version; exact version не сравнивается как обычное текстовое «больше». Семантически упорядоченные массивы сохраняют порядок — например слои, действия и цепочка процедур. JCS сам не сортирует массивы как множества. Unicode сохраняется без неявной нормализации; дубликаты ключей и некорректные строки отвергаются до канонизации. Большие целые остаются строками; float/NaN/Infinity для игровых сумм запрещены.

Запуск на тех же frozen входах и toolchain должен дать те же публикуемые bytes/digests. UUID кандидата, время QA и публикации могут отличаться и хранятся во внешних операционных записях. PackageRelease.published_at не участвует в ManifestBody. Оптимизатор изображений должен быть детерминированным или его уже сохранённый результат становится frozen binary input до fingerprint. Повторная генерация art не часть этой гарантии.

## 7. Контракты отчёта и одобрения

| Объект | Обязательные поля |
|---|---|
| Candidate | candidate_id EntityId, planned_package_ref, build_fingerprint, manifest_digest, lock_digest, status, created_at, previous_candidate_id nullable. |
| ValidationFinding | check_id, severity, code, file_locator, json_pointer nullable, record_ref nullable, message_key, message_args, evidence_ref nullable. Ни UGC, ни секреты не вставляются в публичный отчёт. |
| BuildReport | schema_version, candidate_id, build_fingerprint, validator_versions, findings, stage_results, input_inventory_digest, output_inventory_digest. Stage result passed/failed/pending/skipped_with_reason. |
| CandidateApproval | approval_id, candidate_id, build_fingerprint, manifest_digest, scope tech/art/rights/release, reviewer_ref, decision, decided_at, evidence_refs. |
| WarningWaiver | waiver_id, candidate_id/fingerprint, finding_code, record_ref, reason, approver_ref, scope, validity_condition. Не заменяет обязательный error. |

При изменении любого значимого входа создаётся новый candidate, прежние approvals не копируются как действующие. Для чистого повторного build того же fingerprint можно использовать действующее согласие на те же байты, но publication service проверяет, что политики/права/поддержка всё ещё актуальны. Приёмка prompt/reference не равна приёмке результата генерации.

JSON Schema-диалект сверён по [официальной спецификации 2020-12](https://json-schema.org/draft/2020-12/json-schema-core). Основание JCS — [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html); это опубликованная схема канонизации, не утверждение о встроенном каноническом JSON.stringify. Нумерация пакетов опирается на [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html); более строгий production subset/exact dependencies — наше решение MVP.
