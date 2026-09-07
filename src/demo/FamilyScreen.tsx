import { useState } from 'react';
import { Archive, Check, Pencil, Plus, RotateCcw, ScrollText, Settings2, ShieldCheck, Swords, Users, Zap } from 'lucide-react';
import { Character } from './Character';
import { Art, Button, classes, Empty, Modal, SectionTitle, subtypes, type ScreenProps } from './ui';
import type { DemoAction, DemoSubtype, DemoTask, DemoUser } from './types';
import './wardrobe-v2.css';

type CatalogKind = NonNullable<DemoAction['catalog']>;
const sections = { users: 'Участники', tasks: 'Дела', bosses: 'Соперники', pets: 'Питомцы', items: 'Вещи', themes: 'Комнаты' };
const defaultCatalog: Record<CatalogKind, Record<string, unknown>> = {
  bosses: { name: '', description: '', art: '/assets/game/demo/boss-b01.png', enabled: true, order: 100, theme: 'Семейное приключение', hp: 60, ability: 'Вместе получится', reward: { coins: 25, xp: 20 } },
  pets: { name: '', description: '', art: '/assets/game/demo/pet-p01.png', enabled: true, order: 100, price: 30, hatchCost: 0, eggName: 'Известное яйцо' },
  items: { name: '', description: '', art: '/assets/game/demo/decor/plant.png', enabled: true, order: 100, kind: 'decor', classId: 'all', slot: 'shelf', price: 25, currency: 'coins', color: '#719371', layerArt: '' },
  themes: { name: '', description: '', art: '/assets/game/demo/home-fireplace.webp', enabled: true, order: 100, price: 50, currency: 'coins', palette: '#9b6346', layoutPresetId: 'fireplace' },
};

export function FamilyScreen({ state, user, act, busy }: ScreenProps) {
  const [section, setSection] = useState<keyof typeof sections>('users');
  const [query, setQuery] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<DemoUser> | null>(null);
  const [editingTask, setEditingTask] = useState<Partial<DemoTask> | null>(null);
  const [editingEntry, setEditingEntry] = useState<Record<string, unknown> | null>(null);
  const adult = user.role === 'parent';
  const users = state.users.filter(item => showHidden || !item.archived);
  const approvedCompletions = state.completions.filter(completion => completion.status === 'approved');
  const sharedTaskIds = new Set(state.tasks.filter(task => task.shared).map(task => task.id));
  const sharedDays = new Set(approvedCompletions.filter(completion => {
    const budget = state.taskDayBudgets[`${completion.day}:${completion.taskId}`];
    return budget ? budget.shared : sharedTaskIds.has(completion.taskId);
  }).map(completion => `${completion.day}:${completion.taskId}`));
  const entries = section !== 'users' && section !== 'tasks'
    ? state.catalog[section].filter(item => (showHidden || item.enabled) && item.name.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))).sort((a, b) => a.order - b.order)
    : [];
  const addEntry = () => {
    if (section === 'users') setEditingUser({ name: '', subtype: 'son', age: 8 });
    else if (section === 'tasks') setEditingTask({ title: '', description: '', category: 'home', requiresApproval: true, shared: false, assigneeIds: [], reward: { xp: 10, gold: 5, energy: 10, coins: 5 }, enabled: true, order: state.tasks.length });
    else setEditingEntry({ ...defaultCatalog[section] });
  };

  return <div className="demo-v2-family">
    <SectionTitle title="Наша семья" text="У каждого свой характер. Наши маленькие шаги становятся общим приключением." />

    {adult && <details className="demo-v2-editor-disclosure" onToggle={event => {
      if (!event.currentTarget.open) {
        setSection('users');
        setQuery('');
        setShowHidden(false);
      }
    }}>
      <summary><Settings2 size={20} /><span>Редактор семьи и игры<small>Участники, дела и игровые коллекции</small></span></summary>
      <div className="demo-v2-editor-body">
        <div className="demo-editor-notice"><ShieldCheck size={21} /><p>Инструменты взрослого в локальной демо. Это не настоящая авторизация Telegram. Скрытие обратимо: прогресс и покупки остаются.</p></div>
        <div className="demo-tabs" aria-label="Редактируемая коллекция">
          {Object.entries(sections).map(([id, label]) => <button key={id} aria-pressed={section === id} onClick={() => { setSection(id as keyof typeof sections); setQuery(''); }}>{label}</button>)}
        </div>
        <div className="demo-editor-toolbar">
          <label className="demo-check"><input type="checkbox" checked={showHidden} onChange={event => setShowHidden(event.target.checked)} />Показать скрытые</label>
          <Button variant="quiet" onClick={addEntry}><Plus size={18} />Добавить</Button>
        </div>
      </div>
    </details>}

    {section === 'users' && <>
      <div className="demo-v2-family-cards">
        {users.map(person => {
          const pet = person.role === 'child' && person.petIds.includes(person.activePetId || '')
            ? state.catalog.pets.find(pet => pet.id === person.activePetId) : undefined;
          const equipment = [person.appearance.weaponId, person.appearance.bodyId]
            .map(id => state.catalog.items.find(item => item.id === id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
          return <article className={`demo-v2-family-card ${person.archived ? 'is-archived' : ''}`} key={person.id}>
            <div className="demo-v2-family-portrait">
              <Character appearance={person.appearance} subtype={person.subtype} size={155} title={`Образ ${person.name}`} />
            </div>
            <div className="demo-v2-family-person-info">
              <span className="demo-v2-role-label">{subtypes[person.subtype]}{person.archived ? ' · скрыт' : ''}</span>
              <h2>{person.name}</h2>
              <p className="demo-v2-family-class">{classes[person.appearance.classId]}</p>
              {person.role === 'parent' ? <div className="demo-v2-family-parent"><ShieldCheck size={18} /><span>Поддержка и забота<small>Управляет делами семьи</small></span></div> : <>
                <div className="demo-v2-family-level"><strong>Уровень {person.level}</strong><span>{person.xp} XP</span></div>
                <progress value={person.xp % 100} max={100} aria-label={`Прогресс ${person.name} до следующего уровня: ${person.xp % 100} из 100 опыта`} />
                <p className="demo-v2-family-energy"><Zap size={15} />{person.energy} / 100 энергии</p>
              </>}
              <div className="demo-v2-family-equipment" aria-label="Надетые вещи">
                {equipment.map(item => <span key={item.id} title={item.name}><Art src={item.art} name={item.name} /></span>)}
              </div>
            </div>
            {pet && <div className="demo-v2-family-pet"><Art src={pet.art} name={pet.name} /><div><small>Верный спутник</small><strong>{pet.name}</strong></div></div>}
            {person.archived && <p className="demo-v2-archive-note">Профиль скрыт. Прогресс и коллекция сохранены.</p>}
            {adult && <div className="demo-v2-family-actions">
              <Button variant="quiet" onClick={() => setEditingUser(person)}><Pencil size={16} />Изменить</Button>
              <Button variant="quiet" disabled={busy} onClick={() => act(person.archived ? { action: 'saveUser', user: { id: person.id, archived: false } } : { action: 'archiveUser', userId: person.id })}>
                {person.archived ? <><RotateCcw size={16} />Вернуть</> : <><Archive size={16} />Скрыть</>}
              </Button>
            </div>}
          </article>;
        })}
      </div>
      <section className="demo-v2-family-milestones" aria-labelledby="demo-family-milestones">
        <div className="demo-v2-control-heading"><Users size={21} /><h2 id="demo-family-milestones">Наши общие шаги</h2></div>
        <p>То, что уже получилось. Каждый вклад остаётся частью семейной истории.</p>
        <dl>
          <div><dt><Check size={20} />Выполнено дел</dt><dd>{approvedCompletions.length}</dd></div>
          <div><dt><ScrollText size={20} />Совместных дел с вкладом</dt><dd>{sharedDays.size}</dd></div>
          <div><dt><Swords size={20} />Соперников побеждено</dt><dd>{new Set(state.defeatedBossIds).size}</dd></div>
        </dl>
        <small>В счётчик дел входят только подтверждённые выполнения.</small>
      </section>
    </>}

    {adult && section === 'tasks' && <div className="demo-editor-list">
      {state.tasks.filter(task => showHidden || task.enabled).sort((a, b) => a.order - b.order).map(task =>
        <article key={task.id} className={!task.enabled ? 'archived' : ''}>
          <div><h3>{task.title}</h3><p>{task.shared ? 'Совместное · ' : ''}{task.requiresApproval ? 'Подтверждает взрослый' : 'Доверенное'} · {task.reward.coins} монет{task.shared ? ' на всех' : ''}</p><small>{task.enabled ? 'Доступно' : 'Скрыто'} · порядок {task.order}</small></div>
          <button className="demo-icon-button" aria-label={`Изменить дело: ${task.title}`} onClick={() => setEditingTask(task)}><Pencil size={20} /></button>
        </article>,
      )}
    </div>}
    {adult && section !== 'users' && section !== 'tasks' && <>
      <label className="demo-field">Поиск в каталоге «{sections[section]}»<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Название" /></label>
      <p className="demo-muted">Показано {entries.length} из {state.catalog[section].length}. Уже надетые вещи и активные комнаты защищены от скрытия.</p>
      <div className="demo-editor-list">
        {entries.map(entry => <article key={entry.id} className={!entry.enabled ? 'archived' : ''}>
          <Art src={entry.art} name={entry.name} /><div><h3>{entry.name}</h3><p>{entry.enabled ? 'Доступно' : 'Скрыто'} · порядок {entry.order}</p>{entry.sourceRef && <small>Референс {entry.sourceRef}, позиция {(entry.sourceIndex ?? 0) + 1}</small>}</div>
          <button className="demo-icon-button" aria-label={`Изменить: ${entry.name}`} onClick={() => setEditingEntry({ ...entry })}><Pencil size={20} /></button>
        </article>)}
      </div>
      {!entries.length && <Empty>Нет совпадений. Попробуйте другое название или покажите скрытые записи.</Empty>}
    </>}
    {!adult && <div className="demo-home-note"><Settings2 size={22} /><p>Добавлять участников и менять правила дел могут взрослые. Ваш образ меняется в гардеробе.</p></div>}
    {editingUser && <UserEditor value={editingUser} busy={busy} onClose={() => setEditingUser(null)} onSave={async value => { if (await act({ action: 'saveUser', user: value })) setEditingUser(null); }} />}
    {editingTask && <TaskEditor value={editingTask} state={state} busy={busy} onClose={() => setEditingTask(null)} onSave={async task => { if (await act({ action: 'saveTask', task })) setEditingTask(null); }} />}
    {editingEntry && section !== 'users' && section !== 'tasks' && <CatalogEditor kind={section} value={editingEntry} busy={busy} onClose={() => setEditingEntry(null)} onSave={async entry => { if (await act({ action: 'saveCatalog', catalog: section, entry })) setEditingEntry(null); }} />}
  </div>;
}

function UserEditor({ value, busy, onSave, onClose }: { value: Partial<DemoUser>; busy: boolean; onSave: (value: NonNullable<DemoAction['user']>) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(value.name || '');
  const [subtype, setSubtype] = useState<DemoSubtype>(value.subtype || 'son');
  const [age, setAge] = useState(value.age || 8);
  const adult = subtype === 'father' || subtype === 'mother';
  return <Modal title={value.id ? 'Участник семьи' : 'Новый участник'} onClose={onClose}><form onSubmit={event => { event.preventDefault(); void onSave({ ...(value.id ? { id: value.id } : {}), name, subtype, age }); }}><label className="demo-field">Имя<input required maxLength={32} value={name} onChange={event => setName(event.target.value)} /></label><label className="demo-field">Роль в семье<select value={subtype} onChange={event => { const next = event.target.value as DemoSubtype; setSubtype(next); if (next === 'father' || next === 'mother') setAge(Math.max(18, age)); else setAge(Math.min(17, age)); }}>{Object.entries(subtypes).filter(([id]) => !value.id || (value.role === 'parent' ? id === 'father' || id === 'mother' : id === 'son' || id === 'daughter')).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label className="demo-field">Возраст<input type="number" required min={adult ? 18 : 1} max={adult ? 100 : 17} value={age} onChange={event => setAge(Number(event.target.value))} /></label>{value.id && <p className="demo-muted">Детский и взрослый тип профиля разделены. Для другого типа создайте новый профиль, сохранив старый в архиве.</p>}<div className="demo-actions"><Button type="submit" disabled={busy}>Сохранить участника</Button><Button variant="quiet" onClick={onClose}>Отмена</Button></div></form></Modal>;
}

function TaskEditor({ value, state, busy, onSave, onClose }: { value: Partial<DemoTask>; state: ScreenProps['state']; busy: boolean; onSave: (task: Partial<DemoTask>) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(value);
  const reward = draft.reward!;
  const field = (key: keyof DemoTask, next: unknown) => setDraft({ ...draft, [key]: next });
  return <Modal title={value.id ? 'Настроить дело' : 'Новое дело'} onClose={onClose}><form onSubmit={event => { event.preventDefault(); void onSave(draft); }}><label className="demo-field">Название<input required maxLength={80} value={draft.title || ''} onChange={event => field('title', event.target.value)} /></label><label className="demo-field">Описание<textarea maxLength={300} value={draft.description || ''} onChange={event => field('description', event.target.value)} /></label><label className="demo-field">Категория<select value={draft.category} onChange={event => field('category', event.target.value)}>{Object.entries({ care: 'О себе', home: 'Дом', learning: 'Учёба', together: 'Вместе' }).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label className="demo-check"><input type="checkbox" checked={draft.requiresApproval} onChange={event => field('requiresApproval', event.target.checked)} />Нужно подтверждение взрослого</label><label className="demo-check"><input type="checkbox" checked={draft.shared} onChange={event => field('shared', event.target.checked)} />Совместное дело: один бюджет награды</label><fieldset><legend>Участники (не выбрано — все дети)</legend>{state.users.filter(person => person.role === 'child' && !person.archived).map(person => <label className="demo-check" key={person.id}><input type="checkbox" checked={draft.assigneeIds?.includes(person.id)} onChange={event => field('assigneeIds', event.target.checked ? [...draft.assigneeIds!, person.id] : draft.assigneeIds!.filter(id => id !== person.id))} />{person.name}</label>)}</fieldset><div className="demo-form-grid">{([['coins', 'Монеты семьи'], ['xp', 'Опыт'], ['energy', 'Энергия']] as const).map(([key, label]) => <label key={key} className="demo-field">{label}<input type="number" min={0} max={key === 'energy' ? 30 : 100} required value={reward[key]} onChange={event => field('reward', { ...reward, [key]: Number(event.target.value), ...(key === 'coins' ? { gold: Number(event.target.value) } : {}) })} /></label>)}<label className="demo-field">Порядок<input type="number" min={0} max={10000} value={draft.order} onChange={event => field('order', Number(event.target.value))} /></label></div><label className="demo-check"><input type="checkbox" checked={draft.enabled} onChange={event => field('enabled', event.target.checked)} />Доступно семье</label><p className="demo-muted">Награда уже отправленного дела зафиксирована. Изменение общего бюджета не должно менять сегодняшний начатый экземпляр.</p><div className="demo-actions"><Button type="submit" disabled={busy}>Сохранить дело</Button><Button variant="quiet" onClick={onClose}>Отмена</Button></div></form></Modal>;
}

function CatalogEditor({ value, kind, busy, onSave, onClose }: { value: Record<string, unknown>; kind: CatalogKind; busy: boolean; onSave: (entry: Record<string, unknown>) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState<Record<string, unknown>>(value);
  const set = (key: string, value: unknown) => setDraft({ ...draft, [key]: value });
  const input = (key: string, label: string, type = 'text', max = 10000) => <label className="demo-field" key={key}>{label}<input type={type} required={key !== 'layerArt'} min={key === 'hp' ? 30 : 0} max={max} maxLength={key === 'art' || key === 'layerArt' ? 240 : 80} value={String(draft[key] ?? '')} onChange={event => set(key, type === 'number' ? Number(event.target.value) : event.target.value)} /></label>;
  const select = (key: string, label: string, options: Record<string, string>) => <label className="demo-field" key={key}>{label}<select value={String(draft[key] ?? Object.keys(options)[0])} onChange={event => set(key, event.target.value)}>{Object.entries(options).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>;
  const reward = (draft.reward || { coins: 25, xp: 20 }) as { coins: number; xp: number };
  return <Modal title={`${value.id ? 'Изменить' : 'Добавить'}: ${sections[kind]}`} onClose={onClose}><form onSubmit={event => { event.preventDefault(); void onSave({ ...draft, ...(draft.kind === 'decor' ? { classId: 'all' } : {}), ...(draft.layerArt === '' ? { layerArt: undefined } : {}) }); }}>{input('name', 'Название')}<label className="demo-field">Описание<textarea maxLength={400} value={String(draft.description || '')} onChange={event => set('description', event.target.value)} /></label>{input('art', 'Путь изображения в /assets/game/')}{typeof draft.art === 'string' && draft.art.startsWith('/assets/game/') && <Art className="demo-editor-preview" src={draft.art} name="Предпросмотр изображения" />}
    {kind === 'bosses' && <>{input('theme', 'История / группа')}{input('hp', 'Силы соперника', 'number', 5000)}{input('ability', 'Особенность')}<div className="demo-form-grid">{Object.entries({ coins: 'Монеты за первую победу', xp: 'Опыт каждому участнику' }).map(([key, label]) => <label key={key} className="demo-field">{label}<input type="number" min={0} max={key === 'coins' ? 200 : 100} value={reward[key as keyof typeof reward]} onChange={event => set('reward', { ...reward, [key]: Number(event.target.value) })} /></label>)}</div></>}
    {kind === 'pets' && <>{input('eggName', 'Название известного яйца')}{input('price', 'Цена яйца, монеты', 'number', 500)}<p className="demo-muted">Вид известен заранее, вылупление бесплатно. Скрытый вид остаётся у тех, кто его уже получил.</p></>}
    {kind === 'items' && <>{select('kind', 'Тип вещи', { decor: 'Декор', body: 'Одежда', weapon: 'Оружие' })}{draft.kind === 'decor' ? select('slot', 'Место в комнате', { shelf: 'Полка', floor: 'Пол', wall: 'Стена' }) : <>{select('classId', 'Совместимый класс', { ...classes, all: 'Все классы' })}{input('layerArt', 'Слой персонажа (PNG 256×320 с прозрачностью)')}<p className="demo-muted">У нового предмета нужен отдельный выровненный слой, а не только картинка карточки. Начало пути: /assets/game/.</p></>}{input('price', 'Цена', 'number', 1000)}{select('currency', 'Валюта', { coins: 'Семейные монеты', decorativeCredits: 'Демо-кристаллы (только декор)' })}{input('color', 'Цвет подписи', 'color')}</>}
    {kind === 'themes' && <>{input('price', 'Цена комнаты', 'number', 1000)}{select('currency', 'Валюта', { coins: 'Семейные монеты', decorativeCredits: 'Демо-кристаллы' })}{input('palette', 'Цвет комнаты', 'color')}{select('layoutPresetId', 'Проверенная схема расстановки', { fireplace: 'Дом у камина', library: 'Библиотека', conservatory: 'Зимний сад' })}<p className="demo-muted">Новый фон должен иметь свободный пол и соответствовать выбранной схеме. Координаты людей и декора берутся из неё.</p></>}
    {input('order', 'Порядок в каталоге', 'number')}<label className="demo-check"><input type="checkbox" checked={Boolean(draft.enabled)} onChange={event => set('enabled', event.target.checked)} />Доступно для новых покупок</label>{Boolean(value.reference) && <p className="demo-muted">Источник: {String(value.reference)}</p>}<div className="demo-actions"><Button type="submit" disabled={busy}>Сохранить запись</Button><Button variant="quiet" onClick={onClose}>Отмена</Button></div></form></Modal>;
}
