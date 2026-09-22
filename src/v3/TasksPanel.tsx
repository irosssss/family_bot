import {useState} from 'react';
import {Button,Modal,SectionTitle} from './components/ui';
import {canReviewTask,type State,type Command,type MemberId} from './domain';

export function TasksPanel({state,actor,act}:{state:State;actor:MemberId;act:(command:Command)=>boolean}) {
 const user=state.members.find(m=>m.id===actor)!;
 const [filter,setFilter]=useState('todo');
 const [query,setQuery]=useState('');
 const [scope,setScope]=useState('mine');
 const [creating,setCreating]=useState(false);
 const [title,setTitle]=useState('');
 const [reviewRequired,setReviewRequired]=useState(true);
 const [owner,setOwner]=useState<MemberId>(actor);
 const [returnId,setReturnId]=useState<string|null>(null);
 const [note,setNote]=useState('');
 const [error,setError]=useState('');
 const matches=(title:string)=>title.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru'));
 const scopedTasks=state.tasks.filter(t=>t.ownerId===actor||(user.role==='parent'&&scope==='family'));
 const tasks=scopedTasks.filter(t=>t.status===filter&&matches(t.title));
 const pending=state.tasks.filter(t=>t.status==='pending'&&canReviewTask(state,actor,t)&&matches(t.title));
 return <>
  <SectionTitle title={scope==='family'?'Дела семьи':'Мои дела'} text="Маленькие шаги для нашей семьи"/>
  {user.role==='parent'&&<Button onClick={()=>{setOwner(actor);setTitle('');setReviewRequired(true);setError('');setCreating(true);}}>Новое дело</Button>}
  <div className="v3-form"><label>Найти дело<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Название дела"/></label>{query.length>0&&<Button variant="quiet" onClick={()=>setQuery('')}>Очистить поиск</Button>}</div>
  {user.role==='parent'&&<div className="v3-filter" aria-label="Чьи дела"><Button variant="quiet" aria-pressed={scope==='mine'} onClick={()=>setScope('mine')}>Мои</Button><Button variant="quiet" aria-pressed={scope==='family'} onClick={()=>setScope('family')}>Всей семьи</Button></div>}
  <div className="v3-filter" aria-label="Состояние дел">
   {[['todo','К выполнению'],['pending','Ждут проверки'],['approved','История']].map(([id,label])=><Button key={id} variant="quiet" aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}<span className="v3-filter-count">{scopedTasks.filter(t=>t.status===id&&matches(t.title)).length}</span></Button>)}
  </div>
  {!tasks.length&&<section className="v3-card"><h2>{query.trim()?'Ничего не найдено':filter==='todo'?'Нет дел к выполнению':filter==='pending'?'Нет дел на проверке':'Здесь появятся принятые дела'}</h2><p>{query.trim()?'Попробуйте другое название или очистите поиск.':filter==='todo'?'Новые дела появятся здесь. Отправленные можно посмотреть в разделе «Ждут проверки».':filter==='pending'?'Отправленные дела появятся здесь.':'Здесь видны завершённые дела и полученные награды.'}</p></section>}
  {tasks.map(t=><section className="v3-card" key={t.id}><h2>{t.title}</h2><p>{state.members.find(m=>m.id===t.ownerId)?.name}</p><p>{t.coins} монет · {t.xp} опыта</p><p className="v3-task-mode">{t.reviewRequired===false?'Без проверки · награда за выполнение':'С проверкой · награда после подтверждения'}</p><p>{t.status==='approved'?(t.reviewRequired===false?'Выполнено · награда получена':'Принято · награда получена'):t.status==='pending'?'Ожидает проверки':t.reviewNote||'Можно начинать'}</p>{t.status==='todo'&&t.ownerId===actor&&<Button onClick={()=>act({type:'task.submit',taskId:t.id})}>{t.reviewRequired===false?'Выполнено':'Отправить на проверку'}</Button>}</section>)}
  {user.role==='parent'&&<>
   <h2>На проверке · {pending.length}</h2>
   {!pending.length&&<p>{query.trim()?'По вашему запросу нет дел для проверки.':'Пока нет дел на проверке.'}</p>}
   {pending.map(t=><section className="v3-card" key={t.id}><h2>{t.title}</h2><p>{state.members.find(m=>m.id===t.ownerId)?.name} · {t.coins} монет · {t.xp} опыта</p><Button onClick={()=>act({type:'task.approve',taskId:t.id})}>{t.ownerId===actor?'Подтвердить своё дело':'Принять дело'}</Button><Button variant="quiet" onClick={()=>{setReturnId(t.id);setNote('');setError('');}}>Вернуть на доработку</Button></section>)}
  </>}
  {creating&&<Modal title="Новое дело" onClose={()=>setCreating(false)}>
   <form className="v3-form" onSubmit={e=>{e.preventDefault();if(!title.trim()){setError('Введите название дела');return;}if(act({type:'task.create',taskId:crypto.randomUUID(),ownerId:owner,title,reviewRequired})){setCreating(false);}else setError('Не удалось создать дело. Проверьте сохранение и попробуйте снова.');}}>
    <label>Что сделать<input required maxLength={100} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Например, убрать книги"/></label>
    <label>Кому<select value={owner} onChange={e=>setOwner(e.target.value as MemberId)}>{state.members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
    <fieldset className="v3-choice-group"><legend>Проверка результата</legend><label><input type="radio" name="review" checked={reviewRequired} onChange={()=>setReviewRequired(true)}/>С проверкой</label><p>Награда после подтверждения взрослым. Своё дело проверяет другой взрослый; единственный взрослый подтверждает сам.</p><label><input type="radio" name="review" checked={!reviewRequired} onChange={()=>setReviewRequired(false)}/>Без проверки</label><p>Участник отмечает выполнение и сразу получает награду.</p></fieldset>
    <p>Разовое дело. Расписание пока не настроено.</p>
    <section className="v3-card"><h2>Награда</h2><p>8 монет · 15 опыта</p><small>Тестовый пример из Figma. Участник увидит награду до выполнения.</small></section>
    {error&&<p role="alert">{error}</p>}
    <Button type="submit">Создать дело</Button>
   </form>
  </Modal>}
  {returnId&&<Modal title="Что осталось доделать?" onClose={()=>setReturnId(null)}>
   <form className="v3-form" onSubmit={e=>{e.preventDefault();if(!note.trim()){setError('Напишите, что осталось доделать');return;}if(act({type:'task.return',taskId:returnId,note})){setReturnId(null);}else setError('Не удалось отправить пояснение. Проверьте сохранение.');}}>
    <label>Пояснение<textarea required maxLength={500} value={note} onChange={e=>setNote(e.target.value)} placeholder="Например, на полу остались две книги"/></label>
    <section className="v3-card"><h2>Награда пока не начисляется</h2><p>Участник сможет доделать и отправить результат снова.</p></section>
    {error&&<p role="alert">{error}</p>}
    <Button type="submit">Отправить пояснение</Button>
    <Button variant="quiet" onClick={()=>setReturnId(null)}>Отмена</Button>
   </form>
  </Modal>}
 </>;
}
