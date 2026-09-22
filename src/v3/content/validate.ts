import {existsSync, realpathSync, statSync} from 'node:fs';
import {resolve, sep} from 'node:path';
export interface CatalogRecord {id:string;revision:number;[key:string]:unknown}
export interface Catalog {assets:CatalogRecord[];styles:CatalogRecord[];outfits:CatalogRecord[];offers:CatalogRecord[];locations:CatalogRecord[];bosses:CatalogRecord[]}
const idPattern=/^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*\/[a-z][a-z0-9_]*$/;
/** Semantic checks supplement the JSON schema, without changing any files. */
export function validateCatalog(c:Catalog, publicRoot:string):string[] {
 const errors:string[]=[];const ids=new Set<string>();
 for(const records of Object.values(c)) for(const r of records){
  if(!idPattern.test(r.id))errors.push(`Invalid ID: ${r.id}`);
  if(ids.has(r.id))errors.push(`Duplicate ID: ${r.id}`);ids.add(r.id);
  if(!Number.isInteger(r.revision)||r.revision<1)errors.push(`Invalid revision: ${r.id}`);
 }
 const link=(records:CatalogRecord[],id:unknown,owner:string)=>{if(!records.some(r=>r.id===id))errors.push(`Missing reference ${String(id)} in ${owner}`);};
 for(const a of c.assets){
  const path=String(a.path);const file=resolve(publicRoot,'.'+path);
  if(!/^\/assets\/game\/[a-zA-Z0-9_./-]+$/.test(path)||path.split('/').includes('..')||!file.startsWith(resolve(publicRoot)+sep)){errors.push(`Unsafe path: ${a.id}`);continue;}
  if(!existsSync(file)||!statSync(file).isFile())errors.push(`Missing asset: ${a.id}`);
  else if(!realpathSync(file).startsWith(realpathSync(publicRoot)+sep))errors.push(`Asset escapes public root: ${a.id}`);
 }
 for(const list of [c.styles,c.offers]){const aliases=new Set();for(const r of list){if(aliases.has(r.legacyId))errors.push(`Duplicate legacy ID: ${r.legacyId}`);aliases.add(r.legacyId);}}
 const pairs=new Set<string>();
 for(const o of c.outfits){link(c.assets,o.assetId,o.id);link(c.styles,o.styleId,o.id);const pair=`${o.avatar}/${o.styleId}`;if(pairs.has(pair))errors.push(`Duplicate outfit variant: ${pair}`);pairs.add(pair);}
 for(const avatar of ['father','mother','daughter','son'])for(const style of c.styles)if(!pairs.has(`${avatar}/${style.id}`))errors.push(`Missing outfit variant: ${avatar}/${style.id}`);
 const base=c.styles.find(s=>s.legacyId==='basic-1');if(!base||base.price!==0)errors.push('The automatic base outfit must remain free');
 for(const b of c.bosses){link(c.assets,b.assetId,b.id);link(c.locations,b.locationId,b.id);link(c.locations,b.unlockLocationId,b.id);}
 return errors;
}
