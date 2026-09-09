import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateAssetRelease } from '../../src/v3/assets/resolver.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
export async function checkV3Assets() {
  const manifest:unknown=JSON.parse(await readFile(resolve(root,'src/v3/assets/release.json'),'utf8'));
  if(!validateAssetRelease(manifest))throw new Error('v3.asset_manifest_invalid');
  const paths=new Set<string>();
  for(const asset of manifest.entries)for(const layer of asset.layers) {
    const filename=resolve(root,'public'+layer.path),bytes=await readFile(filename);
    if(bytes.length<24||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||
      bytes.readUInt32BE(16)!==layer.width||bytes.readUInt32BE(20)!==layer.height||
      createHash('sha256').update(bytes).digest('hex')!==layer.sha256)throw new Error('v3.asset_file_mismatch');
    paths.add(filename);
  }
  const files:string[]=[];
  async function walk(dir:string){for(const entry of await readdir(dir,{withFileTypes:true})){
    const file=resolve(dir,entry.name);if(entry.isDirectory())await walk(file);else if(entry.name!=='.gitkeep')files.push(file);
  }}
  await walk(resolve(root,'public/assets/game/family_life_v3'));
  for(const filename of files)if(!paths.has(filename))throw new Error('v3.unregistered_runtime_asset:'+relative(root,filename));
  console.info(JSON.stringify({v3AssetManifest:'passed',entries:manifest.entries.length,files:paths.size}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await checkV3Assets();
