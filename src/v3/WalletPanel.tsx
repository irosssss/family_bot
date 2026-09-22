import {useState} from 'react';
import {Coins, LockKeyhole, Star} from 'lucide-react';
import {Button} from './components/ui';
import {availableCoins,reservedCoins,type State,type MemberId} from './domain';
import './wallet.css';

export function WalletSummary({state,actor}:{state:State;actor:MemberId}) {
 const user=state.members.find(m=>m.id===actor)!;
 return <section className="v3-wallet-summary" aria-label="Баланс кошелька">
  <div className="v3-wallet-available"><Coins size={25} aria-hidden/><div><strong>{availableCoins(state,actor)}</strong><span>монет доступно</span></div></div>
  <dl><div><dt><LockKeyhole size={16} aria-hidden/>В резерве</dt><dd>{reservedCoins(state,actor)}</dd></div><div><dt>Всего монет</dt><dd>{user.coins}</dd></div><div><dt><Star size={16} aria-hidden/>Опыт</dt><dd>{user.xp}</dd></div></dl>
 </section>;
}

export function WalletPanel({state,actor}:{state:State;actor:MemberId}) {
 const [filter,setFilter]=useState('all');
 const entries=state.ledger.filter(e=>e.memberId===actor);
 const visible=entries.filter(e=>filter==='all'||(filter==='income'?e.coins>0:e.coins<0)).slice().reverse();
 const reserved=state.promises.filter(p=>p.ownerId===actor&&p.status==='requested');
 return <div className="v3-wallet-panel">
  <WalletSummary state={state} actor={actor}/>
  <section className="v3-wallet-reserve"><h3>Резерв обещаний</h3><p>Эти монеты ещё ваши, но потратить их на комплект нельзя. Они спишутся при одобрении обещания взрослым.</p>
   {reserved.length?<ul>{reserved.map(p=><li key={p.id}><span>{p.title}</span><strong>{p.cost} монет</strong></li>)}</ul>:<p>Сейчас монет в резерве нет.</p>}
  </section>
  <h3>История операций</h3>
  <div className="v3-filter" aria-label="Тип операций">{[['all','Все'],['income','Приход'],['expense','Расход']].map(([id,label])=><Button key={id} variant="quiet" aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</Button>)}</div>
  {!visible.length&&<p>{entries.length?'Таких операций пока нет. Выберите другой фильтр.':'Пока нет операций. Здесь появятся награды за дела, покупки и возвраты. Начальный тестовый баланс в историю не входит.'}</p>}
  <ul className="v3-wallet-entries">{visible.map(e=><li key={e.id}><span>{e.title}</span><div><strong className={e.coins>0?'v3-wallet-income':'v3-wallet-expense'}>{e.coins>0?'+':''}{e.coins} монет</strong>{e.xp>0&&<small>+{e.xp} опыта</small>}</div></li>)}</ul>
 </div>;
}
