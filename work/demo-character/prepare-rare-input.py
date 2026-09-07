"""Assemble existing generated outfit cells for one palette-only imagegen edit."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'public/assets/game/demo/characters'
atlas = Image.new('RGBA', (1024, 640))
for row, pose in enumerate(['', 'sitting']):
    for col, klass in enumerate(['warrior', 'mage', 'healer', 'rogue']):
        layer = Image.open(ART / pose / f'starter-{klass}-body-peach.png')
        cut = layer.crop(layer.getbbox())
        cut.thumbnail((220, 264), Image.Resampling.NEAREST)
        cut = cut.resize((round(cut.width * 1.4), round(cut.height * 1.4)), Image.Resampling.NEAREST)
        atlas.alpha_composite(cut, (col * 256 + (256 - cut.width) // 2, row * 320 + (320 - cut.height) // 2))
atlas.save(ROOT / 'work/demo-character/rare-edit-input.png')
