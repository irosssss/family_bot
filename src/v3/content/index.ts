/** Local V3 catalog adapter. Stable ContentIds are separate from v1 journal aliases. */
import styles from '../../../content-source/v3/outfit-styles.json';
import outfits from '../../../content-source/v3/outfits.json';
import assets from '../../../content-source/v3/assets.json';
import offers from '../../../content-source/v3/promise-offers.json';
export {default as LOCATIONS} from '../../../content-source/v3/locations.json';
export {default as BOSSES} from '../../../content-source/v3/bosses.json';
export const OUTFITS = styles.map(style => ({...style, contentId:style.id, id:style.legacyId}));
export const PROMISE_OFFERS = offers.map(offer => ({...offer, contentId:offer.id, id:offer.legacyId}));
export function assetPath(id:string):string {
 const asset=assets.find(a=>a.id===id);
 if(!asset) throw new Error(`Unknown asset: ${id}`);
 return asset.path;
}
export function outfitImage(avatar:string, legacyStyleId:string):string {
 const style=styles.find(s=>s.legacyId===legacyStyleId);
 const outfit=outfits.find(o=>o.avatar===avatar&&o.styleId===style?.id);
 if(!outfit) throw new Error(`Unknown outfit: ${avatar}/${legacyStyleId}`);
 return assetPath(outfit.assetId);
}
