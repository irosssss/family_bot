"""Prepare the optional original seated pose and static couch-placement proposals.
Does not enable seating in the main application.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import colorsys
import json
import runpy
from prepare import place, body_variant, SKINS, CLASSES, SIZE

ROOT=Path(__file__).resolve().parents[2]
WORK=ROOT/'work/demo-character'
ART=ROOT/'public/assets/game/demo'
OUT=ART/'characters/sitting'
FONT='/System/Library/Fonts/Supplemental/Arial.ttf'


def skin_variant(image,skin):
    factors={'peach':(1,1,1),'warm':(.9,.74,.55),'brown':(.67,.47,.34),'deep':(.45,.30,.22)}
    result=image.copy(); data=[]
    for i,(r,g,b,a) in enumerate(image.get_flattened_data()):
        x,y=i%256,i//256
        h,s,v=colorsys.rgb_to_hsv(r/255,g/255,b/255)
        if a and 207<=y<=240 and (x<113 or x>143) and r>145 and .04<h<.14 and r>g*1.10 and .22<s<.74:
            mr,mg,mb=factors[skin]; r,g,b=round(r*mr),round(g*mg),round(b*mb)
        data.append((r,g,b,a))
    result.putdata(data)
    return result


def character(klass,hair='short',color='chestnut',skin='peach',beard='none',pose='sitting',rare=False):
    result=Image.new('RGBA',SIZE)
    body=('rare-' if rare else 'starter-')+klass+'-body-'+skin+'.png'
    result.alpha_composite(Image.open(ART/'characters'/('sitting' if pose=='sitting' else '')/body))
    for key in ['head-'+skin,'hair-'+hair+'-'+color]+(['beard-'+beard+'-'+color] if beard!='none' else []):
        result.alpha_composite(Image.open(ART/'characters'/(key+'.png')))
    return result


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    source=Image.open(WORK/'sitting-source-atlas.png').convert('RGBA')
    for col,klass in enumerate(CLASSES):
        cell=source.crop((round(col*source.width/4),0,round((col+1)*source.width/4),source.height))
        cell=cell.crop(cell.getbbox())
        layer=place(cell,148,y=151,height=153)
        for rare in [False,True]:
            for skin in SKINS:
                result=skin_variant(body_variant(layer,'peach',rare),skin)
                result.save(OUT/(('rare-' if rare else 'starter-')+klass+'-body-'+skin+'.png'),optimize=True)

    # Preserve the subsequently approved imagegen palette edit when regenerating.
    if (WORK/'rare-palette-source.png').exists():
        runpy.run_path(str(WORK/'prepare-rare.py'),run_name='__main__')

    review=Image.new('RGB',(1024,700),'#ecddc1')
    draw=ImageDraw.Draw(review)
    for row in range(2):
        for col,klass in enumerate(CLASSES):
            doll=character(klass,hair=['short','bob','long','curly'][col],skin=SKINS[col],beard='short' if col==0 else 'none',rare=bool(row))
            review.paste(doll,(col*256,row*350),doll)
            draw.text((col*256+40,row*350+315),klass+(' rare' if row else ' starter'),fill='#493421')
    review.save(WORK/'sitting-character-review.png')

    # Authored seat centers in the three existing background rasters; hip anchor
    # for these seated bodies is canvas y234. These are proposals, not scene defaults.
    seats={
        'fireplace':[(14.5,39.0,100),(29.0,39.0,100)],
        'library':[(42.0,39.1,100),(59.0,39.1,100)],
        'conservatory':[(40.0,43.0,106),(60.0,43.0,106)],
    }
    sheet=Image.new('RGB',(1125,570),'#ecddc1')
    sheetdraw=ImageDraw.Draw(sheet)
    font=ImageFont.truetype(FONT,13)
    proposal=[]
    for col,(theme,anchors) in enumerate(seats.items()):
        w,h=343,515
        scene=Image.open(ART/f'home-{theme}.webp').convert('RGBA').resize((w*2,h*2),Image.Resampling.LANCZOS)
        figures=[character('warrior',beard='short'),character('healer',hair='long')]
        item={'theme':theme,'width':w,'height':h,'seatAnchorY':234,'seats':[]}
        for i,(x,seat_y,size) in enumerate(anchors):
            doll=figures[i].resize((round(size*.8*2),round(size*2)),Image.Resampling.NEAREST)
            px=round(w*x/100*2-doll.width/2)
            py=round(h*seat_y/100*2-(234/320)*size*2)
            scene.alpha_composite(doll,(px,py))
            item['seats'].append({'x':x,'seatY':seat_y,'size':size,'canvasTopY':round(py/2,2),'visibleFeetY':round((py+304/320*size*2)/2,2)})
        for klass,hair,color,x in [('rogue','short','chestnut',42),('mage','bob','ginger',64)]:
            size=97
            doll=character(klass,hair=hair,color=color,pose='standing').resize((round(size*.8*2),size*2),Image.Resampling.NEAREST)
            scene.alpha_composite(doll,(round(w*x/100*2-doll.width/2),round(h*.70*2-doll.height)))
        scene=scene.resize((w,h),Image.Resampling.LANCZOS)
        scene.save(WORK/f'sitting-{theme}-proposal.png')
        sheet.paste(scene.convert('RGB'),(col*375+16,42))
        sheetdraw.text((col*375+16,17),theme+' · предложение позы',font=font,fill='#493421')
        proposal.append(item)
    sheet.save(WORK/'sitting-scenes-review.png')
    (WORK/'sitting-proposal.json').write_text(json.dumps(proposal,ensure_ascii=False,indent=2)+'\n')
    rows=['| Name | Size | Path | Used-by |','|---|---|---|---|']
    for file in sorted(OUT.glob('*.png')):
        rows.append(f'| sitting/{file.stem} | 256×320, {file.stat().st_size} B | `{file.relative_to(ROOT)}` | `src/demo/Character.tsx` optional sitting pose |')
    (WORK/'sitting-manifest.md').write_text('\n'.join(rows)+'\n')
    print(json.dumps({'layers':len(list(OUT.glob('*.png'))),'characterReview':str(WORK/'sitting-character-review.png'),'sceneReview':str(WORK/'sitting-scenes-review.png')}))

if __name__=='__main__': main()
