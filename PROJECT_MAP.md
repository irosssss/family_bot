# Family Life RPG — карта проекта

Основная версия: [V3_BASELINE](docs/V3_BASELINE.md).

- **Добавить/заменить контент:** [инструкция](docs/content/V3_AUTHORING.md).
- **Каталог:** [content-source/v3](content-source/v3/README.md).
- **Навыки агентов:** [.agents/skills](.agents/skills/README.md).
- **Контракты и планы:** [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md),
  [docs/IMPLEMENTATION_BACKLOG.md](docs/IMPLEMENTATION_BACKLOG.md).
- **Код действующего интерфейса:** src/v3; данные каталога не хранить в JSX.
- **Целевая серверная архитектура:** src/target; контентный конвейер src/target/content.
- **Исторический код:** src/components, src/services, src/db — сохраняется для прежнего
  приложения. Его механики и ассеты не переносятся в V3 автоматически.
- **Исходники/референсы/проверки:** work и output; файлы для игры — public/assets/game.

Контент, определения прав, состояние конкретной семьи и изображения — разные сущности.
Каждое определение имеет постоянный ID; физические пути могут меняться через реестр.
Текущий локальный каталог не означает завершение публичного выпуска/серверной миграции.

Классификация существующих файлов и проверенные зависимости:
[аудит относительно V3](docs/reviews/repository/README.md).
Не считать всю папку demo устаревшей: V3 использует её общие UI-компоненты.
