# DEMO — original art inventory

Work date: 2026-09-05. Artist workflow: built-in `image_gen`, followed by authorized deterministic PNG slicing / alpha-preserving normalization. No Figma, downloaded Habitica sprites, screenshot crops, paid credits, or image API keys are used for these assets.

All 18 PNG references in `/Users/dmitrijzdanov/Desktop/asset test/` were inspected visually. They are source references only and are not runtime assets. The room direction draws primarily from `16_04_41` and `16_04_48`: warm wood, lamps and hearth, expressive chibi family. The references' UI, labels, embedded people, emoji and stat bars were not imported.

## Runtime contract

| Assets | Canvas | Anchor / use | Verified |
|---|---|---|---|
| `home-fireplace.webp`, `home-library.webp`, `home-conservatory.webp` | 768 × 1152 RGB | Full bleed portrait 2:3. Floor clear from y50%; standing feet y65–88%; quiet carpet y57–76%. | All three visually inspected, no humans/pets/UI; 101–144 KB each. |
| `boss-b01.png` … `boss-b49.png` | 256 × 256 RGBA | Centered silhouette, maximum 224 × 224; feet baseline y240; independent battle/catalog sprite. | All 49 present; visual review of five final groups; alpha 0–255. |
| `pet-p01.png` … `pet-p28.png` | 256 × 256 RGBA | Same 240px baseline, used only after acquisition/equipping. | All 28 present; both final groups visually reviewed; alpha 0–255. |
| `egg.png` | 256 × 256 RGBA | Egg inventory/earned hatch. | Complete, visually reviewed; used in WardrobeScreen introduction and owned-egg badge. |
| `decor/{plant,books,rug,lamp,picture,garland,telescope}.png` | 256 × 256 RGBA | One selected item per shelf/floor/wall slot. | All seven complete, transparent silhouettes, no adjacent-cell fragments. |
| `arena.webp` | 768 × 1152 RGB | Empty friendly forest clearing, independent boss/hero layers. | Complete; visually reviewed with empty foreground, no embedded people/boss/UI. |

Exact source output paths, pixel dimensions, file sizes, source crop rectangles, alpha extrema live in `work/demo-art/generated-files.json`. `work/demo-art/prepare_assets.py` never alters source files. It crops atlas cells (with small safety overlap where necessary), removes only small disconnected border fragments from adjacent cells, preserves alpha, and normalizes silhouettes into a shared canvas. Some built-in results contained a partially opaque glow/background despite an RGBA file; these were not shipped. Built-in background-only edits replaced that backdrop with flat magenta, then the authorized local connectivity chromakey removed it. Review sheets and all intermediate atlases stay in `work/demo-art/`, outside runtime.

Final audit: **89 files, 6,348,783 bytes**, excluding the separately owned character/equipment work. All 85 PNGs are 256 × 256 RGBA with alpha extrema 0–255 and four transparent corners; four scene WEBPs are 768 × 1152 RGB. Reproduce: `python3 work/demo-art/audit_runtime.py`. A read-only HTTP pass on `http://localhost:3000` fetched all 89 final paths: **89 HTTP 200, exact byte lengths, no missing assets**. Exact per-file Name/Size/Path/Used-by rows: `work/demo-art/manifest-fragment.md`, merged into `docs/ASSET_MANIFEST.md`.

## Prompt provenance

Common room prompt: “Finished original game background for warm family chores RPG. Portrait 2:3; chibi pixel-art diorama with contemporary clarity, fine deliberate pixel clusters and dark umber outlines, honey oak, teal, ochre, terracotta and moss. Slightly elevated frontal camera, not isometric. Furniture and back wall upper 55%, unobstructed wooden floor and simple oval rug lower 45%. Full bleed room. No people, animals, faces, silhouettes, text, labels, interface or watermark.”

- Fireplace: honey-oak beams, plaster walls, upper-center brick fireplace, muted sage loveseat, arched indigo dusk window, a few shelves/books/plants. Original output `exec-9f519e89-218a-4000-8dcf-1ecc5ba9ab76.png`.
- Library: fireplace output is style/composition reference. Oak bookcases, jewel-tone books, central arched dusk window, low sage reading bench, brass lamps and a shelf globe. Original output `exec-8abd3a73-be5e-4060-a739-29cfa41d6e3a.png`.
- Conservatory: fireplace output is style/composition reference. Arched greenhouse glazing, snowy evergreens outdoors, warm lanterns, low cushioned bench, terracotta plants grouped against rear wall; open foreground. Original output `exec-b46a4c32-73ea-4268-9700-c577f3b30b9c.png`.

Common creature prompt: “Original transparent sprite atlas for friendly cozy family chibi pixel RPG. Each full-body sprite centered in exact equal grid cell with generous transparent margins, no overlap. Genuinely transparent alpha, no painted checkerboard. Adorable chunky silhouette, strong dark-brown pixel outline, warm limited palette, fine crisp pixel clusters, round expressive eyes, readable at 96px. No scenery/platforms/grid/UI/labels/numbers/emoji/logos/watermark, no realistic horror or violence.” Later creature sheets reference the first generated creature sheet for style only. Per-cell subjects follow the explicit reference mapping below; threatening reference details become rounded friendly fantasy metaphors.

## Boss reference mapping — all 49 source slots

Files use sequential `boss-bNN.png`; entries remain distinct even where two sheets use the same title.

| Source sheet | Runtime numbers | Subjects in original left-to-right, row-by-row order |
|---|---|---|
| `16_10_51` | b01–b08 | Прокрастинация (plum clock hood); Лень (armchair blob king); Хаос (sock/paper whirlwind); Скука (gray book creature); Бардак (cardboard/fabric creature); Ссора (paired wool sprites); Гаджетный гоблин (headphones/tablet); Пожиратель времени (clock belly/hourglasses). |
| `16_23_34` | b09–b20 | Лесной великан; Огненный дракон; Ледяной страж; Тёмный рыцарь; Механический голем; Король слизней; Пират-призрак; Песчаный червь; Ведьма теней; Небесный страж; Древний дракон; Повелитель хаоса. |
| `16_23_40` | b21–b28 | Каменный голем; Лесной дух; Огненный дракон — хранитель; Ледяной великан; Тёмный рыцарь — страж; Король скелетов; Пожиратель времени — хранитель; Механический титан. |
| `16_23_45` | b29–b40 | Гряземонстр; Экранояд; Сладкоежка; Гневозавр; Страхотень; Беспорядок; Поздноход; Забывака; Прокрастинация — ленивец; Самокритик; Сравниватель; Финальный босс. |
| `16_23_53` | b41–b49 | Тёмный экран; Повелитель прокрастинации; Король сладостей; Гора домашки; Вирус отвлечений; Босс гнева; Пластиковый дракон; Экзаменационный страж; Королева скуки. |

## Pet reference mapping

28 distinct designs cover species and noticeable color/breed variants across character sheets `16_10_27`, `16_12_47`, `16_13_27`, `16_13_41`, `16_13_50`, `16_23_34`, `16_23_40`, `16_23_45`, `16_23_53`.

Runtime order p01–p28: ginger kitten, corgi, fox, white rabbit, owl, green baby dragon, fawn, panda, squirrel, turtle, penguin, raccoon, hamster, bluebird, robot, pink axolotl, phoenix, parrot, wolf pup, baby dinosaur, indigo ghost cat, beagle puppy, red baby dragon, unicorn, blue slime, purple cat-dragon, cloud spirit, gray kitten.

## Finishing provenance and visual QA

All 49 boss slots and 28 pet slots now have runtime art; no deduplication or silent substitution. Source sheets remain outside runtime. Final contact sheets inspected at useful resolution:

- `work/demo-art/preview-boss-b01.jpg`, `preview-boss-b09.jpg`, `preview-boss-b21.jpg`, `preview-boss-b29.jpg`, `preview-boss-b41.jpg`.
- `work/demo-art/preview-pet-p01.jpg`, `preview-pet-p17.jpg`, `preview-decor-01.jpg`.
- `public/assets/game/demo/arena.webp`; all three home backgrounds were also visually checked in the original pass.

Final source/edit pairs (built-in imagegen, no external upload or CLI/API fallback):

| Output | Original generated source | Background-only generated edit |
|---|---|---|
| b29–b40 | `01a06e51-573f-7f41-af72-48d8a5430ac9/exec-083c5b22-b97e-47b9-8995-00e9931075c2.png` | Same directory, `exec-04ac3667-8cb4-4ffe-bb70-ff6a58aff6cc.png` |
| b41–b49 | `01a06e51-573f-7f41-af72-48d8a5430ac9/exec-aa4f7973-26d9-41a5-a98e-001e31bd8e72.png` | `01a06e7b-d070-7811-a922-81fad1f3e56f/exec-9da3f326-b036-4e95-b168-a21301327a25.png` |
| p17–p28 | `01a06e51-573f-7f41-af72-48d8a5430ac9/exec-ec7cd151-c704-4eec-a95f-7372ac8fd4d5.png` | `01a06e7b-d070-7811-a922-81fad1f3e56f/exec-ee435a4d-b0a9-412e-ad2c-c1fda9315e92.png` |
| decor + egg | `01a06e51-573f-7f41-af72-48d8a5430ac9/exec-bf040cb7-7b99-474b-b957-63c28340c778.png` | `01a06e7b-d070-7811-a922-81fad1f3e56f/exec-0244ec4d-3c38-429c-ae9c-5dfe347a6275.png` |
| arena | `01a06e51-573f-7f41-af72-48d8a5430ac9/exec-32cbd3ec-982a-4728-acdb-880752afeba2.png` | No edit; resized/encoded as WEBP |

The paths in this table are relative to `/Users/dmitrijzdanov/.codex/generated_images/`.

Finishing prompt for each of the last three atlas edits: “Use case: background-extraction. Edit target is this exact existing original pixel-art atlas. Preserve all individual sprites, colors, faces, anatomy, design, and exact order [3×3 bosses / 4×3 pets / 4×2 objects]. Change ONLY the backdrop: replace the entire background and all diffuse glow/shadows OUTSIDE the full sprites with one perfectly uniform solid #FF00FF magenta chroma-key field. Absolutely no gradients, no checkerboard, no lighting halos on the background. Preserve solid sprite pixels and dark crisp outlines; preserve all limbs, wings, tails, horns, feet, particles, small accessories. Give each sprite an even cell with generous 20px safe margin on every edge so nothing crosses a cell. Original 1536x1024 landscape atlas layout. This is an intermediate image for deterministic alpha extraction; all non-sprite pixels must be exact bright magenta. No labels, no text, no new objects, do not change sprite identities.”

Known rendering scope: these creatures and decor are static PNG illustrations, not animation sprite sheets. Home scene people, equipment layers, and sitting-pose work are maintained separately in `docs/DEMO_CHARACTER_ART.md`. Browser composition/interaction acceptance belongs to the main agent; this inventory verifies asset content, alpha, sizes, mapping and file availability, not every screen interaction.
