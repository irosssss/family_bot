"""Read-only pixel/manifest audit plus a generated visual contact sheet."""
from pathlib import Path
import json
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[2]
out = root / 'public/assets/game/demo'
expected = [out / f'boss-b{i:02}.png' for i in range(1, 50)]
expected += [out / f'pet-p{i:02}.png' for i in range(1, 29)]
expected += [out / 'decor' / f'{name}.png' for name in ['plant', 'books', 'rug', 'lamp', 'picture', 'garland', 'telescope']]
expected += [out / 'egg.png']
expected += [out / f'home-{name}.webp' for name in ['fireplace', 'library', 'conservatory']]
expected += [out / 'arena.webp']
records = json.loads((root / 'work/demo-art/generated-files.json').read_text())
by_path = {r['path']: r for r in records}
errors, verified = [], []
for path in expected:
    rel = str(path.relative_to(root))
    if not path.is_file():
        errors.append(f'Missing {rel}')
        continue
    img = Image.open(path)
    record = by_path.get(rel)
    if not record or record['bytes'] != path.stat().st_size or record['size'] != list(img.size):
        errors.append(f'Metadata mismatch {rel}')
    if path.suffix == '.png':
        if img.mode != 'RGBA' or img.size != (256, 256) or img.getchannel('A').getextrema() != (0, 255):
            errors.append(f'Invalid sprite alpha/size {rel}')
        alpha = img.getchannel('A')
        if any(alpha.getpixel(p) for p in [(0,0),(255,0),(0,255),(255,255)]):
            errors.append(f'Opaque corner {rel}')
    elif img.mode != 'RGB' or img.size != (768, 1152):
        errors.append(f'Invalid backdrop {rel}')
    if path.name.startswith('boss-'):
        used = 'src/demo/catalog.ts; AdventureScreen boss battle, catalog and editor'
    elif path.name.startswith('pet-'):
        used = 'src/demo/catalog.ts; WardrobeScreen catalog/eggs; HomeScreen active pet'
    elif path.parent.name == 'decor':
        used = 'src/demo/catalog.ts; HomeScreen decor preview/equipped; shop/editor'
    elif path.name == 'egg.png':
        used = 'src/demo/WardrobeScreen.tsx; owned egg and hatch card'
    elif path.name == 'arena.webp':
        used = 'src/demo/demo.css; AdventureScreen battle stage background'
    else:
        used = 'src/demo/catalog.ts; HomeScreen room and theme previews'
    verified.append({'name': path.name, 'size': f'{img.width} × {img.height}; {path.stat().st_size:,} B', 'path': rel, 'usedBy': used})
print(json.dumps({'count': len(verified), 'totalBytes': sum(p.stat().st_size for p in expected if p.exists()), 'errors': errors, 'files': verified}, ensure_ascii=False))
if errors:
    raise SystemExit(1)
