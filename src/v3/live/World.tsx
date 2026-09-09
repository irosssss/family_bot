import { useState } from 'react';
import { Compass, Flag, Trophy } from 'lucide-react';
import { Button, Meter, PageHeading, Sheet } from '../ui';
import { GameAsset } from '../assets/GameAsset';
import { MemberVisual } from './MemberVisual';
import { BALANCE_POLICY_V01 } from '../model/balance';
import { ActionError, amountRatio, Empty, Field, Form, nameOf, useGame } from './context';
export function ActiveGoal({compact=false}:{compact?:boolean}) {
  const {data}=useGame(),goal=data.goals.find(g=>g.active);
  if(!goal)return null;
  return <section className="v3-family-goal"><div className="v3-section-heading"><span className="v3-section-label">Общая цель</span><Flag size={18}/></div>
    <h3>{goal.title}</h3><p>{goal.milestoneId?'Эта цель уже стала частью истории семьи.':'Принятые дела шаг за шагом приближают нас к цели.'}</p>
    <div className="v3-boss-progress"><span>Семейный вклад</span><strong>{goal.earned} / {goal.target}</strong></div>
    <Meter value={amountRatio(goal.earned,goal.target)} max={100} label="Семейная цель"/>
    {!compact&&<p className="v3-caption">Дней в расчёте: {goal.plannedDays}. Состав: {goal.roster.map(m=>nameOf(data,m.playerId)).join(', ')}. Пропуск дня не отнимает вклад.</p>}
  </section>;
}
export function World() {
  const {data,command,busy,pending}=useGame(),manage=data.capabilities.includes('family.manage');
  const [editor,setEditor]=useState<'goal'|'adventure'|null>(null);
  const adventure=data.adventures.find(a=>a.status!=='won');
  const phase=adventure?(BigInt(adventure.damage)*100n/BigInt(adventure.target)<35n?'phase_one':BigInt(adventure.damage)*100n/BigInt(adventure.target)<70n?'phase_two':'phase_three'):'phase_one';
  return <>
    <PageHeading title="Наш общий путь" text="Дела становятся историей семьи."/>
    {data.goals.some(g=>g.active)?<ActiveGoal/>:<Empty title="Цель ещё не выбрана">Можно собирать семейный вклад ради общей идеи — без срока, после которого всё пропадает.</Empty>}
    {manage&&<div className="v3-live-actions"><Button secondary disabled={busy||pending} onClick={()=>setEditor('goal')}>Новая цель</Button>
      {data.goals.some(g=>g.active)&&<Button secondary disabled={busy||pending} onClick={()=>{void command('SelectFamilyGoal',{goalId:null,expectedSettingsRevision:data.settings.revision},'Пауза общей цели');}}>Пауза цели</Button>}</div>}
    {manage&&data.goals.some(g=>!g.active)&&<details className="v3-live-details"><summary>Другие цели</summary><div className="v3-live-list">{data.goals.filter(g=>!g.active).map(g=>
      <Button key={g.id} secondary disabled={busy||pending} onClick={()=>{void command('SelectFamilyGoal',{goalId:g.id,expectedSettingsRevision:data.settings.revision},'Выбор общей цели');}}>{g.title} · {g.earned}/{g.target}</Button>)}</div></details>}
    <div className="v3-section-heading"><h2>За порогом дома</h2><Compass size={20}/></div>
    {adventure?<section className="v3-adventure-card"><span className="v3-section-label">{adventure.status==='paused'?'Приключение на паузе':'Семейная экспедиция'}</span><h2>{adventure.title}</h2>
      <GameAsset slotId="boss.main" variant="forest-keeper" state={phase} label="Хранитель лесной тропы"/>
      <div className="v3-boss-progress"><span>Общий прогресс</span><strong>{adventure.damage} / {adventure.target}</strong></div><Meter value={amountRatio(adventure.damage,adventure.target)} max={100} label="Приключение"/>
      <p>Вклад принятых дел участников превращается в урон. Состав и размер цели зафиксированы при старте.</p><p className="v3-caption">{adventure.roster.map(id=>nameOf(data,id)).join(', ')}</p>
      <p className="v3-caption">Пауза действует на новые дела. Ранее открытые работы сохраняют свою привязку.</p>
      <div className="v3-members v3-adventure-members">{data.members.filter(m=>m.playerId&&adventure.roster.includes(m.playerId)).map(m=><div className="v3-member" key={m.id}><MemberVisual member={m}/><strong>{m.name}</strong></div>)}</div>
      {manage&&<Button secondary disabled={busy||pending} onClick={()=>{void command('SetAdventurePaused',{adventureId:adventure.id,expectedRevision:adventure.revision,paused:adventure.status==='active'},'Состояние приключения');}}>
        {adventure.status==='paused'?'Продолжить приключение':'Поставить на паузу'}</Button>}
    </section>:<section className="v3-adventure-card"><GameAsset slotId="adventure.map" variant="forest-path" label="Тропа семейного приключения"/><h2>Можно отправиться вместе</h2>
      <p>Приключение добровольное. Урон дают принятые дела; за общую победу семья получает памятный трофей.</p>
      {manage?<Button onClick={()=>setEditor('adventure')}>Начать приключение</Button>:<p className="v3-caption">Взрослый может выбрать состав и начать путешествие.</p>}</section>}
    <div className="v3-section-heading"><h2>В истории семьи</h2><Trophy size={19}/></div>
    {!data.trophies.length?<Empty title="История только начинается">Первый трофей появится после общей цели или завершённого приключения.</Empty>:
      <div className="v3-live-list">{data.trophies.map(t=><article className="v3-live-panel v3-trophy-preview" key={t.id}><GameAsset slotId="family.trophy" variant={t.kind} label="Семейный трофей"/>
        <div><h3>{t.title}</h3><p>{new Intl.DateTimeFormat('ru',{dateStyle:'long',timeZone:data.settings.zone}).format(new Date(t.earnedAt))}</p></div></article>)}</div>}
    <ActionError/>{editor&&<WorldEditor kind={editor} close={()=>setEditor(null)}/>}
  </>;
}
function WorldEditor({kind,close}:{kind:'goal'|'adventure';close:()=>void}) {
  const {data,command}=useGame(),norm=BALANCE_POLICY_V01.family.defaultDailyContributionNorm;
  const [title,setTitle]=useState(kind==='adventure'?'Хранитель лесной тропы':''),[days,setDays]=useState(kind==='adventure'?7:14);
  const [roster,setRoster]=useState<{playerId:string;dailyNorm:number}[]>(data.members.filter(m=>m.active&&m.playerStatus==='active'&&m.playerId).map(m=>({playerId:m.playerId!,dailyNorm:norm})));
  const [error,setError]=useState('');
  const target=roster.reduce((n,m)=>n+(kind==='goal'?m.dailyNorm:norm),0)*days;
  return <Sheet title={kind==='goal'?'Новая семейная цель':'Начало приключения'} close={close}>
    <p>Новая цель будет привязана к будущим работам. Уже открытые дела сохранят прежнее назначение вклада.</p>
    <Form submit={kind==='goal'?'Выбрать эту цель':'Начать вместе'} onSubmit={async()=>{
      if(!roster.length){setError('Выбери хотя бы одного участника.');return;}
      if(await command(kind==='goal'?'CreateGoal':'StartAdventure',{title:title.trim(),plannedDays:days,roster:kind==='goal'?roster:roster.map(r=>r.playerId)},kind==='goal'?'Создание общей цели':'Старт приключения'))close();
    }}>
      <Field title="Название"><input required maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/></Field>
      <Field title="Ориентир по длительности" hint="Это расчёт сложности, не срок потери прогресса."><input type="number" required min={1} max={kind==='goal'?365:30} value={days} onChange={e=>setDays(Number(e.target.value))}/></Field>
      <div className="v3-live-assignees">{data.members.filter(m=>m.active&&m.playerStatus==='active'&&m.playerId).map(m=>{
        const entry=roster.find(r=>r.playerId===m.playerId);
        return <section key={m.id}><label className="v3-switch"><input type="checkbox" checked={Boolean(entry)} onChange={e=>setRoster(e.target.checked?
          [...roster,{playerId:m.playerId!,dailyNorm:norm}]:roster.filter(r=>r.playerId!==m.playerId))}/>{m.name}</label>
          {kind==='goal'&&entry&&<Field title={'Ориентир вклада за день: '+m.name}><input type="number" min={1} max={1000} required value={entry.dailyNorm}
            onChange={e=>setRoster(roster.map(r=>r.playerId===m.playerId?{...r,dailyNorm:Number(e.target.value)}:r))}/></Field>}</section>;
      })}</div>
      <p className="v3-live-panel">Размер цели: <strong>{target}</strong> {kind==='goal'?'вклада':'урона'}. Размер сохранится при изменении состава семьи.</p>
      {error&&<p className="v3-live-error" role="alert">{error}</p>}
    </Form>
  </Sheet>;
}
