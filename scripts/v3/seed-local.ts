/** Explicit synthetic demo bootstrap through the same HTTP routes as the UI. */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url)),origin='http://127.0.0.1:3003';
const meta=await (await fetch(origin+'/v3/api/meta')).json();
if(meta.mode!=='local')throw new Error('v3.seed_requires_local_mode');
let cookie='',expectedMember='';
async function post(path:string,value:object) {
  const response=await fetch(origin+'/v3/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'X-V3-Request':'1','X-V3-Expected-Member':expectedMember,Cookie:cookie},body:JSON.stringify(value)});
  if(!response.ok)throw new Error('v3.seed_request_failed');
  const next=response.headers.get('set-cookie');if(next)cookie=next.split(';')[0];
  return response.json();
}
const login=await post('auth/login',{credential:'local-owner',pin:'123456',displayName:'Алексей',invite:null,intent:'enroll'});
if(login.recoveryCode){
  await mkdir(resolve(root,'work/v3-local'),{recursive:true,mode:0o700});
  await writeFile(resolve(root,'work/v3-local/demo-recovery.txt'),login.recoveryCode+'\n',{mode:0o600,flag:'wx'});
}
function key(name:string){
  const h=createHash('sha256').update('v3-local-demo-v1:'+name).digest('hex');
  return '01989b11-0000-7'+h.slice(0,3)+'-8'+h.slice(3,6)+'-'+h.slice(6,18);
}
expectedMember=(await (await fetch(origin+'/v3/api/game',{headers:{Cookie:cookie}})).json()).memberId;
const child=await post('family/add-member',{idempotencyKey:key('child'),displayName:'Саша',role:'child'});
const projection=await (await fetch(origin+'/v3/api/game',{headers:{Cookie:cookie}})).json();
async function command(name:string,command:string,payload:object){
  return post('commands',{contract:'family_life_v3.commands',version:'0.1',command,idempotencyKey:key(name),payload});
}
await command('today','OpenToday',{});
for(const [name,title,assignment,parts] of [
  ['shared','Подготовить семейный ужин','shared',[{playerId:projection.playerId,difficulty:'normal',label:'Приготовить ужин'},{playerId:child.playerId,difficulty:'easy',label:'Накрыть на стол'}]],
  ['wardrobe','Разобрать большой шкаф','individual',[{playerId:projection.playerId,difficulty:'epic',label:'Рассортировать вещи'}]],
  ['balcony','Освободить балкон','individual',[{playerId:projection.playerId,difficulty:'epic',label:'Навести порядок на балконе'}]],
  ['child','Разобрать свои вещи','individual',[{playerId:child.playerId,difficulty:'hard',label:'Убрать вещи по местам'}]],
] as const) await command(name,'CreateTask',{title,description:'Синтетическое дело для проверки игрового цикла.',assignment,parts,schedule:{kind:'once',startsOn:projection.today,weekdays:[]}});
console.info('V3: тестовая семья и четыре дела готовы. Начислений за выполненные дела пока нет.');
