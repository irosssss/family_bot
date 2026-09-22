# ASSET MANIFEST — Family Chores RPG

**Статус графики — уточнение пользователя 2026-09-07:** все текущие игровые ассеты являются демонстрационными. Основные персонажи, питомцы, вещи, окружение и остальные ассеты будут подготовлены позже. Этот манифест описывает реально используемые сейчас файлы, а не утверждённый production-каталог или будущую Asset Bible. Демо-статус не означает, что файлы не используются или разрешены к удалению.

Каждый ассет, который грузит рантайм. **Правило: новый ассет = строка здесь.**
Без колонки Size агенты масштабируют ассеты неправильно (проверено).

Формат: | Name | Описание | Size (в игре) | Path | Used by |

## Локальная демо — визуальное обновление 2026-09-05

V3, 21.09.2026: `today-room` — статический фон выбранного яркого направления, не модульный дом Мира. Исходник и промпт: `output/v3-bright-direction/README.md`.

| Name | Описание | Size | Path | Used by |
|------|----------|------|------|---------|
| today-room | Светлая гостиная без персонажей и UI | 1536×1024; сцена высотой 230 CSS px, cover | /assets/game/v3-ui/today-room.png | src/v3/TodayPanel.tsx, src/v3/today.css |

| Name | Описание | Size | Path | Used by |
|------|----------|------|------|---------|
| demo-world-map-v2 | Оригинальная карта пяти регионов без впечённых кнопок, людей и питомцев | 1024×1536; 522858 bytes; adaptive 2:3 | /assets/game/demo/world-map-v2.webp | src/demo/AdventureScreen.tsx |

Происхождение и точный промпт: `work/visual-v2-world-art/PROMPT.md`. Исходные референсы не загружаются игрой.

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


## Оригинальные ассеты локальной демо — 2026-09-05

Оригинальный растровый арт сгенерирован через imagegen; Figma и старые Habitica-спрайты в этих сценах не используются. Слои персонажей — 256×320, спрайты существ и декора — 256×256, иконки предметов — 224×224, фоны — 768×1152. Фактический размер отображения задаёт мобильный renderer. Происхождение и visual QA: `docs/DEMO_ART_INVENTORY.md`, `docs/DEMO_CHARACTER_ART.md`.

### Локальная демо: комнаты, арена, боссы, питомцы и декор

| Name | Size | Path | Used-by |
|---|---|---|---|
| boss-b01.png | 256 × 256; 39,809 B | `public/assets/game/demo/boss-b01.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b02.png | 256 × 256; 41,502 B | `public/assets/game/demo/boss-b02.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b03.png | 256 × 256; 54,046 B | `public/assets/game/demo/boss-b03.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b04.png | 256 × 256; 38,350 B | `public/assets/game/demo/boss-b04.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b05.png | 256 × 256; 36,181 B | `public/assets/game/demo/boss-b05.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b06.png | 256 × 256; 27,521 B | `public/assets/game/demo/boss-b06.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b07.png | 256 × 256; 31,617 B | `public/assets/game/demo/boss-b07.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b08.png | 256 × 256; 43,319 B | `public/assets/game/demo/boss-b08.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b09.png | 256 × 256; 105,906 B | `public/assets/game/demo/boss-b09.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b10.png | 256 × 256; 84,728 B | `public/assets/game/demo/boss-b10.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b11.png | 256 × 256; 90,755 B | `public/assets/game/demo/boss-b11.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b12.png | 256 × 256; 74,007 B | `public/assets/game/demo/boss-b12.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b13.png | 256 × 256; 93,889 B | `public/assets/game/demo/boss-b13.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b14.png | 256 × 256; 74,217 B | `public/assets/game/demo/boss-b14.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b15.png | 256 × 256; 82,320 B | `public/assets/game/demo/boss-b15.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b16.png | 256 × 256; 88,186 B | `public/assets/game/demo/boss-b16.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b17.png | 256 × 256; 86,358 B | `public/assets/game/demo/boss-b17.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b18.png | 256 × 256; 97,142 B | `public/assets/game/demo/boss-b18.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b19.png | 256 × 256; 105,505 B | `public/assets/game/demo/boss-b19.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b20.png | 256 × 256; 105,126 B | `public/assets/game/demo/boss-b20.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b21.png | 256 × 256; 47,479 B | `public/assets/game/demo/boss-b21.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b22.png | 256 × 256; 53,108 B | `public/assets/game/demo/boss-b22.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b23.png | 256 × 256; 58,012 B | `public/assets/game/demo/boss-b23.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b24.png | 256 × 256; 76,762 B | `public/assets/game/demo/boss-b24.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b25.png | 256 × 256; 48,796 B | `public/assets/game/demo/boss-b25.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b26.png | 256 × 256; 55,863 B | `public/assets/game/demo/boss-b26.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b27.png | 256 × 256; 39,356 B | `public/assets/game/demo/boss-b27.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b28.png | 256 × 256; 51,006 B | `public/assets/game/demo/boss-b28.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b29.png | 256 × 256; 76,125 B | `public/assets/game/demo/boss-b29.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b30.png | 256 × 256; 65,607 B | `public/assets/game/demo/boss-b30.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b31.png | 256 × 256; 78,731 B | `public/assets/game/demo/boss-b31.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b32.png | 256 × 256; 72,956 B | `public/assets/game/demo/boss-b32.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b33.png | 256 × 256; 72,288 B | `public/assets/game/demo/boss-b33.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b34.png | 256 × 256; 57,528 B | `public/assets/game/demo/boss-b34.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b35.png | 256 × 256; 89,719 B | `public/assets/game/demo/boss-b35.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b36.png | 256 × 256; 69,422 B | `public/assets/game/demo/boss-b36.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b37.png | 256 × 256; 90,462 B | `public/assets/game/demo/boss-b37.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b38.png | 256 × 256; 63,842 B | `public/assets/game/demo/boss-b38.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b39.png | 256 × 256; 70,631 B | `public/assets/game/demo/boss-b39.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b40.png | 256 × 256; 94,779 B | `public/assets/game/demo/boss-b40.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b41.png | 256 × 256; 64,439 B | `public/assets/game/demo/boss-b41.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b42.png | 256 × 256; 73,534 B | `public/assets/game/demo/boss-b42.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b43.png | 256 × 256; 71,876 B | `public/assets/game/demo/boss-b43.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b44.png | 256 × 256; 87,390 B | `public/assets/game/demo/boss-b44.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b45.png | 256 × 256; 64,997 B | `public/assets/game/demo/boss-b45.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b46.png | 256 × 256; 76,705 B | `public/assets/game/demo/boss-b46.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b47.png | 256 × 256; 69,823 B | `public/assets/game/demo/boss-b47.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b48.png | 256 × 256; 77,768 B | `public/assets/game/demo/boss-b48.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| boss-b49.png | 256 × 256; 92,061 B | `public/assets/game/demo/boss-b49.png` | src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor |
| pet-p01.png | 256 × 256; 70,237 B | `public/assets/game/demo/pet-p01.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p02.png | 256 × 256; 63,246 B | `public/assets/game/demo/pet-p02.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p03.png | 256 × 256; 76,559 B | `public/assets/game/demo/pet-p03.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p04.png | 256 × 256; 55,375 B | `public/assets/game/demo/pet-p04.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p05.png | 256 × 256; 76,056 B | `public/assets/game/demo/pet-p05.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p06.png | 256 × 256; 73,389 B | `public/assets/game/demo/pet-p06.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p07.png | 256 × 256; 63,485 B | `public/assets/game/demo/pet-p07.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p08.png | 256 × 256; 72,157 B | `public/assets/game/demo/pet-p08.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p09.png | 256 × 256; 76,489 B | `public/assets/game/demo/pet-p09.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p10.png | 256 × 256; 67,965 B | `public/assets/game/demo/pet-p10.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p11.png | 256 × 256; 64,307 B | `public/assets/game/demo/pet-p11.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p12.png | 256 × 256; 81,500 B | `public/assets/game/demo/pet-p12.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p13.png | 256 × 256; 75,912 B | `public/assets/game/demo/pet-p13.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p14.png | 256 × 256; 61,767 B | `public/assets/game/demo/pet-p14.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p15.png | 256 × 256; 59,992 B | `public/assets/game/demo/pet-p15.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p16.png | 256 × 256; 72,424 B | `public/assets/game/demo/pet-p16.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p17.png | 256 × 256; 69,381 B | `public/assets/game/demo/pet-p17.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p18.png | 256 × 256; 67,440 B | `public/assets/game/demo/pet-p18.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p19.png | 256 × 256; 67,744 B | `public/assets/game/demo/pet-p19.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p20.png | 256 × 256; 69,964 B | `public/assets/game/demo/pet-p20.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p21.png | 256 × 256; 77,145 B | `public/assets/game/demo/pet-p21.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p22.png | 256 × 256; 70,511 B | `public/assets/game/demo/pet-p22.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p23.png | 256 × 256; 61,373 B | `public/assets/game/demo/pet-p23.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p24.png | 256 × 256; 78,396 B | `public/assets/game/demo/pet-p24.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p25.png | 256 × 256; 62,164 B | `public/assets/game/demo/pet-p25.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p26.png | 256 × 256; 69,644 B | `public/assets/game/demo/pet-p26.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p27.png | 256 × 256; 75,099 B | `public/assets/game/demo/pet-p27.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| pet-p28.png | 256 × 256; 80,930 B | `public/assets/game/demo/pet-p28.png` | src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet |
| plant.png | 256 × 256; 67,671 B | `public/assets/game/demo/decor/plant.png` | src/demo/catalog.ts; HomeScreen decor preview/equipped; shop/editor |
| books.png | 256 × 256; 66,124 B | `public/assets/game/demo/decor/books.png` | src/demo/catalog.ts; HomeScreen decor preview/equipped; shop/editor |
| rug.png | 256 × 256; 57,366 B | `public/assets/game/demo/decor/rug.png` | src/demo/catalog.ts; HomeScreen decor preview/equipped; shop/editor |
| lamp.png | 256 × 256; 24,878 B | `public/assets/game/demo/decor/lamp.png` | src/demo/catalog.ts; HomeScreen decor preview/equipped; shop/editor |
| picture.png | 256 × 256; 75,761 B | `public/assets/game/demo/decor/picture.png` | src/demo/catalog.ts; HomeScreen decor preview/equipped; shop/editor |
| garland.png | 256 × 256; 23,049 B | `public/assets/game/demo/decor/garland.png` | src/demo/catalog.ts; HomeScreen decor preview/equipped; shop/editor |
| telescope.png | 256 × 256; 36,019 B | `public/assets/game/demo/decor/telescope.png` | src/demo/catalog.ts; HomeScreen decor preview/equipped; shop/editor |
| egg.png | 256 × 256; 68,005 B | `public/assets/game/demo/egg.png` | src/demo/WardrobeScreen.tsx; owned egg and hatch card |
| home-fireplace.webp | 768 × 1152; 113,064 B | `public/assets/game/demo/home-fireplace.webp` | src/demo/catalog.ts; HomeScreen room and theme previews |
| home-library.webp | 768 × 1152; 100,946 B | `public/assets/game/demo/home-library.webp` | src/demo/catalog.ts; HomeScreen room and theme previews |
| home-conservatory.webp | 768 × 1152; 144,408 B | `public/assets/game/demo/home-conservatory.webp` | src/demo/catalog.ts; HomeScreen room and theme previews |
| arena.webp | 768 × 1152; 199,292 B | `public/assets/game/demo/arena.webp` | src/demo/demo.css; AdventureScreen battle stage background |

### Локальная демо: модульные персонажи и иконки экипировки

| Name | Size | Path | Used-by |
|---|---|---|---|
| beard-full-black | 256×320, 14580 B | `public/assets/game/demo/characters/beard-full-black.png` | `src/demo/Character.tsx` |
| beard-full-blond | 256×320, 22318 B | `public/assets/game/demo/characters/beard-full-blond.png` | `src/demo/Character.tsx` |
| beard-full-chestnut | 256×320, 21159 B | `public/assets/game/demo/characters/beard-full-chestnut.png` | `src/demo/Character.tsx` |
| beard-full-ginger | 256×320, 21266 B | `public/assets/game/demo/characters/beard-full-ginger.png` | `src/demo/Character.tsx` |
| beard-full-silver | 256×320, 19657 B | `public/assets/game/demo/characters/beard-full-silver.png` | `src/demo/Character.tsx` |
| beard-short-black | 256×320, 10035 B | `public/assets/game/demo/characters/beard-short-black.png` | `src/demo/Character.tsx` |
| beard-short-blond | 256×320, 15317 B | `public/assets/game/demo/characters/beard-short-blond.png` | `src/demo/Character.tsx` |
| beard-short-chestnut | 256×320, 14691 B | `public/assets/game/demo/characters/beard-short-chestnut.png` | `src/demo/Character.tsx` |
| beard-short-ginger | 256×320, 14754 B | `public/assets/game/demo/characters/beard-short-ginger.png` | `src/demo/Character.tsx` |
| beard-short-silver | 256×320, 13718 B | `public/assets/game/demo/characters/beard-short-silver.png` | `src/demo/Character.tsx` |
| hair-bob-black | 256×320, 21175 B | `public/assets/game/demo/characters/hair-bob-black.png` | `src/demo/Character.tsx` |
| hair-bob-blond | 256×320, 33128 B | `public/assets/game/demo/characters/hair-bob-blond.png` | `src/demo/Character.tsx` |
| hair-bob-chestnut | 256×320, 31790 B | `public/assets/game/demo/characters/hair-bob-chestnut.png` | `src/demo/Character.tsx` |
| hair-bob-ginger | 256×320, 31918 B | `public/assets/game/demo/characters/hair-bob-ginger.png` | `src/demo/Character.tsx` |
| hair-bob-silver | 256×320, 28778 B | `public/assets/game/demo/characters/hair-bob-silver.png` | `src/demo/Character.tsx` |
| hair-curly-black | 256×320, 23791 B | `public/assets/game/demo/characters/hair-curly-black.png` | `src/demo/Character.tsx` |
| hair-curly-blond | 256×320, 38055 B | `public/assets/game/demo/characters/hair-curly-blond.png` | `src/demo/Character.tsx` |
| hair-curly-chestnut | 256×320, 36410 B | `public/assets/game/demo/characters/hair-curly-chestnut.png` | `src/demo/Character.tsx` |
| hair-curly-ginger | 256×320, 36655 B | `public/assets/game/demo/characters/hair-curly-ginger.png` | `src/demo/Character.tsx` |
| hair-curly-silver | 256×320, 33019 B | `public/assets/game/demo/characters/hair-curly-silver.png` | `src/demo/Character.tsx` |
| hair-long-black | 256×320, 24439 B | `public/assets/game/demo/characters/hair-long-black.png` | `src/demo/Character.tsx` |
| hair-long-blond | 256×320, 37997 B | `public/assets/game/demo/characters/hair-long-blond.png` | `src/demo/Character.tsx` |
| hair-long-chestnut | 256×320, 36373 B | `public/assets/game/demo/characters/hair-long-chestnut.png` | `src/demo/Character.tsx` |
| hair-long-ginger | 256×320, 36542 B | `public/assets/game/demo/characters/hair-long-ginger.png` | `src/demo/Character.tsx` |
| hair-long-silver | 256×320, 33194 B | `public/assets/game/demo/characters/hair-long-silver.png` | `src/demo/Character.tsx` |
| hair-ponytail-black | 256×320, 23414 B | `public/assets/game/demo/characters/hair-ponytail-black.png` | `src/demo/Character.tsx` |
| hair-ponytail-blond | 256×320, 37293 B | `public/assets/game/demo/characters/hair-ponytail-blond.png` | `src/demo/Character.tsx` |
| hair-ponytail-chestnut | 256×320, 35815 B | `public/assets/game/demo/characters/hair-ponytail-chestnut.png` | `src/demo/Character.tsx` |
| hair-ponytail-ginger | 256×320, 35979 B | `public/assets/game/demo/characters/hair-ponytail-ginger.png` | `src/demo/Character.tsx` |
| hair-ponytail-silver | 256×320, 32097 B | `public/assets/game/demo/characters/hair-ponytail-silver.png` | `src/demo/Character.tsx` |
| hair-short-black | 256×320, 17691 B | `public/assets/game/demo/characters/hair-short-black.png` | `src/demo/Character.tsx` |
| hair-short-blond | 256×320, 27792 B | `public/assets/game/demo/characters/hair-short-blond.png` | `src/demo/Character.tsx` |
| hair-short-chestnut | 256×320, 26677 B | `public/assets/game/demo/characters/hair-short-chestnut.png` | `src/demo/Character.tsx` |
| hair-short-ginger | 256×320, 26840 B | `public/assets/game/demo/characters/hair-short-ginger.png` | `src/demo/Character.tsx` |
| hair-short-silver | 256×320, 23785 B | `public/assets/game/demo/characters/hair-short-silver.png` | `src/demo/Character.tsx` |
| head-brown | 256×320, 29366 B | `public/assets/game/demo/characters/head-brown.png` | `src/demo/Character.tsx` |
| head-deep | 256×320, 29336 B | `public/assets/game/demo/characters/head-deep.png` | `src/demo/Character.tsx` |
| head-peach | 256×320, 29961 B | `public/assets/game/demo/characters/head-peach.png` | `src/demo/Character.tsx` |
| head-warm | 256×320, 29769 B | `public/assets/game/demo/characters/head-warm.png` | `src/demo/Character.tsx` |
| rare-healer-body-brown | 256×320, 43504 B | `public/assets/game/demo/characters/rare-healer-body-brown.png` | `src/demo/Character.tsx` |
| rare-healer-body-deep | 256×320, 43385 B | `public/assets/game/demo/characters/rare-healer-body-deep.png` | `src/demo/Character.tsx` |
| rare-healer-body-peach | 256×320, 43744 B | `public/assets/game/demo/characters/rare-healer-body-peach.png` | `src/demo/Character.tsx` |
| rare-healer-body-warm | 256×320, 43625 B | `public/assets/game/demo/characters/rare-healer-body-warm.png` | `src/demo/Character.tsx` |
| rare-healer-weapon | 256×320, 7215 B | `public/assets/game/demo/characters/rare-healer-weapon.png` | `src/demo/Character.tsx` |
| rare-mage-body-brown | 256×320, 42671 B | `public/assets/game/demo/characters/rare-mage-body-brown.png` | `src/demo/Character.tsx` |
| rare-mage-body-deep | 256×320, 42581 B | `public/assets/game/demo/characters/rare-mage-body-deep.png` | `src/demo/Character.tsx` |
| rare-mage-body-peach | 256×320, 42861 B | `public/assets/game/demo/characters/rare-mage-body-peach.png` | `src/demo/Character.tsx` |
| rare-mage-body-warm | 256×320, 42727 B | `public/assets/game/demo/characters/rare-mage-body-warm.png` | `src/demo/Character.tsx` |
| rare-mage-weapon | 256×320, 8004 B | `public/assets/game/demo/characters/rare-mage-weapon.png` | `src/demo/Character.tsx` |
| rare-rogue-body-brown | 256×320, 41674 B | `public/assets/game/demo/characters/rare-rogue-body-brown.png` | `src/demo/Character.tsx` |
| rare-rogue-body-deep | 256×320, 41599 B | `public/assets/game/demo/characters/rare-rogue-body-deep.png` | `src/demo/Character.tsx` |
| rare-rogue-body-peach | 256×320, 41858 B | `public/assets/game/demo/characters/rare-rogue-body-peach.png` | `src/demo/Character.tsx` |
| rare-rogue-body-warm | 256×320, 41690 B | `public/assets/game/demo/characters/rare-rogue-body-warm.png` | `src/demo/Character.tsx` |
| rare-rogue-weapon | 256×320, 9727 B | `public/assets/game/demo/characters/rare-rogue-weapon.png` | `src/demo/Character.tsx` |
| rare-warrior-body-brown | 256×320, 41071 B | `public/assets/game/demo/characters/rare-warrior-body-brown.png` | `src/demo/Character.tsx` |
| rare-warrior-body-deep | 256×320, 40978 B | `public/assets/game/demo/characters/rare-warrior-body-deep.png` | `src/demo/Character.tsx` |
| rare-warrior-body-peach | 256×320, 41359 B | `public/assets/game/demo/characters/rare-warrior-body-peach.png` | `src/demo/Character.tsx` |
| rare-warrior-body-warm | 256×320, 41172 B | `public/assets/game/demo/characters/rare-warrior-body-warm.png` | `src/demo/Character.tsx` |
| rare-warrior-weapon | 256×320, 7962 B | `public/assets/game/demo/characters/rare-warrior-weapon.png` | `src/demo/Character.tsx` |
| starter-healer-body-brown | 256×320, 43147 B | `public/assets/game/demo/characters/starter-healer-body-brown.png` | `src/demo/Character.tsx` |
| starter-healer-body-deep | 256×320, 43021 B | `public/assets/game/demo/characters/starter-healer-body-deep.png` | `src/demo/Character.tsx` |
| starter-healer-body-peach | 256×320, 43444 B | `public/assets/game/demo/characters/starter-healer-body-peach.png` | `src/demo/Character.tsx` |
| starter-healer-body-warm | 256×320, 43256 B | `public/assets/game/demo/characters/starter-healer-body-warm.png` | `src/demo/Character.tsx` |
| starter-healer-weapon | 256×320, 6920 B | `public/assets/game/demo/characters/starter-healer-weapon.png` | `src/demo/Character.tsx` |
| starter-mage-body-brown | 256×320, 41072 B | `public/assets/game/demo/characters/starter-mage-body-brown.png` | `src/demo/Character.tsx` |
| starter-mage-body-deep | 256×320, 41011 B | `public/assets/game/demo/characters/starter-mage-body-deep.png` | `src/demo/Character.tsx` |
| starter-mage-body-peach | 256×320, 41301 B | `public/assets/game/demo/characters/starter-mage-body-peach.png` | `src/demo/Character.tsx` |
| starter-mage-body-warm | 256×320, 41141 B | `public/assets/game/demo/characters/starter-mage-body-warm.png` | `src/demo/Character.tsx` |
| starter-mage-weapon | 256×320, 7724 B | `public/assets/game/demo/characters/starter-mage-weapon.png` | `src/demo/Character.tsx` |
| starter-rogue-body-brown | 256×320, 40071 B | `public/assets/game/demo/characters/starter-rogue-body-brown.png` | `src/demo/Character.tsx` |
| starter-rogue-body-deep | 256×320, 40028 B | `public/assets/game/demo/characters/starter-rogue-body-deep.png` | `src/demo/Character.tsx` |
| starter-rogue-body-peach | 256×320, 40237 B | `public/assets/game/demo/characters/starter-rogue-body-peach.png` | `src/demo/Character.tsx` |
| starter-rogue-body-warm | 256×320, 40103 B | `public/assets/game/demo/characters/starter-rogue-body-warm.png` | `src/demo/Character.tsx` |
| starter-rogue-weapon | 256×320, 9407 B | `public/assets/game/demo/characters/starter-rogue-weapon.png` | `src/demo/Character.tsx` |
| starter-warrior-body-brown | 256×320, 40990 B | `public/assets/game/demo/characters/starter-warrior-body-brown.png` | `src/demo/Character.tsx` |
| starter-warrior-body-deep | 256×320, 40878 B | `public/assets/game/demo/characters/starter-warrior-body-deep.png` | `src/demo/Character.tsx` |
| starter-warrior-body-peach | 256×320, 41237 B | `public/assets/game/demo/characters/starter-warrior-body-peach.png` | `src/demo/Character.tsx` |
| starter-warrior-body-warm | 256×320, 41083 B | `public/assets/game/demo/characters/starter-warrior-body-warm.png` | `src/demo/Character.tsx` |
| starter-warrior-weapon | 256×320, 7679 B | `public/assets/game/demo/characters/starter-warrior-weapon.png` | `src/demo/Character.tsx` |
| healer-body | 224×224, 42778 B | `public/assets/game/demo/items/healer-body.png` | `src/demo/catalog.ts`, wardrobe/editor |
| healer-weapon | 224×224, 6730 B | `public/assets/game/demo/items/healer-weapon.png` | `src/demo/catalog.ts`, wardrobe/editor |
| mage-body | 224×224, 40670 B | `public/assets/game/demo/items/mage-body.png` | `src/demo/catalog.ts`, wardrobe/editor |
| mage-weapon | 224×224, 7498 B | `public/assets/game/demo/items/mage-weapon.png` | `src/demo/catalog.ts`, wardrobe/editor |
| rare-healer-body | 224×224, 43134 B | `public/assets/game/demo/items/rare-healer-body.png` | `src/demo/catalog.ts`, wardrobe/editor |
| rare-healer-weapon | 224×224, 7022 B | `public/assets/game/demo/items/rare-healer-weapon.png` | `src/demo/catalog.ts`, wardrobe/editor |
| rare-mage-body | 224×224, 42285 B | `public/assets/game/demo/items/rare-mage-body.png` | `src/demo/catalog.ts`, wardrobe/editor |
| rare-mage-weapon | 224×224, 7776 B | `public/assets/game/demo/items/rare-mage-weapon.png` | `src/demo/catalog.ts`, wardrobe/editor |
| rare-rogue-body | 224×224, 41197 B | `public/assets/game/demo/items/rare-rogue-body.png` | `src/demo/catalog.ts`, wardrobe/editor |
| rare-rogue-weapon | 224×224, 9447 B | `public/assets/game/demo/items/rare-rogue-weapon.png` | `src/demo/catalog.ts`, wardrobe/editor |
| rare-warrior-body | 224×224, 40716 B | `public/assets/game/demo/items/rare-warrior-body.png` | `src/demo/catalog.ts`, wardrobe/editor |
| rare-warrior-weapon | 224×224, 7737 B | `public/assets/game/demo/items/rare-warrior-weapon.png` | `src/demo/catalog.ts`, wardrobe/editor |
| rogue-body | 224×224, 39558 B | `public/assets/game/demo/items/rogue-body.png` | `src/demo/catalog.ts`, wardrobe/editor |
| rogue-weapon | 224×224, 9135 B | `public/assets/game/demo/items/rogue-weapon.png` | `src/demo/catalog.ts`, wardrobe/editor |
| warrior-body | 224×224, 40611 B | `public/assets/game/demo/items/warrior-body.png` | `src/demo/catalog.ts`, wardrobe/editor |
| warrior-weapon | 224×224, 7464 B | `public/assets/game/demo/items/warrior-weapon.png` | `src/demo/catalog.ts`, wardrobe/editor |

### Локальная демо: сидячие слои одежды

| Name | Size | Path | Used-by |
|---|---|---|---|
| sitting/rare-healer-body-brown | 256×320, 43349 B | `public/assets/game/demo/characters/sitting/rare-healer-body-brown.png` | `src/demo/Character.tsx` |
| sitting/rare-healer-body-deep | 256×320, 43161 B | `public/assets/game/demo/characters/sitting/rare-healer-body-deep.png` | `src/demo/Character.tsx` |
| sitting/rare-healer-body-peach | 256×320, 43641 B | `public/assets/game/demo/characters/sitting/rare-healer-body-peach.png` | `src/demo/Character.tsx` |
| sitting/rare-healer-body-warm | 256×320, 43514 B | `public/assets/game/demo/characters/sitting/rare-healer-body-warm.png` | `src/demo/Character.tsx` |
| sitting/rare-mage-body-brown | 256×320, 43405 B | `public/assets/game/demo/characters/sitting/rare-mage-body-brown.png` | `src/demo/Character.tsx` |
| sitting/rare-mage-body-deep | 256×320, 43324 B | `public/assets/game/demo/characters/sitting/rare-mage-body-deep.png` | `src/demo/Character.tsx` |
| sitting/rare-mage-body-peach | 256×320, 43568 B | `public/assets/game/demo/characters/sitting/rare-mage-body-peach.png` | `src/demo/Character.tsx` |
| sitting/rare-mage-body-warm | 256×320, 43482 B | `public/assets/game/demo/characters/sitting/rare-mage-body-warm.png` | `src/demo/Character.tsx` |
| sitting/rare-rogue-body-brown | 256×320, 42184 B | `public/assets/game/demo/characters/sitting/rare-rogue-body-brown.png` | `src/demo/Character.tsx` |
| sitting/rare-rogue-body-deep | 256×320, 42063 B | `public/assets/game/demo/characters/sitting/rare-rogue-body-deep.png` | `src/demo/Character.tsx` |
| sitting/rare-rogue-body-peach | 256×320, 42444 B | `public/assets/game/demo/characters/sitting/rare-rogue-body-peach.png` | `src/demo/Character.tsx` |
| sitting/rare-rogue-body-warm | 256×320, 42285 B | `public/assets/game/demo/characters/sitting/rare-rogue-body-warm.png` | `src/demo/Character.tsx` |
| sitting/rare-warrior-body-brown | 256×320, 42277 B | `public/assets/game/demo/characters/sitting/rare-warrior-body-brown.png` | `src/demo/Character.tsx` |
| sitting/rare-warrior-body-deep | 256×320, 42191 B | `public/assets/game/demo/characters/sitting/rare-warrior-body-deep.png` | `src/demo/Character.tsx` |
| sitting/rare-warrior-body-peach | 256×320, 42443 B | `public/assets/game/demo/characters/sitting/rare-warrior-body-peach.png` | `src/demo/Character.tsx` |
| sitting/rare-warrior-body-warm | 256×320, 42348 B | `public/assets/game/demo/characters/sitting/rare-warrior-body-warm.png` | `src/demo/Character.tsx` |
| sitting/starter-healer-body-brown | 256×320, 36547 B | `public/assets/game/demo/characters/sitting/starter-healer-body-brown.png` | `src/demo/Character.tsx` |
| sitting/starter-healer-body-deep | 256×320, 36406 B | `public/assets/game/demo/characters/sitting/starter-healer-body-deep.png` | `src/demo/Character.tsx` |
| sitting/starter-healer-body-peach | 256×320, 36824 B | `public/assets/game/demo/characters/sitting/starter-healer-body-peach.png` | `src/demo/Character.tsx` |
| sitting/starter-healer-body-warm | 256×320, 36656 B | `public/assets/game/demo/characters/sitting/starter-healer-body-warm.png` | `src/demo/Character.tsx` |
| sitting/starter-mage-body-brown | 256×320, 32994 B | `public/assets/game/demo/characters/sitting/starter-mage-body-brown.png` | `src/demo/Character.tsx` |
| sitting/starter-mage-body-deep | 256×320, 32990 B | `public/assets/game/demo/characters/sitting/starter-mage-body-deep.png` | `src/demo/Character.tsx` |
| sitting/starter-mage-body-peach | 256×320, 33096 B | `public/assets/game/demo/characters/sitting/starter-mage-body-peach.png` | `src/demo/Character.tsx` |
| sitting/starter-mage-body-warm | 256×320, 32982 B | `public/assets/game/demo/characters/sitting/starter-mage-body-warm.png` | `src/demo/Character.tsx` |
| sitting/starter-rogue-body-brown | 256×320, 32796 B | `public/assets/game/demo/characters/sitting/starter-rogue-body-brown.png` | `src/demo/Character.tsx` |
| sitting/starter-rogue-body-deep | 256×320, 32765 B | `public/assets/game/demo/characters/sitting/starter-rogue-body-deep.png` | `src/demo/Character.tsx` |
| sitting/starter-rogue-body-peach | 256×320, 32917 B | `public/assets/game/demo/characters/sitting/starter-rogue-body-peach.png` | `src/demo/Character.tsx` |
| sitting/starter-rogue-body-warm | 256×320, 32773 B | `public/assets/game/demo/characters/sitting/starter-rogue-body-warm.png` | `src/demo/Character.tsx` |
| sitting/starter-warrior-body-brown | 256×320, 31996 B | `public/assets/game/demo/characters/sitting/starter-warrior-body-brown.png` | `src/demo/Character.tsx` |
| sitting/starter-warrior-body-deep | 256×320, 31981 B | `public/assets/game/demo/characters/sitting/starter-warrior-body-deep.png` | `src/demo/Character.tsx` |
| sitting/starter-warrior-body-peach | 256×320, 32092 B | `public/assets/game/demo/characters/sitting/starter-warrior-body-peach.png` | `src/demo/Character.tsx` |
| sitting/starter-warrior-body-warm | 256×320, 31992 B | `public/assets/game/demo/characters/sitting/starter-warrior-body-warm.png` | `src/demo/Character.tsx` |
| home-evening-v5 | 1672×941, 2123818 B | `public/assets/game/demo/home-evening-v5.png` | `src/demo/homeScenes.ts` → `AuthoredRoom`; clean built-in imagegen edit of responsive v4, prompt: `work/overnight/art-prompts.md` |

### SpriteCook wardrobe exploration — 2026-09-11 (not runtime assets)

Uploaded the four user-approved transparent bases to SpriteCook project `ffc3e855-24c2-4784-8a48-c53910e050e9`. Generated three outfits and three hairstyles per character as transparent sheets. Asset IDs, SHA-256 prefixes, prompts, and limitations: `output/spritecook/wardrobe/spritecook-assets.json`. These sheets need alignment and layer preparation before equipping in-game; some hair variants include ear details. No runtime code consumes them yet.

| Name | Size | Path | Used-by |
|---|---|---|---|
| Mother base | 1024×1536 RGBA | `output/imagegen/family-transparent/mother.png` | SpriteCook reference |
| Boy base | 1024×1536 RGBA | `output/imagegen/family-transparent/boy.png` | SpriteCook reference |
| Girl base | 1024×1536 RGBA | `output/imagegen/family-transparent/girl.png` | SpriteCook reference |
| Father base | 1024×1536 RGBA | `output/imagegen/family-transparent/father.png` | SpriteCook reference |
| Mother wardrobe | 1024×1024 RGBA | `output/spritecook/wardrobe/mother-sheet.png` | Wardrobe art exploration |
| Boy wardrobe | 1024×1024 RGBA | `output/spritecook/wardrobe/boy-sheet.png` | Wardrobe art exploration |
| Girl wardrobe | 1024×1024 RGBA | `output/spritecook/wardrobe/girl-sheet.png` | Wardrobe art exploration |
| Father wardrobe | 1024×1024 RGBA | `output/spritecook/wardrobe/father-sheet.png` | Wardrobe art exploration |

### Figma character workshop — user bases and son pilot

Authoring assets only; not loaded by the game. Figma page `15 · Персонажи · мастерская`, file `7D5G4cp3ui5cSlXqbwWIMv`. Original bodies are byte-preserving copies of the user-provided files.

| Name | Size | Path | Used-by |
|---|---|---|---|
| Father supplied base | 1024×1536 RGBA | `output/figma-character-workshop/Папа-body-base.png` | Figma master Основа/Папа |
| Mother supplied base | 1024×1536 RGBA | `output/figma-character-workshop/Мама-body-base.png` | Figma master Основа/Мама |
| Son supplied base | 1024×1536 RGBA | `output/figma-character-workshop/Сын-body-base.png` | Figma master Основа/Сын |
| Daughter supplied base | 1024×1536 RGBA | `output/figma-character-workshop/Дочь-body-base.png` | Figma master Основа/Дочь |
| Son forest outfit source | 1024×1536 RGBA | `output/figma-character-workshop/outfit-forest.png` | Figma registered costume component |
| Son blue outfit source | 1024×1536 RGB | `output/figma-character-workshop/outfit-blue.png` | Figma vector-masked costume; do not consume unmasked |
| Son side-part source | 1024×1536 RGBA | `output/figma-character-workshop/hair-part.png` | Figma registered hair component |
| Son curls source | 1024×1536 RGBA | `output/figma-character-workshop/hair-curls.png` | Figma registered hair component |
| Son cap source | 1024×1536 RGBA | `output/figma-character-workshop/headwear.png` | Figma registered cap component |
| Son boots source | 1024×1536 RGBA | `output/figma-character-workshop/shoes.png` | Figma registered boots component |

Готовые совмещённые слои Figma (RGBA 1024×1536, проверены; authoring-only):

| Name | Size | Path | Used-by |
|---|---|---|---|
| son-eyes-blue | 1024×1536 RGBA | `output/figma-character-workshop/export/son-eyes-blue.png` | Figma son constructor / registered layer pack |
| son-eyes-hazel | 1024×1536 RGBA | `output/figma-character-workshop/export/son-eyes-hazel.png` | Figma son constructor / registered layer pack |
| son-hair-curls | 1024×1536 RGBA | `output/figma-character-workshop/export/son-hair-curls.png` | Figma son constructor / registered layer pack |
| son-hair-part | 1024×1536 RGBA | `output/figma-character-workshop/export/son-hair-part.png` | Figma son constructor / registered layer pack |
| son-headwear | 1024×1536 RGBA | `output/figma-character-workshop/export/son-headwear.png` | Figma son constructor / registered layer pack |
| son-outfit-blue | 1024×1536 RGBA | `output/figma-character-workshop/export/son-outfit-blue.png` | Figma son constructor / registered layer pack |
| son-outfit-forest | 1024×1536 RGBA | `output/figma-character-workshop/export/son-outfit-forest.png` | Figma son constructor / registered layer pack |
| son-shoes | 1024×1536 RGBA | `output/figma-character-workshop/export/son-shoes.png` | Figma son constructor / registered layer pack |

Прежняя мастерская сына отвергнута пользователем, страница15 удалена. Перечисленные выше файлы — исторические authoring-материалы, не принятый набор.

Прежние отдельные глаза мамы — исторический Figma-пилот, заменён новой основой со встроенными глазами; без runtime-подключения:

| Name | Size | Path | Used-by |
|---|---|---|---|
| Mother eyes reference | 1774×887 RGBA | Figma `7D5G4cp3ui5cSlXqbwWIMv`, node `250:39` | Replaced with user source without skin/lashes; mother eye components |
| Mother eye left / right | 600×450 each | Figma nodes `254:39`, `254:48`; board `254:5126` | Page13 eye preview; white/iris/pupil/highlight, editable iris Fill; pending user review |

| Mother body with native eyes | 1024×1536 RGBA | Figma `260:40`, `228:40`; imageHash `c5cc646a89e08e284a45ffa7ba7f8eb9b71a5dde` | Current mother master, family height board, fitting instance `267:5174`, face preview; native iris recoloring via COLOR overlays |
| Father body with native eyes | 1024×1536 RGBA | Figma `262:5155`, `228:39`; imageHash `a4aba628ce70d896833a0722a13178d33a2ed715` | Current father master, family height board, fitting instance `263:5155`, face preview `270:5144`; independent native iris recoloring via COLOR overlays |
| Son body with native eyes | 1024×1536 RGBA | Figma `262:5162`, `228:42`; imageHash `f21d6d67de1deb9168716239653f128ac8424cec` | Current son master, family height board, fitting instance `263:5199`, face preview `273:5150`; independent native iris recoloring via COLOR overlays |
| Daughter body with native eyes | 1024×1536 RGBA | Figma `262:5169`, `228:41`; imageHash `60662c1eebc9cccc545358e509809fcd2771372c` | Current daughter master, family height board, fitting instance `263:5210`, face preview `278:83`; independent native iris recoloring via COLOR overlays |

Готовые пользовательские сеты мамы — целые персонажи, authoring-only:

| Name | Size | Path | Used-by |
|---|---|---|---|
| Мишка дома | 1024×1536 RGBA | Desktop `Мама_1_базовый сет.png`; Figma `295:88` | Mother Комплект selector |
| Команда двора | 1024×1536 RGBA | Desktop `Мама_2_базовый сет..png`; Figma `295:89` | Mother Комплект selector |
| Дачный изобретатель | 1024×1536 RGBA | Desktop `Мама_3_базовый сет..png`; Figma `295:90` | Mother Комплект selector |
| Морозные узоры | 1024×1536 RGBA | Desktop `Мама_1_платный сезонный сет..png`; Figma `295:91` | Mother Комплект selector |
| Звёздная экспедиция | 1024×1536 RGBA | Desktop `Мама_2_платный сезонный сет..png`; Figma `295:92` | Mother Комплект selector |
| Жар-птица | 1024×1536 RGBA | Desktop `Мама_3_платный сезонный сет..png`; Figma `295:93` | Mother Комплект selector |
| Лесной дракон | 1024×1536 RGBA | Desktop `Мама_4_платный сезонный сет.png`; Figma `295:94` | Mother Комплект selector |

Готовые пользовательские сеты папы — целые персонажи, authoring-only:

| Name | Size | Path | Used-by |
|---|---|---|---|
| Мишка дома | 1024×1536 RGBA | Desktop `Папа_1_базовый сет.png`; Figma `309:82` | Father Комплект selector |
| Команда двора | 1024×1536 RGBA | Desktop `Папа_2_базовый сет.png`; Figma `309:83` | Father Комплект selector |
| Дачный изобретатель | 1024×1536 RGBA | Desktop `Папа_3_базовый сет.png`; Figma `309:84` | Father Комплект selector |
| Морозные узоры | 1024×1536 RGBA | Desktop `Папа_1_платный сезонный сет.png`; Figma `309:85` | Father Комплект selector |
| Звёздная экспедиция | 1024×1536 RGBA | Desktop `Папа_2_платный сезонный сет.png`; Figma `309:86` | Father Комплект selector |
| Жар-птица | 1024×1536 RGBA | Desktop `Папа_3_платный сезонный сет.png`; Figma `309:87` | Father Комплект selector |
| Лесной дракон | 1024×1536 RGBA | Desktop `Папа_4_платный сезонный сет.png`; Figma `309:88` | Father Комплект selector |

Готовые пользовательские сеты дочери — целые персонажи, authoring-only:

| Name | Size | Path | Used-by |
|---|---|---|---|
| Мишка дома | 1024×1536 RGBA | Desktop `Дочь_1_базовый сет.png`; Figma `325:76` | Daughter Комплект selector |
| Команда двора | 1024×1536 RGBA | Desktop `Дочь_2_базовый сет.png`; Figma `325:77` | Daughter Комплект selector |
| Дачный изобретатель | 1024×1536 RGBA | Desktop `Дочь_3_базовый сет.png`; Figma `325:78` | Daughter Комплект selector |
| Морозные узоры | 1024×1536 RGBA | Desktop `Дочь_1_платный сезонный сет.png`; Figma `325:79` | Daughter Комплект selector |
| Звёздная экспедиция | 1024×1536 RGBA | Desktop `Дочь_2_платный сезонный сет.png`; Figma `325:80` | Daughter Комплект selector |
| Жар-птица | 1024×1536 RGBA | Desktop `Дочь_3_платный сезонный сет.png`; Figma `325:81` | Daughter Комплект selector |
| Лесной дракон | 1024×1536 RGBA | Desktop `Дочь_4_платный сезонный сет.png`; Figma `325:82` | Daughter Комплект selector |

Готовые пользовательские сеты сына — целые персонажи, authoring-only:

| Name | Size | Path | Used-by |
|---|---|---|---|
| Мишка дома | 1024×1536 RGBA | Desktop `Сын_1_базовый сет.png`; Figma `341:70` | Son Комплект selector |
| Команда двора | 1024×1536 RGBA | Desktop `Сын_2_базовый сет.png`; Figma `341:71` | Son Комплект selector |
| Дачный изобретатель | 1024×1536 RGBA | Desktop `Сын_3_базовый сет.png`; Figma `341:72` | Son Комплект selector |
| Морозные узоры | 1024×1536 RGBA | Desktop `Сын_1_платный сезонный сет.png`; Figma `341:73` | Son Комплект selector |
| Звёздная экспедиция | 1024×1536 RGBA | Desktop `Сын_2_платный сезонный сет.png`; Figma `341:74` | Son Комплект selector |
| Жар-птица | 1024×1536 RGBA | Desktop `Сын_3_платный сезонный сет.png`; Figma `341:75` | Son Комплект selector |
| Лесной дракон | 1024×1536 RGBA | Desktop `Сын_4_платный сезонный сет.png`; Figma `341:76` | Son Комплект selector |

## V3 — пользовательские цельные комплекты, runtime-пилот 16.09.2026

Копии без изменения байтов. Исходники предоставлены пользователем; это не отдельная проверка прав для публичного выпуска. Профиль: 1024×1536, цельный персонаж; не смешивать с ULPC-слоями. SHA-256, размеры и источник: `src/preview/wardrobePilot/v3Assets.json`.

| Name | Size | Path | Used-by |
|---|---|---|---|
| V3 father-basic-1 | 1024×1536; 2072693 bytes | `public/assets/game/wardrobe-pilot/v3/father-basic-1.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 father-seasonal-1 | 1024×1536; 2060784 bytes | `public/assets/game/wardrobe-pilot/v3/father-seasonal-1.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 father-basic-2 | 1024×1536; 1876112 bytes | `public/assets/game/wardrobe-pilot/v3/father-basic-2.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 father-seasonal-2 | 1024×1536; 1882991 bytes | `public/assets/game/wardrobe-pilot/v3/father-seasonal-2.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 father-basic-3 | 1024×1536; 2096188 bytes | `public/assets/game/wardrobe-pilot/v3/father-basic-3.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 father-seasonal-3 | 1024×1536; 2192613 bytes | `public/assets/game/wardrobe-pilot/v3/father-seasonal-3.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 father-seasonal-4 | 1024×1536; 2197162 bytes | `public/assets/game/wardrobe-pilot/v3/father-seasonal-4.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 mother-basic-1 | 1024×1536; 1761261 bytes | `public/assets/game/wardrobe-pilot/v3/mother-basic-1.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 mother-seasonal-1 | 1024×1536; 1841819 bytes | `public/assets/game/wardrobe-pilot/v3/mother-seasonal-1.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 mother-basic-2 | 1024×1536; 1620538 bytes | `public/assets/game/wardrobe-pilot/v3/mother-basic-2.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 mother-seasonal-2 | 1024×1536; 1548319 bytes | `public/assets/game/wardrobe-pilot/v3/mother-seasonal-2.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 mother-basic-3 | 1024×1536; 1804921 bytes | `public/assets/game/wardrobe-pilot/v3/mother-basic-3.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 mother-seasonal-3 | 1024×1536; 1694786 bytes | `public/assets/game/wardrobe-pilot/v3/mother-seasonal-3.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 mother-seasonal-4 | 1024×1536; 1711259 bytes | `public/assets/game/wardrobe-pilot/v3/mother-seasonal-4.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 son-basic-1 | 1024×1536; 1791398 bytes | `public/assets/game/wardrobe-pilot/v3/son-basic-1.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 son-seasonal-1 | 1024×1536; 1960889 bytes | `public/assets/game/wardrobe-pilot/v3/son-seasonal-1.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 son-basic-2 | 1024×1536; 1829636 bytes | `public/assets/game/wardrobe-pilot/v3/son-basic-2.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 son-seasonal-2 | 1024×1536; 1972623 bytes | `public/assets/game/wardrobe-pilot/v3/son-seasonal-2.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 son-basic-3 | 1024×1536; 2001521 bytes | `public/assets/game/wardrobe-pilot/v3/son-basic-3.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 son-seasonal-3 | 1024×1536; 2040177 bytes | `public/assets/game/wardrobe-pilot/v3/son-seasonal-3.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 son-seasonal-4 | 1024×1536; 1963325 bytes | `public/assets/game/wardrobe-pilot/v3/son-seasonal-4.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 daughter-basic-1 | 1024×1536; 1831342 bytes | `public/assets/game/wardrobe-pilot/v3/daughter-basic-1.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 daughter-seasonal-1 | 1024×1536; 1896098 bytes | `public/assets/game/wardrobe-pilot/v3/daughter-seasonal-1.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 daughter-basic-2 | 1024×1536; 1866513 bytes | `public/assets/game/wardrobe-pilot/v3/daughter-basic-2.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 daughter-seasonal-2 | 1024×1536; 1808789 bytes | `public/assets/game/wardrobe-pilot/v3/daughter-seasonal-2.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 daughter-basic-3 | 1024×1536; 1932857 bytes | `public/assets/game/wardrobe-pilot/v3/daughter-basic-3.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 daughter-seasonal-3 | 1024×1536; 1870967 bytes | `public/assets/game/wardrobe-pilot/v3/daughter-seasonal-3.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |
| V3 daughter-seasonal-4 | 1024×1536; 1930549 bytes | `public/assets/game/wardrobe-pilot/v3/daughter-seasonal-4.png` | `src/preview/wardrobePilot/V3Pilot.tsx` — isolated preview, not production |

### V3 UI — точные экспорты Figma, 16.09.2026

| Name | Size | Path | Used-by |
|---|---|---|---|
| Navigation strip | 2172×724 | public/assets/game/v3-ui/navigation.png | src/v3/V3App.tsx |
| Wood | 2172×724 | public/assets/game/v3-ui/wood.png | src/v3/v3.css |
| Parchment | 2172×724 | public/assets/game/v3-ui/parchment.png | src/v3/v3.css |

Source: Figma 7D5G4cp3ui5cSlXqbwWIMv, design context 442:198. Bytes downloaded unchanged; no new generated art.

### V3 — первая глава Мира, 21.09.2026
| Name | Size | Path | Used-by |
|---|---|---|---|
| Карта без надписей, Figma 622:4293 | 941×1672 PNG | public/assets/game/v3-ui/world-map.png | src/v3/world.css |
| Первый босс, Figma 622:4292, экспорт для мобильного окна | 394×700 PNG | public/assets/game/v3-ui/first-boss.png | src/v3/WorldPanel.tsx |

| World route (Figma 627:4313) | 941×1672 PNG | public/assets/game/v3-ui/world-route.png | src/v3/WorldPanel.tsx |
| Open location (Figma 622:4294) | 1254×1254 PNG | public/assets/game/v3-ui/world-open.png | src/v3/WorldPanel.tsx, park after victory |
