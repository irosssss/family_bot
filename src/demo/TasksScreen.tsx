import { useState } from 'react';
import { BookOpen, Check, Clock, Droplets, HeartHandshake, House, RotateCcw, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { Button, Empty, Modal, Money, SectionTitle, type ScreenProps } from './ui';
import type { DemoCompletion } from './types';

const categories = { all: 'Все', care: 'О себе', home: 'Дом', learning: 'Учёба', together: 'Вместе' };
const categoryIcons = { care: Droplets, home: House, learning: BookOpen, together: HeartHandshake };
export function TasksScreen({ state, user, act, busy }: ScreenProps) {
  const [category, setCategory] = useState('all');
  const [scope, setScope] = useState<'all' | 'personal' | 'shared'>('all');
  const children = state.users.filter(item => item.role === 'child' && !item.archived);
  const [childId, setChildId] = useState(children[0]?.id || '');
  const targetId = user.role === 'parent' ? children.find(child => child.id === childId)?.id || children[0]?.id || '' : user.id;
  const [rejection, setRejection] = useState<DemoCompletion | null>(null);
  const [note, setNote] = useState('');
  const available = state.tasks.filter(task => task.enabled && (!task.assigneeIds.length || task.assigneeIds.includes(targetId))).sort((a, b) => a.order - b.order);
  const tasks = available.filter(task => (category === 'all' || task.category === category) && (scope === 'all' || task.shared === (scope === 'shared')));
  const pending = state.completions.filter(item => item.status === 'pending');
  const todayApproved = state.completions.filter(item => item.day === state.day && item.userId === targetId && item.status === 'approved');
  const completed = available.filter(task => todayApproved.some(item => item.taskId === task.id)).length;
  const earnedXp = todayApproved.reduce((total, item) => total + item.reward.xp, 0);
  const targetName = state.users.find(person => person.id === targetId)?.name;
  return <>
    <SectionTitle title={user.role === 'parent' ? 'Дела нашей семьи' : 'Мои задания'} text={user.role === 'parent' ? 'Подтверждайте, подсказывайте и радуйтесь вместе.' : 'Забота о себе и близких делает наш дом сильнее.'} />
    {user.role === 'parent' && <section className="demo-approval-board"><h2>Ждут подтверждения <span>{pending.length}</span></h2>{pending.length ? pending.map(item => <article key={item.id} className="demo-approval"><ShieldCheck size={22} /><div><h3>{state.tasks.find(task => task.id === item.taskId)?.title}</h3><p>{state.users.find(person => person.id === item.userId)?.name} · {item.day}</p><div className="demo-actions"><Button disabled={busy} onClick={() => act({ action: 'approveTask', completionId: item.id })}>Подтвердить</Button><Button variant="quiet" disabled={busy} onClick={() => { setRejection(item); setNote(''); }}>Ещё чуть-чуть</Button></div></div></article>) : <Empty>Пока нет дел на проверке. Всё спокойно.</Empty>}</section>}
    {user.role === 'parent' && <label className="demo-field demo-child-select">Отметить дело за ребёнка<select value={targetId} disabled={!children.length} onChange={event => setChildId(event.target.value)}>{children.length ? children.map(child => <option key={child.id} value={child.id}>{child.name}</option>) : <option value="">В семье пока нет детей</option>}</select></label>}
    <section className="demo-day-summary" aria-label="Итог заданий за сегодня"><div className="demo-day-summary-heading"><h2>Сегодня{user.role === 'parent' && targetName ? `: ${targetName}` : ''}</h2><span><Sparkles size={15} /> +{earnedXp} опыта</span></div><div className="demo-day-progress" role="progressbar" aria-label="Выполненные задания" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={Math.max(available.length, 1)}><span style={{ width: `${available.length ? completed / available.length * 100 : 0}%` }} /></div><p>Выполнено {completed} из {available.length}<span>Награда — после выполнения</span></p></section>
    <div className="demo-task-filters"><div className="demo-tabs" aria-label="Тип заданий">{([['all', 'Все дела'], ['personal', 'Личные'], ['shared', 'Семейные']] as const).map(([id, label]) => <button key={id} aria-pressed={scope === id} onClick={() => setScope(id)}>{label}</button>)}</div><label className="demo-task-category">Категория<select value={category} onChange={event => setCategory(event.target.value)}>{Object.entries(categories).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div>
    <div className="demo-task-list">{tasks.map(task => {
      const completion = state.completions.find(item => item.day === state.day && item.taskId === task.id && item.userId === targetId);
      const approved = completion?.status === 'approved'; const waiting = completion?.status === 'pending';
      const participants = state.users.filter(person => person.role === 'child' && !person.archived && (!task.assigneeIds.length || task.assigneeIds.includes(person.id)));
      const sharedDone = state.completions.filter(item => item.taskId === task.id && item.day === state.day && item.status === 'approved').length;
      const Icon = categoryIcons[task.category];
      return <article className={`demo-task ${task.shared ? 'shared' : ''} ${approved ? 'completed' : ''} ${waiting ? 'waiting' : ''}`} key={task.id}>
        <div className={`demo-task-symbol ${task.category}`} aria-hidden><Icon size={25} /></div>
        <div className="demo-task-content"><div className="demo-task-type">{task.shared ? <><HeartHandshake size={12} />Семейное дело</> : task.requiresApproval ? <><ShieldCheck size={12} />С подтверждением</> : 'Личное дело'}</div><h2>{task.title}</h2><p>{task.description}</p>
          {task.shared && <p className="demo-shared-progress">Участники: {sharedDone} из {participants.length}. Награда общая.</p>}
          <div className="demo-rewards"><Money value={task.reward.coins} /><span>+{task.reward.xp} опыта{task.shared ? ' на всех' : ''}</span><span><Zap size={14} />{task.reward.energy}</span></div>
          {completion?.status === 'rejected' && <p className="demo-review-note">{completion.note || 'Попробуй ещё раз — мы рядом.'}</p>}
        </div>
        <Button className="demo-task-complete" variant={approved || waiting ? 'quiet' : 'primary'} disabled={busy || approved || waiting || !targetId} aria-label={`${task.title}: ${approved ? 'выполнено' : waiting ? 'на проверке' : completion?.status === 'rejected' ? 'отправить ещё раз' : user.role === 'parent' ? 'отметить за ребёнка' : 'отметить выполнение'}`} onClick={() => act({ action: 'completeTask', taskId: task.id, userId: targetId })}>{approved ? <><Check size={22} /><span>Готово</span></> : waiting ? <><Clock size={22} /><span>Ждём</span></> : completion?.status === 'rejected' ? <><RotateCcw size={22} /><span>Повторить</span></> : <><Check size={22} /><span>{user.role === 'parent' ? 'Отметить' : 'Я сделал'}</span></>}</Button>
      </article>;
    })}{!tasks.length && <Empty>{available.length ? 'В этой категории пока нет заданий. Попробуйте выбрать «Все дела» и категорию «Все».' : 'Здесь пока нет дел. Взрослый может добавить их в разделе «Семья».'}</Empty>}</div>
    {rejection && <Modal title="Поддержать и подсказать" onClose={() => setRejection(null)}><p>Что ещё можно сделать? Это не штраф — ребёнок сможет отправить результат повторно.</p><label className="demo-field">Подсказка<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={300} placeholder="Давай вместе проверим…" /></label><div className="demo-actions"><Button disabled={busy} onClick={async () => { if (await act({ action: 'rejectTask', completionId: rejection.id, note: note || 'Попробуй ещё раз — мы рядом.' })) setRejection(null); }}>Отправить подсказку</Button><Button variant="quiet" onClick={() => setRejection(null)}>Отмена</Button></div></Modal>}
  </>;
}
