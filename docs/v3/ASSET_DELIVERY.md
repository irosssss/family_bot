# V3 — контракт поставки графики

2026-09-09. Папки созданы; активный `src/v3/assets/release.json` содержит `entries: []`. PNG нет. Код уже умеет разрешать точные слоты/варианты, составлять героя, показывать loading/failed без изменения игрового выбора. Отсутствующие ресурсы не запрашиваются. Артдирекция и геометрия пока кандидатные.

Дополнение от 09.09.2026: художественное направление уточнено референсами как мягкий детальный cartoon/chibi; профили и геометрия ещё не приняты. [Аудит](ASSET_ARCHITECTURE_AUDIT.md) фиксирует необходимые исправления оболочки изображения, проверки профиля и композиции сцены. Этот контракт описывает текущий формат, но не подтверждает готовность массовой поставки или наличие полноценного загрузчика.

## Где что лежит

Все пути относительно корня изолированной V3:

```text
art/family-life-v3/
  briefs/                  запросы, эталоны и принятые профили
  sources/                 исходники, референсы, происхождение/лицензии
  exports/                 кандидаты экспортов до приёмки
  review/                  контакты слоёв, скриншоты и замечания
public/assets/game/family_life_v3/v1/
  scenes/home/
  heroes/adult/
  heroes/adult/equipment/outfits/
  heroes/adult/equipment/hand/
  heroes/child/
  heroes/child/equipment/outfits/
  heroes/child/equipment/hand/
  heroes/portraits/
  adventure/bosses/
  adventure/maps/
  pets/eggs/
  pets/companions/
  pets/corners/
  items/outfits/
  items/hand/
  home/furniture/
  home/trophies/
  collections/covers/
  ui/icons/
```

`.gitkeep` только сохраняет пустые каталоги, это не игровой ресурс. Исходники и невыбранные варианты не складывать в `public`. Растровые иконки не обязательны: текущие control icons — lucide. `heroes/portraits` зарезервирован; текущий портрет производится CSS-кадрированием той же сборки `GameHero`, поэтому отдельный PNG портрета для каждой одежды сейчас не требуется.

## Идентичность ресурса

1. `slotId` — место в `registry.ts`: например, `hero.adult`.
2. `variant` — точный контентный вариант; не имя пользователя и не ID его покупки.
3. `state` — статичное состояние из списка этого слота.
4. `profile` — принятая версия геометрии/камеры/rig, например `adult.front.v1`. Одинаковых размеров недостаточно для совместимости.
5. `path` и SHA-256 — конкретные неизменяемые байты PNG.

Игровые кошельки/покупки сохраняют content ID и ownership; пути изображений в них не записываются. Цена, XP, доступность и рост не определяются картинкой.

| UI | Точные варианты текущего клиента |
|---|---|
| Дом | `home.room`, variant `default`, state `base` |
| Взрослый/ребёнок | `hero.adult`/`hero.child`: variant `default`, state `neutral` |
| Одежда на герое | тот же hero slot, variant `outfit:v3.outfit.traveler`, state `neutral` |
| Предмет в руке | тот же hero slot, variant `hand:v3.item.adventure-kit`, state `neutral` |
| Квадратное превью одежды/предмета | `item.outfit`/`item.weapon`, variant равен catalog item ID, state `base` |
| Яйца в магазине | `pet.egg`, variant равен ID яйца (`v3.egg.fox` и т. п.), state `unhatched` |
| Яйцо выбранного питомца | `pet.egg`, variant `v3.pet.cat`/`v3.pet.dog`/`v3.pet.fox`, state `unhatched` или `ready_to_hatch` |
| Питомец | `pet.companion`, variant — вид, state `pet`/`companion` по сохранённому росту |
| Уголок | `pet.corner`, variant `<species>:<theme>`, например `v3.pet.cat:meadow`, state `base`; темы meadow/sky/sand |
| Босс | `boss.main`, variant `forest-keeper`, state `phase_one`/`phase_two`/`phase_three` |
| Карта | `adventure.map`, variant `forest-path`, state `base` |
| Семейная вещь | `home.furniture`, variant `v3.home.reading-lamp`, state `base` |
| Трофей | `family.trophy`, variant `goal`/`adventure`, state `base` |

Общий показ стартового яйца до выбора использует `pet.egg/default/unhatched`. Несколько variants могут ссылаться на одни и те же PNG с тем же hash, если изображение действительно одно. Обложки коллекций и дополнительные states из реестра — план ассортимента, не требование изготовить их до работающего пилота.

## Release manifest

Файл: `src/v3/assets/release.json`. Объект имеет `contract: family_life_v3.assets`, `release: v1`, положительную целую `revision` и массив `entries`. Ниже **образец структуры**, не активная поставка; hash заменить SHA-256 настоящего файла. Размеры 64×80/scale2 также не являются утверждением артдирекции.

```json
{
  "contract": "family_life_v3.assets",
  "release": "v1",
  "revision": 2,
  "entries": [{
    "slotId": "hero.adult",
    "variant": "default",
    "state": "neutral",
    "profile": "adult.front.v1",
    "geometry": "approved",
    "logicalWidth": 64,
    "logicalHeight": 80,
    "pixelScale": 2,
    "layers": [{
      "role": "body_underlayer",
      "path": "/assets/game/family_life_v3/v1/heroes/adult/body_r1.png",
      "sha256": "REPLACE_WITH_REAL_64_HEX_SHA256",
      "width": 128,
      "height": 160
    }]
  }]
}
```

Validator требует: зарегистрированный slot/state, уникальный slot+variant+state, явное `geometry: approved`, корректный profile, целые logical dimensions 1…2048, ту же пропорцию слота, pixelScale 1/2/3/4, уникальные семантические роли в порядке реестра, только локальный PNG внутри `/assets/game/family_life_v3/v1/`. Ни remote URL, ни traversal, ни произвольный путь в `src` не принимаются. Слои имеют полный canvas logical×scale. Имена файлов — lowercase латиница/цифры/`_`/`-`, с `.png`.

`resolveHero` берёт base и точные выбранные outfit/hand variants. Профиль, canvas и scale должны совпасть. Слои одежды заменяют одноимённые роли базы, затем упорядочиваются по реестру. Отсутствующая одежда не превращается в другую одежду: вся сборка остаётся нейтральным местом, выбранное владение сохраняется. Для v1 профиль обязан описывать такую замену ролей; произвольный механизм hide/trim/occlusion не подразумевается. Несовместимую сложную шляпу/позу сначала оформить новым проверенным профилем и расширением renderer.

## Приёмка

1. Принять художественный пилот и записать профиль/происхождение в `art/.../briefs` и `sources`. Все базовые и носимые слои одной сборки держать в общем canvas. Проверить бесплатную базу после снятия вещей.
2. Вывести кандидаты в `art/.../exports`, осмотреть alpha, контуры, границы, руки/волосы и пару adult/child. Подробный чеклист — [ASSET_INSERTION_GUIDE.md](ASSET_INSERTION_GUIDE.md).
3. Поместить только выбранные подключаемые PNG в runtime, добавить точные entries, увеличить revision. Для уже выпущенных bytes использовать новый filename/revision, не перезаписывать старый файл. Новый release `v2` потребует явного обновления allowlist/профиля и совместимости.
4. Запустить `npm run v3:assets:check`: проверяются PNG signature, реальные ширина/высота, hash и отсутствие неучтённых файлов в runtime. Это не полная проверка декодирования/alpha — их осматривают на следующем шаге.
5. Проверить настоящую загрузку, ошибку PNG, неподдерживаемый профиль, несколько слоёв, предмет на взрослом/ребёнке и один и тот же облик в герое/доме/семье/приключении на 375/390. Loading и failed сохраняют геометрию. При failed обновление страницы повторяет загрузку; отдельной кнопки retry рисунка пока нет.
6. Добавить реальную строку Name/Size/Path/Used-by в `docs/ASSET_MANIFEST.md`; источник, лицензию, bytes/hash, принятый profile и review evidence сохранить рядом с авторскими материалами.

Текущий local runtime обслуживает только этот V3 asset root. Статическая Vite-сборка не копирует весь legacy `public`; при выпуске нужно отдельно включить проверенные manifest PNG. Наличие файла или готовой клиентской сборки не означает публикацию.
