import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Gift, Lamp, ScrollText, Users } from 'lucide-react';
import { canRenderSittingPose, Character } from './Character';
import { getSceneLayout, getSceneSeats } from './sceneLayout';
import { Art, Button, Empty, Modal, type ScreenProps } from './ui';
import type { DemoState, DemoUser } from './types';
import { AuthoredRoom } from './AuthoredRoom';
import { resolveAuthoredHomeScene } from './homeScenes';

export function Room({ state, themeId = state.home.themeId, onMember, compact = false }: { state: DemoState; themeId?: string; onMember?: (user: DemoUser) => void; compact?: boolean }) {
  const theme = state.catalog.themes.find(item => item.id === themeId) || state.catalog.themes[0];
  const scene = resolveAuthoredHomeScene(theme);
  return scene ? <AuthoredRoom state={state} theme={theme} scene={scene} onMember={onMember} compact={compact} />
    : <LegacyRoom state={state} themeId={themeId} onMember={onMember} compact={compact} />;
}

function LegacyRoom({ state, themeId, onMember, compact }: { state: DemoState; themeId: string; onMember?: (user: DemoUser) => void; compact: boolean }) {
  const [page, setPage] = useState(0);
  const roomRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(room); return () => observer.disconnect();
  }, []);
  const theme = state.catalog.themes.find(item => item.id === themeId) || state.catalog.themes[0];
  const layout = getSceneLayout(state.users, page, theme.layoutPresetId);
  // Authored seated poses are verified against these exact rooms; custom backgrounds
  // retain the chosen standing layout until their furniture has been art-reviewed.
  const seats = theme.art === `/assets/game/demo/home-${theme.layoutPresetId}.webp`
    ? getSceneSeats(theme.layoutPresetId, size.width, size.height) : [];
  const seated = layout.members.filter(({ member }) => member.role === 'parent' && canRenderSittingPose(member.appearance, state.catalog.items)).slice(0, seats.length);
  const standing = getSceneLayout(layout.members.map(item => item.member).filter(member => !seated.some(item => item.member.id === member.id)), 0, theme.layoutPresetId);
  return <div className={`demo-room-wrap ${compact ? 'compact' : ''}`}>
    <div className="demo-room" data-theme={theme.id} data-layout={theme.layoutPresetId} ref={roomRef}>
      <img className="demo-room-background" src={theme.art} alt={theme.name} draggable={false} />
      {!compact && <div className="demo-room-caption"><h1>Наша семья</h1><p>Маленькие шаги — большие перемены</p></div>}
      {Object.entries(state.home.decor).map(([slot, id]) => {
        const item = state.catalog.items.find(item => item.id === id);
        return item && <Art key={slot} src={item.art} name={item.name} className={`demo-room-decor decor-${slot}`} />;
      })}
      {seated.map(({ member }, index) => {
        const seat = seats[index];
        const x = seated.length === 1 && seats.length === 2 ? (seats[0].x + seats[1].x) / 2 : seat.x;
        return <div key={member.id} className="demo-room-member seated" style={{ left: x, top: seat.canvasTop, transform: 'translateX(-50%)', zIndex: 500 }}>
          <button className="demo-member-button" onClick={() => onMember?.(member)} disabled={!onMember} aria-label={`${member.name}: посмотреть дела`}>
            <Character appearance={member.appearance} subtype={member.subtype} size={seat.size} pose="sitting" showWeapon={false} title={member.name} />
            <span className="demo-member-name">{member.name}</span>
          </button>
        </div>;
      })}
      {standing.members.map(({ member, x, y, scale, zIndex }) => {
        const pet = state.catalog.pets.find(item => item.id === member.activePetId && member.petIds.includes(item.id));
        return <div key={member.id} className="demo-room-member" style={{ left: `${x}%`, top: `${y}%`, zIndex, '--member-scale': scale } as React.CSSProperties}>
          <button className="demo-member-button" onClick={() => onMember?.(member)} disabled={!onMember} aria-label={`${member.name}: посмотреть дела`}>
            <Character appearance={member.appearance} subtype={member.subtype} size={compact ? 90 * scale : 125 * scale} showWeapon={false} title={member.name} />
            <span className="demo-member-name">{member.name}</span>
          </button>
          {pet && <Art src={pet.art} name={`Питомец ${member.name}: ${pet.name}`} className="demo-room-pet" />}
        </div>;
      })}
      {layout.total === 0 && <p className="demo-room-empty">Добавьте семью в разделе «Семья».</p>}
      <div className="demo-room-label"><Lamp size={14} />{theme.name}</div>
    </div>
    {layout.pageCount > 1 && <div className="demo-scene-pages" aria-label="Группы семьи"><span>В доме {layout.total} человек</span>{Array.from({ length: layout.pageCount }, (_, index) => <button key={index} aria-pressed={index === layout.page} onClick={() => setPage(index)}>Группа {index + 1}</button>)}</div>}
  </div>;
}

export function HomeScreen({ state, user, act, busy, go }: ScreenProps & { go: (tab: 'home' | 'tasks' | 'adventure' | 'wardrobe' | 'family', section?: string) => void }) {
  const [member, setMember] = useState<DemoUser | null>(null);
  const pending = state.completions.filter(item => item.status === 'pending');
  const approved = state.completions.filter(item => item.day === state.day && item.status === 'approved');
  const done = state.dailyBonusDay === state.day;
  const ownTasks = state.tasks.filter(task => task.enabled && (task.assigneeIds.length === 0 || task.assigneeIds.includes(user.id)));
  const ownDone = ownTasks.filter(task => approved.some(item => item.userId === user.id && item.taskId === task.id)).length;
  const ownPending = pending.filter(item => item.userId === user.id && item.day === state.day).length;
  const nextTask = [...ownTasks].sort((a, b) => a.order - b.order).find(task => !state.completions.some(item => item.day === state.day && item.userId === user.id && item.taskId === task.id && item.status !== 'rejected'));
  return <div className="demo-home-layout">
    <section className="demo-home-scene"><Room state={state} onMember={setMember} /><button className="demo-room-action" onClick={() => go('wardrobe', 'home')} aria-label="Обустроить дом"><Lamp size={20} /><span>Обустроить</span></button></section>
    <aside className="demo-home-aside">
      <button className="demo-mission" onClick={() => go('tasks')} aria-label="Открыть сегодняшние дела"><span className="demo-mission-icon"><ScrollText size={27} /></span><span className="demo-mission-content"><span className="demo-mission-heading">Сегодняшние задания<small>{user.role === 'parent' ? `${pending.length} на проверке` : `${ownDone} / ${ownTasks.length}`}</small></span><span className="demo-mission-description">{user.role === 'parent' ? pending.length ? 'Помогите детям заметить свои победы' : 'Сегодня можно просто быть рядом' : nextTask?.title || (ownPending ? 'Ждём подтверждения взрослого' : 'Всё сделано. Время отдохнуть!')}</span>{user.role === 'child' && <span className="demo-mission-progress" role="progressbar" aria-label="Задания на сегодня" aria-valuenow={ownDone} aria-valuemin={0} aria-valuemax={Math.max(ownTasks.length, 1)}><span style={{ width: `${ownTasks.length ? ownDone / ownTasks.length * 100 : 0}%` }} /></span>}</span><ArrowRight className="demo-mission-arrow" size={20} /></button>
      <section className="demo-bonus"><Gift size={24} /><div><h2>Подарок новому дню</h2><p>{done ? 'Уже в семейной копилке. До завтра!' : '2 монеты на семью. Без серий и штрафов.'}</p></div><Button variant="quiet" aria-label={done ? 'Подарок дня уже получен' : undefined} disabled={busy || done} onClick={() => act({ action: 'claimDaily' })}>{done ? <Check size={20} aria-hidden /> : 'Забрать'}</Button></section>
      <section className="demo-journal"><header><h2>История нашего дома</h2><span>{approved.length} дел сегодня</span></header>{state.activity.length ? <ol>{state.activity.slice(0, 4).map(item => <li key={item.id}><span className="demo-journal-dot" /><div><p>{item.text}</p><time>{new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit', timeZone: state.timezone }).format(new Date(item.at))}</time></div></li>)}</ol> : <Empty>Здесь появится первое доброе дело вашей семьи.</Empty>}</section>
      <div className="demo-home-note"><Users size={19} /><p>Дом меняется вместе с вами. Все близкие на своих местах, а новые вещи появляются благодаря общим делам.</p></div>
    </aside>
    {member && <Modal title={member.name} onClose={() => setMember(null)}><div className="demo-person-summary"><Character appearance={member.appearance} subtype={member.subtype} size={130} /><div><h3>{member.role === 'parent' ? 'Хранитель семейного уюта' : `Уровень ${member.level}`}</h3><p>{member.role === 'parent' ? 'Помогает, поддерживает и подтверждает дела.' : `${member.energy} энергии для приключений`}</p></div></div>{member.role === 'child' ? <><h3>Дела сегодня</h3>{state.tasks.filter(task => task.enabled && (!task.assigneeIds.length || task.assigneeIds.includes(member.id))).map(task => { const completion = state.completions.find(item => item.taskId === task.id && item.userId === member.id && item.day === state.day); return <div className="demo-simple-row" key={task.id}><span>{task.title}</span><small>{completion?.status === 'approved' ? 'Готово' : completion?.status === 'pending' ? 'На проверке' : 'Впереди'}</small></div>; })}</> : <p>Ваш профиль не изменился. Переключиться можно в верхней панели.</p>}<Button variant="quiet" onClick={() => setMember(null)}>Вернуться домой</Button></Modal>}
  </div>;
}
