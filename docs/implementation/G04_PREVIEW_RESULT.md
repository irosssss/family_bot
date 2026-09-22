# G04-D / W15 — предпросмотр точного кандидата

16.09.2026. Реализован и проверен локальный plain_text срез W15; не публикация и не визуальная приёмка игровых ассетов.

## Результат

`src/target/content/preview.ts` принимает только неизменяемый результат действующего компилятора. Проверяет manifest и артефакты по digest, версию runtime-схемы, capability и compatibility profile каждого пакета. Показывает основной пакет и все зависимости. HTML экранирует текст, запрещает скрипты/сетевые ресурсы через CSP и не выполняет авторскую разметку.

Существующий `target:content:build` теперь сохраняет `private/preview.html` и `private/preview-report.json` до завершающего `candidate.json`. Report содержит build fingerprint, root manifest/lock digest, compiler report digest, все показанные manifests, число записей и HTML digest. Статус — `generated_not_reviewed`, production_ready=false. Каталог назначения не перезаписывается. Preview не добавляет права одобрения, публикации или активации.

Запуск существующей команды:

```sh
npm run target:content:build -- work/my-new-candidate fixture:package/root_texts 1.0.0 fixture tests/fixtures/content/g04-b/root tests/fixtures/content/g04-b/base
```

Открыть `work/my-new-candidate/private/preview.html` локально. Использовать новый каталог для новой сборки. Это локальный инструмент автора, не экран игровой навигации.

## Проверки

- lint, target:typecheck, target:build — PASS.
- Preview/compiler/local release: 63 теста PASS, включая 8 новых preview-сценариев.
- Проверены точная связь отчёта и HTML с кандидатом, зависимости, повторяемость, неизменность после правки исходника, отказ копии результата, неизвестного handler/schema/variant и HTML-разметки, запрет перезаписи.
- Синтетический fixture собран обычной CLI-командой; HTML открыт и визуально проверен в браузере. Видны 3 строки двух bundles, предупреждение о локальном кандидате и идентификаторы сборки. Это не проверка игровой сцены, Telegram или физического телефона.
- БД, схемы, Figma, существующие игровые данные и правила V3 не изменены.

## Оставшиеся зависимости

CPT10 для pet/hat/corner и DBT17 в части игровых variant требуют зарегистрированных игровых типов и runtime-профилей G05/G06. Plain_text preview подтверждает только отказ неподдерживаемых входов; не выдаёт фиктивное visual approval. Полный production-каталог, права на графику, O13, выпуск и acquired references остаются в прежнем плане. Следующий визуальный шаг — W16/W17: пилот существующих V3-ассетов с проверкой совместимости.
