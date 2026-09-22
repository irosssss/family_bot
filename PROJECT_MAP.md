# Family Life RPG — карта проекта

Основная версия: [V3_BASELINE](docs/V3_BASELINE.md).

- **Добавить/заменить контент:** [инструкция](docs/content/V3_AUTHORING.md).
- **Каталог:** [content-source/v3](content-source/v3/README.md).
- **Навыки агентов:** [.agents/skills](.agents/skills/README.md).
- **Контракты и планы:** [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md),
  [docs/IMPLEMENTATION_BACKLOG.md](docs/IMPLEMENTATION_BACKLOG.md).
- **Код действующего интерфейса:** src/v3; данные каталога не хранить в JSX.
- **Целевая серверная архитектура:** src/target; контентный конвейер src/target/content.
- **Подготовленные модули:** src/target и src/v3-server; назначение —
  [PREPARED_MODULES](docs/maintenance/PREPARED_MODULES.md). Прежние приложения удалены; история доступна в Git.
- **Исходники/референсы/проверки:** work и output; файлы для игры — public/assets/game.

Контент, определения прав, состояние конкретной семьи и изображения — разные сущности.
Каждое определение имеет постоянный ID; физические пути могут меняться через реестр.
Текущий локальный каталог не означает завершение публичного выпуска/серверной миграции.

Классификация существующих файлов и проверенные зависимости:
[аудит относительно V3](docs/reviews/repository/README.md).
Общие UI-компоненты V3 находятся в src/v3/components; зависимости от demo удалены.
