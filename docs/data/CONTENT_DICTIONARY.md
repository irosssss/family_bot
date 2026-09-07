# Family Chores RPG — каталог, ассеты и локализация

Версия: 1.1. Дата: 2026-09-07. **Словарь принят в пакете DAT01–DAT08; версия 1.1 отражает принятое уточнение PIPE06 об активации набора.** Связан с [общим контрактом](DATA_CONTRACT.md) и [игровыми данными](RUNTIME_DICTIONARY.md). ART/PIPE приняты как спецификации; окончательные размеры и ассортимент ждут визуального пилота и отдельного решения объёма. Все существующие ассеты — демо; основные будут подготовлены позже. Нынешние ULPC и остальные демо-файлы не задают будущий визуальный стандарт.

## 1. Граница каталога

Каталог описывает то, что существует в игре и как это отображается. Семейные экземпляры описывают, кому это принадлежит и что выбрано. Один кот имеет определение и опубликованную ревизию; разные дети имеют собственные OwnedPet со своим ID, именем и PetCorner. PNG, предложение продажи, яйцо и полученный питомец — разные ссылки, даже если используют одну иконку.

При подготовке основных ассетов демо-картинки можно заменить через новые AssetRevision и ContentRevision без изменения ID игрового профиля, питомца или права владения. Точная опубликованная ревизия не перезаписывается: переход уже существующих демо-экземпляров на целевой каталог требует явной карты соответствий. Демо-контент не становится production-контентом автоматически, а совпадение названий файлов не доказывает тождество предметов. Будущий профиль размеров/слоёв выбирается по целевому интерфейсу, а не ради сохранения ограничений демо. Уточнение о демо само по себе не разрешает удалять, заменять или генерировать файлы. DAT позднее принят отдельно; текущие статусы следующих пакетов указаны в [контракте данных](DATA_CONTRACT.md).

В каталоге нет обязательного `family_id`, персонального имени ребёнка или его баланса. Системные тексты — TextKey. Созданное взрослым задание/обещание сохраняет самостоятельный пользовательский текст. Версия документа не является версией контентного пакета.

## 2. Основные сущности

### ContentDefinition — постоянная идентичность

| Поле | Тип | Обязательность и ограничения |
|---|---|---|
| `id` | `ContentId!` | Стабильный namespace:kind/slug; не переиспользуется для другой сущности после снятия с выпуска. |
| `schema_version`, `state_revision` | `SchemaVersion!`, `Revision!` | Формат записи и ревизия изменяемых метаданных. |
| `kind` | `Key!` | Из ContentTypeRegistry; совпадает с видом ID. Новое название предмета — новый ID, новая механика — новый поддерживаемый контракт. |
| `status` | `Enum(draft,active,retired)!` | Retired запрещает новые выдачи по соответствующей политике, но не удаляет историю/файлы используемых ревизий. |
| `current_published_revision` | `Revision?` | Null до первой публикации; указатель для нового выбора, не замена точных ContentRef истории. |
| `created_at`, `updated_at` | `Instant!`, `Instant!` | Системные моменты. Категории и визуальные свойства находятся в ревизии. |

### ContentRevision — неизменная опубликованная версия определения

| Поле | Тип | Обязательность и ограничения |
|---|---|---|
| `definition_id`, `content_revision`, `schema_version` | `ContentId!`, `Revision!`, `SchemaVersion!` | Пара definition/revision уникальна. После публикации всё содержимое этой ревизии неизменно. |
| `state_revision` | `Revision!` | Защита конкурентной правки черновика; после публикации заморожена вместе с содержимым. Не заменяет content_revision. |
| `category_id`, `subcategory_id` | `ContentId!`, `ContentId?` | Ссылки на TaxonomyNode из того же taxonomy snapshot; subcategory при наличии — потомок category. |
| `taxonomy_snapshot`, `tag_ids` | `RegistryRef!`, `Set<ContentId>!` | Категоризация/теги проверяются в закреплённом реестре. Теги не исполняемый код. |
| `name_key`, `description_key` | `TextKey!`, `TextKey?` | Name не содержит пользовательское имя питомца. Пустая строка не замена ключа. |
| `properties` | `TypedPayload!` | Зарегистрированный закрытый контракт выбранного kind; его schema_version проверяется отдельно. |
| `visual_bindings` | `List<VisualBinding>!` | Уникальные роли ресурса внутри варианта; непусто для видимого контента. |
| `dependencies` | `List<ContentDependency>!` | Явные типизированные связи на определения/ресурсы/реестры; без неразрешённых циклов. |
| `compatibility_rules` | `List<CompatibilityRuleRef>!` | Ссылки на неизменные версии зарегистрированных правил; пусто только для типа, которому правила не нужны. |
| `created_at`, `published_at`, `digest` | `Instant!`, `Instant?`, `Digest?` | Опубликованная ревизия требует published_at и digest канонического содержимого. Канонизация — конвейер, не порядок полей обычного JSON.stringify. |

Черновик редактируется только до публикации. Опубликованное изменение создаёт следующую content_revision. Нельзя менять PNG по прежнему адресу и объявлять прежний digest действующим. Retired — состояние определения/канала выдачи; история выпуска остаётся неизменной.

### AssetRevision — версия бинарного ресурса

| Поле | Тип | Обязательность и ограничения |
|---|---|---|
| `asset_id`, `asset_revision`, `schema_version` | `ContentId!`, `Revision!`, `SchemaVersion!` | Asset ID namespace:asset/slug; пара уникальна. AssetRef = эта пара. |
| `role`, `media_type`, `storage_key` | `Key!`, `Text!`, `Text!` | Role из визуального реестра; media_type соответствует проверенным байтам. Storage_key относительный внутри разрешённого хранилища, не произвольный URL/локальный путь. |
| `digest`, `byte_size` | `Digest!`, `UInt!` | Проверяются по файлу; размер >0. Digest не означает наличие лицензии. |
| `width_px`, `height_px`, `frame_count` | `SmallInt!`, `SmallInt!`, `SmallInt!` | Положительные размеры; целевой runtime статичный: frame_count = 1. Исходный spritesheet может остаться производственным входом для статичного crop. |
| `alpha_mode`, `color_profile` | `Enum(opaque,straight_alpha)!`, `Key!` | Конкретные допустимые форматы/палитры фиксирует VisualProfile; не полагаться на расширение имени. |
| `visual_profile`, `geometry` | `RegistryRef!`, `AssetGeometry!` | Профиль и точная ревизия; правила слоёв, пиксельной сетки и anchors проверяются. |
| `source_credit_refs`, `derivation`, `created_at` | `Set<RegistryRef>!`, `AssetDerivation?`, `Instant!` | Непустое происхождение с точной ревизией SourceCredit; если производный файл — derivation обязателен. |

### ContentPackage — идентичность пакета

| Поле | Тип | Обязательность и ограничения |
|---|---|---|
| `id`, `schema_version`, `state_revision` | `ContentId!`, `SchemaVersion!`, `Revision!` | Namespace:package/slug; статус и указатели могут изменяться отдельно от выпущенного состава. |
| `name_key`, `purpose`, `status` | `TextKey!`, `Enum(core,season,city,mode,expansion)!`, `Enum(draft,active,retired)!` | Purpose не включает механику автоматически; сезонный пакет может состоять только из косметики. |
| `created_at`, `updated_at` | `Instant!`, `Instant!` | Метаданные сопровождения. Никаких пользовательских прогрессов в пакете. |

### PackageRelease — неизменный состав выпуска

| Поле | Тип | Обязательность и ограничения |
|---|---|---|
| `package_id`, `package_version`, `schema_version` | `ContentId!`, `PackageVersion!`, `SchemaVersion!` | Пара package/version уникальна; тот же номер нельзя повторно выпустить с иными байтами. |
| `content_refs`, `asset_refs`, `registry_refs`, `localization_refs` | `Set<ContentRef>!`, `Set<AssetRef>!`, `Set<RegistryRef>!`, `Set<LocalizationBundleRef>!` | Точный состав; обязательные транзитивные ссылки должны разрешаться в lock manifest. |
| `dependency_requirements`, `resolved_dependencies` | `List<PackageRequirement>!`, `List<PackageReleaseRef>!` | Требования автора отделены от точных разрешённых версий выпуска. Не загружать «latest» в воспроизводимом релизе. |
| `required_capabilities`, `compatibility_contract` | `Set<Key>!`, `RegistryRef!` | Client/server должны поддерживать нужные обработчики и формат до активации пакета. |
| `manifest_digest`, `published_at`, `migration_refs` | `Digest!`, `Instant!`, `List<RegistryRef>!` | Миграции описаны реестром допустимых преобразований; произвольные SQL/JS из пакета не исполняются. |

Активация выпуска отделена от публикации. `ReleaseActivation`: `id:EntityId!`, `package_id:ContentId!`, `package_version:PackageVersion!`, `scope:ReleaseScope!`, `state_revision:Revision!`, `activated_at:Instant!`, `previous_release:PackageReleaseRef?`, `operation_id:EntityId!` — проекция пакета внутри текущего согласованного набора, а не самостоятельный источник переключения. Scope задаётся `{kind:global}` либо позднее отдельным принятым контрактом ограниченного rollout. Принятый PIPE06 добавляет неизменный `ActivationSnapshot`, управляющий `ActivationHead` и журнал `ActivationChange`; их поля и порядок операций закреплены в [RELEASE_OPERATIONS](../content/RELEASE_OPERATIONS.md), связи — в [PHYSICAL_SCHEMA](PHYSICAL_SCHEMA.md). Head и проекции меняются согласованно одной транзакцией. Снятие/откат активации не переписывает PackageRelease и не отнимает выданные права. Старая ревизия остаётся доступна приобретшим её профилям либо проходит явно принятый совместимый перенос.

## 3. Ссылки, зависимости и совместимость

| Тип | Поля | Правило |
|---|---|---|
| `AssetRef` | `asset_id:ContentId!`, `asset_revision:Revision!` | Точная неизменная версия ресурса. |
| `RegistryRef` | `registry_id:ContentId!`, `revision:Revision!` | Версия словаря/визуального профиля/правила, не строка с неявной текущей версией. |
| `PackageReleaseRef` | `package_id:ContentId!`, `package_version:PackageVersion!` | Точный выпущенный пакет. |
| `PackageRequirement` | `package_id:ContentId!`, `version_constraint:Text!`, `optional:boolean!` | Синтаксис диапазонов и политика prerelease должны быть выбраны перед реализацией resolver; выпуск всё равно хранит exact lock. |
| `ContentDependency` | `kind:Enum(content,asset,registry)!`, `target:ContentRef/AssetRef/RegistryRef!`, `required:boolean!`, `purpose:Key!` | Target строго соответствует kind. Обязательная ссылка отсутствует — блок выпуска. Необязательная разрешена лишь с описанным поведением отсутствия. |
| `VisualBinding` | `role_key:Key!`, `asset:AssetRef!`, `variant_key:Key!` | Роли вроде icon/scene_layer задаёт контракт kind. Несколько ролей вправе ссылаться на один файл, если размер/кадр/семантика подходят. |
| `CompatibilityRuleRef` | `rule:RegistryRef!` | Версионированное правило существующего обработчика; неизвестное правило не считается разрешением. |
| `CompatibilityRule` | `id:ContentId!`, `revision:Revision!`, `schema_version:SchemaVersion!`, `handler_key:Key!`, `parameters:TypedPayload!` | Декларативные параметры проверенного handler: например body_family, slot, anchors; не eval и не произвольный скрипт. |

Граф content/package dependencies должен быть разрешим до публикации. Циклы обязательных загрузок запрещены. Взаимные игровые ссылки, если понадобятся, задаются отдельным типом отношения без рекурсивной загрузки и проходят свой валидатор; их нельзя случайно объявить обычной зависимостью.

## 4. Классификаторы и визуальный контракт

Каждый реестр имеет `registry_id:ContentId!`, `revision:Revision!`, `schema_version:SchemaVersion!`, `published_at:Instant?` и неизменный снимок после публикации. Для всех перечисленных записей поля ниже дополняют этот конверт.

| Запись | Поля | Проверка |
|---|---|---|
| `TaxonomyNode` | `id:ContentId!`, `parent_id:ContentId?`, `name_key:TextKey!`, `allowed_content_kinds:Set<Key>!`, `sort_order:SmallInt!` | Корень parent null; дерево без циклов, ссылка категории разрешает kind. Подкатегория — узел дерева, а не свободный текст. |
| `TagDefinition` | `id:ContentId!`, `name_key:TextKey!`, `purpose:Key!` | Теги для поиска/тематики; фильтры не предоставляют игровые права. |
| `ContentTypeRegistry` | `kind:Key!`, `properties_contract_id:Key!`, `supported_schema_versions:Set<SchemaVersion>!`, `handler_capability:Key!`, `required_visual_roles:Set<Key>!` | Поддержка типа явная; новый pet/cat использует pet handler. Новая боевая механика требует реализации и проверки handler. |
| `SlotDefinition` | `slot_key:Key!`, `target_kind:Enum(hero,pet,corner,house,ui)!`, `required:boolean!`, `allowed_kinds:Set<Key>!`, `layer_order:SmallInt!`, `compatibility_rules:List<CompatibilityRuleRef>!` | Slot_key уникален внутри visual profile. Порядок фиксируется данными профиля; клиент не сортирует слои по имени PNG. |
| `VisualProfile` | `id:ContentId!`, `target_kind:Key!`, `canvas_width_px:SmallInt!`, `canvas_height_px:SmallInt!`, `pixel_grid:SmallInt!`, `palette_ref:RegistryRef!`, `slots:List<SlotDefinition>!`, `anchor_keys:Set<Key>!`, `render_policy:TypedPayload!` | Размеры >0, сетка совместима с слоями. Статичный pixel art, без анимационных состояний. Конкретные значения принимаются на образцах в Asset Bible. |
| `AssetGeometry` | `content_bounds:PixelRect!`, `pivot:PixelPoint!`, `anchors:List<NamedAnchor>!`, `nine_slice:NineSlice?` | Прямоугольник внутри файла, якоря уникальны; nine_slice только для подходящего UI/панели. Все координаты в исходных пикселях, не CSS-процентах. |
| `PixelRect` | `x:SmallInt!`, `y:SmallInt!`, `width:SmallInt!`, `height:SmallInt!` | x/y ≥0, width/height >0, сумма не выходит за canvas. |
| `PixelPoint`, `NamedAnchor` | Point: `x:SmallInt!`, `y:SmallInt!`; Anchor: `key:Key!`, `point:PixelPoint!` | Допустимость якорей вне canvas задаётся профилем явно; по умолчанию внутри. |
| `NineSlice` | `left:SmallInt!`, `right:SmallInt!`, `top:SmallInt!`, `bottom:SmallInt!` | Все ≥0; суммы оставляют ненулевой центральный участок. |

Основная таксономия для разработки: hero (base/body/hair/face), equipment (head/torso/legs/feet/hands/accessories), pet, egg, pet_cosmetic, corner_decor (background/rest/toy), house (base/upgrade/decor), environment (city/region/season/encounter), ui (icon/control/surface/status), task_template, progression_rule, family_goal, consumable. Это предложенный охват, а не обязанность выпускать все группы в MVP. Subcategory и kind имеют разный смысл: UI-кнопка может состоять из нескольких ресурсов, а не из одного ContentDefinition на каждый пиксель.

Минимальная единица ассета определяется независимостью повторного использования, смены и совместимости. Не дробить тень/обводку в отдельный PNG без реальной необходимости управления ими. Не создавать отдельную копию общего фона на каждого ребёнка, дом или семью. Конкретная декомпозиция и допустимые комбинации — следующий визуальный этап.

## 5. Обязательное содержание контрактов типов

TypedPayload не считается «готовой схемой». Ниже фиксируются поля ядра; версия 1 каждого контракта должна получить закрытую JSON Schema, проверки ссылок и примеры до появления runtime-обработчика. Дополнительные параметры нельзя незаметно записывать в свободный properties.

| Контракт | Поля ядра | Инвариант / этап |
|---|---|---|
| `hero_base` | `body_family:RegistryRef!`, `visual_profile:RegistryRef!`, `base_access:Enum(default,entitlement)!` | Все точки рендера используют один выбор тела и совместимые слои. Базовые варианты MVP. |
| `equipment` | `ownership_key:ContentId!`, `slot_key:Key!`, `allowed_body_families:Set<RegistryRef>!`, `visual_profile:RegistryRef!` | Приобретение отдельно от надевания; физическое владение или совместимость не выводится из названия файла. |
| `pet` | `collection_key:ContentId!`, `visual_profile:RegistryRef!`, `default_corner:ContentRef!` | Owner/collection уникален; бесплатная база уголка. Самостоятельное существо и косметический вариант различаются этим ключом. |
| `egg` | `pet_result:ContentRef!`, `collection_key:ContentId!` | Known result; ключ совпадает с результатом. Не случайный лутбокс, бесплатное вылупление. |
| `corner_base` | `visual_profile:RegistryRef!`, `default_assets:List<VisualBinding>!` | Доступен автоматически с питомцем; платный декор не нужен для работоспособности уголка. |
| `corner_decor` | `ownership_key:ContentId!`, `slot_key:Key!`, `compatible_corner_profiles:Set<RegistryRef>!` | Одно право переиспользуется в уголках одного владельца. Расширенный ассортимент — по roadmap. |
| `pet_cosmetic` | `ownership_key:ContentId!`, `slot_key:Key!`, `compatible_pet_profiles:Set<RegistryRef>!` | Не создаёт второго питомца; релиз 1.1. |
| `house_base` | `visual_profile:RegistryRef!`, `default_assets:List<VisualBinding>!` | Семья получает базовый дом без копирования системного контента. |
| `house_upgrade` | `unlock_key:ContentId!`, `slot_key:Key!`, `compatible_house_profiles:Set<RegistryRef>!` | Постоянное семейное улучшение; не личная расходуемая валюта. |
| `family_goal` | `target_amount:UInt!`, `reward_content:ContentRef!`, `eligibility_rule:TypedPayload!` | Target >0; экземпляр замораживает эти условия. |
| `task_template` | `title_key:TextKey!`, `description_key:TextKey?`, `suggested_terms:TypedPayload!` | Применение шаблона создаёт семейный UGC-снимок, не живую ссылку, и требует выбора реальных участников. |
| `progression_rule` | `calculation_contract:Key!`, `parameters:TypedPayload!` | Таблица уровней/числа O12 ещё не приняты; новые значения поддерживаемого расчёта — данные. |
| `consumable` | `use_contract:Key!`, `parameters:TypedPayload!`, `stack_key:ContentId!` | Корм/использование 1.1; собственная история расхода, без наказания за отсутствие кормления. |
| `environment`, `ui`, `boss`, `game_mode` | `visual_profile:RegistryRef!`, `behavior_contract:Key?`, `parameters:TypedPayload!` | Конкретные схемы после Asset Bible/спецификации режима. Boss/mode не становятся готовыми механиками наличием строки. |

Ownership/collection/unlock keys — namespaced ContentId зарегистрированной смысловой группы, например `core:collection/cat`. Это исключает столкновение одноимённых `cat` из разных пакетов. Slot/role keys локальны своему визуальному контракту. Изменить ключ владения после выдачи можно только через проверенный план совместимости/переноса, иначе это новая вещь и дублирование коллекции.

## 6. Локализация

| Запись | Поля | Ограничения |
|---|---|---|
| `LocalizationKey` | `key:TextKey!`, `namespace:Key!`, `meaning:Text!`, `context:Text!`, `argument_spec:List<MessageArgument>!`, `deprecated:boolean!` | Meaning/context помогают переводчику; смысл существующего ключа не меняется на несовместимый. |
| `MessageArgument` | `name:Key!`, `kind:Enum(text,integer,instant)!`, `required:boolean!` | Имена/типы совпадают во всех переводах, не разрешают HTML/код. |
| `LocalizationBundle` | `bundle_id:ContentId!`, `revision:Revision!`, `schema_version:SchemaVersion!`, `locale:Text!`, `fallback_locale:Text?`, `entries:List<LocalizedMessage>!`, `digest:Digest!` | Локаль нормализована выбранной библиотекой; fallback без циклов. Состав языков ещё не принят. |
| `LocalizedMessage` | `key:TextKey!`, `message:Text!`, `syntax:Key!`, `status:Enum(draft,reviewed)!` | Unique key в bundle; production только reviewed для обязательных сообщений. ICU MessageFormat — предлагаемый синтаксис, библиотека/версия проверяются отдельно. |
| `LocalizationBundleRef` | `bundle_id:ContentId!`, `revision:Revision!`, `locale:Text!` | Ровно та версия переводов, что включена в выпуск. |

Число, склонение, дата и порядок слов форматируются локалью; не собирать фразу склейкой «число + монет». Десятичные строки UInt преобразуются точным выбранным форматтером, не через потенциально теряющий точность Number. Аргументы экранируются; пользовательское имя не интерпретируется как шаблон.

Обязательные тексты UI, ошибки, подписи доступности и системный контент не вшиваются в PNG. Экранный текст отделён от пиксельных иконок; длинные переводы и увеличенный шрифт проверяются на 375–390px. Отсутствие обязательного ключа блокирует выпуск языка/пакета. Разрешённый fallback должен сохранять смысл и доступность, а не показывать сырой `pet.cat.name` пользователю. Псевдолокализация и проверка argument_spec входят в будущий конвейер.

## 7. Происхождение, лицензии и производные ресурсы

| Запись | Поля | Ограничения |
|---|---|---|
| `SourceCredit` | `id:ContentId!`, `revision:Revision!`, `source_kind:Enum(original,third_party,generated)!`, `source_locator:Text!`, `author_credit:Text!`, `rights_record_ref:RegistryRef!`, `attribution_text:Text?`, `review_status:Enum(unreviewed,approved,rejected)!` | Source URL/производственный ID — подтверждённое происхождение. Точная ревизия RightsRecord содержит проверенное основание использования; неизвестная лицензия не получает выдуманный SPDX. |
| `RightsRecord` | `id:ContentId!`, `revision:Revision!`, `license_identifier:Text?`, `terms_snapshot_ref:Text!`, `reviewed_at:Instant?`, `reviewed_by:Text?`, `distribution_constraints:TypedPayload!` | Договор, условия генерации, лицензия и требования атрибуции различаются. Конкретные права проверяются перед включением файла; этот словарь не юридическое заключение. |
| `AssetDerivation` | `input_refs:List<Text>!`, `recipe_id:Key!`, `recipe_version:Text!`, `tool_versions:List<ToolVersion>!`, `parameters:TypedPayload!` | Производственные входы и рецепт статичного crop/очистки/экспорта; параметры закрыты схемой рецепта. Не публиковать локальные абсолютные пути/чувствительные промпты. |
| `ToolVersion` | `tool_key:Key!`, `version:Text!` | Зафиксированная фактическая версия/модель инструмента, не «latest». |

Происхождение и условия использования обязательны для каждого выпускаемого ассета, включая производные изображения. Рецепт генерации не гарантирует побайтовую воспроизводимость внешней модели: воспроизводимость релиза обеспечивает сохранённый проверенный файл и digest. Производственные входы/черновики хранятся вне `public/assets/game/`; новый runtime-ассет требует строки в [ASSET_MANIFEST](../ASSET_MANIFEST.md).

## 8. Валидация и последствия для сопровождения

| Проверка | Отказ при | Когда |
|---|---|---|
| Структура | Неизвестный schema_version, лишние критические свойства, неверный тип/enum/null, невалидный ID | Авторский validate и CI до пакета. |
| Ссылки | Нет ревизии, подкатегория вне дерева, несовместимый slot/profile, цикл обязательных зависимостей | Сборка разрешённого графа. |
| Бинарные файлы | Digest/размер/MIME не совпадают, выход geometry за canvas, alpha/profile нарушены | Импорт и сборка; существующие файлы не считаются автоматически проверенными. |
| Права | Нет подтверждённого происхождения/условий выпуска/обязательной атрибуции | До production-включения. |
| Локализация | Нет ключа, несовместимы аргументы, цикл fallback, сообщение не помещается/не читается | Сборка языка и визуальный просмотр. |
| Семантика | Egg result и collection_key расходятся, товар ссылается на неподдержанный handler, free base отсутствует | Доменный валидатор контента. |
| Совместимость выпуска | Клиент/сервер не поддерживает capability, не разрешён lock, требуется неизвестная миграция | До активации, а не после ошибки у ребёнка. |
| Владение после обновления | Выданная точная ревизия или её файлы становятся недоступными, fallback меняет смысл покупки | План обновления/отката с проверкой реальных ссылок. |

Реестры нужны для конечных повторяемых правил. Не строить универсальную платформу сценариев и редактор всего до MVP: для начала достаточно файлов контента, схем, сборки и проверяемого preview. Расширять инструменты по подтверждённой стоимости ручной работы. Все величины производительности — размер пакета, число слоёв, память, время первой загрузки — должны получить измеренные бюджеты O13; здесь они не названы произвольными «AAA-стандартами».

Оставшиеся результаты: физическая схема/карта переноса, закрытые схемы команд и payload, визуальная декомпозиция с принятыми числовыми профилями, окончательные папки/нейминг и release pipeline. Словарь делает эти решения связными, но не объявляет их уже реализованными.
