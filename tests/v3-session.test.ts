import {describe,it,expect} from 'vitest';
import {loadSession,commitSession,resetSession,SESSION_KEY} from '../src/v3/session';
function storage(){const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};}
describe('local V3 journal',()=>{
 it('restores purchases and equipment by replay without duplicate charges',()=>{const s=storage();let session=loadSession(s);session=commitSession(s,session,{type:'outfit.buy',outfitId:'basic-2'},'daughter');session=commitSession(s,session,{type:'outfit.equip',outfitId:'basic-2'},'daughter');const restored=loadSession(s);expect(restored.state).toEqual(session.state);expect(restored.state.members.find(m=>m.id==='daughter')?.coins).toBe(184);});
 it('refuses stale tabs before writing',()=>{const s=storage();const a=loadSession(s),b=loadSession(s);commitSession(s,a,{type:'task.submit',taskId:'son-1'},'son');expect(()=>commitSession(s,b,{type:'task.submit',taskId:'daughter-1'},'daughter')).toThrow('другой вкладке');});
 it('keeps malformed saves intact and blocks writes',()=>{const s=storage();s.setItem(SESSION_KEY,'broken');const session=loadSession(s);expect(session.error).toBeTruthy();expect(()=>commitSession(s,session,{type:'outfit.buy',outfitId:'basic-2'},'daughter')).toThrow();expect(s.getItem(SESSION_KEY)).toBe('broken');});
 it('does not accept unknown replay commands',()=>{const s=storage();s.setItem(SESSION_KEY,JSON.stringify({version:1,soloAdult:false,events:[{actorId:'daughter',command:{type:'fake'}}]}));expect(loadSession(s).error).toBeTruthy();});
 it('does not change the live state if storage fails',()=>{const s=storage();const session=loadSession(s);s.setItem=()=>{throw Error('quota');};expect(()=>commitSession(s,session,{type:'outfit.buy',outfitId:'basic-2'},'daughter')).toThrow('quota');expect(session.state.ownedOutfits.daughter).toEqual(['basic-1']);});
 it('restores the solo adult setting',()=>{const s=storage();resetSession(s,true);expect(loadSession(s).state.members.filter(m=>m.role==='parent')).toHaveLength(1);});
});

it('replays unchecked completion without charging or rewarding twice',()=>{
 const s=storage();let session=loadSession(s);
 session=commitSession(s,session,{type:'task.create',taskId:'unchecked',ownerId:'daughter',title:'Книги',reviewRequired:false},'mother');
 session=commitSession(s,session,{type:'task.submit',taskId:'unchecked'},'daughter');
 const restored=loadSession(s);
 expect(restored.state).toEqual(session.state);
 expect(restored.state.ledger).toHaveLength(1);
 expect(()=>commitSession(s,restored,{type:'task.submit',taskId:'unchecked'},'daughter')).toThrow();
});

it('restores added members and edited names from the journal',()=>{
 const s=storage();let session=loadSession(s);
 session=commitSession(s,session,{type:'member.add',memberId:'test-new',name:'Первое',avatar:'daughter'},'mother');
 session=commitSession(s,session,{type:'member.rename',memberId:'test-new',name:'Второе'},'father');
 expect(loadSession(s).state).toEqual(session.state);
});

it('preserves a save from a newer version and refuses to overwrite it',()=>{
 const s=storage();const raw=JSON.stringify({version:2,soloAdult:false,events:[]});
 s.setItem(SESSION_KEY,raw);const session=loadSession(s);
 expect(session.error).toBeTruthy();
 expect(()=>commitSession(s,session,{type:'outfit.buy',outfitId:'basic-2'},'daughter')).toThrow();
 expect(s.getItem(SESSION_KEY)).toBe(raw);
});

it('keeps the previous journal when a reset cannot be persisted',()=>{
 const s=storage();const before=commitSession(s,loadSession(s),{type:'outfit.buy',outfitId:'basic-2'},'daughter');
 const failing={getItem:s.getItem,setItem:()=>{throw Error('quota');}};
 expect(()=>resetSession(failing,true)).toThrow('quota');
 expect(loadSession(s).state).toEqual(before.state);
});
