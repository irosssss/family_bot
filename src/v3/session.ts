import {applyCommand,createInitialState,type Command,type State} from './domain';

export const SESSION_KEY='family-life-v3-local-v1';
interface Journal {version:1; soloAdult:boolean; events:{actorId:string;command:Command}[]}
export interface LocalSession {state:State;journal:Journal;raw:string|null;error:string|null}
export interface StoragePort {getItem(key:string):string|null;setItem(key:string,value:string):void}
export function loadSession(storage:StoragePort):LocalSession {
 let raw:string|null=null;
 try {
  raw=storage.getItem(SESSION_KEY);
  const journal:Journal=raw?JSON.parse(raw):{version:1,soloAdult:false,events:[]};
  if(journal.version!==1||typeof journal.soloAdult!=='boolean'||!Array.isArray(journal.events)||journal.events.length>10000)throw Error('format');
  let state=createInitialState({soloAdult:journal.soloAdult});
  for(const event of journal.events){
   if(!event||typeof event.actorId!=='string'||!event.command||!['campaign.start','campaign.hit','member.add','member.rename','task.create','task.submit','task.approve','task.return','outfit.buy','outfit.equip','promise.request','promise.approve','promise.fulfill','promise.cancel'].includes(event.command.type))throw Error('command');
   state=applyCommand(state,event.command,event.actorId);
  }
  return {state,journal,raw,error:null};
 }catch{return {state:createInitialState(),journal:{version:1,soloAdult:false,events:[]},raw,error:'Не удалось прочитать сохранение. Оно не перезаписано. Начните новую тестовую семью или восстановите данные.'};}
}
export function commitSession(storage:StoragePort,session:LocalSession,command:Command,actorId:string):LocalSession {
 if(session.error)throw Error(session.error);
 if(storage.getItem(SESSION_KEY)!==session.raw)throw Error('Прогресс изменился в другой вкладке. Обновите страницу перед следующим действием.');
 if(session.journal.events.length>=10000)throw Error('Тестовое сохранение заполнено. Начните новую тестовую семью.');
 const state=applyCommand(session.state,command,actorId);
 const journal:Journal={...session.journal,events:[...session.journal.events,{actorId,command}]};
 const raw=JSON.stringify(journal);
 storage.setItem(SESSION_KEY,raw);
 return {state,journal,raw,error:null};
}
export function resetSession(storage:StoragePort,soloAdult:boolean):LocalSession {
 const journal:Journal={version:1,soloAdult,events:[]};const raw=JSON.stringify(journal);
 storage.setItem(SESSION_KEY,raw);
 return {state:createInitialState({soloAdult}),journal,raw,error:null};
}
