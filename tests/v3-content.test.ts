import {describe,it,expect} from 'vitest';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {validateCatalog,type Catalog} from '../src/v3/content/validate';
import {OUTFITS,outfitImage} from '../src/v3/content';
function fixture():Catalog{const read=(name:string)=>JSON.parse(readFileSync(resolve('content-source/v3',name),'utf8'));return {assets:read('assets.json'),styles:read('outfit-styles.json'),outfits:read('outfits.json'),offers:read('promise-offers.json'),locations:read('locations.json'),bosses:read('bosses.json')};}
describe('V3 content catalog',()=>{
 it('resolves all shipped records and preserves seven old purchase aliases',()=>{
  expect(validateCatalog(fixture(),resolve('public'))).toEqual([]);
  expect(OUTFITS.map(o=>[o.id,o.price])).toEqual([['basic-1',0],['basic-2',48],['basic-3',72],['seasonal-1',120],['seasonal-2',120],['seasonal-3',120],['seasonal-4',120]]);
  for(const avatar of ['father','mother','daughter','son'])for(const style of OUTFITS)expect(outfitImage(avatar,style.id)).toBe(`/assets/game/wardrobe-pilot/v3/${avatar}-${style.id}.png`);
 });
 it('rejects duplicate IDs and orphaned references',()=>{const c=fixture();c.assets.push({...c.assets[0]});c.outfits[0].assetId='core:asset/missing';const e=validateCatalog(c,resolve('public'));expect(e.some(x=>x.includes('Duplicate ID'))).toBe(true);expect(e.some(x=>x.includes('Missing reference'))).toBe(true);});
 it('rejects missing variant and traversal',()=>{const c=fixture();c.outfits.pop();c.assets[0].path='/assets/game/../../secret.png';const e=validateCatalog(c,resolve('public'));expect(e.some(x=>x.includes('Missing outfit variant'))).toBe(true);expect(e.some(x=>x.includes('Unsafe path'))).toBe(true);});
 it('does not silently substitute unknown content',()=>expect(()=>outfitImage('father','removed')).toThrow('Unknown outfit'));
});
