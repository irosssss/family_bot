/** Browser adapter for the existing G03 transport. No fake identity or stored PIN. */
type Scope='launch'|'setup'|'session'|'candidate';
type Fields=Record<string,unknown>;
export class AccessError extends Error {
 constructor(public readonly key:string,public readonly uncertain=false){
  super(uncertain?'Ответ сервера не получен. Результат действия нужно проверить перед повтором.':messages[key]??'Не удалось выполнить действие. Попробуйте позже.');
 }
}
const messages:Record<string,string>={
 'transport.bootstrap_closed':'Создание семьи пока недоступно.',
 'adult.pin_invalid':'Введите PIN из шести цифр.',
 'adult.access_denied':'Не удалось подтвердить доступ.',
 'adult.retry_later':'Слишком много попыток. Попробуйте позже.',
 'family.session_invalid':'Сессия завершена. Войдите снова.',
 'family.context_changed':'Данные изменились. Обновите сведения.',
 'access.launch_invalid':'Откройте приложение заново из Telegram.',
 'access.identity_replayed':'Откройте приложение заново из Telegram.',
};
const bearerPattern=/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
function object(v:unknown):v is Fields{return !!v&&typeof v==='object'&&!Array.isArray(v);}
export function createAccessClient(fetcher:typeof fetch,origin:string){
 const url=new URL(origin);
 if(url.origin!==origin||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port)throw new Error('Unsupported access transport origin');
 const credentials=new Map<Scope,string>();
 let busy=false;
 async function call(path:string,scope:Scope|'none',input:Fields,receive?:Scope):Promise<Fields>{
  if(busy)throw new AccessError('client.busy');
  const bearer=scope==='none'?undefined:credentials.get(scope);
  if(scope!=='none'&&!bearer)throw new AccessError('family.session_invalid');
  busy=true;
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
  try{
   let response:Response;
   try{response=await fetcher(`${origin}/access/v1/${path}`,{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal,headers:{'Content-Type':'application/json','X-RPG-Credential':scope,...(bearer?{Authorization:`Bearer ${bearer}`}:{})},body:JSON.stringify(input)});}
   catch{throw new AccessError('client.network',true);}
   let result:unknown;
   try{result=await response.json();}catch{throw new AccessError('client.response',true);}
   if(!object(result))throw new AccessError('client.response',true);
   if(!response.ok||result.ok!==true){
    const key=typeof result.error_key==='string'?result.error_key:'client.response';
    if(response.status===401&&scope!=='none')credentials.delete(scope);
    throw new AccessError(key);
   }
   if(receive){
    if(typeof result.bearer!=='string'||!bearerPattern.test(result.bearer))throw new AccessError('client.response',true);
    credentials.set(receive,result.bearer);
    // Return only public projections; secrets stay in this instance's memory.
    const {bearer:_secret,...publicResult}=result;
    return publicResult;
   }
   return result;
  }finally{clearTimeout(timeout);busy=false;}
 }
 const binding=(familyId:string,bindingId:string)=>({family_id:familyId,binding_id:bindingId});
 return Object.freeze({
  exchange:(initData:string)=>call('identity/exchange','none',{init_data:initData},'launch'),
  login:(familyId:string,bindingId:string,pin:string)=>call('session/login','launch',{...binding(familyId,bindingId),pin},'session'),
  ownChild:(familyId:string,bindingId:string)=>call('session/own-child','launch',binding(familyId,bindingId),'session'),
  readSession:()=>call('session/read','session',{}),
  switchProfile:(pin:string,targetMode:'adult'|'managed_child',targetBindingId:string,revision:number)=>call('session/switch','session',{pin,target_mode:targetMode,target_binding_id:targetBindingId,expected_session_revision:revision},'session'),
  beginSetup:(familyId:string,bindingId:string)=>call('setup/begin','launch',binding(familyId,bindingId),'setup'),
  readSetup:()=>call('setup/read','setup',{}),
  prepareSetup:(revision:number,pin:string,confirmation:string)=>call('setup/prepare','setup',{expected_revision:revision,pin,pin_confirmation:confirmation}),
  acknowledgeRecovery:(revision:number,code:string)=>call('setup/acknowledge','setup',{expected_revision:revision,recovery_code:code}),
  issueInvitation:(kind:'invite_child'|'invite_adult',profileId:string|null,pin:string,operationId:string)=>call('invitation/issue','session',{kind,profile_id:profileId,pin,operation_id:operationId}),
  claimInvitation:(secret:string)=>call('invitation/claim','launch',{invite_secret:secret},'candidate'),
  readRequest:()=>call('lifecycle/read','candidate',{}),
  inspectRequest:(requestId:string)=>call('lifecycle/inspect','session',{request_id:requestId}),
  approveInvitation:(requestId:string,revision:number,candidateAccountId:string,pin:string,operationId:string)=>call('invitation/approve','session',{request_id:requestId,expected_revision:revision,candidate_account_id:candidateAccountId,pin,operation_id:operationId}),
  consumeInvitation:(revision:number,displayName:string)=>call('invitation/consume','candidate',{expected_revision:revision,display_name:displayName}),
  async logout(revision:number){await call('session/retire','session',{expected_revision:revision});credentials.clear();},
  clearLocalCredentials:()=>credentials.clear(),
 });
}
