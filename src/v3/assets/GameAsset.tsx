import { useState } from 'react';
import { AssetSlot } from './AssetSlot';
import { resolveAsset, resolveHero, type ReleasedAsset } from './resolver';

function LoadedLayers({asset,label,className}:{asset:ReleasedAsset;label:string;className?:string}) {
  const [loaded,setLoaded]=useState<string[]>([]),[failed,setFailed]=useState(false);
  const ready=!failed&&asset.layers.every(layer=>loaded.includes(layer.path));
  return <figure className={['v3-game-art',className].filter(Boolean).join(' ')}
    style={{aspectRatio:asset.logicalWidth+' / '+asset.logicalHeight}} aria-label={label}
    data-asset-slot={asset.slotId} data-resource-state={failed?'failed':ready?'ready':'loading'}>
    {!ready&&<div className="v3-game-art-fallback">{label}<small>{failed?'Изображение временно недоступно':'Загрузка изображения'}</small></div>}
    {!failed&&asset.layers.map(layer=><img key={layer.path} src={layer.path} alt="" aria-hidden="true"
      width={layer.width} height={layer.height} decoding="async"
      style={{visibility:ready?'visible':'hidden'}}
      onLoad={()=>setLoaded(current=>current.includes(layer.path)?current:[...current,layer.path])}
      onError={()=>setFailed(true)}/>)}
  </figure>;
}
/** The art state never changes appearance, ownership, rewards or selected companion. */
export function GameAsset({slotId,variant='default',state,label,className}:{slotId:string;variant?:string;state?:string;label:string;className?:string}) {
  const resolved=resolveAsset(slotId,variant,state);
  return resolved.state==='ready'?<LoadedLayers key={resolved.asset.layers.map(l=>l.path).join('|')} asset={resolved.asset} label={label} className={className}/>:
    <AssetSlot slotId={slotId} label={label} className={className} resourceState={resolved.state}/>;
}
export function GameHero({role,outfit=null,hand=null,label,portrait=false}:{role:'adult'|'child';outfit?:string|null;hand?:string|null;label:string;portrait?:boolean}) {
  const resolved=resolveHero(role,outfit,hand);
  return <div className={portrait?'v3-hero-art-portrait':'v3-hero-art-full'} data-outfit={outfit??''} data-hand={hand??''}>
    {resolved.state==='ready'?<LoadedLayers key={resolved.asset.layers.map(l=>l.path).join('|')} asset={resolved.asset} label={label}/>:
      <AssetSlot slotId={portrait?'hero.portrait':'hero.'+role} label={label} resourceState={resolved.state}/>}
  </div>;
}
