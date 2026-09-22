import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import Ajv from 'ajv';
import {FIRST_BOSS_HP} from '../../src/v3/domain';
import {validateCatalog,type Catalog} from '../../src/v3/content/validate';
const directory=resolve('content-source/v3');
const read=(name:string)=>JSON.parse(readFileSync(resolve(directory,name),'utf8'));
const catalog={assets:read('assets.json'),styles:read('outfit-styles.json'),outfits:read('outfits.json'),offers:read('promise-offers.json'),locations:read('locations.json'),bosses:read('bosses.json')};
const check=new Ajv({allErrors:true}).compile(read('catalog.schema.json'));
if(!check(catalog)){console.error(check.errors);process.exitCode=1;}
else {const errors=validateCatalog(catalog as Catalog,resolve('public'));if(catalog.bosses.find((b:{id:string})=>b.id==='core:boss/yard')?.hp!==FIRST_BOSS_HP)errors.push('Boss HP must match journal v1 rules; a balance change requires migration');if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`V3 catalog OK: ${Object.values(catalog).flat().length} records; IDs, variants, references and asset files verified.`);}
