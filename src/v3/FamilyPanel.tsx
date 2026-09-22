import {useEffect,useState} from 'react';
import {Button,Modal,SectionTitle} from './components/ui';
import {availableCoins,PROMISE_OFFERS,type State,type Command,type MemberId,type AvatarId} from './domain';

import {WalletSummary} from './WalletPanel';

type Props={state:State;actor:MemberId;act:(command:Command)=>boolean};
const statuses={requested:'Ждёт одобрения',approved:'Одобрено · ждём исполнения',fulfilled:'Исполнено',cancelled:'Отменено'};
export function FamilyPanel({state,actor,act}:Props){
 const user=state.members.find(m=>m.id===actor)!;
 const [tab,setTab]=useState('members');
 useEffect(()=>{document.querySelector('.v3-app main')?.scrollTo(0,0);},[tab]);
 const [memberId,setMemberId]=useState<MemberId|null>(null);
 const [offerId,setOfferId]=useState<string|null>(null);
 const [finished,setFinished]=useState(false);
 const [confirm,setConfirm]=useState<{title:string;body:string;label:string;command:Command}|null>(null);
 const [error,setError]=useState('');
 const [adding,setAdding]=useState(false);const [name,setName]=useState('');const [avatar,setAvatar]=useState<AvatarId>('daughter');
 const member=state.members.find(m=>m.id===memberId);
 const offer=PROMISE_OFFERS.find(o=>o.id===offerId);
 const requests=state.promises.filter(p=>(user.role==='parent'||p.ownerId===actor)&&(finished||p.status==='requested'||p.status==='approved'));
 const results=state.tasks.filter(t=>t.status==='approved'&&(user.role==='parent'||t.ownerId===actor));
 function ask(value:NonNullable<typeof confirm>){setError('');setConfirm(value);}
 return <>
  <SectionTitle title="Наш семейный круг" text="У каждого свой путь, а семья у нас общая."/>
  <div className="v3-filter"><Button variant="quiet" aria-pressed={tab==='members'} onClick={()=>setTab('members')}>Участники</Button><Button variant="quiet" aria-pressed={tab==='promises'} onClick={()=>setTab('promises')}>Обещания</Button><Button variant="quiet" aria-pressed={tab==='results'} onClick={()=>setTab('results')}>Результаты</Button></div>
  {tab==='members'&&<>{state.members.map(m=><section className="v3-card" key={m.id}><div className="v3-member-row"><img src={`/assets/game/wardrobe-pilot/v3/${m.avatar??m.id}-${state.equippedOutfits[m.id]}.png`} alt=""/><div><h2>{m.name}</h2><p>{m.role==='parent'?'Взрослый':'Ребёнок'}{m.id===actor?' · Сейчас играет':''}</p></div></div><Button variant="quiet" onClick={()=>{setMemberId(m.id);setName(m.name);setError('');}}>Профиль · {m.name}</Button></section>)}<>{user.role==='parent'&&<Button onClick={()=>{setAdding(true);setName('');setAvatar('daughter');setError('');}}>Добавить участника</Button>}</><section className="v3-card"><h2>Взрослые тоже играют</h2><p>У каждого свои дела, монеты и опыт. За проверку чужого дела награда не начисляется.</p></section></>}
  {tab==='results'&&<><h2>{user.role==='parent'?'Принятые дела семьи':'Мои результаты'}</h2>{!results.length&&<section className="v3-card"><h2>Пока нет принятых дел</h2><p>Выполненные дела появятся здесь вместе с полученной наградой.</p></section>}{[...results].reverse().map(t=><section className="v3-card" key={t.id}><h2>{t.title}</h2><p>{state.members.find(m=>m.id===t.ownerId)?.name}</p><strong>+{t.coins} монет · +{t.xp} опыта</strong><p>{t.reviewRequired===false?'Выполнено без проверки':'Подтверждено взрослым'}</p></section>)}</>}
  {tab==='promises'&&<>
   <WalletSummary state={state} actor={actor}/>
   <h2>Семейные обещания</h2>
   {PROMISE_OFFERS.map(o=><section className="v3-card" key={o.id}><h2>{o.title}</h2><p>{o.cost} монет · тестовое предложение</p><Button variant="quiet" onClick={()=>{setError('');setOfferId(o.id);}}>Посмотреть условия</Button></section>)}
   <section className="v3-card"><h2>Забота остаётся бесплатной</h2><p>Обычное внимание, забота и базовые потребности не требуют монет.</p></section>
   <h2>Заявки</h2><label className="v3-check"><input type="checkbox" checked={finished} onChange={e=>setFinished(e.target.checked)}/>Показать завершённые</label>
   {!requests.length&&<p>Здесь появятся ваши заявки на семейные обещания.</p>}
   {[...requests].reverse().map(p=><section className="v3-card" key={p.id}><h2>{p.title}</h2><p>{state.members.find(m=>m.id===p.ownerId)?.name} · {statuses[p.status]}</p><strong>{p.cost} монет · {p.status==='requested'?'в резерве':p.status==='cancelled'?'доступны снова':'списаны при одобрении'}</strong>
    {user.role==='parent'&&p.status==='requested'&&<Button onClick={()=>ask({title:'Одобрить обещание?',body:`У участника будут списаны ${p.cost} монет из резерва. Исполнение вы отметите отдельно.`,label:`Одобрить и списать ${p.cost}`,command:{type:'promise.approve',promiseId:p.id}})}>Одобрить</Button>}
    {user.role==='parent'&&p.status==='approved'&&<Button onClick={()=>ask({title:'Обещание исполнено?',body:'Подтвердите, что обещанное событие уже состоялось. Повторного списания монет не будет.',label:'Подтвердить исполнение',command:{type:'promise.fulfill',promiseId:p.id}})}>Отметить исполненным</Button>}
    {['requested','approved'].includes(p.status)&&<Button variant="quiet" onClick={()=>ask({title:'Отменить обещание?',body:p.status==='requested'?`${p.cost} монет будут освобождены из резерва.`:`${p.cost} монет будут возвращены участнику.`,label:'Отменить обещание',command:{type:'promise.cancel',promiseId:p.id}})}>Отменить</Button>}
   </section>)}
  </>}
  {member&&<Modal title={member.name} onClose={()=>setMemberId(null)}><div className="v3-fitting"><img className="v3-portrait" src={`/assets/game/wardrobe-pilot/v3/${member.avatar??member.id}-${state.equippedOutfits[member.id]}.png`} alt={`Герой: ${member.name}`}/></div><p>{member.role==='parent'?'Взрослый':'Ребёнок'} · участвует в игре</p>{(user.role==='parent'||member.id===actor)&&<><p>{member.xp} опыта · {availableCoins(state,member.id)} монет доступно</p><p>Принятых дел: {state.tasks.filter(t=>t.ownerId===member.id&&t.status==='approved').length}</p></>}{user.role==='parent'&&(member.role==='child'||member.id===actor)&&<form className="v3-form" onSubmit={e=>{e.preventDefault();if(act({type:'member.rename',memberId:member.id,name}))setMemberId(null);else setError('Не удалось сохранить имя. Проверьте ввод и сохранение.');}}><label>Имя<input required maxLength={40} value={name} onChange={e=>setName(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}<Button type="submit">Сохранить профиль</Button></form>}<p>Вы просматриваете профиль. Сейчас играет {user.name}.</p><Button variant="quiet" onClick={()=>setMemberId(null)}>Вернуться к семье</Button></Modal>}
  {adding&&<Modal title="Новый участник" onClose={()=>setAdding(false)}><p>Добавление в тестовую семью на этом устройстве. Приглашение на другое устройство и настоящий вход ещё не подключены.</p><form className="v3-form" onSubmit={e=>{e.preventDefault();if(act({type:'member.add',memberId:crypto.randomUUID(),name,avatar}))setAdding(false);else setError('Не удалось добавить участника. Проверьте имя и сохранение.');}}><label>Имя участника<input required maxLength={40} value={name} onChange={e=>setName(e.target.value)}/></label><label>Роль и персонаж<select value={avatar} onChange={e=>setAvatar(e.target.value as AvatarId)}><option value="daughter">Ребёнок · дочь</option><option value="son">Ребёнок · сын</option><option value="mother">Взрослый · мама</option><option value="father">Взрослый · папа</option></select></label><p>Первый базовый комплект выдаётся бесплатно. Начальный баланс нового тестового участника — 0 монет.</p>{error&&<p role="alert">{error}</p>}<Button type="submit">Добавить в тестовую семью</Button><Button variant="quiet" onClick={()=>setAdding(false)}>Отмена</Button></form></Modal>}
  {offer&&<Modal title={offer.title} onClose={()=>setOfferId(null)}><p>Стоимость: {offer.cost} монет.</p><p>Доступно: {availableCoins(state,actor)} монет. После запроса останется: {Math.max(0,availableCoins(state,actor)-offer.cost)}.</p><section className="v3-card"><h2>Как это работает</h2><p>При запросе монеты попадут в резерв. При одобрении взрослым — спишутся. Исполнение обещания отмечается отдельно.</p></section>{availableCoins(state,actor)<offer.cost&&<p>Не хватает {offer.cost-availableCoins(state,actor)} монет.</p>}{error&&<p role="alert">{error}</p>}<Button disabled={availableCoins(state,actor)<offer.cost} onClick={()=>{if(act({type:'promise.request',promiseId:crypto.randomUUID(),offerId:offer.id}))setOfferId(null);else setError('Не удалось сохранить заявку. Проверьте сообщение на странице.');}}>Отправить заявку и зарезервировать {offer.cost}</Button><Button variant="quiet" onClick={()=>setOfferId(null)}>Назад</Button></Modal>}
  {confirm&&<Modal title={confirm.title} onClose={()=>setConfirm(null)}><p>{confirm.body}</p>{error&&<p role="alert">{error}</p>}<Button onClick={()=>{if(act(confirm.command))setConfirm(null);else setError('Действие не сохранено. Закройте окно и проверьте сообщение на странице.');}}>{confirm.label}</Button><Button variant="quiet" onClick={()=>setConfirm(null)}>Вернуться без изменений</Button></Modal>}
 </>;
}
