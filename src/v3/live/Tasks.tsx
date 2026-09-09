import { useState } from 'react';
import { ArrowRight, Check, ListChecks, Plus, ShieldCheck } from 'lucide-react';
import type { Allocation, Difficulty, TaskDefinition, TaskPart } from '../../v3-shared/game';
import { getTaskReward } from '../model/balance';
import { Button, PageHeading, Sheet } from '../ui';
import { ActionError, difficultyNames, Empty, Field, Form, nameOf, prettyDate, useGame } from './context';
const states={open:'Можно выполнить',submitted:'На проверке',returned:'Нужно уточнить',settled:'Принято',cancelled:'Отменено'} as const;
export function TaskCard({allocation,onOpen}:{allocation:Allocation;onOpen:()=>void}) {
  const {data}=useGame(),occurrence=data.occurrences.find(o=>o.id===allocation.occurrenceId)!;
  return <article className="v3-task-card"><div className="v3-task-top"><span className="v3-task-glyph home"><ListChecks size={22}/></span>
    <div><p className="v3-caption">{nameOf(data,allocation.playerId)} · {prettyDate(occurrence.scheduledFor)}</p><h3>{occurrence.title}</h3></div></div>
    <p className="v3-task-copy">{occurrence.assignment==='shared'?allocation.label:occurrence.description||difficultyNames[allocation.difficulty]}</p>
    <div className="v3-live-task-meta"><span>{states[allocation.status]}</span><span>{allocation.reward.gold} монет · {allocation.reward.heroXp} XP</span></div>
    <div className="v3-task-bottom"><span><ShieldCheck size={15}/>{allocation.role==='child'?'Подтвердит взрослый':'Самостоятельно'}</span>
      <Button secondary onClick={onOpen}>Подробнее<ArrowRight size={16}/></Button></div>
  </article>;
}
export function Tasks() {
  const {data}=useGame(),manage=data.capabilities.includes('tasks.manage'),review=data.capabilities.includes('completion.review_child');
  const [scope,setScope]=useState('mine'),[status,setStatus]=useState('active'),[selected,setSelected]=useState<string|null>(null);
  const [editor,setEditor]=useState<TaskDefinition|'new'|null>(null);
  const items=data.allocations.filter(a=>(scope==='review'?a.role==='child'&&a.status==='submitted':
    scope==='all'?true:a.playerId===data.playerId)&&(scope==='review'||status==='all'||(status==='active'?['open','returned','submitted'].includes(a.status):a.status===status)));
  return <>
    <PageHeading title="Маленькие дела" text="Выбрать, сделать, поделиться результатом."/>
    <div className="v3-tabs" aria-label="Чьи дела">{[['mine','Мои'],...(review?[['review','Проверить']]:[]),...(manage?[['all','Все']]:[])].map(([id,title])=>
      <button key={id} aria-pressed={scope===id} onClick={()=>setScope(id)}>{title}</button>)}</div>
    <div className="v3-live-toolbar">{scope!=='review'&&<Field title="Состояние"><select value={status} onChange={e=>setStatus(e.target.value)}>
      <option value="active">Текущие дела</option><option value="settled">Принятые</option><option value="cancelled">Отменённые</option><option value="all">Все состояния</option></select></Field>}
      {manage&&<Button onClick={()=>setEditor('new')}><Plus size={18}/>Добавить дело</Button>}</div>
    <div className="v3-task-list">{items.map(a=><TaskCard key={a.id} allocation={a} onOpen={()=>setSelected(a.id)}/>)}</div>
    {!items.length&&<Empty title={scope==='review'?'Всё проверено':'Здесь спокойно'}>{scope==='review'?'Новые результаты появятся, когда ребёнок отправит выполненное дело.':
      manage?'Добавь дело себе или семье. Оно появится по выбранному расписанию.':'Пока нет дел в этом разделе.'}</Empty>}
    {manage&&<section><div className="v3-section-heading"><h2>Расписания</h2><span className="v3-caption">{data.tasks.filter(t=>t.status==='active').length} активных</span></div>
      <div className="v3-live-list">{data.tasks.filter(t=>t.status==='active').map(t=><button className="v3-live-row" key={t.id} onClick={()=>setEditor(t)}><span><strong>{t.title}</strong><small>
        {t.status==='retired'?'В архиве':t.schedule.kind==='daily'?'Каждый день':t.schedule.kind==='weekly'?'По дням недели':'Один раз'}</small></span><ArrowRight size={18}/></button>)}</div>
      {data.tasks.some(t=>t.status==='retired')&&<details className="v3-live-details"><summary>Архив расписаний</summary><div className="v3-live-list">{data.tasks.filter(t=>t.status==='retired').map(t=><button className="v3-live-row" key={t.id} onClick={()=>setEditor(t)}>{t.title}</button>)}</div></details>}</section>}
    {selected&&<TaskDetails allocationId={selected} close={()=>setSelected(null)}/>}
    {editor&&<TaskEditor task={editor==='new'?undefined:editor} close={()=>setEditor(null)}/>}
  </>;
}
export function TaskDetails({allocationId,close}:{allocationId:string;close:()=>void}) {
  const {data,command,busy,pending}=useGame();
  const allocation=data.allocations.find(a=>a.id===allocationId),occurrence=data.occurrences.find(o=>o.id===allocation?.occurrenceId);
  const [note,setNote]=useState(''),[performed,setPerformed]=useState(data.today),[reason,setReason]=useState('');
  if(!allocation||!occurrence)return <Sheet title="Дело недоступно" close={close}><p>Обнови список дел.</p></Sheet>;
  const own=allocation.playerId===data.playerId,canReview=data.capabilities.includes('completion.review_child')&&allocation.role==='child';
  const attempt=data.attempts.find(a=>a.id===allocation.latestAttemptId);
  const canSubmit=own&&['open','returned'].includes(allocation.status)&&data.members.find(m=>m.id===data.memberId)?.playerStatus==='active';
  return <Sheet title={occurrence.title} close={close}>
    <p>{occurrence.description||allocation.label}</p>
    <dl className="v3-details"><div><dt>Участник</dt><dd>{nameOf(data,allocation.playerId)}</dd></div>
      <div><dt>Состояние</dt><dd>{states[allocation.status]}</dd></div><div><dt>Награда</dt><dd>{allocation.reward.gold} монет, {allocation.reward.heroXp} XP героя,
        {' '}{allocation.reward.familyContribution} вклада{allocation.petId?', '+allocation.reward.petXp+' XP выбранного питомца':'. Питомец для этого дела не был выбран.'}</dd></div>
      <div><dt>Плановый день</dt><dd>{prettyDate(occurrence.scheduledFor)}</dd></div><div><dt>Отправить до</dt><dd>{prettyDate(occurrence.submissionThrough)}</dd></div>
      {occurrence.assignment==='shared'&&<div><dt>Твоя часть</dt><dd>{allocation.label}. Общий бюджет распределён между частями один раз.</dd></div>}
    </dl>
    {attempt&&<div className="v3-live-panel"><h3>Последний результат</h3><p>{prettyDate(attempt.performedOn)}{attempt.note?' · '+attempt.note:''}</p>
      {attempt.decision?.reason&&<p>Комментарий взрослого: {attempt.decision.reason}</p>}</div>}
    {canSubmit&&data.today<=occurrence.submissionThrough&&<Form submit={allocation.role==='child'?'Отправить на проверку':'Отметить выполненным'} onSubmit={async()=>{
      const result=await command('SubmitCompletion',{allocationId,expectedRevision:allocation.revision,performedOn:performed,note:note.trim()||null,
        continuation:allocation.status==='returned'?{kind:'after_return',returnedAttemptId:allocation.latestAttemptId}:{kind:'first'}},'Выполнение дела');
      if(result)close();
    }}><Field title="Когда выполнено"><input required type="date" value={performed} min={occurrence.scheduledFor} max={data.today} onChange={e=>setPerformed(e.target.value)}/></Field>
      <Field title="Что получилось" hint="Можно оставить пустым."><input maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></Field>
      <p className="v3-caption">{allocation.role==='child'?'Награда появится после подтверждения взрослым.':'Своё дело взрослый подтверждает этой отметкой.'}</p></Form>}
    {canSubmit&&data.today>occurrence.submissionThrough&&<p className="v3-boundary-note">Срок отправки закончился. Это не уменьшает накопления.</p>}
    {canReview&&allocation.status==='submitted'&&attempt&&<section className="v3-live-form">
      <Field title="Комментарий к решению"><input maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></Field><ActionError/>
      <div className="v3-live-actions"><Button disabled={busy||pending} onClick={async()=>{if(await command('ReviewCompletion',{attemptId:attempt.id,expectedRevision:attempt.revision,decision:'accept',reason:reason.trim()||null},'Подтверждение дела'))close();}}><Check size={17}/>Принять</Button>
        <Button secondary disabled={busy||pending||!reason.trim()} onClick={async()=>{if(await command('ReviewCompletion',{attemptId:attempt.id,expectedRevision:attempt.revision,decision:'return',reason:reason.trim()},'Возврат дела'))close();}}>Вернуть с комментарием</Button></div>
    </section>}
    {data.capabilities.includes('tasks.manage')&&occurrence.status==='open'&&<details className="v3-live-details"><summary>Отменить эту работу</summary>
      <p>Открытые части закроются. Уже принятые результаты сохранятся. Сначала нужно решить результаты на проверке.</p>
      <Form submit="Отменить работу" onSubmit={async()=>{if(await command('CancelOccurrence',{occurrenceId:occurrence.id,expectedRevision:occurrence.revision,reason:reason.trim()},'Отмена работы'))close();}}>
        <Field title="Причина отмены"><input required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></Field></Form></details>}
  </Sheet>;
}
function TaskEditor({task,close}:{task?:TaskDefinition;close:()=>void}) {
  const {data,command,busy,pending}=useGame();
  const [title,setTitle]=useState(task?.title??''),[description,setDescription]=useState(task?.description??'');
  const [assignment,setAssignment]=useState<TaskDefinition['assignment']>(task?.assignment??'individual');
  const [parts,setParts]=useState<TaskPart[]>(task?.parts??[]),[kind,setKind]=useState(task?.schedule.kind??'once');
  const [start,setStart]=useState(task?.schedule.startsOn??data.today),[weekdays,setWeekdays]=useState(task?.schedule.weekdays??[1,2,3,4,5]);
  const [localError,setLocalError]=useState('');
  const changePart=(id:string,change:Partial<TaskPart>)=>setParts(parts.map(p=>p.playerId===id?{...p,...change}:p));
  const rewards=parts.reduce((sum,p)=>sum+getTaskReward(p.difficulty).gold,0);
  return <Sheet title={task?'Расписание дела':'Новое дело'} close={close}>
    {task&&<p>Правки применятся к будущим работам. Уже открытые части и их награды сохраняются.</p>}
    {task?.status==='retired'?<Empty title="Расписание в архиве">Уже открытые дела остаются доступны для завершения.</Empty>:<Form submit={task?'Сохранить расписание':'Создать дело'} onSubmit={async()=>{
      if(!parts.length||(kind==='weekly'&&!weekdays.length)){setLocalError('Выбери участников и дни выполнения.');return;}
      setLocalError('');
      const payload={title:title.trim(),description:description.trim(),assignment,parts:parts.map(p=>({...p,label:p.label.trim()||title.trim()})),schedule:{kind,startsOn:start,weekdays:kind==='weekly'?weekdays:[]}};
      if(await command(task?'UpdateTask':'CreateTask',task?{...payload,taskId:task.id,expectedRevision:task.revision}:payload,task?'Изменение расписания':'Создание дела'))close();
    }}>
      <Field title="Название"><input required maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/></Field>
      <Field title="Как понять, что готово"><input maxLength={500} value={description} onChange={e=>setDescription(e.target.value)}/></Field>
      <Field title="Кто выполняет"><select value={assignment} onChange={e=>setAssignment(e.target.value as TaskDefinition['assignment'])}>
        <option value="individual">Каждый делает своё</option><option value="shared">Общее дело с частями</option><option value="rotation">По очереди</option></select></Field>
      <p className="v3-caption">{assignment==='shared'?'Опиши отдельную часть каждого участника. Общая награда равна сумме этих частей.':
        assignment==='rotation'?'Участники выполняют дело по очереди в порядке списка. На день назначается один игрок.':'Каждый выбранный участник получает отдельную работу.'}</p>
      <div className="v3-live-assignees">{data.members.filter(m=>m.playerId&&m.active&&m.playerStatus==='active').map(m=>{
        const part=parts.find(p=>p.playerId===m.playerId);
        return <section key={m.id}><label className="v3-switch"><input type="checkbox" checked={Boolean(part)} onChange={e=>setParts(e.target.checked?
          [...parts,{playerId:m.playerId!,difficulty:'normal',label:''}]:parts.filter(p=>p.playerId!==m.playerId))}/>{m.name}</label>
          {part&&<><Field title={'Сложность: '+m.name}><select value={part.difficulty} onChange={e=>changePart(m.playerId!,{difficulty:e.target.value as Difficulty})}>
            {Object.entries(difficultyNames).map(([id,label])=><option key={id} value={id}>{label} · {getTaskReward(id as Difficulty).gold} монет</option>)}</select></Field>
          <Field title={'Часть работы: '+m.name}><input maxLength={100} required={assignment==='shared'} value={part.label} placeholder={title||'Что сделать'} onChange={e=>changePart(m.playerId!,{label:e.target.value})}/></Field></>}
        </section>;
      })}</div>
      {!!parts.length&&<p className="v3-caption">{assignment==='rotation'?'Награда зависит от сложности части назначенного игрока.':'Сумма наград выбранных частей: '+rewards+' монет.'}</p>}
      <Field title="Повтор"><select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="once">Один раз</option><option value="daily">Каждый день</option><option value="weekly">По дням недели</option></select></Field>
      <Field title="Первый день"><input required type="date" value={start} onChange={e=>setStart(e.target.value)}/></Field>
      {kind==='weekly'&&<div className="v3-live-weekdays">{['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((label,i)=><label key={label}><input type="checkbox" checked={weekdays.includes(i+1)} onChange={e=>setWeekdays(e.target.checked?[...weekdays,i+1].sort():weekdays.filter(d=>d!==i+1))}/>{label}</label>)}</div>}
      {localError&&<p role="alert" className="v3-live-error">{localError}</p>}
    </Form>}
    {task?.status==='active'&&<details className="v3-live-details"><summary>Завершить расписание</summary><p>Новые работы больше не появятся. Открытые дела сохранятся.</p>
      <Button secondary disabled={busy||pending} onClick={async()=>{if(await command('RetireTask',{taskId:task.id,expectedRevision:task.revision},'Архивирование расписания'))close();}}>Убрать расписание в архив</Button></details>}
  </Sheet>;
}
