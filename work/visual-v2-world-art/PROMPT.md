# Original world map — visual v2

Date: 2026-09-05. Mode: built-in `image_gen`, one original generation. No CLI/API generation or additional paid credits.

User Image 1 and Image 5 were inspected as visual references: green fantasy valley, winding path, mountains/castle, woodland, water and a mysterious cave. No screenshot crops or inherited UI were used. The generated output contains no text, characters, pets, pins, locks or meters. All five interactive destinations and progress counts are rendered in HTML from the existing enabled boss catalog and defeated IDs.

Generated source: `/Users/dmitrijzdanov/.codex/generated_images/01a06e99-ac8b-7b93-9017-904ec2e5d679/exec-54c7894e-3823-41a2-a013-977e82aaf578.png`.

Preserved source: `work/visual-v2-world-art/world-map-source.png`, 1024×1536.

Runtime: `public/assets/game/demo/world-map-v2.webp`, 1024×1536, 522858 bytes. Local non-semantic format optimization: installed `cwebp -q 86 -m 6`; no resizing or composition edits. Used by `src/demo/AdventureScreen.tsx`.

## Generation prompt

Use case: stylized-concept.
Asset type: production game world-map background, a single tall portrait illustration with aspect ratio 2:3, for a mobile family chores RPG. Original pixel-art-inspired chibi fantasy environment, rich deliberate tiny brush clusters and crisp readable silhouettes, not a UI mockup.
Primary request: a welcoming green fantasy valley with a continuous winding beige footpath joining five visually distinct landmarks. Overhead three-quarter storybook-map view; no horizon except a little sky at the very top. Top: snowy mountain ridge and a red-roofed stone castle. Upper left: magical ancient forest and a small tree sanctuary. Middle right: turquoise river broadening to a peaceful lake with a little waterfall and stone bridge. Lower left: cozy tiny village with orange roofs among gardens. Lower right: intriguing violet-lit cave in a dark rock, mysterious but child-friendly. A river runs down the valley; dense jewel-green trees around the edges, warm sunlight, blue mountain shadows, vivid blue water.
Composition: the five landmarks have breathing room and are spread vertically, joined by an elegant winding pathway from village toward the mountain. Keep the path easy to follow; avoid noisy confetti detail. Main landmarks are legible when the whole image is displayed at 350px wide. No people or animals or characters: these must remain modular UI layers. No baked-in pins, no buttons, no circles, no signs or labels, no borders, no stars, no locks or progress meters, no typography anywhere. No text, letters, numbers, watermark, logos. Full-bleed environment only; no empty exterior canvas. Cohesive polished 16-bit fantasy illustration, friendly and wondrous rather than photorealistic or 3D.

## Layout intent

The source image is approved as a standalone background. Warm parchment labels are HTML buttons: village25/72%, forest22/35%, castle56/17%, lake73/46%, cave72/85%. Each label has a 44px-plus hit area and reflects actual defeated counts, not invented level locks. The complete 49-entry catalog remains available in the book; editor-created entries receive a deterministic display region without a new persisted contract.

Static placement tests cover label rectangles at mobile width; actual browser proof remains the coordinator's read-only visual pass. Do not treat source-art approval as full UI acceptance.

## Code verification

`npm run lint` passed, followed by `npx vitest run tests/demoWorldMap.test.ts tests/demoDomain.test.ts`: 41/41 tests passed on 2026-09-05. `git diff --check` passed. A sandboxed local HTTP request was unavailable (connection code000); HTTP and real mobile screenshots remain for the coordinator. No live demo mutation or reset was attempted.
