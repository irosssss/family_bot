"""Prepare the palette-only imagegen edit without inventing new drawn artwork."""
from collections import deque
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import importlib.util
import json
from prepare import place, body_variant, CLASSES, SKINS, SIZE

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'work/demo-character'
ART = ROOT / 'public/assets/game/demo/characters'
ITEMS = ROOT / 'public/assets/game/demo/items'
spec = importlib.util.spec_from_file_location('sitting', WORK / 'prepare-sitting.py')
sitting = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sitting)


def extract(atlas, col, row):
    cell = atlas.crop((round(col * atlas.width / 4), round(row * atlas.height / 2),
                       round((col + 1) * atlas.width / 4), round((row + 1) * atlas.height / 2))).convert('RGBA')
    pixels = cell.load()
    width, height = cell.size
    queue = deque([(x, 0) for x in range(width)] + [(x, height - 1) for x in range(width)]
                  + [(0, y) for y in range(height)] + [(width - 1, y) for y in range(height)])
    seen = set()
    while queue:
        x, y = queue.popleft()
        if (x, y) in seen or not (0 <= x < width and 0 <= y < height):
            continue
        seen.add((x, y))
        r, g, b, a = pixels[x, y]
        # Generated background is neutral checker; cream scarf and skin are chromatic.
        if min(r, g, b) >= 193 and max(r, g, b) - min(r, g, b) < 23:
            pixels[x, y] = (r, g, b, 0)
            queue.extend([(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)])
    return cell.crop(cell.getbbox())


def composite(klass, rare, pose):
    doll = Image.new('RGBA', SIZE)
    folder = ART / ('sitting' if pose == 'sitting' else '')
    doll.alpha_composite(Image.open(folder / f'{"rare" if rare else "starter"}-{klass}-body-peach.png'))
    for filename in ['head-peach.png', 'hair-short-chestnut.png']:
        doll.alpha_composite(Image.open(ART / filename))
    return doll


def main():
    source = Image.open(WORK / 'rare-palette-source.png')
    report = []
    for row, pose in enumerate(['standing', 'sitting']):
        folder = ART / ('sitting' if pose == 'sitting' else '')
        folder.mkdir(parents=True, exist_ok=True)
        for col, klass in enumerate(CLASSES):
            layer = place(extract(source, col, row), 148, y=151, height=153)
            for skin in SKINS:
                variant = body_variant(layer, skin, False) if pose == 'standing' else sitting.skin_variant(layer, skin)
                file = folder / f'rare-{klass}-body-{skin}.png'
                variant.save(file, optimize=True)
                report.append({'path': str(file.relative_to(ROOT)), 'size': list(variant.size), 'alpha': list(variant.getchannel('A').getextrema())})
            if pose == 'standing':
                cut = layer.crop(layer.getbbox())
                cut.thumbnail((180, 200), Image.Resampling.NEAREST)
                tile = Image.new('RGBA', (224, 224))
                tile.alpha_composite(cut, ((224 - cut.width) // 2, (224 - cut.height) // 2))
                tile.save(ITEMS / f'rare-{klass}-body.png', optimize=True)

    # Real 100px and 130px Character canvases side by side; not enlarged thumbnails.
    review = Image.new('RGB', (1110, 715), '#ecdcc0')
    draw = ImageDraw.Draw(review)
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 13)
    for row, (pose, size) in enumerate([('standing', 100), ('standing', 130), ('sitting', 100), ('sitting', 130)]):
        y = 20 + row * 174
        for col, klass in enumerate(CLASSES):
            x = 20 + col * 275
            draw.text((x, y), f'{klass} / {pose} / {size}px', font=font, fill='#453020')
            for index, rare in enumerate([False, True]):
                doll = composite(klass, rare, pose).resize((round(size * .8), size), Image.Resampling.NEAREST)
                review.paste(doll, (x + 8 + index * 118, y + 19), doll)
                draw.text((x + 8 + index * 118, y + 20 + size), 'Редкий' if rare else 'Стартовый', font=font, fill='#453020')
    review.save(WORK / 'rare-comparison-100-130.png')
    (WORK / 'rare-palette-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')

    assets = []
    for file in sorted(ART.glob('*.png')):
        with Image.open(file) as image:
            assets.append({'name': file.name, 'size': file.stat().st_size, 'width': image.width,
                           'height': image.height, 'mode': image.mode,
                           'alpha_extrema': image.getchannel('A').getextrema()})
    (WORK / 'assets.json').write_text(json.dumps(assets, indent=2) + '\n')

    # Refresh the existing manifest fragments after replacing the approved rare files.
    for output, paths, prefix in [
        (WORK / 'manifest.md', sorted(ART.glob('*.png')) + sorted(ITEMS.glob('*.png')), ''),
        (WORK / 'sitting-manifest.md', sorted((ART / 'sitting').glob('*.png')), 'sitting/'),
    ]:
        rows = ['| Name | Size | Path | Used-by |', '|---|---|---|---|']
        for file in paths:
            with Image.open(file) as image:
                consumer = '`src/demo/Character.tsx`' if 'characters' in file.parts else '`src/demo/catalog.ts`, wardrobe/editor'
                rows.append(f'| {prefix}{file.stem} | {image.width}×{image.height}, {file.stat().st_size} B | `{file.relative_to(ROOT)}` | {consumer} |')
        output.write_text('\n'.join(rows) + '\n')
    print(json.dumps({'updatedRareLayers': len(report), 'updatedItemPreviews': 4, 'review': str(WORK / 'rare-comparison-100-130.png')}))


if __name__ == '__main__':
    main()
