import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronRight, Compass, Heart, Home, Layers3, ListChecks, Ruler, ShieldCheck, Sparkles, Sprout, UserRound, Users, X } from 'lucide-react';
import { AssetSlot } from './assets/AssetSlot';
import { assetSlots, getAssetSlot } from './assets/registry';
import { demoMembers, demoTasks, categoryNames, statusNames, type Member, type Task } from './fixtures';
import { Button, Meter, PageHeading, Sheet } from './ui';
import { BALANCE_POLICY_V01, getTaskReward, planFamilyGoal, projectHeroLevel } from './model/balance';
import { getCatalogItem, starterChoicesV01 } from './model/catalog';
import { initialExamples, type PrototypeExamples } from './prototypeStates';
import { PrototypeTools } from './PrototypeTools';
import { GoalPreview } from './GoalPreview';
import { PetPreview } from './PetPreview';
import { ShopPreview, examplePersonalGold, itemExampleStatus, outfitExampleId } from './ShopPreview';
import { RealRewardPreview } from './RealRewardPreview';
import { BalancePreview } from './BalancePreview';

type Page = 'today' | 'tasks' | 'adventure' | 'hero' | 'family';
const pages = [{ id: 'today', title: 'Сегодня', icon: Home }, { id: 'tasks', title: 'Дела', icon: ListChecks }, { id: 'adventure', title: 'Мир', icon: Compass }, { id: 'hero', title: 'Герой', icon: UserRound }, { id: 'family', title: 'Семья', icon: Users }] as const;
type Overlay = { type: 'task'; task: Task } | { type: 'member'; member: Member } | { type: 'asset'; slotId: string } | { type: 'item'; itemId: string } | { type: 'lab' | 'story' | 'map' | 'examples' | 'balance' | 'goal' | 'pet-choice' | 'real-reward' } | null;
const categoryIcons = { home: Home, learning: BookOpen, care: Heart, together: Users };
const roleName = (member: Member) => member.familyRole === 'adult' ? 'Взрослый, игрок' : 'Ребёнок, игрок';
const membersForSize = (size: number) => size === 2 ? demoMembers.filter(member => member.id === 'alex' || member.id === 'sasha') : demoMembers.slice(0, size);

export function App() {
  const [page, setPage] = useState<Page>('today');
  const [actorId, setActorId] = useState('sasha');
  const [familySize, setFamilySize] = useState(4);
  const [inspect, setInspect] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [taskScope, setTaskScope] = useState('mine');
  const [taskStatus, setTaskStatus] = useState('all');
  const [heroSection, setHeroSection] = useState('look');
  const [bossPhase, setBossPhase] = useState(1);
  const [examples, setExamples] = useState<PrototypeExamples>(initialExamples);
  const members = membersForSize(familySize);
  const user = members.find(member => member.id === actorId) || members[0];
  const hero = projectHeroLevel(user.hero.xp);
  const personalGold = examplePersonalGold(examples.item);
  const goal = planFamilyGoal(members.map(member => ({ playerId: member.id, dailyContributionNorm: BALANCE_POLICY_V01.family.defaultDailyContributionNorm })));
  const realReward = getCatalogItem('v3.real-reward.choose-activity')!;
  const rewardRecipient = user.familyRole === 'child' ? user.name : members.find(member => member.familyRole === 'child')!.name;
  const mine = demoTasks.filter(task => task.assignee === user.id);
  const nextTask = mine.find(task => task.status === 'ready') || demoTasks.find(task => task.assignee === 'family')!;
  const pending = demoTasks.filter(task => task.status === 'review' && members.some(member => member.id === task.assignee && member.familyRole === 'child'));
  const visibleTasks = (taskScope === 'review' ? pending : demoTasks.filter(task => taskScope === 'family' ? task.assignee === 'family' : task.assignee === user.id)).filter(task => taskScope === 'review' || taskStatus === 'all' || task.status === taskStatus);
  const emptyMine = taskScope === 'mine' && taskStatus === 'all';
  const go = (next: Page) => { setPage(next); setTaskScope('mine'); setTaskStatus('all'); window.scrollTo({ top: 0, behavior: 'instant' }); };
  const changeFamilySize = (size: number) => {
    const nextMembers = membersForSize(size);
    setFamilySize(size);
    if (!nextMembers.some(member => member.id === actorId)) {
      setActorId(nextMembers[0].id);
      setTaskScope('mine');
      setTaskStatus('all');
      setHeroSection('look');
    }
  };
  const slot = (id: string, label?: string, className?: string) => <AssetSlot slotId={id} label={label} className={className} inspect={inspect} onInspect={slotId => setOverlay({ type: 'asset', slotId })}/>;
  useEffect(() => { document.body.classList.add('v3-body'); return () => document.body.classList.remove('v3-body'); }, []);
  const selectedAsset = overlay?.type === 'asset' ? getAssetSlot(overlay.slotId) : undefined;
  const selectedItem = overlay?.type === 'item' ? getCatalogItem(overlay.itemId) : undefined;
  const selectedTaskReward = overlay?.type === 'task' ? getTaskReward(overlay.task.shares ? 'easy' : overlay.task.difficulty) : undefined;
  const openExample = (section: keyof PrototypeExamples) => {
    setOverlay(null);
    go(section === 'goal' || section === 'realReward' ? 'family' : 'hero');
    if (section === 'pet') setHeroSection('pet');
    if (section === 'item') setHeroSection('collection');
  };
  function taskCard(task: Task, compact = false) {
    const Icon = categoryIcons[task.category]; const assignee = members.find(member => member.id === task.assignee);
    return <article className={`v3-task-card ${compact ? 'compact' : ''}`} key={task.id}><div className="v3-task-top"><span className={`v3-task-glyph ${task.category}`}><Icon size={22}/></span><div><p className="v3-caption">{task.assignee === 'family' ? 'Семейное дело' : `${categoryNames[task.category]} · ${assignee?.name || 'Участник'}`}</p><h3>{task.title}</h3></div><span className={`v3-status ${task.status}`}>{statusNames[task.status]}</span></div>{!compact && <p className="v3-task-copy">{task.description}</p>}<div className="v3-task-bottom"><span><ShieldCheck size={15}/>{task.requiresReview ? 'С подтверждением' : 'Самостоятельно'}</span><Button secondary={!compact} onClick={() => setOverlay({ type: 'task', task })}>{compact ? 'Посмотреть дело' : 'Подробнее'}<ArrowRight size={16}/></Button></div></article>;
  }
  const familyGrid = (limit?: number) => <div className="v3-members">{members.slice(0, limit).map(member => <div className="v3-member" key={member.id}>{slot('hero.portrait', member.name)}<button type="button" onClick={() => setOverlay({ type: 'member', member })} aria-label={`Посмотреть участника: ${member.name}`}><strong>{member.name}</strong><span>{member.familyRole === 'adult' ? 'Взрослый' : 'Ребёнок'}</span></button></div>)}</div>;
  return <div className="v3-app">
    <div className="v3-prototype-banner">Вариант 3 · этап 2 · примеры правил v0.1</div>
    <header className="v3-topbar"><button type="button" className="v3-brand" onClick={() => go('today')} aria-label="Family Life, на главную"><span><Sprout size={25}/></span><strong>Family Life<small>Наше общее приключение</small></strong></button><label className="v3-profile"><span className="v3-sr">Тестовый профиль</span><select aria-label="Тестовый профиль" value={user.id} onChange={event => { setActorId(event.target.value); setTaskScope('mine'); setTaskStatus('all'); setHeroSection('look'); window.scrollTo({ top: 0, behavior: 'instant' }); }}>{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label></header>
    <div className="v3-context-line"><span><UserRound size={14}/>{roleName(user)}</span><button type="button" onClick={() => setOverlay({ type: 'lab' })}><Ruler size={16}/>{inspect ? 'Разметка включена' : 'Разметка'}</button></div>
    {inspect && <div className="v3-inspector-note"><Layers3 size={18}/><span>Нажмите «Параметры» у нужного места, чтобы открыть размеры, слои и путь будущего файла.</span><button type="button" aria-label="Выключить разметку" onClick={() => setInspect(false)}><X size={18}/></button></div>}
    <main className="v3-main">
      {page === 'today' && <>
        <PageHeading title="Сегодня мы команда" text="Одно доброе дело меняет общий день."><span className="v3-date">Среда<br/>9 сентября</span></PageHeading>
        <section className="v3-home-scene">{slot('home.room', 'Здесь будет наш семейный дом')}<div className="v3-scene-caption"><span><Home size={16}/>Точка встречи семьи</span><button type="button" onClick={() => go('family')} aria-label="Открыть семейный круг"><Users size={15}/>{members.length}<ChevronRight size={16}/></button></div></section>
        <GoalPreview state={examples.goal} target={goal.targetContribution} compact showDetails={() => setOverlay({ type: 'goal' })}/>
        <div className="v3-section-heading"><h2>Твоё ближайшее дело</h2><button type="button" className="v3-text-button" onClick={() => go('tasks')}>Все дела<ChevronRight size={16}/></button></div>{taskCard(nextTask, true)}
        {user.permissions.reviewChildTasks && <button type="button" className="v3-review-callout" onClick={() => { go('tasks'); setTaskScope('review'); }}><ShieldCheck size={23}/><span><strong>На проверке: {pending.length}</strong><small>{pending.length ? 'Посмотреть примеры результатов' : 'Очередь сейчас пуста'}</small></span><ChevronRight size={19}/></button>}
        <section className="v3-family-preview"><div className="v3-section-heading"><h2>Наш семейный круг</h2>{members.length > 4 && <button type="button" className="v3-text-button" onClick={() => go('family')}>Все {members.length}<ChevronRight size={16}/></button>}</div>{familyGrid(4)}</section>
        <div className="v3-quiet-note"><Heart size={19}/><p>Родители и дети играют вместе. Задачи помогают реальной жизни.</p></div>
      </>}
      {page === 'tasks' && <>
        <PageHeading title="Маленькие дела" text="Выбрать, сделать, поделиться результатом."/>
        <div className="v3-tabs" aria-label="Чьи дела">{[['mine', 'Мои'], ['family', 'Семейные'], ...(user.permissions.reviewChildTasks ? [['review', 'Проверить']] : [])].map(([id, label]) => <button type="button" key={id} aria-pressed={taskScope === id} onClick={() => setTaskScope(id)}>{label}{id === 'review' && <span>{pending.length}</span>}</button>)}</div>
        {taskScope !== 'review' && <label className="v3-filter">Состояние<select value={taskStatus} onChange={event => setTaskStatus(event.target.value)}><option value="all">Все дела</option><option value="ready">Впереди</option><option value="review">На проверке</option><option value="rework">На доработке</option><option value="done">Готово</option></select></label>}
        <div className="v3-task-list">{visibleTasks.map(task => taskCard(task))}</div>
        {!visibleTasks.length && <div className="v3-empty"><Check size={26}/><h2>Здесь спокойно</h2><p>{emptyMine ? 'Для этого профиля пока нет личных примеров. Посмотри общее дело семьи.' : 'В выбранном разделе нет примеров дел. Можно посмотреть другой статус.'}</p><Button secondary onClick={() => { setTaskScope(emptyMine ? 'family' : 'mine'); setTaskStatus('all'); }}>{emptyMine ? 'Посмотреть семейные дела' : 'Показать мои дела'}</Button></div>}
        <section className="v3-flow-note"><h2>Каждое старание заметно</h2><ol><li><span>1</span>Выполнить реальное дело</li><li><span>2</span>Поделиться результатом</li><li><span>3</span>Получить награду за принятый результат</li></ol><p>Проверяемое дело принимает взрослый. Доверенное дело принимается при отметке.</p></section>
      </>}
      {page === 'adventure' && <>
        <PageHeading title="За порогом дома" text="Наши дела становятся общей историей."/>
        <div className="v3-stage-label">Композиция приключения · механика на этапе 4</div>
        <section className="v3-adventure-card"><div className="v3-section-heading"><span className="v3-section-label">Первая экспедиция</span><span className="v3-caption">Глава 1</span></div><h2>Хранитель лесной тропы</h2>{slot('boss.main', `Босс · фаза ${bossPhase}`)}<div className="v3-boss-progress"><span>Пример состояния</span><strong>{[100, 55, 20][bossPhase - 1]}%</strong></div><Meter value={[100, 55, 20][bossPhase - 1]} max={100} label="Пример состояния босса"/>{inspect && <div className="v3-tabs" aria-label="Предпросмотр фазы босса">{[1, 2, 3].map(phase => <button type="button" key={phase} aria-pressed={phase === bossPhase} onClick={() => setBossPhase(phase)}>Фаза {phase}</button>)}</div>}<p>Прогресс приключения будет складываться из принятых результатов дел.</p><Button onClick={() => setOverlay({ type: 'story' })}>Как мы будем побеждать<ArrowRight size={17}/></Button></section>
        <button type="button" className="v3-route-card" onClick={() => setOverlay({ type: 'map' })}><Compass size={27}/><span><strong>Карта нашей истории</strong><small>Дом, тропа и первая встреча</small></span><ChevronRight size={20}/></button>
        <section className="v3-trophy-preview">{slot('family.trophy', 'Трофей за общую победу')}<div><h2>В истории семьи</h2><p>Завершённое приключение оставит память в доме.</p></div></section>
      </>}
      {page === 'hero' && <>
        <PageHeading title={`Герой: ${user.name}`} text="Личный путь в нашем общем приключении."/>
        <div className="v3-tabs" aria-label="Раздел героя">{[['look', 'Облик'], ['pet', 'Спутник'], ['collection', 'Вещи']].map(([id, label]) => <button type="button" key={id} aria-pressed={heroSection === id} onClick={() => setHeroSection(id)}>{label}</button>)}</div>
        {heroSection === 'look' && <>
          <section className="v3-hero-sheet">
            <div className="v3-hero-summary"><span><Sparkles size={16}/>Уровень {hero.level}</span><span>{personalGold} золота в примере</span></div>
            {slot(user.familyRole === 'adult' ? 'hero.adult' : 'hero.child', `Герой ${user.name}`)}
            <h2>{user.hero.title}</h2>
            {examples.item === 'equipped' && <p className="v3-equipped-note">Применено в примере: {getCatalogItem(outfitExampleId)!.title}</p>}
            <div className="v3-hero-xp"><span>Опыт героя</span><strong>{hero.xpIntoLevel} / {hero.xpToNextLevel}</strong></div>
            <Meter value={hero.xpIntoLevel} max={hero.xpToNextLevel!} label="Пример опыта героя"/>
          </section>
          <div className="v3-section-heading"><h2>Места для экипировки</h2><span className="v3-caption">Внешний вид</span></div>
          <div className="v3-item-grid">{[outfitExampleId, 'v3.item.adventure-kit'].map(id => {
            const item = getCatalogItem(id)!;
            return <article key={id}>{slot(item.assetSlotId!, item.kind === 'outfit' ? 'Одежда' : 'Предмет в руке')}<h3>{item.title}</h3><p className="v3-caption">{itemExampleStatus(item, examples.item, personalGold, user.familyRole === 'adult')}</p><Button secondary onClick={() => setOverlay({ type: 'item', itemId: id })}>Посмотреть</Button></article>;
          })}</div>
        </>}
        {heroSection === 'pet' && <PetPreview state={examples.pet} asset={slot} showChoice={() => setOverlay({ type: 'pet-choice' })}/>}
        {heroSection === 'collection' && <>
          <section className="v3-collection-cover">{slot('collection.cover', 'Обложка первой коллекции')}<h2>Первое путешествие</h2><p>Одежда, личный предмет и находка для дома. Всё остаётся у владельца после получения.</p></section>
          <ShopPreview state={examples.item} isAdult={user.familyRole === 'adult'} asset={slot} openItem={item => setOverlay({ type: 'item', itemId: item.id })}/>
        </>}
      </>}
      {page === 'family' && <>
        <PageHeading title="Наш семейный круг" text="У каждого свой герой. История — общая."/>
        <div className="v3-family-count"><Users size={21}/><strong>Участников в примере: {members.length}</strong><span>Все на своих местах</span></div>{familyGrid()}
        <GoalPreview state={examples.goal} target={goal.targetContribution} showDetails={() => setOverlay({ type: 'goal' })}/>
        {user.permissions.manageFamily && <section className="v3-parent-rights"><ShieldCheck size={23}/><div><h2>Игрок и взрослый</h2><p>Личный герой развивается за ваши дела. Проверка детских результатов и семейные покупки — отдельная ответственность.</p><Button secondary onClick={() => { go('tasks'); setTaskScope('review'); }}>Посмотреть результаты детей</Button></div></section>}
        <RealRewardPreview state={examples.realReward} price={realReward.priceGold} title={realReward.title} recipient={rewardRecipient} isAdult={user.familyRole === 'adult'} showDetails={() => setOverlay({ type: 'real-reward' })}/>
      </>}
    </main>
    <nav className="v3-nav" aria-label="Основная навигация">{pages.map(({ id, title, icon: Icon }) => <button type="button" key={id} aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}><Icon size={22}/><span>{title}</span></button>)}</nav>
    {overlay?.type === 'task' && selectedTaskReward && <Sheet title={overlay.task.title} close={() => setOverlay(null)}>
      <span className={`v3-status ${overlay.task.status}`}>{statusNames[overlay.task.status]}</span><p>{overlay.task.description}</p>
      <dl className="v3-details">
        <div><dt>Кому</dt><dd>{overlay.task.assignee === 'family' ? 'Участникам общего дела' : members.find(member => member.id === overlay.task.assignee)?.name}</dd></div>
        <div><dt>Подтверждение</dt><dd>{overlay.task.requiresReview ? 'Взрослый принимает результат ребёнка. Свою часть взрослый отмечает сам.' : 'Взрослый сам отмечает собственное дело.'}</dd></div>
        <div><dt>{overlay.task.shares ? 'За одну часть' : 'За результат'}</dt><dd>{selectedTaskReward.heroXp} XP · {selectedTaskReward.gold} золота<br/>Шаги общей цели: {selectedTaskReward.familyContribution}<br/><small>До {selectedTaskReward.petXp} XP питомца, выбранного до работы; иначе 0.</small></dd></div>
        <div><dt>Условия</dt><dd>Пример v0.1. Награда, исполнитель, цель и питомец фиксируются до работы.</dd></div>
        <div><dt>Дата</dt><dd>Поздняя проверка сохраняет дату выполнения. Обновление страницы не создаёт ещё одну награду.</dd></div>
      </dl>
      {overlay.task.reworkReason && <section><h3>Что осталось сделать</h3><p>{overlay.task.reworkReason}</p><p>Доработка продолжает тот же результат. Уже выполненную часть не нужно начинать заново.</p></section>}
      {overlay.task.shares && <section>
        <h3>Части общего дела</h3><p>Каждая часть оценена как Easy до работы. Общий бюджет — сумма этих частей; отдельной награды за проверку нет.</p>
        <dl className="v3-details">{overlay.task.shares.filter(share => members.some(member => member.id === share.memberId)).map(share => <div key={share.memberId}><dt>{members.find(member => member.id === share.memberId)?.name}</dt><dd>{share.contribution}<br/><span className={`v3-status ${share.status}`}>{statusNames[share.status]}</span><small className="v3-share-reward">{selectedTaskReward.heroXp} XP · {selectedTaskReward.gold} золота</small></dd></div>)}</dl>
        <p>Пример для {members.length} участников: {selectedTaskReward.heroXp * members.length} XP и {selectedTaskReward.gold * members.length} Gold на все части. Это подготовленный пример состава; обещанный бюджет при изменении реальной семьи пересчитываться не будет.</p>
      </section>}
      <div className="v3-boundary-note">Это условия и состояние для обсуждения. Реальную отправку, подтверждение и однократное начисление подключим на этапе 3.</div>
      <Button onClick={() => { const scope = overlay.task.assignee === 'family' ? 'family' : overlay.task.assignee === user.id ? 'mine' : 'review'; setOverlay(null); go('tasks'); setTaskScope(scope); }}>Вернуться к делам</Button>
    </Sheet>}
    {overlay?.type === 'member' && <Sheet title={overlay.member.name} close={() => setOverlay(null)}>{slot(overlay.member.familyRole === 'adult' ? 'hero.adult' : 'hero.child', `Герой ${overlay.member.name}`, 'v3-modal-hero')}<h3>{overlay.member.hero.title}</h3><p>{roleName(overlay.member)}</p><p>Просмотр участника не меняет выбранный профиль. Взрослые и дети участвуют в игре; права управления выдаются отдельно.</p><Button secondary onClick={() => setOverlay(null)}>Вернуться к семье</Button></Sheet>}
    {overlay?.type === 'story' && <Sheet title="Каждое дело — вклад в историю" close={() => setOverlay(null)}><ol className="v3-explanation"><li>Выполняем реальные дела в удобном темпе.</li><li>Взрослый подтверждает проверяемые результаты детей.</li><li>Принятый результат двигает героя и приключение.</li><li>Общая победа остаётся в истории семьи.</li></ol><p>Босс не отнимает предметы за пропуски. Платёж не заменяет реальные дела.</p><div className="v3-boundary-note">Точные награды и длительность приключения проверяются в аудите баланса.</div><Button onClick={() => { setOverlay(null); go('tasks'); }}>Открыть дела</Button></Sheet>}
    {overlay?.type === 'map' && <Sheet title="Карта первой экспедиции" close={() => setOverlay(null)}>{slot('adventure.map', 'Карта приключения')}<ol className="v3-map-stops"><li><span/>Семейный дом</li><li><span/>Лесная тропа</li><li><span/>Встреча с хранителем</li></ol><p>Сейчас это маршрут для обсуждения. Изображение карты и механика открытий добавятся отдельно.</p><Button secondary onClick={() => setOverlay(null)}>Вернуться в мир</Button></Sheet>}
    {overlay?.type === 'item' && <Sheet title={selectedItem?.title || 'Предмет не найден'} close={() => setOverlay(null)}>
      {selectedItem && <>
        {selectedItem.assetSlotId && slot(selectedItem.assetSlotId, selectedItem.title)}
        <p>{selectedItem.description}</p>
        <span className="v3-status">{itemExampleStatus(selectedItem, examples.item, personalGold, user.familyRole === 'adult')}</span>
        <dl className="v3-details">
          <div><dt>Цена v0.1</dt><dd>{selectedItem.priceGold} золота</dd></div>
          <div><dt>Кошелёк</dt><dd>{personalGold} золота у выбранного героя в примере</dd></div>
          <div><dt>Владение</dt><dd>{selectedItem.ownership === 'family' ? 'Предмет остаётся у семьи; взрослый расходует только свои монеты.' : 'Постоянный предмет выбранного героя.'}</dd></div>
          <div><dt>Применение</dt><dd>{selectedItem.kind === 'known_egg' ? 'Вид питомца известен заранее, рост начинается для новых дел после выбора.' : 'Покупка даёт владение. Применение выбирается отдельно и не списывает монеты повторно.'}</dd></div>
        </dl>
      </>}
      <div className="v3-boundary-note">Выбранное состояние — пример. Кнопок реальной покупки и выдачи на этапе 2 нет.</div>
      <Button secondary onClick={() => { setOverlay(null); go('hero'); setHeroSection('collection'); }}>Вернуться в каталог</Button>
    </Sheet>}
    {overlay?.type === 'lab' && <Sheet title="Проверка V3" close={() => setOverlay(null)}>
      <p>Инструменты просмотра третьего варианта. Здесь нет данных настоящей семьи.</p>
      <div className="v3-lab-actions"><Button onClick={() => setOverlay({ type: 'examples' })}>Состояния экранов<ArrowRight size={16}/></Button><Button secondary onClick={() => setOverlay({ type: 'balance' })}>Посчитать баланс v0.1<ArrowRight size={16}/></Button></div>
      <label className="v3-switch"><input type="checkbox" checked={inspect} onChange={event => setInspect(event.target.checked)}/><span>Показывать контракт каждого места для графики</span></label>
      <fieldset className="v3-fieldset"><legend>Размер тестовой семьи</legend><div className="v3-tabs">{[2, 4, 8].map(size => <button type="button" key={size} aria-pressed={familySize === size} onClick={() => changeFamilySize(size)}>Участников: {size}</button>)}</div><p>В минимальном примере — Алексей и Саша. Восемь участников — расширенный пример, а не лимит семьи.</p></fieldset>
      <h3>Мест в реестре: {assetSlots.length}</h3><p>Ни одно место не загружает изображение. Экспортные размеры — кандидаты для будущей арт-проверки.</p>
      <div className="v3-slot-index">{assetSlots.map(asset => <button type="button" key={asset.id} onClick={() => setOverlay({ type: 'asset', slotId: asset.id })}><span>{asset.label}<small>{asset.id}</small></span><ChevronRight size={17}/></button>)}</div><Button onClick={() => setOverlay(null)}>Вернуться к макету</Button>
    </Sheet>}
    {overlay?.type === 'examples' && <Sheet title="Состояния экранов" close={() => setOverlay(null)}><PrototypeTools examples={examples} update={setExamples} open={openExample}/><Button secondary onClick={() => setOverlay({ type: 'lab' })}>К инструментам</Button></Sheet>}
    {overlay?.type === 'balance' && <Sheet title="Проверяем баланс v0.1" close={() => setOverlay(null)}><BalancePreview/><Button secondary onClick={() => setOverlay({ type: 'lab' })}>К инструментам</Button></Sheet>}
    {overlay?.type === 'goal' && <Sheet title="Условия общей цели" close={() => setOverlay(null)}>
      <p>Пример: подготовить семейный вечер. Каждый помогает посильными делами; вклад сохраняется после принятия результата.</p>
      <dl className="v3-details"><div><dt>Цель примера</dt><dd>{goal.targetContribution} шагов</dd></div><div><dt>План</dt><dd>{goal.roster.length} участников × {BALANCE_POLICY_V01.family.defaultDailyContributionNorm} шагов за активный день × {goal.plannedActiveDays} плановых дней</dd></div><div><dt>Срок</dt><dd>Это ориентир, а не таймер сгорания. Пропуск не уменьшает прогресс.</dd></div><div><dt>Поздняя проверка</dt><dd>Пополняет историю исходной цели. Достижение выдаётся один раз; превышение не переезжает в новую цель.</dd></div><div><dt>Монеты</dt><dd>Золото каждого остаётся личным. Шаги общей цели нельзя тратить как валюту.</dd></div></dl>
      <div className="v3-boundary-note">Размер и состояние цели здесь — готовый пример. Состав и индивидуальные посильные нормы будут фиксироваться до начала реальной работы.</div>
      <Button onClick={() => { setOverlay(null); go('tasks'); setTaskScope('family'); }}>Посмотреть общее дело</Button>
    </Sheet>}
    {overlay?.type === 'pet-choice' && <Sheet title="Один бесплатный известный выбор" close={() => setOverlay(null)}>
      <p>После первого принятого дела предлагается один стартовый питомец. Котёнок и щенок — альтернативы одного бесплатного выбора.</p>
      <div className="v3-starter-options">{starterChoicesV01.map(item => <article key={item.id}>{slot('pet.egg', item.title)}<h3>{item.title}</h3><span>Бесплатно · вид известен</span></article>)}</div>
      <p>После выбора новые дела могут приносить XP выбранному яйцу. Дела, открытые раньше без питомца, не начислят опыт задним числом.</p>
      <p>В предлагаемой модели нужно {BALANCE_POLICY_V01.pet.hatchXp} XP до вылупления и ещё {BALANCE_POLICY_V01.pet.firstGrowthAdditionalXp} XP до первого роста. Уголок бесплатный.</p>
      <div className="v3-boundary-note">Здесь просмотр двух предложенных вариантов. Получение питомца будет отдельной операцией этапа 3.</div><Button secondary onClick={() => setOverlay(null)}>Вернуться к спутнику</Button>
    </Sheet>}
    {overlay?.type === 'real-reward' && <Sheet title="Как устроена семейная награда" close={() => setOverlay(null)}>
      <p>Получатель примера — {rewardRecipient}. Взрослый заранее включает награду, задаёт выполнимые условия и цену; обычное внимание и необходимые вещи остаются бесплатными.</p>
      <ol className="v3-explanation"><li>Ребёнок выбирает согласованное предложение. Для примера цена — {realReward.priceGold} Gold.</li><li>При заявке монеты остаются в кошельке, но временно недоступны для других покупок.</li><li>После согласования резерв сохраняется до фактической выдачи.</li><li>При выдаче сумма списывается один раз. Отмена до выдачи освобождает резерв.</li></ol>
      <p>У взрослых есть собственные герои и личный Gold, но реальные награды в этой версии предназначены детям. Семейный поход или игра не превращаются в покупку только из-за наличия этого раздела.</p>
      <div className="v3-boundary-note">Выбранные состояния показывают предложенный процесс v0.1. Реальные заявки, резервы и списания ещё не выполняются.</div><Button secondary onClick={() => setOverlay(null)}>Вернуться к семье</Button>
    </Sheet>}
    {overlay?.type === 'asset' && <Sheet title={selectedAsset?.label || 'Неизвестное место'} close={() => setOverlay(null)}>{selectedAsset ? <><code className="v3-slot-code">{selectedAsset.id}</code><p>{selectedAsset.description}</p><dl className="v3-details"><div><dt>Пропорции</dt><dd>{selectedAsset.aspectRatio}</dd></div><div><dt>Холст-кандидат</dt><dd>{selectedAsset.logicalCanvas.width} × {selectedAsset.logicalCanvas.height}</dd></div><div><dt>Экраны</dt><dd>{selectedAsset.screens.join(', ')}</dd></div><div><dt>Будущий путь</dt><dd><code>{selectedAsset.targetPath}</code></dd></div><div><dt>Точка привязки</dt><dd><code>{JSON.stringify(selectedAsset.anchor)}</code></dd></div><div><dt>Слои</dt><dd>{selectedAsset.layers.join(' → ')}</dd></div><div><dt>Состояния</dt><dd>{selectedAsset.states.join(', ')}</dd></div></dl><div className="v3-boundary-note">Файла пока нет, запрос по этому пути не выполняется. Порядок подготовки и вставки описан в ASSET_INSERTION_GUIDE.md.</div></> : <p>Для этого идентификатора нет записи. Чужое изображение не подставляется.</p>}<Button secondary onClick={() => setOverlay({ type: 'lab' })}>Ко всем местам</Button></Sheet>}
  </div>;
}
