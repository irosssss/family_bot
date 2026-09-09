import { useEffect, useState } from 'react';
import { Plus, Settings } from 'lucide-react';
import { Button, PageHeading, Sheet } from '../ui';
import { MemberVisual } from './MemberVisual';
import { ActionError, Empty, Field, Form, useGame } from './context';
import { getApi } from './transport';
import { Rewards } from './Rewards';
import { History } from './Hero';
type MemberAdmin={id:string;name:string;role:'adult'|'child';status:'active'|'left';revision:number;playerStatus:'active'|'paused'|'left'|null};
export function Family() {
  const {data}=useGame(),manage=data.capabilities.includes('family.manage');
  const [section,setSection]=useState('members'),[add,setAdd]=useState(false),[calendar,setCalendar]=useState(false);
  const [member,setMember]=useState<MemberAdmin|null>(null),[roster,setRoster]=useState<MemberAdmin[]>([]),[readError,setReadError]=useState('');
  useEffect(()=>{if(manage)void getApi<MemberAdmin[]>('family/roster').then(setRoster).catch(e=>setReadError(e.message));},[manage,data.revision,add,member?.id]);
  return <><PageHeading title="Наш семейный круг" text="У каждого свой путь, а дом у нас общий."/>
    <div className="v3-tabs" aria-label="Раздел семьи">{[['members','Участники'],['rewards','Обещания'],...(manage?[['history','Результаты']]:[])].map(([id,title])=>
      <button key={id} aria-pressed={section===id} onClick={()=>setSection(id)}>{title}</button>)}</div>
    {section==='members'&&<><div className="v3-members">{data.members.filter(m=>m.active).map(m=><article key={m.id} className="v3-member">
      <MemberVisual member={m}/>
      <strong>{m.name}</strong><span className="v3-caption">{m.role==='adult'?'Взрослый':'Ребёнок'}{m.playerStatus==='paused'?' · пауза':''}</span>
      {manage&&<Button secondary disabled={!roster.some(r=>r.id===m.id)} onClick={()=>setMember(roster.find(r=>r.id===m.id)??null)}>Профиль</Button>}</article>)}</div>
      {manage&&<><div className="v3-live-actions"><Button onClick={()=>setAdd(true)}><Plus size={17}/>Добавить участника</Button>
        <Button secondary onClick={()=>setCalendar(true)}><Settings size={17}/>Календарь</Button></div>
        {roster.some(m=>m.status==='left')&&<details className="v3-live-details"><summary>Участники вне игры</summary>{roster.filter(m=>m.status==='left').map(m=>
          <Button key={m.id} secondary onClick={()=>setMember(m)}>{m.name}</Button>)}</details>}</>}
      <div className="v3-quiet-note"><p>Взрослые участвуют в игре и управляют семейными делами. Они сами отмечают свои результаты; детские результаты подтверждает взрослый.</p></div>
      {readError&&<p className="v3-live-error" role="alert">{readError}</p>}
    </>}
    {section==='rewards'&&<Rewards/>}
    {section==='history'&&<><p className="v3-caption v3-live-help">Принятые детские результаты и исправления. Личная история другого взрослого здесь не отображается.</p><History childrenOnly/></>}
    {add&&<AddMember close={()=>setAdd(false)}/>}
    {calendar&&<CalendarEditor close={()=>setCalendar(false)}/>}
    {member&&<MemberEditor member={member} close={()=>setMember(null)}/>}
  </>;
}
function AddMember({close}:{close:()=>void}) {
  const {admin}=useGame(),[name,setName]=useState(''),[role,setRole]=useState<'adult'|'child'>('child');
  return <Sheet title="Новый участник" close={close}><p>Ребёнок сможет играть на общем устройстве. Для отдельного входа можно создать приглашение.</p>
    <Form submit="Добавить в семью" onSubmit={async()=>{if(await admin('add-member',{displayName:name.trim(),role},'Новый участник'))close();}}>
      <Field title="Имя участника"><input required maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></Field>
      <Field title="Роль в семье"><select value={role} onChange={e=>setRole(e.target.value as typeof role)}><option value="child">Ребёнок</option><option value="adult">Взрослый</option></select></Field>
      {role==='adult'&&<p className="v3-caption">Взрослый получает управление семьёй. Его личный профиль открывается на своём устройстве через приглашение.</p>}
    </Form></Sheet>;
}
function MemberEditor({member,close}:{member:MemberAdmin;close:()=>void}) {
  const {data,admin,busy,pending}=useGame(),[name,setName]=useState(member.name),[status,setStatus]=useState(member.status);
  const [playerStatus,setPlayerStatus]=useState(member.playerStatus==='left'?'active':member.playerStatus??'active'),[invite,setInvite]=useState<string|null>(null);
  const editable=member.role==='child'||member.id===data.memberId;
  return <Sheet title={member.name} close={close}>
    {editable?<Form submit="Сохранить профиль" onSubmit={async()=>{if(await admin('update-member',{memberId:member.id,displayName:name.trim(),status,playerStatus,expectedRevision:member.revision},'Изменение профиля'))close();}}>
      <Field title="Имя"><input required maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></Field>
      <Field title="Участие в игре"><select value={playerStatus} onChange={e=>setPlayerStatus(e.target.value as typeof playerStatus)}><option value="active">Играет</option><option value="paused">На паузе</option></select></Field>
      {member.role==='child'&&<Field title="Участие в семье" hint="При выходе история сохранится, а текущие сессии закроются."><select value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option value="active">В семье</option><option value="left">Временно вышел</option></select></Field>}
    </Form>:<p>Другой взрослый управляет своим личным профилем самостоятельно.</p>}
    {member.id!==data.memberId&&member.status==='active'&&<><div className="v3-section-heading"><h3>Отдельное устройство</h3></div><p>Одноразовое приглашение действует 7 дней. Новое приглашение заменит предыдущее. Участник с собственным входом не может быть привязан повторно.</p>
      <Button secondary disabled={busy||pending} onClick={async()=>{const r=await admin<{code:string}>('invite',{memberId:member.id},'Приглашение участника');if(r)setInvite(r.code);}}>Создать приглашение</Button>
      {invite&&<><p className="v3-caption">Передай этот код участнику. В первом входе нужно выбрать «Начать» и указать код.</p><code className="v3-live-secret">{invite}</code></>}</>}
    <ActionError/>
  </Sheet>;
}
function CalendarEditor({close}:{close:()=>void}) {
  const {data,command}=useGame(),[zone,setZone]=useState(data.settings.pendingZone??data.settings.zone),[late,setLate]=useState(data.settings.lateDays);
  return <Sheet title="Календарь семьи" close={close}><p>Текущий часовой пояс: {data.settings.zone}. Смена пояса действует после окончания текущего дня.</p>
    {data.settings.pendingZone&&<p>Уже запланирован переход: {data.settings.pendingZone}.</p>}
    <Form submit="Сохранить календарь" onSubmit={async()=>{if(await command('UpdateCalendar',{zone:zone.trim(),lateDays:late,expectedRevision:data.settings.revision},'Календарь семьи'))close();}}>
      <Field title="Часовой пояс IANA" hint="Например: Europe/Moscow, Europe/Berlin, Asia/Almaty."><input required maxLength={100} value={zone} onChange={e=>setZone(e.target.value)}/></Field>
      <Field title="Сколько дней можно отправлять результат позже" hint="Уже открытые дела сохранят прежнее окно. Результаты на проверке не истекают."><input required type="number" min={1} max={90} value={late} onChange={e=>setLate(Number(e.target.value))}/></Field>
    </Form></Sheet>;
}
