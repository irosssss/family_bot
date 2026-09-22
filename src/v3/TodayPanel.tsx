import {outfitImage} from './content';
import {useState} from 'react';
import {Coins, Star, ClipboardList, Clock3, Check, ChevronRight} from 'lucide-react';
import {availableCoins,canReviewTask,type State,type MemberId,type Command} from './domain';
import './today.css';

export function TodayPanel({state,actor,act,openTasks,openHero,openWallet}:{state:State;actor:MemberId;act:(command:Command)=>boolean;openTasks:()=>void;openHero:()=>void;openWallet:()=>void}){
 const user=state.members.find(m=>m.id===actor)!;
 const tasks=state.tasks.filter(t=>t.ownerId===actor);
 const pendingReview=state.tasks.filter(t=>t.status==='pending'&&canReviewTask(state,actor,t)).length;
 const preview=tasks.filter(t=>t.status!=='approved').slice(0,2);
 return <div className="today-content">
  <button className="today-wallet" onClick={openWallet} aria-label={`Кошелёк: ${availableCoins(state,actor)} монет доступно, ${user.xp} опыта`}><span><Coins aria-hidden="true"/>{availableCoins(state,actor)} монет</span><span><Star aria-hidden="true"/>{user.xp} опыта</span></button>
  <section className="today-scene" aria-label="Наша семья"><h1>Хорошо быть вместе</h1><div className={`today-family ${state.members.length>4?'today-family-many':''}`}>{state.members.map(m=><FamilyFigure key={m.id} name={m.name} avatar={m.avatar??m.id} outfit={state.equippedOutfits[m.id]} child={m.role==='child'}/>)}</div></section>
  <section className="today-board"><h2>Мои дела</h2><div className="today-counts">{([{status:'todo',label:'осталось',Icon:ClipboardList},{status:'pending',label:'на проверке',Icon:Clock3},{status:'approved',label:'готово',Icon:Check}] as const).map(({status,label,Icon})=><div key={status}><Icon aria-hidden="true"/><strong>{tasks.filter(t=>t.status===status).length}</strong><span>{label}</span></div>)}</div>
  <div className="today-task-list">{preview.map(t=><article className="today-task" key={t.id}><div className="today-task-copy"><h3>{t.title}</h3><p><Coins size={16} aria-hidden="true"/>{t.coins} монет <span>· {t.xp} опыта</span></p></div>{t.status==='todo'?<button className="today-complete" onClick={()=>act({type:'task.submit',taskId:t.id})}>Выполнить</button>:<span className="today-pending">На проверке</span>}</article>)}{preview.length===0&&<p className="today-empty">{tasks.length?'Все текущие дела выполнены.':'Пока нет назначенных дел.'}</p>}</div>
  <button className="today-all" onClick={openTasks}><ClipboardList aria-hidden="true"/>Все дела<ChevronRight aria-hidden="true"/></button>
  {user.role==='parent'&&pendingReview>0&&<button className="today-review" onClick={openTasks}>Ждут вашей проверки: {pendingReview}<ChevronRight aria-hidden="true"/></button>}
  </section><button className="today-all today-hero-link" onClick={openHero}>Мой герой и комплекты<ChevronRight aria-hidden="true"/></button>
 </div>;
}
function FamilyFigure({name,avatar,outfit,child}:{name:string;avatar:string;outfit:string;child:boolean}){
 const [failed,setFailed]=useState(false);const src=outfitImage(avatar,outfit);
 return <figure className={child?'today-child':''}>{failed?<span className="today-portrait-fallback">{name}</span>:<img key={src} src={src} alt={name} onError={()=>setFailed(true)}/>}</figure>;
}
