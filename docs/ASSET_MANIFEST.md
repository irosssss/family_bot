# ASSET MANIFEST — Family Chores RPG

Каждый ассет, который грузит рантайм. **Правило: новый ассет = строка здесь.**
Без колонки Size агенты масштабируют ассеты неправильно (проверено).

Формат: | Name | Описание | Size (в игре) | Path | Used by |

## Фоны сцен (fullscreen)

| Name | Описание | Size | Path | Used by |
|------|----------|------|------|---------|
| home_bg | Комната семьи с камином (LPC interior) | 1376x768, fullscreen cover | /assets/game/home_bg.png | FamilyHubScene |
| arena_bg | Фон арены боя | 1376x768, fullscreen cover | /assets/game/arena_bg.png | BossRaidScene |
| wardrobe_bg | Гардеробная с зеркалом | 1376x768, fullscreen cover | /assets/game/wardrobe_bg.png | WardrobeCustomizationScene |

## Боссы

| Name | Описание | Size | Path | Used by |
|------|----------|------|------|---------|
| slime_idle_sheet | Слайм idle, 5 кадров по 64px | 320x64 sheet, кадр 64px | /assets/game/entities/bosses/slime_idle_sheet.png | BossAvatar (default) |

## Питомцы (LPC, 8x4 кадров по 64px, ряд 1 = профиль)

| Name | Описание | Size | Path | Used by |
|------|----------|------|------|---------|
| lpc_cat | Кот, полный спрайтшит | 512x256 sheet, кадр 64x64 | /assets/game/entities/pets/lpc_cat.png | initialData Pet.spriteSheetUrl |
| lpc_cat_idle | Кот, статичный кадр (иконка) | 64x64, display 56px | /assets/game/entities/pets/lpc_cat_idle.png | Pet.icon, PixelAvatar type=pet |
| lpc_dog | Пёс, полный спрайтшит | 512x256 sheet, кадр 64x64 | /assets/game/entities/pets/lpc_dog.png | initialData Pet.spriteSheetUrl |
| lpc_dog_idle | Пёс, статичный кадр | 64x64, display 56px | /assets/game/entities/pets/lpc_dog_idle.png | Pet.icon |

## UI

| Name | Описание | Size | Path | Used by |
|------|----------|------|------|---------|
| coin (Kenney) | Золотая монета | 12x12 source, display 12-14px | /assets/game/backgrounds/Previews/coin.png | FeedJournal, TodayTasks, ui/index.tsx |

## Персонажи ULPC (кадры 64x64, слои по z-index)

Структура: `characters/ulpc/{sex}/{слой}/{вариант}/{anim}.png`
Слои по порядку отрисовки: body → legs → feet → torso → head → eyes → hair → weapon_bg → weapon_fg.

| Группа | Анимации (размер листа) | Папки |
|--------|------------------------|-------|
| male/female: body, head, legs/cuffed_pants, torso/shirt, torso/leather_armor, feet | idle 128x256 (2к), walk 576x256 (9к), combat_idle 128x256, emote 192x256 (3к), hurt 384x64 (6к в ряд), slash 384x256 (3к), thrust 512x256 (4к) | `ulpc/male/*`, `ulpc/female/*` |
| hair (причёски с цветами) | idle, walk (только 2 анимации) | `ulpc/hair_colors/{style}_{color}/` — 378 папок (63 стиля x 6 цветов) |
| eyes/default | все 7 анимаций | `ulpc/eyes/default/` |
| weapons/sword_iron (bg+fg) | все 7 анимаций | `ulpc/weapons/sword_iron/` |
| torso_shop (магазин одежды) | idle, walk | `ulpc/torso_shop/{leather,legion,plate,chainmail,overalls,suspenders}/{male,female}/` |

Код: `src/utils/ulpcCharacter.ts` (маппинг магазинных ULPC-торсов).

## Старые LPC-слои (используются FamilySettings + иконки магазина)

| Name | Size | Used by |
|------|------|---------|
| characters/bases/lpc_body_male.png | 576x256 | FamilySettings ROLE_ICONS, rpg32bitCatalog BODY_BASES |
| characters/bases/lpc_body_female_lidia.png | 36x55 (кадр) | FamilySettings ROLE_ICONS |
| characters/bases/lpc_body_skeleton.png, lidia_spritesheet.png | 576x256 | резерв (не в рантайме — НЕ УДАЛЯТЬ, нет в git) |
| characters/heads/*.png (6 шт) | 576x256 | initialData иконки шляп (id 7-9, 21-24...) |
| characters/clothing/*.png (16 шт) | 576x256 | initialData иконки одежды + rpg32bitCatalog |
| equipment/weapons/*.png (5 шт) | 384-832x256 | initialData иконки оружия |
| equipment/shields/*.png (2 шт) | 512x256 | initialData иконки щитов |
| equipment/cloaks/lpc_behind_quiver.png | 576x256 | initialData (плащ) |

## Kenney Previews (ИСПОЛЬЗУЮТСЯ! Не удалять!)

`backgrounds/Previews/` — 51 иконка, `entities/pets/Previews/` — 24 иконки.
**Они отслеживаются в git.** `dist/assets/game/` — только сгенерированная копия. Используются в:
`initialData.ts` (35+ иконок магазина/задач), `FeedJournal`, `TodayTasks`, `ui/index.tsx` (coin),
`FamilySettings` (character-human, animal-chick).

## Habitica-ассеты (пак HabitRPG/habitica-images, ~9.2 MB выборочно)

Путь: `/assets/game/habitica/`. Каталог: `src/utils/habiticaCatalog.ts`.

| Категория | Файлов | Размер | Формат нейминга |
|-----------|--------|--------|-----------------|
| bosses/ | 118 | 0.9 MB | `quest_{id}.png` (219×219 и похожие) — недельная ротация |
| pets/ | 2490 | 4.6 MB | `Pet-{Species}-{Potion}.png` (81×99) |
| gear/armoire/ | 1070 | ~3 MB | сундук-лут (Этап 6) |
| backgrounds/ | 805 | 2.3 MB | `background_{id}.png` (141×147) |
| achievements/ | 104 | ~0.1 MB | иконки ачивок |
| shop/ | 20 | ~0.02 MB | иконки магазина |

**Ротация боссов**: `getWeeklyBoss()` в habiticaCatalog.ts — босс недели = номер недели
с начала года % 117. При смене `week_key` stateRoutes обновляет запись в таблице bosses
(имя + sprite_url). Русские имена — словарь BOSS_NAMES_RU в каталоге.

**BossAvatar**: умеет статичные PNG (frames=1, рисует целиком с сохранением пропорций).
BossRaidScene берёт `appState.boss.spriteSheetUrl` (Habitica) или фолбэк на ULPC-слайм.

Атрибуция при публичном релизе: ассеты из Habitica (HabitRPG), не для коммерческого использования без проверки лицензии.

## Правила

1. Новый ассет → строка в этом файле (Name/Size/Path/Used by).
2. Удаление ассета → сначала grep пути по `src/`, потом проверка `dist/`.
3. Спрайтшиты персонажей: кадр 64x64, ряды: 0=up, 1=left, 2=down(лицо), 3=right.
4. Питомцы: ряд 1 (профиль). Ряд 2 у LPC-животных — «вид сверху», не использовать.
