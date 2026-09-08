# Временная проверка игры в Telegram

2026-09-08. Тестовая версия подключена к существующему боту по поручению пользователя.
Google Cloud исключён по прямому указанию пользователя.

Обновление 2026-09-08: по просьбе открыть текущую игру также в обычном браузере
`src/preview/browserDemo.ts` добавляет отдельный in-memory transport на страницу.
Он использует те же demo domain/экраны, выполняет тестовые действия без HTTP API;
перезагрузка сбрасывает мир. Preview выбирает его только при отсутствии initData.
Присутствующая неверная Telegram-подпись по-прежнему отвергается сервером.
Ключи pending/profile браузера отделены от Telegram. Каталог закрыт в обоих режимах.

Последний временный адрес: https://italic-net-appliances-seo.trycloudflare.com/ — ранее проверены
HTTPS health, загрузка домашнего экрана в браузере, screenshot iframe375×812.
Кнопка бота обновлена с read-back. Lint/build PASS;253 regression PASS/9opt-inPGskip.
Это визуальная проверка существующей demo, не реализация G04-D/W15.

Повторная проверка после ревью 2026-09-08 вернула `ERR_NAME_NOT_RESOLVED`.
Адрес сейчас не подтверждён как рабочий; постоянного hosting нет. Восстановление требует
работающего туннеля, согласованного PREVIEW_ORIGIN и обновления меню бота.

Старый адрес edit-therefore-microwave-showing.trycloudflare.com перестал разрешаться
в DNS. Прежний сервер3210 и его данные оставлены работать: automatic approval review
отклонил его остановку из-за сброса in-memory семей. Новый экземпляр работает на3211,
через `PREVIEW_PORT=3211` с новым PREVIEW_ORIGIN; tunnel указывает на3211.
У него отдельные временные Telegram-семьи. Порт без PREVIEW_PORT остаётся3210.

Отдельный сервер `scripts/telegram-preview.ts` слушает только loopback (по умолчанию `127.0.0.1:3210`).
Cloudflare Quick Tunnel передаёт HTTPS-запросы на этот порт. Сборка:
`node --import tsx scripts/build-telegram-preview.ts`, результат `work/telegram-preview/dist`.
Клиент не включает legacy App, Sentry initialization, dev server или service worker.

Сервер получает только BOT_TOKEN через envskill и PREVIEW_ORIGIN с точным HTTPS origin.
Проверяет Host/Origin и подписанный Telegram initData, срок 2 часа. Каждый проверенный
Telegram subject получает отдельный синтетический мир в памяти, максимум 32 мира.
Переключатель профилей действует только внутри этого мира. Данные исчезают при перезапуске.
Основная PostgreSQL, legacy API, webhook, cron и G03 HTTP transport не подключены.
Редактор каталога недоступен. Это проверка демо на устройстве, не завершённый целевой
onboarding или общий многопользовательский MVP.

Запуск туннеля: `cloudflared tunnel --url http://127.0.0.1:3210 --no-autoupdate --protocol http2`.
Затем сервер: `envskill run --only BOT_TOKEN -- env PREVIEW_ORIGIN=<https-origin> node --import tsx scripts/telegram-preview.ts`.
При перезапуске туннеля адрес меняется: обновить PREVIEW_ORIGIN и кнопку через Bot API.
Кнопка установлена через setChatMenuButton с текстом «Играть»; getChatMenuButton подтвердил
новый адрес. Токен не помещать в файлы, URL команд, логи или клиентскую сборку.
Сон/выключение Mac или остановка любого процесса делает ссылку недоступной.

Проверки: Vite build PASS (остаётся предупреждение размера JS), lint 0 ошибок,
`npm test -- tests/telegramPreview.test.ts` PASS: отсутствующая, изменённая,
просроченная подпись; чужой Origin; закрытый legacy API; изоляция двух пользователей;
успешное действие и идемпотентный повтор. HTTPS health подтвердил isolated-telegram-preview.
Браузер загрузил страницу и показал просьбу открыть через Telegram; скриншот просмотрен.
Пользователь подтвердил работу на телефоне: «да все работает». Полная матрица целевого
onboarding/PIN/recovery этим не проверена. Тест Telegram preview включён в общую Vitest
регрессию: `npm test -- tests/telegramPreview.test.ts`.
