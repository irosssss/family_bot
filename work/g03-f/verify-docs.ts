import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const files=['docs/IMPLEMENTATION_PLAN.md','docs/IMPLEMENTATION_BACKLOG.md','docs/PRODUCT_CONTRACT.md','docs/PRODUCT_ROADMAP.md',
  'docs/security/ACCESS_VALIDATION.md','docs/security/RECOVERY_LIFECYCLE_TRANSITIONS.md',
  'docs/implementation/G03_RECOVERY_LIFECYCLE_CARD.md','docs/implementation/G03_RECOVERY_LIFECYCLE_RESULT.md','docs/implementation/G03_TRANSPORT_CARD.md'];
let checked=0;const missing:string[]=[];
for(const file of files){const source=await readFile(file,'utf8');for(const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
  const link=match[1].split('#')[0];if(!link||/^[a-z]+:/i.test(link))continue;
  checked++;try{await access(path.resolve(path.dirname(file),decodeURIComponent(link)));}catch{missing.push(file+': '+link);}
}}
const manifest=JSON.parse(await readFile('migrations/target/manifest.json','utf8'));
const checksums:Record<string,string>={};let historicalUnchanged=true;
for(const m of manifest.migrations){if(!/^\d{4}_[a-z_]+\.sql$/.test(m.name))throw new Error('Unexpected migration name');
  const bytes=await readFile('migrations/target/'+m.name),sum=createHash('sha256').update(bytes).digest('hex');
  if(sum!==m.sha256)throw new Error('Migration checksum mismatch');checksums[m.name]=sum;
  if(Number(m.name.slice(0,4))<5){const old=execFileSync('git',['show','HEAD:migrations/target/'+m.name]);if(!old.equals(bytes))historicalUnchanged=false;}
}
console.log(JSON.stringify({checked,missing,historical_0001_0004_unchanged:historicalUnchanged,checksums},null,2));
if(missing.length||!historicalUnchanged)process.exitCode=1;
