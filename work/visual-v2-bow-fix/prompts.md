# Targeted image edit prompts

## Shared prompt

Use case: background-extraction / precise-object-edit.
Asset type: transparent weapon overlay for an existing layered 2D chibi RPG character.
Input image 1 is the edit target, not a loose style reference.
Primary request: remove ONLY the opaque white/checkerboard-filled wedge inside the bow, between its curved wooden limb and the thin straight bowstring. That enclosed space must become genuine fully transparent alpha. Keep the curved limb, the dark/green wrapped hand grip and the thin taut bowstring intact.
Canvas and placement invariants: preserve the entire input canvas, aspect ratio 4:5. The source logical canvas is 256×320. The ONLY painted bow has bounds x=180..223, y=181..299 on that canvas. It occupies the lower-right area, about 17.2% of canvas width and 37.2% of its height. DO NOT recenter, crop, zoom, rotate, mirror, widen or relocate the bow. Keep the rest of the full canvas empty alpha. If rendering at 1024×1280, those exact bow bounds are x=720..895, y=724..1199. The bow's orientation is a curved limb to the left, a straight narrow string to the right.
Style invariants: preserve the existing tiny pixel-art/chibi inventory style, original silhouette, material shades, crisp outline and small detail. This is a surgical alpha cleanup, not a redesign.
Background: genuinely transparent PNG RGBA outside AND inside the bow; no painted checkerboard, no white fill, no white fringe, no shadow, no backdrop, no extra characters, no arrow, no text.
Output: one isolated bow overlay aligned on the original full-size canvas.

## Starter palette suffix

Palette lock: this is the STARTER bow. Retain its brown/copper wood; do not turn it gold.

## Rare palette suffix

Palette lock: this is the RARE bow. Retain its brighter golden/yellow limb and green grip; do not turn it plain brown.

## Retry: actual alpha, not a painted transparency grid

Use case: background-extraction.
Image 1 is the edit target. Its grey-white checker pattern is accidentally PAINTED INTO THE RGB IMAGE. Remove that entire background to actual alpha transparency.
Return a genuine RGBA PNG with alpha=0 in all empty pixels, including the open area BETWEEN the curved bow limb and straight bowstring. Do NOT paint or depict transparency with white, grey, black, or checkerboard. The output file must have an actual alpha channel, not an RGB checkerboard preview.
Keep only the golden/wooden bow, its green grip, crisp outline, and its very thin straight bowstring. All patterned pixels inside the bow must be alpha=0. The string must remain visible and connected to both tips.
Do not redraw or move the bow. Preserve exactly the full 4:5 canvas with this small bow in its lower-right area, same scale, silhouette, orientation, palette and position as the edit target. No recentering, no crop, no scene, no extra object, no text.
This output is a transparent layered character weapon overlay, not a screenshot of a transparency grid.
