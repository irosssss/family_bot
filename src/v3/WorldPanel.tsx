import {assetPath, LOCATIONS} from './content';
import {useState} from 'react';
import {Button,Modal,SectionTitle} from './components/ui';
import {FIRST_BOSS_HP,TASK_STRENGTH,type State,type Command,type MemberId} from './domain';
import './world.css';

export function WorldPanel({state,actor,act,openTasks}:{state:State;actor:MemberId;act:(c:Command)=>boolean;openTasks:()=>void}) {
 const [battle,setBattle]=useState(false);const [park,setPark]=useState(false);const [error,setError]=useState('');
 const campaign=state.campaign;const won=campaign?.hp===0;const strength=campaign?.strength[actor]??0;
 function run(c:Command){if(act(c)){setError('');return true;}setError('Действие не сохранено. Закройте окно и проверьте сообщение на странице.');return false;}
 return <>
  <SectionTitle title="Наше приключение" text="Одна дорога для всей семьи"/>
  <section className="v3-card"><h2>Ваша сила: {strength}</h2><p>Завершённое дело даёт {TASK_STRENGTH} силы. Дети и взрослые вместе открывают дорогу.</p>{!campaign?<><p>Начните приключение: сила будет начисляться за следующие завершённые дела. Старые награды сохранятся.</p><Button onClick={()=>run({type:'campaign.start'})}>Начать приключение</Button></>:<Button variant="quiet" onClick={openTasks}>К моим делам</Button>}</section>
  <div className="v3-world-map" aria-label="Карта приключения">
   <img className={`v3-world-route${won?' v3-world-route-won':''}`} src={assetPath('core:asset/world_route')} alt="Маршрут: Двор, Парк, Лес, Деревня, Снежный город"/>
   {won&&<img className="v3-world-park-open" src={assetPath('core:asset/world_open')} alt=""/>}
   {LOCATIONS.map(location=>{
    const yard=location.id==='core:location/yard';const parkLocation=location.id==='core:location/park';
    const enabled=yard||(parkLocation&&won);
    const label=yard?(won?'пройдено':'босс ждёт'):parkLocation?(won?'открыт':'закрыт, победите босса во дворе'):'закрыто, следующая глава';
    return <button key={location.id} data-content-id={location.id} className="v3-world-stop" style={{left:`${location.mapX}%`,top:`${location.mapY}%`}} aria-label={`${location.title} — ${label}`} disabled={!enabled} onClick={()=>{setError('');if(yard)setBattle(true);else if(parkLocation)setPark(true);}}/>;
   })}
  </div>
  <p className="v3-world-caption">{won?'Парк открыт всей семье. Следующий бой готовится.':'Нажмите на кристалл во дворе. Победа откроет парк всей семье.'}</p>
  {battle&&<Modal title={won?'Победа всей семьи!':'Босс во дворе'} onClose={()=>setBattle(false)}>
   <img className="v3-boss-scene" src={assetPath('core:asset/first_boss')} alt="Сказочный босс среди беспорядка в комнате"/>
   <label className="v3-boss-health">Здоровье: {campaign?.hp??FIRST_BOSS_HP} / {FIRST_BOSS_HP}<progress max={FIRST_BOSS_HP} value={campaign?.hp??FIRST_BOSS_HP}/></label>
   {won?<><p>Вы освободили дорогу в парк. Оставшаяся сила сохранена; монеты и опыт повторно не начисляются.</p><Button onClick={()=>{setBattle(false);setPark(true);}}>Открыть парк</Button></>:<><p>Ваша сила: {strength}. Удар нанесёт {Math.min(strength,campaign?.hp??FIRST_BOSS_HP)} урона.</p>{!campaign?<Button onClick={()=>run({type:'campaign.start'})}>Начать приключение</Button>:<Button disabled={strength===0} onClick={()=>run({type:'campaign.hit',hitId:crypto.randomUUID()})}>Ударить</Button>}{strength===0&&<Button variant="quiet" onClick={()=>{setBattle(false);openTasks();}}>Получить силу за дела</Button>}</>}
   {error&&<p role="alert">{error}</p>}
   {!!campaign?.hits.length&&<section><h3>Вклад семьи</h3>{state.members.map(m=>{const damage=campaign.hits.filter(h=>h.actorId===m.id).reduce((n,h)=>n+h.damage,0);return damage>0?<p key={m.id}>{m.name}: {damage} урона</p>:null;})}</section>}
  </Modal>}
  {park&&<Modal title="Парк открыт" onClose={()=>setPark(false)}><p>Первая победа открыла эту локацию всей семье. Следующий бой ещё готовится. Ваша сила остаётся с вами.</p><Button onClick={()=>setPark(false)}>Вернуться к карте</Button></Modal>}
 </>;
}
