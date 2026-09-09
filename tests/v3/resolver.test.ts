import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {GameAsset,GameHero} from '../../src/v3/assets/GameAsset';
import {resolveAsset,resolveHero,validateAssetRelease,type AssetRelease,type ReleasedAsset} from '../../src/v3/assets/resolver';
const part=(variant='default',role='body_underlayer'):ReleasedAsset=>({slotId:'hero.adult',variant,state:'neutral',profile:'adult.front.v1',geometry:'approved',pixelScale:2,
  logicalWidth:64,logicalHeight:80,layers:[{role,path:'/assets/game/family_life_v3/v1/heroes/adult/body_r1.png',sha256:'a'.repeat(64),width:128,height:160}]});
const release=(entries:ReleasedAsset[]):AssetRelease=>({contract:'family_life_v3.assets',release:'v1',revision:1,entries});
describe('V3 release resolver',()=>{
  it('does not request images for an empty supplied release or unknown variant',()=>{
    expect(resolveAsset('hero.adult')).toEqual({state:'not_supplied',asset:null});
    expect(resolveAsset('hero.unknown').state).toBe('unsupported');
    for(const element of [createElement(GameAsset,{slotId:'home.room',label:'Дом'}),createElement(GameHero,{role:'child',outfit:'v3.outfit.traveler',label:'Герой'})]){
      const html=renderToStaticMarkup(element);expect(html).not.toContain('<img');expect(html).not.toContain('src=');expect(html).toContain('not_supplied');
    }
  });
  it('requires exact local paths, approved geometry, dimensions, hashes and unique ordered roles',()=>{
    expect(validateAssetRelease(release([part()]))).toBe(true);
    for(const invalid of [
      {...part(),geometry:'candidate'}, {...part(),variant:undefined}, {...part(),logicalHeight:64},
      {...part(),layers:[{...part().layers[0],path:'https://example.test/avatar.png'}]},
      {...part(),layers:[{...part().layers[0],path:'/assets/game/family_life_v3/v1/../private.png'}]},
      {...part(),layers:[{...part().layers[0],width:64}]},
      {...part(),layers:[part().layers[0],part().layers[0]]},
      {...part(),layers:[{...part().layers[0],role:'face'},part().layers[0]]},
    ])expect(validateAssetRelease(release([invalid as ReleasedAsset]))).toBe(false);
    expect(validateAssetRelease(release([part(),part()]))).toBe(false);
  });
  it('composes exact owned outfit and hand layers with the same rig, and refuses missing equipment',()=>{
    const base=part(),outfit=part('outfit:v3.outfit.traveler','torso'),hand=part('hand:v3.item.adventure-kit','hands_held_front');
    const manifest=release([base,outfit,hand]);
    const resolved=resolveHero('adult','v3.outfit.traveler','v3.item.adventure-kit',manifest);
    expect(resolved.state).toBe('ready');
    if(resolved.state==='ready')expect(resolved.asset.layers.map(l=>l.role)).toEqual(['body_underlayer','torso','hands_held_front']);
    expect(resolveHero('adult','v3.outfit.missing',null,manifest).state).toBe('not_supplied');
    expect(resolveHero('child',null,null,manifest).state).toBe('not_supplied');
    const otherRig={...outfit,logicalWidth:128,logicalHeight:160,layers:[{...outfit.layers[0],width:256,height:320}]};
    expect(resolveHero('adult','v3.outfit.traveler',null,release([base,otherRig])).state).toBe('unsupported');
    expect(resolveHero('adult','v3.outfit.traveler',null,release([base,{...outfit,profile:'adult.side.v1'}])).state).toBe('unsupported');
  });
});
