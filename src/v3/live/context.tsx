import { createContext, useContext, type ReactNode } from 'react';
import type { GameProjection, GameResponse } from '../../v3-shared/game';
import { Button } from '../ui';
export type LiveState={
  data:GameProjection;busy:boolean;pending:boolean;error:string|null;
  command:(name:string,payload:object,label?:string)=>Promise<GameResponse|null>;
  admin:<T>(name:string,payload:object,label:string)=>Promise<T|null>;
  refresh:()=>Promise<void>;
  retryPending:(()=>Promise<unknown>)|null;
};
export const LiveContext=createContext<LiveState|null>(null);
export function useGame(){const ctx=useContext(LiveContext);if(!ctx)throw new Error('V3 context missing');return ctx;}
export function ActionError(){
  const {error,pending,busy,retryPending}=useGame();
  return error?<div role="alert"><p className="v3-live-error">{error}</p>{pending&&!busy&&retryPending&&
    <Button secondary onClick={()=>{void retryPending();}}>Проверить результат тем же запросом</Button>}</div>:null;
}
export function Form({children,onSubmit,submit='Сохранить',disabled=false}:{children:ReactNode;onSubmit:()=>void|Promise<void>;submit?:string;disabled?:boolean}) {
  const {busy,pending}=useGame();
  return <form className="v3-live-form" onSubmit={e=>{e.preventDefault();void onSubmit();}}>
    <fieldset disabled={busy||pending||disabled}>{children}<Button type="submit">{busy?'Сохраняем…':submit}</Button></fieldset><ActionError/>
  </form>;
}
export function Field({title,children,hint}:{title:string;children:ReactNode;hint?:string}) {
  return <label className="v3-live-field"><span>{title}</span>{children}{hint&&<small>{hint}</small>}</label>;
}
export function Empty({title,children}:{title:string;children:ReactNode}) {
  return <div className="v3-live-empty"><h2>{title}</h2><p>{children}</p></div>;
}
export const nameOf=(d:GameProjection,playerId:string)=>d.members.find(m=>m.playerId===playerId)?.name??'Участник';
export const difficultyNames={easy:'Лёгкое',normal:'Обычное',hard:'Сложное',epic:'Большое'} as const;
export function prettyDate(date:string){return new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));}
export const available=(d:GameProjection)=>d.progress?(BigInt(d.progress.postedGold)-BigInt(d.progress.reservedGold)).toString():'0';
export function amountRatio(value:string,max:string){return BigInt(max)>0n?Number(BigInt(value)*10000n/BigInt(max))/100:0;}
