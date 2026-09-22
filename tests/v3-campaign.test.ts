import {describe,it,expect} from 'vitest';
import {applyCommand,createInitialState} from '../src/v3/domain';
import {loadSession,commitSession} from '../src/v3/session';

describe('V3 first campaign',()=>{
 it('grants strength to task owner only after review, not retroactively',()=>{
  let s=createInitialState();s=applyCommand(s,{type:'task.submit',taskId:'daughter-1'},'daughter');
  s=applyCommand(s,{type:'task.approve',taskId:'daughter-1'},'father');
  s=applyCommand(s,{type:'campaign.start'},'mother');expect(s.campaign?.strength).toEqual({});
  s=applyCommand(s,{type:'task.submit',taskId:'father-1'},'father');expect(s.campaign?.strength).toEqual({});
  s=applyCommand(s,{type:'task.approve',taskId:'father-1'},'mother');expect(s.campaign?.strength).toEqual({father:10});
  expect(()=>applyCommand(s,{type:'task.approve',taskId:'father-1'},'mother')).toThrow();
 });
 it('shares boss HP, keeps excess, rejects duplicate and post-victory hits',()=>{
  let s=applyCommand(createInitialState(),{type:'campaign.start'},'daughter');
  for(let i=0;i<7;i++){s=applyCommand(s,{type:'task.create',taskId:`test-${i}`,ownerId:'daughter',title:'Дело',reviewRequired:false},'father');s=applyCommand(s,{type:'task.submit',taskId:`test-${i}`},'daughter');}
  const coins=s.members.find(m=>m.id==='daughter')!.coins;
  s=applyCommand(s,{type:'campaign.hit',hitId:'hit-1'},'daughter');expect(s.campaign?.hp).toBe(0);expect(s.campaign?.strength.daughter).toBe(10);expect(s.members.find(m=>m.id==='daughter')!.coins).toBe(coins);
  expect(()=>applyCommand(s,{type:'campaign.hit',hitId:'hit-1'},'daughter')).toThrow();
  expect(()=>applyCommand(s,{type:'campaign.hit',hitId:'hit-2'},'daughter')).toThrow();
 });
 it('replays campaign with existing journal and preserves failed writes',()=>{
  let raw:string|null=null;const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v;}};
  let session=loadSession(storage);session=commitSession(storage,session,{type:'campaign.start'},'father');
  session=commitSession(storage,session,{type:'task.submit',taskId:'father-1'},'father');
  session=commitSession(storage,session,{type:'task.approve',taskId:'father-1'},'mother');
  session=commitSession(storage,session,{type:'campaign.hit',hitId:'saved'},'father');
  expect(loadSession(storage).state).toEqual(session.state);expect(session.state.campaign?.hp).toBe(50);
  expect(()=>commitSession(storage,session,{type:'campaign.hit',hitId:'empty'},'mother')).toThrow();expect(loadSession(storage).state.campaign?.hp).toBe(50);
 });
});
