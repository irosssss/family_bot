# Rogue bow alpha repair candidates

Date: 2026-09-05.

Scope: non-destructive candidates only; no runtime replacement or game-state action.

Both existing 256×320 character-overlay PNGs contain an opaque white/checker-pattern wedge between their bow limb and bowstring. The requested change is to remove that wedge, leaving true alpha transparency while preserving the bow shape, grip, thin string, palette and placement.

Sources:
- `public/assets/game/demo/characters/starter-rogue-weapon.png`
- `public/assets/game/demo/characters/rare-rogue-weapon.png`

Generation method: built-in `image_gen`, one targeted edit per source. No API key, paid CLI fallback or hand-painted alpha removal.

## Outcome: no acceptable transparent candidate

Two targeted built-in edit attempts were made for each bow (four generated PNGs total). All four results were visually inspected and checked with Pillow and `sips`. Each is **RGB 1122×1402, without an alpha channel**. The apparent transparency is a painted white/grey checker pattern, including the enclosed area inside the bow. Converting RGB to RGBA alone would keep that entire area opaque, so no such conversion is presented as a repair.

The thin straight bowstring, brown/gold limb and green grip remain visually recognizable. However, the output is not a drop-in overlay: in addition to lacking alpha, the generator slightly changed the bow's position and size. No runtime file, item thumbnail or game state was changed. No manual painting, threshold alpha deletion or CLI/API fallback was used.

Rejected candidates retained for provenance:

| File | Built-in generation ID | Mode | Dark/colored silhouette bounds mapped to 256×320 |
| --- | --- | --- | --- |
| `starter-generated-v1-rgb-rejected.png` | `exec-cc948841-1cfa-4bbb-84dd-eb5e37b58ddf.png` | RGB, no alpha | [174.09, 170.73, 219.72, 292.61] |
| `rare-generated-v1-rgb-rejected.png` | `exec-e5b1a66d-418b-4af0-a007-f7c58efb032c.png` | RGB, no alpha | [177.06, 172.33, 224.29, 295.12] |
| `starter-generated-v2-rgb-rejected.png` | `exec-97a56f5e-6ecf-4cea-a060-84f05984c028.png` | RGB, no alpha | [174.32, 166.85, 220.41, 288.96] |
| `rare-generated-v2-rgb-rejected.png` | `exec-000f1070-e344-4bfa-ae31-05e1997e8127.png` | RGB, no alpha | [176.14, 172.10, 222.92, 295.12] |

Generated originals remain in `/Users/dmitrijzdanov/.codex/generated_images/01a06e99-2a0a-76a0-be65-a0c586de14f4/`. The first prompts edited the respective runtime sources; the second prompt edited each retained v1 candidate. Exact prompts are in `prompts.md`.

## Alignment and acceptance contract for the next candidate

- Full transparent canvas must remain exactly 256×320.
- Both runtime source nonzero-alpha bounding boxes are `(180, 181, 224, 300)` (right/bottom exclusive). Preserve this 44×119 footprint, with limb to the left and taut string to the right; no mirroring or recentering.
- Source interior pixel `(207,237)` is `(253,254,253,255)` and must instead be genuinely transparent, not painted white or checkerboard.
- The grip must retain its source position near `(190,240)` so it still meets the paper-doll hand. Bounding-box alignment alone is not sufficient: inspect hand/grip registration at actual character render sizes.
- Keep the string visible, thin and connected to both bow tips. Review against the dark arena and a colored background.
- Preserve the distinct starter brown/copper and rare golden/yellow palettes.
- Only after those checks should the coordinator decide whether to replace the two runtime weapon layers and mechanically regenerate their existing item thumbnails.

The silhouette bounds above are diagnostic estimates using non-light RGB pixels (`min(R,G,B) < 200`), not alpha masks and not an automatic repair. Further extraction requires an explicit revised workflow; this task stopped after the repeat transparency failure rather than silently applying hand-edited alpha.
