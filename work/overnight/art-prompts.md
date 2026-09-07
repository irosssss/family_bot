# Вечерний runtime-фон

Встроенный image_gen, edit по responsive masterv4. Не CLI, не SpriteCook. Сначала чистый фон, текущие прозрачные персонажи берутся из настоящей общей системы внешности, а не запекаются в комнате.

```text
Use case: precise-object-edit.
Edit target: the supplied wide evening family living-room illustration.
Change ONLY this: remove all four family members and the little toy held by the daughter, and reconstruct the sofa/window ledge/rug areas they covered.
Keep EVERYTHING ELSE invariant: exact wide16:9 framing and camera, image proportions, centered sofa at the same size and location, tan cushions and purple side pillows, fireplace against the left wall, blue nighttime window and curtains, books/plants/cabinets, warm light, floorboards and rug, crisp pixel-art style and palette. No zoom, no crop, no widening or shrinking the furniture, no moving the window or hearth. Preserve the interior pixels outside the removed people as faithfully as possible.
The result is a clean game background: zero people, zero animals, zero toys, zero names, zero UI, no text. The sofa remains completely in place, now empty. Do NOT replace people with cushions, objects or pets. Only reconstruct genuinely occluded existing surfaces. Keep the full original landscape canvas. Output one opaque PNG-like background, not transparent, not a collage. This will receive separately rendered real customizable characters in the app; do not draw any silhouettes or placement markers.
```
