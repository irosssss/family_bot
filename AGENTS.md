# AGENTS.md — гайд для агентов (Family Chores RPG)

Семейная RPG-игра домашних дел: React 18 + Vite + Tailwind (frontend), Node/Express + Drizzle + PostgreSQL (backend), Telegram Mini App. **Mobile-first**: 95% пользователей — телефоны 375–390px.

## Запуск

```bash
# PostgreSQL 18 — в РЕАЛЬНОЙ консоли: двойной клик scripts/start-pg.bat
# (запуск через pg_ctl start из git-bash/фона = error 487; окно открыто = БД работает)

# Сервер (порт 3000, из корня проекта)
npm run dev

# Проверки
npm run lint        # tsc --noEmit — должен быть 0 ошибок
curl http://localhost:3000/api/health
```

## Silent-failure квирки (наступали — не повторяй)

- **`equipped_body` обязателен во ВСЕХ точках рендера.** `getUserCharacter()` принимает
  `{...user, equipped_body: user.equipped_codes?.body}`. Забыл — купленная одежда видна
  только в гардеробе, а в хабе/карточках/арене старый торс (наш баг магазина).
- **`Previews/` (51 иконка в `backgrounds/Previews/`, 24 в `entities/pets/Previews/`)
  ИСПОЛЬЗУЮТСЯ** в `initialData.ts`, `FeedJournal`, `TodayTasks`, `ui/index.tsx`.
  Их НЕТ в git (public почти не трекается) — единственный бэкап `dist/`. Перед удалением
  любого ассета: grep пути по всему `src/` + проверка `dist/`.
- **Эмодзи ЗАПРЕЩЕНЫ везде** (UI, toasts, бот, API-строки) — только пиксель-арт спрайты.
  Иконки — lucide-react или Kenney/LPC из `public/assets/game/`.
- **ULPC порядок слоёв** (z-index): body→legs→feet→torso→head→eyes→hair(bg/main/fg по
  hairMode)→weapon_bg→weapon_fg. Слои 64×64 кадры; спрайтшиты: idle 128×256 (2 кадра),
  walk 576×256 (9 кадров), slash 384×256 и т.д. — см. `src/utils/ulpcCharacter.ts`.
- **Причёски**: `ulpc_hair` + `ulpc_hair_color` → путь `hair_colors/{style}_{color}/idle.png`
  (63 стиля × 6 цветов = 378 папок). НЕ путать со старым `ulpc/hair/` (удалён).
- **Питомцы**: спрайтшит 512×256 = 8×4 кадров по 64px. **Ряд 1 = профиль (используем его)**,
  ряд 2 = «вид сверху» 23px (выглядит как клякса), ряд 3 пустой. Рендер `UlpcPetAvatar`.
- **Роли**: папа/мама = админы (НЕ играют: без золота/босса/streak), дети без лимита.
  Кнопка удара и игровые действия скрыты у родителей (`family_role !== 'parent'`).
  Все POST/PUT/DELETE `/api/users` требуют `actorId` (admin-guard).
- **Кнопка «Мощный удар»** — внизу арены (thumb zone), не в шапке. Тап по персонажу =
  ТОЛЬКО пузырь задач (смена профиля — через селектор в шапке). 1 тап = 1 действие.

## Архитектура

```
src/
  api/          Express-роутеры по доменам (state, tasks, shop, users...)
  services/     бизнес-логика (taskService, streakService, ulpcCharacter...)
  components/
    scenes/     3 сцены: FamilyHubScene, BossRaidScene, WardrobeCustomizationScene
    ui/         дизайн-система (PixelButton, PixelCard — >=44px, WCAG AA)
  bot/          Telegram-бот (node-telegram-bot-api)
  db/           Drizzle schema + seed
  utils/        ulpcCharacter (слои), haptics, ulpcHairCatalog
public/assets/game/   ТОЛЬКО файлы, которые грузит игра (см. docs/ASSET_MANIFEST.md)
```

## Правила работы

1. **Proof over claims**: визуальное изменение = скриншот/превью, а не «должно работать».
2. Новый ассет = строка в `docs/ASSET_MANIFEST.md` (Name/Size/Path/Used-by).
3. После правок: `npm run lint` → 0 ошибок, потом проверка в браузере.
4. Кнопки ≥44px, сцены адаптивны (проверяй на 375px).
5. Ассеты в `public/assets/game/` — только то, что грузится рантаймом. Генерация-инпуты держи вне.
