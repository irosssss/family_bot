"""Normalize authorized generated game assets; never alters source artwork.

Usage: python3 work/demo-art/prepare_assets.py scene SOURCE NAME
       python3 work/demo-art/prepare_assets.py sheet SOURCE COLS ROWS PREFIX START COUNT
Sprites retain real generated alpha and are centered on uniform 256px canvases.
"""
from pathlib import Path
import json
import sys
from PIL import Image, ImageDraw
from collections import deque

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/game/demo'
WORK = ROOT / 'work/demo-art'
OUT.mkdir(parents=True, exist_ok=True)
WORK.mkdir(parents=True, exist_ok=True)


def metadata(path, image, source, bounds=None):
    return {'path': str(path.relative_to(ROOT)), 'source': str(source), 'size': list(image.size),
            'mode': image.mode, 'bytes': path.stat().st_size,
            'alphaExtrema': list(image.getchannel('A').getextrema()) if image.mode == 'RGBA' else None,
            'sourceBounds': bounds}


mode, source, *args = sys.argv[1:]
source = Path(source)
image = Image.open(source)
records = []
if mode == 'key':
    result = image.convert('RGBA')
    pixels = result.load()
    queue = deque()
    seen = set()
    for x in range(result.width):
        queue.extend(((x,0),(x,result.height-1)))
    for y in range(result.height):
        queue.extend(((0,y),(result.width-1,y)))
    for y in range(0,result.height,2):
        for x in range(0,result.width,2):
            r,g,b,a = pixels[x,y]
            if r > 200 and b > 200 and g < 20:
                queue.append((x,y))
    while queue:
        x,y = queue.popleft()
        if (x,y) in seen or not (0 <= x < result.width and 0 <= y < result.height):
            continue
        seen.add((x,y))
        r,g,b,a = pixels[x,y]
        if r > 75 and b > 75 and abs(r-b) < 65 and g < min(r,b)*.43:
            pixels[x,y] = (0,0,0,0)
            queue.extend(((x-1,y),(x+1,y),(x,y-1),(x,y+1)))
    # Flat-key enclosed holes use the same exact chroma color.
    for y in range(result.height):
        for x in range(result.width):
            r,g,b,a = pixels[x,y]
            if r > 210 and b > 210 and g < 30:
                pixels[x,y] = (0,0,0,0)
    path = WORK / args[0]
    result.save(path, optimize=True)
    print(str(path))
    sys.exit(0)
elif mode == 'scene':
    result = image.convert('RGB').resize((768, 1152), Image.Resampling.LANCZOS)
    path = OUT / (f'{args[0]}.webp' if args[0] == 'arena' else f'home-{args[0]}.webp')
    result.save(path, quality=88, method=6)
    records.append(metadata(path, result, source))
elif mode == 'sheet':
    cols, rows, prefix, start, count, *extra = args
    cols, rows, start, count = int(cols), int(rows), int(start), int(count)
    overlap = int(extra[0]) if extra else 0
    x_overlap = 0 if len(extra) > 1 and extra[1] == 'y' else overlap
    image = image.convert('RGBA')
    if image.getchannel('A').getextrema()[0] == 255:
        raise ValueError('Generated sheet has no transparency: must regenerate genuine alpha.')
    image.putalpha(image.getchannel('A').point(lambda a: a if a >= 32 else 0))
    previews = Image.new('RGB', (cols * 256, rows * 280), '#e9dcc1')
    draw = ImageDraw.Draw(previews)
    for i in range(count):
        col, row = i % cols, i // cols
        bounds = (max(0, round(col * image.width / cols)-x_overlap), max(0, round(row * image.height / rows)-overlap),
                  min(image.width, round((col + 1) * image.width / cols)+x_overlap), min(image.height, round((row + 1) * image.height / rows)+overlap))
        tile = image.crop(bounds)
        # Atlas cells may contain a disconnected pixel sliver from an adjacent
        # creature. Remove only border-touching small components, never the main
        # sprite or its contained floating particles; source sheet stays intact.
        pixels = tile.load()
        seen = set()
        edge = [(x, y) for x in range(tile.width) for y in (0, tile.height-1)]
        edge += [(x, y) for y in range(tile.height) for x in (0, tile.width-1)]
        for start_point in edge:
            if start_point in seen or pixels[start_point][3] <= 10:
                continue
            queue, component = deque([start_point]), []
            seen.add(start_point)
            while queue:
                x, y = queue.popleft()
                component.append((x, y))
                for point in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                    px, py = point
                    if 0 <= px < tile.width and 0 <= py < tile.height and point not in seen and pixels[point][3] > 10:
                        seen.add(point)
                        queue.append(point)
            if len(component) < tile.width * tile.height * .10:
                for point in component:
                    pixels[point] = (0, 0, 0, 0)
        visible = tile.getchannel('A').getbbox()
        if not visible:
            raise ValueError(f'Empty sprite at {i}')
        tile = tile.crop(visible)
        tile.thumbnail((224, 224), Image.Resampling.LANCZOS)
        result = Image.new('RGBA', (256, 256))
        result.alpha_composite(tile, ((256 - tile.width) // 2, 240 - tile.height))
        suffix = f'{start+i:02d}'
        filename = f'{prefix}{suffix}.png'
        if prefix == 'decor-':
            names = ['decor/plant', 'decor/books', 'decor/rug', 'decor/lamp', 'decor/picture', 'decor/garland', 'decor/telescope', 'egg']
            filename = names[start+i-1] + '.png'
        path = OUT / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        result.save(path, optimize=True)
        records.append(metadata(path, result, source, list(bounds)))
        previews.paste(result, (col * 256, row * 280), result)
        draw.text((col * 256 + 8, row * 280 + 258), path.name, fill='#3c3028')
    previews.save(WORK / f'preview-{prefix}{start:02d}.jpg', quality=92)
else:
    raise ValueError(mode)
record_file = WORK / 'generated-files.json'
existing = json.loads(record_file.read_text()) if record_file.exists() else []
paths = {r['path'] for r in records}
existing = [r for r in existing if r['path'] not in paths] + records
record_file.write_text(json.dumps(existing, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'files': [r['path'] for r in records], 'totalBytes': sum(r['bytes'] for r in records)}, ensure_ascii=False))
