# Asset Generator — Family Chores RPG

Генерация игровых ассетов через AI (форк пайплайна [godogen](https://github.com/htdt/godogen)).

## Статус

| Компонент | Статус |
|-----------|--------|
| `asset_gen.py` — изображения (Gemini/Grok), видео, 3D | установлен, работает |
| `grid_slice.py` — нарезка китов предметов | работает |
| `find_loop_frame.py` — поиск loop-кадра для спрайтов | работает |
| `rembg_matting.py` + `rembg.md` — удаление фона | требует `pip install rembg[cpu] onnxruntime` |
| Gemini image API | **ключ есть, но free-tier лимит = 0** для image-моделей. Нужен биллинг Google AI Studio (или paid tier) |
| Grok (xAI) video/image | ключа нет (`XAI_API_KEY`) |
| Tripo3D 3D | ключа нет (`TRIPO3D_API_KEY`) |

## Установка зависимостей

```bash
pip install google-genai xai-sdk requests numpy pillow
# для удаления фона:
pip install rembg onnxruntime pymatting
```

## Ключи

Берутся из переменных окружения: `GOOGLE_API_KEY`, `XAI_API_KEY`, `TRIPO3D_API_KEY`.
`GOOGLE_API_KEY` уже лежит в `C:/Users/poddu/AppData/Local/hermes/.env`.

Загрузка перед запуском (git-bash):
```bash
export $(grep -E "^GOOGLE_API_KEY=" "C:/Users/poddu/AppData/Local/hermes/.env" | head -1)
```

## Использование

```bash
# Изображение (после включения биллинга):
python tools/asset-gen/asset_gen.py image --model gemini --size 1K \
  --prompt "pixel-art slime king with crown, solid medium-gray background" \
  -o public/assets/game/entities/bosses/boss2_ref.png

# Кит предметов одной картинкой → нарезка (дёшево: 2-7¢ за набор):
python tools/asset-gen/grid_slice.py kit.png --grid 2x2 --names "sword,potion,key,ring" -o out/

# Анимированный спрайт: референс → поза → видео → кадры → loop-trim → rembg
python tools/asset-gen/asset_gen.py video --image pose.png --duration 2 -o walk.mp4   # 5¢/s
ffmpeg -i walk.mp4 -vsync 0 frames/%04d.png
python tools/asset-gen/find_loop_frame.py frames/
python tools/asset-gen/rembg_matting.py --batch frames/ -o clean/
```

## Правила (из godogen, проверено их опытом)

1. **Никогда не проси у генератора «прозрачный фон»** — нарисует шахматку. Прось сплошной
   цвет под окружение игры (лес → dark-green, подземелье → dark-gray), потом rembg.
2. Ревью каждого PNG до конверсии в 3D — плохая картинка = потерянные 30¢+.
3. Маленькие спрайты: генерируй 1K и режь китом, или рисуй жирные плоские формы.
4. Направление («смотрит влево») ненадёжно — сгенерируй одно и отзеркаль в рантайме.
5. Манифест: каждый ассет → строка в `docs/ASSET_MANIFEST.md`.
6. Подтверждай расход у пользователя перед первой платной генерацией.

## Цены (за генерацию)

| Что | Инструмент | Цена |
|-----|-----------|------|
| Текстура / простой спрайт | Grok image | 2¢ |
| Персонаж / точный референс | Gemini 1K | 7¢ |
| Фон | Grok / Gemini 2K | 2¢ / 10¢ |
| 3D модель из картинки | Tripo GLB | 30¢ (+60¢ HD) |
| Риггинг бипеда | Tripo rig | +25¢ |
| Анимация (ретаргет) | Tripo retarget | 10¢/клип |
| Видео 2с для спрайта | Grok video | ~10¢ |

Полный анимированный персонаж (idle+walk+attack): ≈ 92¢.
