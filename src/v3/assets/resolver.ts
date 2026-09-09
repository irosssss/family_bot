import suppliedManifest from './release.json';
import { getAssetSlot } from './registry';

export type AssetLayer = {
  role: string; path: string; sha256: string; width: number; height: number;
};
export type ReleasedAsset = {
  slotId: string; variant: string; state: string; profile: string; geometry: 'approved'; pixelScale: number;
  logicalWidth: number; logicalHeight: number; layers: AssetLayer[];
};
export type AssetRelease = {contract:'family_life_v3.assets';release:'v1';revision:number;entries:ReleasedAsset[]};
export type ResolvedAsset = {state:'ready';asset:ReleasedAsset}|{state:'not_supplied'|'unsupported';asset:null};
const root='/assets/game/family_life_v3/v1/';
export function validateAssetRelease(input: unknown): input is AssetRelease {
  if(!input||typeof input!=='object')return false;
  const data=input as AssetRelease;
  if(data.contract!=='family_life_v3.assets'||data.release!=='v1'||!Number.isSafeInteger(data.revision)||data.revision<1||!Array.isArray(data.entries))return false;
  const keys=new Set<string>();
  for(const entry of data.entries){
    if(!entry||typeof entry!=='object')return false;
    const slot=getAssetSlot(entry.slotId);
    if(!slot||typeof entry.variant!=='string'||!/^[-a-z0-9_.:]{1,128}$/.test(entry.variant)||typeof entry.profile!=='string'||!/^[-a-z0-9_.]{1,128}$/.test(entry.profile)||!slot.states.includes(entry.state)||entry.geometry!=='approved'||
      ![1,2,3,4].includes(entry.pixelScale)||!Number.isSafeInteger(entry.logicalWidth)||entry.logicalWidth<1||entry.logicalWidth>2048||
      !Number.isSafeInteger(entry.logicalHeight)||entry.logicalHeight<1||entry.logicalHeight>2048||
      entry.logicalWidth*slot.logicalCanvas.height!==entry.logicalHeight*slot.logicalCanvas.width||!Array.isArray(entry.layers)||!entry.layers.length)return false;
    const key=entry.slotId+':'+entry.variant+':'+entry.state;
    if(keys.has(key))return false;keys.add(key);
    let previous=-1;
    for(const layer of entry.layers) {
      if(!layer||typeof layer!=='object'||typeof layer.path!=='string'||!layer.path.startsWith(root)||
        !/^\/assets\/game\/family_life_v3\/v1\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.png$/.test(layer.path)||
        !/^[a-f0-9]{64}$/.test(layer.sha256)||layer.width!==entry.logicalWidth*entry.pixelScale||layer.height!==entry.logicalHeight*entry.pixelScale)return false;
      const order=slot.layers.indexOf(layer.role);if(order<=previous)return false;previous=order;
    }
  }
  return true;
}
/** No guessed URLs, source files, fallback catalog item or remote resource request. */
export function resolveAsset(slotId:string,variant='default',state?:string,manifest:unknown=suppliedManifest):ResolvedAsset {
  const slot=getAssetSlot(slotId);
  if(!slot||!validateAssetRelease(manifest))return {state:'unsupported',asset:null};
  const selected=manifest.entries.find(e=>e.slotId===slotId&&e.variant===variant&&e.state===(state??slot.states[0]));
  return selected?{state:'ready',asset:selected}:{state:'not_supplied',asset:null};
}
export const assetRelease=suppliedManifest as unknown;
export function resolveHero(role:'adult'|'child',outfit:string|null,hand:string|null,manifest:unknown=suppliedManifest):ResolvedAsset {
  const slotId='hero.'+role;
  const variants=['default',...(outfit?['outfit:'+outfit]:[]),...(hand?['hand:'+hand]:[])];
  const pieces=variants.map(variant=>resolveAsset(slotId,variant,'neutral',manifest));
  if(pieces.some(p=>p.state==='unsupported'))return {state:'unsupported',asset:null};
  if(pieces.some(p=>p.state!=='ready'))return {state:'not_supplied',asset:null};
  const assets=pieces.map(p=>(p as {state:'ready';asset:ReleasedAsset}).asset),base=assets[0];
  if(assets.some(a=>a.profile!==base.profile||a.logicalWidth!==base.logicalWidth||a.logicalHeight!==base.logicalHeight||a.pixelScale!==base.pixelScale))
    return {state:'unsupported',asset:null};
  const layers=new Map<string,AssetLayer>();
  for(const asset of assets)for(const layer of asset.layers)layers.set(layer.role,layer);
  return {state:'ready',asset:{...base,variant:variants.join('+'),layers:getAssetSlot(slotId)!.layers.flatMap(role=>layers.has(role)?[layers.get(role)!]:[])}};
}
