# Подложка вечернего дома

Режим: встроенный image_gen; edit по локальному оригиналу05. Это рабочий кандидат вне runtime. Прозрачность не требуется для этой подложки. Люди/питомцы/UI намеренно отсутствуют, но исходная базовая мебель сохранена.

## Промпт первой итерации

```text
Use case: precise-object-edit.
Asset type: clean layered-game background candidate; NOT a new room design, NOT a mockup.
Edit target: the supplied collage, ONLY its TOP-LEFT home panel. Ignore the seven other screens. The canonical scene is the evening home in that panel.
Primary request: extract and carefully reconstruct that exact evening room as ONE tall portrait background, without the characters, animals, labels or application UI. Use approximately the original home panel region x=0..245 and y=100..632 of the 941x1672 source: start at the evening window wall, end at the front rug just above the task button. Output one full-bleed approximately 1:2 portrait image (for example 1024x2048), never a collage.
Preserve invariants: same near frontal camera; same blue nighttime narrow window upper middle; same dark timber wall and warm amber light; same plants climbing the left side and books on the right; same broad close sofa across the central width; same low hearth/fire BELOW the family seating zone; same partial rug in the lower foreground. Keep all visible authored architectural details and furniture as close to the source as possible. Do not relocate the fireplace to the rear wall, do not relocate the sofa to the far left, do not introduce a panoramic window, do not widen the room. Do not create a new long empty floor.
Removal: remove all four people, all animals, the floating name/level plates, top app header, quotation lettering, task button and bottom navigation. Reconstruct only the sofa cushions, wall and floor portions hidden by those removed elements. Keep the basic furniture; removing people must not remove the sofa or move it. Any plaque left on the wall has no lettering.
Style: preserve the source's crisp pixel-art clusters, strong dark edge definition, warm wood and amber local lighting with deep midnight blue contrast. Clear intentional pixels, no soft painted gradients, no 3D, no watercolor, no blur, no photoreal materials, no generic smooth chibi illustration. The source is low-resolution; restore missing detail conservatively without inventing objects.
Constraints: zero people, zero pets, zero UI, zero text, zero letters or numbers, no icons, no frame outside the room. The scene remains densely furnished and intimate exactly as the original, with a sofa seating area ready for separate large family layers. The fireplace remains below it. No additional furniture or purchasable decor. This is background preparation, not the completed family scene.
```

## Вторая итерация — только вертикальное кадрирование

После независимой сверки: кандидат01 добавляет пустую стену сверху и слишком большую долю переднего ковра. Не менять мебель или свет.

```text
Use case: precise-object-edit.
Edit target: image 1, the clean evening room background candidate. Image 2 is the canonical source collage: ONLY its top-left home panel, interior approximately x0..245 y100..632.
Make one correction only: match the VERTICAL FRAMING and proportions of that canonical interior. The candidate has an unwanted dark empty timber strip above the window and too much empty foreground rug. Remove that unnecessary upper wall and reduce the foreground floor/rug, bringing the close sofa/family seating area into the same prominent vertical position as the reference. The upper edge should start just above the night window, as in source, not at a ceiling or large blank dark strip. Target roughly 1:2.1 portrait framing; do not shrink the sofa to make more floor.
Keep all existing architectural objects in the same relative arrangement: night window middle, plants left, parchment frame and books right, broad close sofa, low hearth BELOW the seating area, small partial front rug. Keep the exact same furniture design, materials, dark pixel outlines, colour palette, warm lighting. Retain the full sofa and hearth. Do not zoom out or add wall/floor to satisfy the canvas ratio. No redecoration, no new objects, no changes in time of day, no relocated fireplace, no family or animals, no UI or words. Preserve crisp pixel-art cluster edges and do not soften the image.
This is a clean room asset, not the completed scene. Output ONE image, not a collage.
```
