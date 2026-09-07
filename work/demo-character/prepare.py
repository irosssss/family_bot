"""Deterministic preparation of the original generated modular raster atlas.

This performs cell extraction, checkerboard-to-alpha segmentation, resizing and
palette mapping only. It does not synthesize/draw character artwork.
"""
from pathlib import Path
from collections import deque
from PIL import Image, ImageOps, ImageDraw, ImageFont
import colorsys
import json
import runpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/game/demo/characters'
ITEMS = ROOT / 'public/assets/game/demo/items'
WORK = ROOT / 'work/demo-character'
SOURCE = WORK / 'source-atlas.png'
SIZE = (256, 320)
SKINS = ['peach', 'warm', 'brown', 'deep']
HAIRS = ['short', 'bob', 'long', 'curly', 'ponytail']
CLASSES = ['warrior', 'mage', 'healer', 'rogue']
COLORS = ['chestnut', 'blond', 'black', 'ginger', 'silver']


def alpha_cell(atlas, col, row, closed_hole=False):
    w, h = atlas.size
    bounds = (round(col*w/5), round(row*h/4), round((col+1)*w/5), round((row+1)*h/4))
    cell = atlas.crop(bounds).convert('RGBA')
    pix = cell.load()
    cw, ch = cell.size
    visited = set()
    queue = deque([(x,0) for x in range(cw)] + [(x,ch-1) for x in range(cw)] + [(0,y) for y in range(ch)] + [(cw-1,y) for y in range(ch)])
    if closed_hole:
        # The mouth opening is the only closed transparent region of a beard cutout.
        queue.append((cw//2, round(ch * (0.60 if row == 0 else 0.39))))
    while queue:
        x,y = queue.popleft()
        if (x,y) in visited or not (0 <= x < cw and 0 <= y < ch):
            continue
        visited.add((x,y))
        r,g,b,a = pix[x,y]
        is_hair = row == 1 or (col == 4 and row in (0,2))
        if min(r,g,b) >= (185 if is_hair else 194) and max(r,g,b)-min(r,g,b) < (50 if is_hair else 22):
            pix[x,y] = (r,g,b,0)
            queue.extend(((x-1,y),(x+1,y),(x,y-1),(x,y+1)))
    # The generated atlas follows the grid closely, but a curl or crystal tip can
    # extend a few pixels into the neighbouring cell. Preserve the main component.
    components=[]
    seen=set()
    for y in range(ch):
        for x in range(cw):
            if (x,y) in seen or pix[x,y][3]==0:
                continue
            points=[]
            queue=deque([(x,y)])
            while queue:
                px,py=queue.popleft()
                if (px,py) in seen or not (0<=px<cw and 0<=py<ch) or pix[px,py][3]==0:
                    continue
                seen.add((px,py)); points.append((px,py))
                queue.extend((px+dx,py+dy) for dx,dy in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,1),(-1,1),(1,-1)])
            components.append(points)
    if components:
        main=max(components,key=len)
        for component in components:
            if component is not main:
                for x,y in component:
                    r,g,b,a=pix[x,y]
                    pix[x,y]=(r,g,b,0)
    box = cell.getbbox()
    return cell.crop(box) if box else cell


def place(cutout, width, x=None, y=0, height=None):
    width = round(width)
    height = round(height if height else cutout.height*width/cutout.width)
    resized = cutout.resize((width,height), Image.Resampling.NEAREST)
    layer = Image.new('RGBA', SIZE, (0,0,0,0))
    layer.alpha_composite(resized, (round(x if x is not None else (SIZE[0]-width)/2), round(y)))
    return layer


def hair_palette(image, color):
    if color == 'chestnut':
        return image.copy()
    result = image.copy()
    data = []
    for r,g,b,a in result.get_flattened_data():
        if a == 0:
            data.append((r,g,b,a)); continue
        h,s,v = colorsys.rgb_to_hsv(r/255,g/255,b/255)
        if color == 'black':
            rr,gg,bb = colorsys.hsv_to_rgb(.075,.25,max(.075,v*.46))
        elif color == 'blond':
            rr,gg,bb = colorsys.hsv_to_rgb(.105,max(.34,s*.82),min(.99,v*1.36+.10))
        elif color == 'ginger':
            rr,gg,bb = colorsys.hsv_to_rgb(.04,min(.91,s*1.08),min(.92,v*1.17+.03))
        else:
            rr,gg,bb = colorsys.hsv_to_rgb(.10,.07,min(.95,v*1.20+.16))
        data.append((round(rr*255),round(gg*255),round(bb*255),a))
    result.putdata(data)
    return result


def body_variant(image, skin, rare):
    # Isolate only the generated exposed mitten skin by its warm peach palette.
    # Do not recolor brown leather, brass or cream textile highlights.
    result = image.copy()
    data = []
    multipliers = {'peach':(1,1,1), 'warm':(.90,.74,.55), 'brown':(.67,.47,.34), 'deep':(.45,.30,.22)}
    for index,(r,g,b,a) in enumerate(result.get_flattened_data()):
        h,s,v = colorsys.rgb_to_hsv(r/255,g/255,b/255)
        x,y=index%SIZE[0],index//SIZE[0]
        hand_area = 213 <= y <= 260 and (x < 85 or x > 170)
        if a and hand_area and r > 148 and .045 < h < .14 and r > g*1.10 and .22 < s < .72:
            mr,mg,mb = multipliers[skin]
            r,g,b = round(r*mr),round(g*mg),round(b*mb)
        elif a and rare:
            # A clearly visible cosmetic finish; no change to combat power.
            if (h > .42 and s > .25) or (.16 < h < .38 and s > .15):
                rr,gg,bb = colorsys.hsv_to_rgb((h+.085)%1,min(.90,s*1.12),min(1,v*1.17))
                r,g,b = round(rr*255),round(gg*255),round(bb*255)
        data.append((r,g,b,a))
    result.putdata(data)
    return result


def weapon_variant(image, rare):
    if not rare:
        return image.copy()
    result=image.copy()
    data=[]
    for r,g,b,a in result.get_flattened_data():
        h,s,v=colorsys.rgb_to_hsv(r/255,g/255,b/255)
        if a and s>.28 and v>.25:
            rr,gg,bb=colorsys.hsv_to_rgb((h+.04)%1,s*.75,min(1,v*1.28))
            r,g,b=round(rr*255),round(gg*255),round(bb*255)
        data.append((r,g,b,a))
    result.putdata(data)
    return result


def save(name, image):
    image.save(OUT / (name+'.png'), optimize=True)


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    ITEMS.mkdir(parents=True,exist_ok=True)
    WORK.mkdir(parents=True,exist_ok=True)
    atlas=Image.open(SOURCE)
    cuts={}
    for i,skin in enumerate(SKINS):
        cuts['head-'+skin]=alpha_cell(atlas,i,0)
        save('head-'+skin,place(cuts['head-'+skin],144,y=32,height=132))
    for i,hair in enumerate(HAIRS):
        cut=alpha_cell(atlas,i,1)
        width = {'short':174,'bob':171,'long':180,'curly':181,'ponytail':173}[hair]
        layer=place(cut,width,y=4 if hair=='ponytail' else 13)
        for color in COLORS:
            save('hair-'+hair+'-'+color,hair_palette(layer,color))
    for i,klass in enumerate(CLASSES):
        cut=alpha_cell(atlas,i,2)
        layer=place(cut,148,y=151,height=153)
        for skin in SKINS:
            for rare in [False,True]:
                save(('rare-' if rare else 'starter-')+klass+'-body-'+skin,body_variant(layer,skin,rare))
        cut=alpha_cell(atlas,i,3)
        layer=place(cut,44,x=180,y=181,height=119)
        for rare in [False,True]:
            save(('rare-' if rare else 'starter-')+klass+'-weapon',weapon_variant(layer,rare))
    for row,name in [(0,'short'),(2,'full')]:
        cut=alpha_cell(atlas,4,row,closed_hole=True)
        layer=place(cut,131,y=113,height=71 if name=='short' else 95)
        for color in COLORS:
            save('beard-'+name+'-'+color,hair_palette(layer,color))

    # Preserve the subsequently approved imagegen palette edit when regenerating.
    if (WORK/'rare-palette-source.png').exists():
        runpy.run_path(str(WORK/'prepare-rare.py'),run_name='__main__')

    for klass in CLASSES:
        for kind in ['body','weapon']:
            for rare in [False,True]:
                key=('rare-' if rare else 'starter-')+klass+'-'+kind
                layer=Image.open(OUT/(key+('-peach' if kind=='body' else '')+'.png'))
                cut=layer.crop(layer.getbbox())
                cut.thumbnail((180,200),Image.Resampling.NEAREST)
                tile=Image.new('RGBA',(224,224))
                tile.alpha_composite(cut,((224-cut.width)//2,(224-cut.height)//2))
                tile.save(ITEMS/(('rare-' if rare else '')+klass+'-'+kind+'.png'),optimize=True)

    audit=[]
    for file in sorted(OUT.glob('*.png')):
        with Image.open(file) as img:
            audit.append({'name':file.name,'size':file.stat().st_size,'width':img.width,'height':img.height,'mode':img.mode,'alpha_extrema':img.getchannel('A').getextrema()})
    (WORK/'assets.json').write_text(json.dumps(audit,indent=2)+'\n')
    manifest=['| Name | Size | Path | Used-by |','|---|---|---|---|']
    for file in sorted(OUT.glob('*.png'))+sorted(ITEMS.glob('*.png')):
        if file.parent==ITEMS and not any(file.name.startswith(prefix) for prefix in CLASSES+['rare-']):
            continue
        with Image.open(file) as img:
            manifest.append(f'| {file.stem} | {img.width}×{img.height}, {file.stat().st_size} B | `{file.relative_to(ROOT)}` | '+('`src/demo/Character.tsx`' if file.parent==OUT else '`src/demo/catalog.ts`, wardrobe/editor')+' |')
    (WORK/'manifest.md').write_text('\n'.join(manifest)+'\n')

    # Non-runtime review sheet showing the exact renderer layer stack in 16 combinations.
    preview=Image.new('RGB',(1024,1400),'#ecdcc0')
    draw=ImageDraw.Draw(preview)
    for row in range(4):
        for col,klass in enumerate(CLASSES):
            skin=SKINS[row]
            hair=HAIRS[(row+col)%5]
            color=COLORS[(row+col)%5]
            names=[f'starter-{klass}-body-{skin}',f'head-{skin}',f'hair-{hair}-{color}']
            if row==0:
                names.append(f'beard-short-{color}')
            names.append(f'starter-{klass}-weapon')
            combined=Image.new('RGBA',SIZE)
            for name in names:
                combined.alpha_composite(Image.open(OUT/(name+'.png')))
            preview.paste(combined,(col*256,row*350),combined)
            draw.text((col*256+32,row*350+317),f'{skin} / {klass} / {hair}',fill='#453020')
    preview.save(WORK/'character-review.png')
    print(json.dumps({'assets':len(audit),'totalBytes':sum(a['size'] for a in audit),'review':str(WORK/'character-review.png')}))


if __name__=='__main__':
    main()
