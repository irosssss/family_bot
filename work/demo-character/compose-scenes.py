"""Static anchor review of existing original assets. NOT browser screenshots."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from PIL import ImageChops
import json

ROOT=Path(__file__).resolve().parents[2]
WORK=ROOT/'work/demo-character'
ART=ROOT/'public/assets/game/demo'
FONT='/System/Library/Fonts/Supplemental/Arial.ttf'
font=ImageFont.truetype(FONT,11)
heading=ImageFont.truetype(FONT,15)
fixtures=json.loads((WORK/'layout-fixtures.json').read_text())
SCALE=2
tile=(375,580)
sheet=Image.new('RGB',(tile[0]*4,tile[1]*3),'#f0e4cd')
overlaps=[]
alpha_overlaps=[]
for index,fixture in enumerate(fixtures):
    w,h=fixture['width'],round(fixture['height'])
    room=Image.open(ART/f"home-{fixture['theme']}.webp").convert('RGBA').resize((w*SCALE,h*SCALE),Image.Resampling.LANCZOS)
    positions=[]
    masks=[]
    for placement in sorted(fixture['layout']['members'],key=lambda p:p['zIndex']):
        member=placement['member']; app=member['appearance']
        keys=[app['bodyId']+'-'+app['skin'],'head-'+app['skin'],'hair-'+app['hair']+'-'+app['hairColor']]
        if member['subtype']=='father' and app['beard']!='none':
            keys.append('beard-'+app['beard']+'-'+app['hairColor'])
        avatar=Image.new('RGBA',(256,320))
        for key in keys:
            avatar.alpha_composite(Image.open(ART/'characters'/(key+'.png')))
        size=125*placement['scale']
        aw,ah=round(size*.8*SCALE),round(size*SCALE)
        avatar=avatar.resize((aw,ah),Image.Resampling.NEAREST)
        label_height=22*SCALE
        x=round(w*placement['x']/100*SCALE-aw/2)
        y=round(h*placement['y']/100*SCALE-ah)
        mask=Image.new('L',room.size)
        mask.paste(avatar.getchannel('A'),(x,y))
        for previous_id,previous_mask in masks:
            common=ImageChops.multiply(mask,previous_mask)
            if common.getbbox():
                alpha_overlaps.append({'theme':fixture['theme'],'count':fixture['count'],'a':previous_id,'b':member['id'],'pixels':sum(1 for p in common.get_flattened_data() if p>0)})
        masks.append((member['id'],mask))
        room.alpha_composite(avatar,(x,y))
        draw=ImageDraw.Draw(room)
        label=member['name']
        textfont=ImageFont.truetype(FONT,11*SCALE)
        label_w=round(draw.textlength(label,font=textfont))+16*SCALE
        lx=x+(aw-label_w)//2; ly=y+ah+12*SCALE-label_height
        draw.rounded_rectangle((lx,ly,lx+label_w,ly+label_height-2*SCALE),radius=8*SCALE,fill='#3b291ddd')
        draw.text((lx+8*SCALE,ly+2*SCALE),label,font=textfont,fill='#fff4df')
        positions.append({'id':member['id'],'x':x/SCALE,'y':y/SCALE,'width':aw/SCALE,'height':ah/SCALE,'feetPercent':round((y+ah*304/320)/SCALE/h*100,1)})
    room=room.resize((w,h),Image.Resampling.LANCZOS)
    filename=f"scene-{fixture['theme']}-{fixture['count']}.png"
    room.save(WORK/filename)
    ox=(index%4)*tile[0]+16; oy=(index//4)*tile[1]+42
    sheet.paste(room.convert('RGB'),(ox,oy))
    draw=ImageDraw.Draw(sheet)
    draw.text((ox,oy-29),f"{fixture['theme']} · {fixture['count']} человек",font=heading,fill='#49321d')
    for a in positions:
        for b in positions:
            if a['id']>=b['id']: continue
            intersection=max(0,min(a['x']+a['width'],b['x']+b['width'])-max(a['x'],b['x']))*max(0,min(a['y']+a['height'],b['y']+b['height'])-max(a['y'],b['y']))
            if intersection:
                overlaps.append({'theme':fixture['theme'],'count':fixture['count'],'a':a['id'],'b':b['id'],'canvasIntersection':round(intersection,1)})
    fixture['renderedPositions']=positions
sheet.save(WORK/'scene-layout-review.png')
(WORK/'layout-review.json').write_text(json.dumps({'fixtures':fixtures,'canvasOverlaps':overlaps,'alphaOverlaps':alpha_overlaps},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'review':str(WORK/'scene-layout-review.png'),'composites':len(fixtures),'canvasOverlaps':len(overlaps),'alphaOverlaps':len(alpha_overlaps)},ensure_ascii=False))
