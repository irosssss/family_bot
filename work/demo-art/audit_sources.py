from pathlib import Path
from PIL import Image, ImageDraw

source = Path('/Users/dmitrijzdanov/.codex/generated_images/01a06e51-573f-7f41-af72-48d8a5430ac9')
files = sorted(source.glob('*.png'), key=lambda p: p.stat().st_mtime)
sheet = Image.new('RGB', (1000, ((len(files)+3)//4)*230), '#e9dcc1')
draw = ImageDraw.Draw(sheet)
for i, path in enumerate(files):
    img = Image.open(path)
    alpha = img.getchannel('A').getextrema() if img.mode == 'RGBA' else None
    print(i, path.name, img.size, img.mode, alpha)
    img.thumbnail((240, 190))
    x, y = i % 4 * 250, i // 4 * 230
    sheet.paste(img, (x+(250-img.width)//2,y), img if img.mode == 'RGBA' else None)
    draw.text((x+4,y+194), f'{i} {path.name[:18]}', fill='#302820')
    draw.text((x+4,y+210), f'{alpha}', fill='#302820')
sheet.save('work/demo-art/source-review.jpg', quality=90)
