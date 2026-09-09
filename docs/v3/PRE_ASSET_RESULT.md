# V3 — результат до графики

2026-09-09. Ветка `codex/family-life-v3`, исходный commit `01926287`. Выполнен расширенный [пакет](PRE_ASSET_IMPLEMENTATION.md): сохраняемый бесплатный цикл и подготовка ассетов. Ниже различаются автоматические проверки, реальные browser actions в синтетической семье и работа перед выпуском.

## Готовый результат

Все пять основных разделов вызывают API V3. Родители и дети имеют своих игроков/кошельки; permissions задаются отдельно. Работают расписания/доли/проверка/начисление, ошибки и коррекции, покупки и облик, питомцы, реальные детские обещания, общая цель и добровольное приключение. Созданы auth/HTTP/local runtime, три зарегистрированные SQL-миграции, PNG folders/manifest/resolver. Точная семантика — [RUNTIME_DESIGN](RUNTIME_DESIGN.md), запуск — [README](README.md), поставка — [ASSET_DELIVERY](ASSET_DELIVERY.md).

## Автоматическая проверка финального кода

| Проверка | Результат |
|---|---|
| `npm run lint` | PASS, 0 ошибок |
| `v3:typecheck`, `v3:server:typecheck` | PASS |
| `v3:test` | 32/32 PASS: model, assets, resolver, transport |
| `v3:server:test:pg` | 223/223 PASS, без skipped: 164 unit + 59 PG/HTTP |
| Initial rollback / concurrent migrations | PASS |
| Neighbor sentinel / точный cleanup | PASS |
| `v3:build` | PASS: два HTML, CSS 27.04 kB, JS 256.37 kB / gzip76.93 kB |
| `v3:server:build` | PASS: 8 отдельных entry; проверенные SQL рядом с migrator |
| Import graph | UI22 inputs, server30 inputs, 0 посторонних source imports; 8 compiled imports PASS без подключения/миграции |
| `v3:assets:check` | PASS: entries0, files0 |

Последний полный PG run: `b23bba1e3a13dc8739f1050e57a47870`, PostgreSQL `180006`, image ID `sha256:b07129cc272f688c98f5b343138a0a52fa45b3d82f50d7a53ff441330624cd2e`. Временный контейнер `ae2e78279a15fe4cae903b4347ff3c982bbd3ec793078498260846540214f3be` удалён runner; постоянная локальная семья сохранена отдельно.

Доказаны: семейная/actor изоляция, запрет чужих IDs и текущий отзыв прав; price/role injection; failed PIN и recovery; immutable ledger и detection повреждённого cached wallet; receipt replay после потери ответа и semantic uniqueness после удаления transport receipt. Отдельные транзакционные гонки: два reviewers, submit/cancel, две purchases на один available, reserve/purchase, delivery/adult cancellation. Ошибка между эффектами и commit откатывает весь результат.

## Browser QA с настоящими HTTP-командами

Приложение `http://127.0.0.1:3003/family-life-v3.html`, синтетические Алексей/Саша. Значения не записывались прямым SQL и не подменялись в React.

1. Алексей сам подтвердил два больших дела: 60 Gold/120 XP. Купил одежду за 60: wallet0, владение появилось. Примерка не меняет applied; отдельное применение сохранило `v3.outfit.traveler`, тот же ID виден в личном и публичном renderer.
2. Детский профиль не показывал управление взрослого. Саша отправил своё дело: награды0. Взрослый вернул с причиной; ребёнок доработал/отправил заново; взрослый принял: ребёнку15 Gold/30 XP, взрослому ничего за проверку.
3. Создано обещание ценой10. Детская заявка дала total15/reserved10/available5. Одобрение сохранило резерв. При отметке фактического выполнения списалось10, order стал delivered, терминальных повторных действий нет.
4. Browser response interception остановил HTTP200 **после server commit** CreateTask. UI показал неизвестный результат внутри открытой формы. Кнопка проверки отправила тот же key, HTTP200 вернул сохранённый результат, форма закрылась. Read model содержит ровно одно дело «Проверка сохранения при обрыве». Interception полностью снят; метод clear — Fetch.enable с пустыми patterns.
5. Через UI выбраны starter cat, XP target, семейная цель target26 и adventure target26. Семь новых больших дел выполнены через тот же локальный HTTP API вспомогательным QA-script: 210 Gold/420 XP, pet56 XP, goal84/26, adventure36/26 won, trophies2. Их definitions убраны в архив. Работы, открытые до выбора питомца/цели, не получили новую привязку задним числом.
6. В UI котёнок бесплатно вылупился, выбран спутником, уголок «Домик котёнка» сохранён. HTTP перезапущен, страница перезагружена — семья, кошелёк, applied outfit, companion, уголок и трофеи сохранились.
7. Для принятого детского результата после потраченной награды preview показал Gold−5/waived10, XP−30/вклад−6. Исправление применено, затем восстановлено; возвращено только applied5, без долга/повторной выдачи награды.
8. Проверены 375×812 и 390×844: scrollWidth совпадает с viewport, видимые кнопки/контролы не ниже44 (checkbox имеет собственный label hit area), игровых img0. Home/hero/family используют точные выбранные appearance IDs; тексты и управление сохраняются без графики.

Скриншоты локально в `work/v3-qa/pre-assets/` (ignored, не входят в runtime): `reward-reserve-375.png`, `pet-corner-375.png`, `world-trophies-375.png`, `correction-preview-375.png`, `home-390.png`. Это просмотр browser viewport, не физический телефон. Числовой прогресс7 дел — HTTP QA, остальные перечисленные переходы — реальные нажатия UI. Unit покрывает дальнейший рост до122 XP; его полный жизненный цикл на физическом телефоне не заявляется.

## Что осталось на следующую работу

- Этап5: один художественный образец, принятие геометрии/profile, настоящие PNG и их visual QA/ошибки декодирования. Папки и интеграционный код готовы, но композиция комнаты/точные anchors и crop уточняются по арту. 0 изображений создано, скопировано или загружено внешнему генератору.
- Настоящий Telegram: настройка trusted verifier/token, HTTPS/database deployment, проверка Telegram iOS/Android/WebView, cookie и safe areas. В этой работе есть SDK entry и HMAC tests, но нет изменения меню бота или публикации.
- Перед production: нагрузочные/retention решения для растущего JSONB агрегата, конфигурация proxy/rate limits/headers и приёмка темпа v0.1. Базовый цикл проверен локально; это не обещание окончательной экономики или production SLO.
- Сезоны и деньги/платежи — отдельные этапы6–7. Main/Folio/старые ассеты и настоящая БД не менялись.
