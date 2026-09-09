export type PreparedRequest = {path:string;body:string;memberId:string;label:string};
export class TransportError extends Error {
  constructor(readonly code:string,message:string,readonly unknownResult=false){super(message);this.name='TransportError';}
}
export function requestId():string {
  const bytes=crypto.getRandomValues(new Uint8Array(16));let time=BigInt(Date.now());
  for(let i=5;i>=0;i--){bytes[i]=Number(time&255n);time>>=8n;}
  bytes[6]=(bytes[6]&15)|0x70;bytes[8]=(bytes[8]&63)|0x80;
  const h=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}
export function prepareCommand(memberId:string,command:string,payload:object,label:string):PreparedRequest {
  return {path:'/v3/api/commands',memberId,label,body:JSON.stringify({
    contract:'family_life_v3.commands',version:'0.1',command,idempotencyKey:requestId(),payload,
  })};
}
async function request<T>(path:string,method:'GET'|'POST',body?:string):Promise<T> {
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
  try {
    let response:Response;
    try {
      response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',signal:controller.signal,
        headers:method==='POST'?{'Content-Type':'application/json','X-V3-Request':'1'}:undefined,body});
    }catch{throw new TransportError('UNKNOWN','Ответ не получен. Действие могло сохраниться. Повторите тот же запрос.',method==='POST');}
    let value:any;
    try{value=await response.json();}catch{throw new TransportError('UNAVAILABLE','Сервис недоступен. Проверьте локальный запуск.',method==='POST');}
    if(!response.ok)throw new TransportError(value.code??'UNAVAILABLE',value.message??'Сервис временно недоступен.',method==='POST'&&response.status>=500);
    return value as T;
  }
  finally{clearTimeout(timeout);}
}
export const getApi=<T>(path:string)=>request<T>('/v3/api/'+path,'GET');
export const postApi=<T>(path:string,value:object)=>request<T>('/v3/api/'+path,'POST',JSON.stringify(value));
export const sendPrepared=<T>(prepared:PreparedRequest)=>request<T>(prepared.path,'POST',prepared.body);
const storageKey='family-life-v3.pending-command.v1';
export function savePending(value:PreparedRequest|null) {
  try{value?sessionStorage.setItem(storageKey,JSON.stringify(value)):sessionStorage.removeItem(storageKey);}catch{/* In-memory retry still works if storage is unavailable. */}
}
export function loadPending():PreparedRequest|null {
  try {
    const v=JSON.parse(sessionStorage.getItem(storageKey)??'null');
    if(!v||!['/v3/api/commands','/v3/api/family/add-member','/v3/api/family/update-member','/v3/api/family/invite'].includes(v.path)||
      typeof v.memberId!=='string'||typeof v.body!=='string'||v.body.length>65536||typeof v.label!=='string')return null;
    return v;
  }catch{return null;}
}
