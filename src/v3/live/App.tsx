import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Compass, Home, ListChecks, RefreshCw, Sprout, UserRound, Users } from 'lucide-react';
import type { GameProjection, GameResponse } from '../../v3-shared/game';
import { Button, PageHeading, Sheet } from '../ui';
import { GameAsset } from '../assets/GameAsset';
import { MemberVisual } from './MemberVisual';
import { getCatalogItem } from '../model/catalog';
import { LiveContext, Empty, Field, prettyDate, useGame } from './context';
import { Login, readyTelegram, type RuntimeMode } from './Login';
import { getApi, postApi, loadPending, savePending, prepareCommand, requestId, sendPrepared, TransportError, type PreparedRequest } from './transport';
import { TaskCard, TaskDetails, Tasks } from './Tasks';
import { Hero } from './Hero';
import { Family } from './Family';
import { World, ActiveGoal } from './World';
export type Page='home'|'tasks'|'world'|'hero'|'family';
type Session={mode:'adult'|'own_child'|'managed_child';homeMemberId:string;hasAdultHome:boolean};
const pages=[{id:'home',title:'Сегодня',icon:Home},{id:'tasks',title:'Дела',icon:ListChecks},{id:'world',title:'Мир',icon:Compass},
  {id:'hero',title:'Герой',icon:UserRound},{id:'family',title:'Семья',icon:Users}] as const;
export function LiveApp(){
  const [mode,setMode]=useState<RuntimeMode|null>(null),[bootError,setBootError]=useState<string|null>(null),[loading,setLoading]=useState(true);
  const [data,setData]=useState<GameProjection|null>(null),[session,setSession]=useState<Session|null>(null),[page,setPage]=useState<Page>('home');
  const [busy,setBusy]=useState(false),[pending,setPending]=useState<PreparedRequest|null>(()=>loadPending()),[error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState(''),[recovery,setRecovery]=useState<string|null>(null),[profiles,setProfiles]=useState(false);
  const [retryEpoch,setRetryEpoch]=useState(0);
  const dataRef=useRef(data),busyRef=useRef(false),epoch=useRef(0),pendingRef=useRef(pending),opened=useRef(new Set<string>());
  dataRef.current=data;pendingRef.current=pending;
  const setProjection=(projection:GameProjection)=>{
    setData(current=>current&&current.memberId===projection.memberId&&current.familyId===projection.familyId&&current.revision>projection.revision?current:projection);
  };
  const refresh=useCallback(async()=>{
    const generation=epoch.current;
    try{
      const [projection,context]=await Promise.all([getApi<GameProjection>('game'),getApi<Session>('session')]);
      if(generation!==epoch.current)return;
      setProjection(projection);setSession(context);
    }catch(e){
      if(generation===epoch.current&&e instanceof TransportError&&e.code==='FORBIDDEN'){
        epoch.current++;setData(null);setSession(null);opened.current.clear();
      }
      throw e;
    }
  },[]);
  useEffect(()=>{
    document.body.classList.add('v3-body');
    let live=true;
    void (async()=>{
      try {
        const meta=await getApi<{mode:RuntimeMode}>('meta');if(!live)return;setMode(meta.mode);
        if(meta.mode==='telegram')readyTelegram();
        try{await refresh();}catch(e){if(!(e instanceof TransportError&&e.code==='FORBIDDEN'))throw e;}
      }catch(e){if(live)setBootError(e instanceof Error?e.message:'Не удалось загрузить приложение.');}
      finally{if(live)setLoading(false);}
    })();
    return()=>{live=false;document.body.classList.remove('v3-body');};
  },[refresh]);
  const send=async<T,>(prepared:PreparedRequest,retry=false):Promise<T|null>=>{
    if(busyRef.current||(!retry&&pendingRef.current))return null;
    if(prepared.memberId!==dataRef.current?.memberId){setError('Этот запрос относится к другому профилю. Вернись в него для проверки результата.');return null;}
    busyRef.current=true;setBusy(true);setError(null);setNotice('');
    pendingRef.current=prepared;setPending(prepared);savePending(prepared);
    try{
      const result=await sendPrepared<T>(prepared);
      if(prepared.path==='/v3/api/commands')setProjection((result as GameResponse).projection);
      pendingRef.current=null;setPending(null);savePending(null);
      if(prepared.path!=='/v3/api/commands')await refresh().catch(()=>setError('Действие сохранено. Обнови экран, чтобы увидеть новые данные.'));
      if(prepared.label!=='Открытие дня')setNotice(prepared.label+': сохранено.');
      if(retry)setRetryEpoch(value=>value+1);
      return result;
    }catch(e){
      const failure=e instanceof TransportError?e:new TransportError('UNKNOWN','Не удалось подтвердить результат.',true);
      if(!failure.unknownResult&&!(retry&&['FORBIDDEN','STALE_ACTOR'].includes(failure.code))){pendingRef.current=null;setPending(null);savePending(null);}
      setError(failure.message);
      if(!failure.unknownResult)void refresh().catch(()=>{});
      return null;
    }finally{busyRef.current=false;setBusy(false);}
  };
  const command=async(name:string,payload:object,label='Действие')=>
    dataRef.current?send<GameResponse>(prepareCommand(dataRef.current.memberId,name,payload,label)):null;
  const admin=async<T,>(name:string,payload:object,label:string)=>
    dataRef.current?send<T>({path:'/v3/api/family/'+name,memberId:dataRef.current.memberId,label,body:JSON.stringify({...payload,idempotencyKey:requestId()})}):null;
  useEffect(()=>{
    if(!data||pending||busy)return;
    const key=data.memberId+':'+data.today;
    if(opened.current.has(key))return;opened.current.add(key);
    void command('OpenToday',{},'Открытие дня');
  },[data?.memberId,data?.today,pending,busy]);
  useEffect(()=>{
    if(!data)return;
    const update=()=>{if(!busyRef.current&&!pendingRef.current&&document.visibilityState==='visible')void refresh().catch(()=>{});};
    window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);
    const interval=setInterval(update,30000);
    return()=>{window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);clearInterval(interval);};
  },[data?.memberId,refresh]);
  const loggedIn=async(code:string|null)=>{
    epoch.current++;opened.current.clear();setLoading(true);setError(null);setNotice('');setRecovery(code);
    try{await refresh();}catch(e){setBootError(e instanceof Error?e.message:'Не удалось открыть семью.');}finally{setLoading(false);}
  };
  const switchProfile=async(memberId:string,pin:string|null)=>{
    if(busyRef.current||(pendingRef.current&&pendingRef.current.memberId===dataRef.current?.memberId))return false;
    busyRef.current=true;setBusy(true);setError(null);
    try{
      await postApi('auth/switch',{memberId,pin});epoch.current++;setData(null);setPage('home');setProfiles(false);opened.current.clear();
      await refresh();return true;
    }catch(e){setError(e instanceof Error?e.message:'Не удалось сменить профиль.');return false;}finally{busyRef.current=false;setBusy(false);}
  };
  const logout=async()=>{
    if(busyRef.current)return;setError(null);
    try{await postApi('auth/logout',{});epoch.current++;setData(null);setSession(null);setProfiles(false);}
    catch(e){setError(e instanceof Error?e.message:'Не удалось выйти.');}
  };
  const go=(next:Page)=>{setPage(next);setError(null);setNotice('');window.scrollTo({top:0,behavior:'instant'});};
  if(loading)return <Frame><PageHeading title="Открываем наш дом" text="Загружаем сохранённое состояние семьи."/></Frame>;
  if(bootError)return <Frame><PageHeading title="Сервис пока недоступен" text={bootError}/>
    <p className="v3-caption">Для сохраняемой игры нужен локальный запуск V3.</p><Button onClick={()=>location.reload()}>Проверить снова</Button>
    <a className="v3-live-link" href="http://127.0.0.1:3003/family-life-v3.html">Открыть локальную игру</a></Frame>;
  if(!data||!session)return mode?<Login mode={mode} onLogin={code=>{void loggedIn(code);}}/>:<Frame><p>Проверяем режим входа.</p></Frame>;
  const member=data.members.find(m=>m.id===data.memberId)!;
  return <LiveContext.Provider value={{data,busy,pending:Boolean(pending),error,command,admin,refresh,
    retryPending:pending?.memberId===data.memberId?()=>send(pending,true):null}}>
    <div className="v3-app v3-live">
      {mode==='local'&&<div className="v3-prototype-banner">Локальная тестовая семья · данные сохраняются</div>}
      <header className="v3-topbar"><button className="v3-brand" onClick={()=>go('home')} aria-label="Family Life, на главную"><span><Sprout size={25}/></span><strong>Family Life<small>Наше общее приключение</small></strong></button>
        <Button secondary className="v3-live-profile" onClick={()=>setProfiles(true)}>{member.name}</Button></header>
      <div className="v3-context-line"><span><UserRound size={14}/>{data.role==='adult'?'Взрослый':'Ребёнок'} · {member.playerStatus==='paused'?'игра на паузе':'игрок'}</span>
        <button disabled={busy} onClick={()=>{void refresh().then(()=>setNotice('Данные обновлены.')).catch(e=>setError(e.message));}}><RefreshCw size={15}/>Обновить</button></div>
      {pending&&!busy&&<div className="v3-live-pending" role="alert"><strong>Проверим результат</strong><p>{pending.label}. Ответ не получен — действие могло сохраниться.</p>
        {pending.memberId===data.memberId?<Button onClick={()=>{void send(pending,true);}}>Повторить тот же запрос</Button>:<p>Войди в профиль, из которого отправлялось действие.</p>}</div>}
      {error&&<p className="v3-live-error v3-live-notice" role="alert">{error}</p>}
      {notice&&<p className="v3-live-notice" role="status">{notice}</p>}
      <main className="v3-main" key={data.memberId+':'+retryEpoch}>
        {page==='home'&&<HomePage go={go}/>}
        {page==='tasks'&&<Tasks/>}
        {page==='world'&&<World/>}
        {page==='hero'&&<Hero/>}
        {page==='family'&&<Family/>}
      </main>
      <nav className="v3-nav" aria-label="Основная навигация">{pages.map(({id,title,icon:Icon})=><button key={id} aria-current={page===id?'page':undefined} onClick={()=>go(id)}><Icon size={22}/>{title}</button>)}</nav>
      {profiles&&<Sheet title="Профиль на устройстве" close={()=>setProfiles(false)}><ProfileSwitch session={session} switchProfile={switchProfile} resumePending={Boolean(pending&&pending.memberId!==data.memberId)}/><Button secondary onClick={()=>{void logout();}}>Выйти из профиля</Button></Sheet>}
      {recovery&&<Sheet title="Сохрани код восстановления" close={()=>setRecovery(null)}><p>Этот одноразовый код поможет задать новый PIN. Сохрани его отдельно от устройства; после использования появится новый код.</p>
        <code className="v3-live-secret">{recovery}</code><Button onClick={()=>setRecovery(null)}>Я сохранил код</Button></Sheet>}
    </div>
  </LiveContext.Provider>;
}
function Frame({children}:{children:ReactNode}){return <div className="v3-app v3-live"><main className="v3-main">{children}</main></div>;}
function ProfileSwitch({session,switchProfile,resumePending}:{session:Session;switchProfile:(id:string,pin:string|null)=>Promise<boolean>;resumePending:boolean}) {
  const {data,busy,pending,error}=useGame(),[pin,setPin]=useState('');
  return <div className="v3-live-form">
    {session.hasAdultHome&&session.mode==='managed_child'?<form onSubmit={e=>{e.preventDefault();void switchProfile(session.homeMemberId,pin);}}>
      <Field title="PIN взрослого профиля"><input type="password" required pattern="[0-9]{6,12}" inputMode="numeric" value={pin} onChange={e=>setPin(e.target.value)}/></Field>
      <Button type="submit" disabled={busy||(pending&&!resumePending)}>Вернуться к взрослому</Button></form>:
      session.mode==='adult'?<><p>В детском режиме доступны только дела и накопления выбранного ребёнка. Для возвращения потребуется PIN.</p>
        <div className="v3-live-list">{data.members.filter(m=>m.role==='child'&&m.active).map(m=><Button key={m.id} secondary disabled={busy||(pending&&!resumePending)} onClick={()=>{void switchProfile(m.id,null);}}>Открыть профиль: {m.name}</Button>)}</div></>:
        <p>На этом устройстве открыт твой личный профиль.</p>}
    {error&&<p className="v3-live-error" role="alert">{error}</p>}
  </div>;
}
function HomePage({go}:{go:(page:Page)=>void}) {
  const {data}=useGame(),[task,setTask]=useState<string|null>(null);
  const next=data.allocations.find(a=>a.playerId===data.playerId&&['open','returned'].includes(a.status));
  const pending=data.allocations.filter(a=>a.role==='child'&&a.status==='submitted').length;
  return <><PageHeading title="Сегодня мы команда" text="Одно доброе дело меняет общий день."><span className="v3-date">{prettyDate(data.today)}</span></PageHeading>
    <section className="v3-home-scene"><GameAsset slotId="home.room" label="Наш семейный дом"/><div className="v3-scene-caption"><span><Home size={16}/>Точка встречи семьи</span><button onClick={()=>go('family')}><Users size={16}/>{data.members.filter(m=>m.active).length}</button></div></section>
    {data.owned.some(o=>o.ownerKind==='family')&&<details className="v3-live-details"><summary>Вещи нашего дома</summary><div className="v3-live-list">{data.owned.filter(o=>o.ownerKind==='family').map(o=>{const item=getCatalogItem(o.itemId);return <article className="v3-live-panel v3-trophy-preview" key={o.id}><GameAsset slotId="home.furniture" variant={o.itemId} label={item?.title??'Семейная вещь'}/><div><h3>{item?.title}</h3><p>Принадлежит семье</p></div></article>;})}</div></details>}
    <ActiveGoal compact/>
    <div className="v3-section-heading"><h2>Ближайшее дело</h2><button className="v3-text-button" onClick={()=>go('tasks')}>Все дела</button></div>
    {next?<TaskCard allocation={next} onOpen={()=>setTask(next.id)}/>:<Empty title="Можно выдохнуть">Открытых дел пока нет. Новое расписание можно добавить в разделе «Дела».</Empty>}
    {data.capabilities.includes('completion.review_child')&&pending>0&&<Button secondary className="v3-live-wide" onClick={()=>go('tasks')}>Результатов на проверке: {pending}</Button>}
    <div className="v3-section-heading"><h2>Наш семейный круг</h2></div><div className="v3-members">{data.members.filter(m=>m.active).map(m=><div className="v3-member" key={m.id}>
      <MemberVisual member={m}/><strong>{m.name}</strong><span className="v3-caption">{m.role==='adult'?'Взрослый':'Ребёнок'}</span></div>)}</div>
    {task&&<TaskDetails allocationId={task} close={()=>setTask(null)}/>}
  </>;
}
