import { useEffect, useRef, useState } from 'react';
import { BookOpen, Check, ChevronRight, Compass, Landmark, Map, Mountain, Search, Shield, Swords, TreePine, Trophy, Waves, Zap } from 'lucide-react';
import { Character } from './Character';
import { Art, Button, Empty, Modal, Money, SectionTitle, type ScreenProps } from './ui';
import type { DemoBoss } from './types';
import { bossRegionId, getWorldRegions, type WorldRegionId } from './worldMap';
import './adventure-v2.css';

type WorldMode = 'map' | 'battle' | 'book';
const regionIcons = { village: Landmark, forest: TreePine, mountain: Mountain, lake: Waves, cave: Compass };

export function AdventureScreen({ state, user, act, busy }: ScreenProps) {
  const [mode, setMode] = useState<WorldMode>('map');
  const screenRef = useRef<HTMLDivElement>(null);
  const previousMode = useRef<WorldMode>(mode);
  useEffect(() => {
    if (previousMode.current !== mode) {
      screenRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      previousMode.current = mode;
    }
  }, [mode]);
  const [query, setQuery] = useState('');
  const [regionId, setRegionId] = useState<WorldRegionId | 'all'>('all');
  const [preview, setPreview] = useState<DemoBoss | null>(null);
  const [partyPage, setPartyPage] = useState(0);
  const children = state.users.filter(item => !item.archived && item.role === 'child');
  const partyPages = Math.max(1, Math.ceil(children.length / 4));
  const currentPartyPage = Math.min(partyPage, partyPages - 1);
  const visibleChildren = children.slice(currentPartyPage * 4, (currentPartyPage + 1) * 4);
  const boss = state.catalog.bosses.find(item => item.id === state.battle.bossId);
  const defeated = state.battle.hp === 0;
  const regions = getWorldRegions(state.catalog.bosses, state.defeatedBossIds);
  const enabledBosses = regions.flatMap(region => region.bosses).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const completedCount = regions.reduce((total, region) => total + region.defeatedCount, 0);
  const selectedRegion = regions.find(region => region.id === regionId);
  const currentRegion = boss ? regions.find(region => region.id === bossRegionId(boss)) : undefined;
  const bosses = enabledBosses.filter(item => (regionId === 'all' || bossRegionId(item) === regionId)
    && `${item.name} ${item.theme}`.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')));
  const showRegion = (id: WorldRegionId) => { setRegionId(id); setQuery(''); setMode('book'); };

  return <div className="demo-world-v2" ref={screenRef}>
    <SectionTitle title="Наш мир" text="Большое приключение начинается с маленьких дел." />
    <div className="demo-tabs demo-world-tabs" aria-label="Разделы мира">
      <button aria-pressed={mode === 'map'} onClick={() => setMode('map')}><Map size={18} aria-hidden />Карта</button>
      <button aria-pressed={mode === 'battle'} onClick={() => setMode('battle')}><Swords size={18} aria-hidden />Битва</button>
      <button aria-pressed={mode === 'book'} onClick={() => setMode('book')}><BookOpen size={18} aria-hidden />Книга <span>{enabledBosses.length}</span></button>
    </div>

    {mode === 'map' && <div className="demo-world-map-layout">
      <section className="demo-world-map-card" aria-label="Карта приключений">
        <header className="demo-world-map-heading"><h2>Карта приключений</h2><p>Выберите место и познакомьтесь с его обитателями.</p></header>
        <div className="demo-world-map-canvas">
          <img src="/assets/game/demo/world-map-v2.webp" alt="Зелёная долина: деревня, древний лес, замок в горах, озеро и пещера соединены тропинками." className="demo-world-map-art" width={1024} height={1536} draggable={false} />
          {regions.map(region => {
            const Icon = regionIcons[region.id];
            const current = currentRegion?.id === region.id;
            const completed = region.bosses.length > 0 && region.defeatedCount === region.bosses.length;
            return <button key={region.id} className={`demo-world-map-point ${current ? 'current' : ''} ${completed ? 'completed' : ''}`}
              style={{ left: `${region.x}%`, top: `${region.y}%` }} onClick={() => showRegion(region.id)}
              aria-label={`${region.name}: побеждено ${region.defeatedCount} из ${region.bosses.length}${current ? ', текущий поход' : ''}. Открыть соперников.`}>
              <span className="demo-world-map-pin">{completed ? <Check size={20} aria-hidden /> : <Icon size={20} aria-hidden />}</span>
              <span className="demo-world-map-label"><strong>{region.name}</strong><small>{current ? 'Ваш поход · ' : ''}{region.defeatedCount} / {region.bosses.length}</small></span>
            </button>;
          })}
        </div>
        <footer className="demo-world-map-footer"><Trophy size={22} aria-hidden /><div><strong>{completedCount} из {enabledBosses.length} побед</strong><p>Здесь отмечены победы семьи, а не закрытые уровни.</p></div></footer>
      </section>
      <aside className="demo-world-travel-notes">
        {boss && <section className="demo-world-current">
          <span className="demo-world-meta">{defeated ? 'Поход завершён' : 'Сейчас в походе'}</span>
          <div className="demo-world-current-hero"><Art src={boss.art} name={boss.name} /><div><h2>{boss.name}</h2><p>{currentRegion?.name}</p><span className="demo-world-force">{state.battle.hp} / {boss.hp} сил</span></div></div>
          <Button onClick={() => setMode('battle')}><Swords size={19} aria-hidden />{defeated ? 'Итог похода' : 'Вернуться к битве'}<ChevronRight size={18} aria-hidden /></Button>
        </section>}
        <section className="demo-world-guide"><h2>Вместе — сильнее</h2><p>Дети выполняют дела и получают энергию. В походе она помогает преодолеть трудности.</p><p>Взрослый выбирает приключение и поддерживает команду. Все места доступны для знакомства.</p><div className="demo-world-progress" role="progressbar" aria-label="Побеждённые соперники" aria-valuemin={0} aria-valuemax={Math.max(1, enabledBosses.length)} aria-valuenow={completedCount}><span style={{ width: `${enabledBosses.length ? completedCount / enabledBosses.length * 100 : 0}%` }} /></div><small>{completedCount} побед отмечено на карте</small></section>
        <section className="demo-world-region-list" aria-label="Места на карте">{regions.map(region => {
          const Icon = regionIcons[region.id];
          return <button key={region.id} onClick={() => showRegion(region.id)}><Icon size={22} aria-hidden /><span><strong>{region.name}</strong><small>{region.defeatedCount} / {region.bosses.length} побед</small></span><ChevronRight size={18} aria-hidden /></button>;
        })}</section>
      </aside>
    </div>}

    {mode === 'battle' && (boss ? <div className="demo-adventure-layout"><section className={`demo-arena ${defeated ? 'won' : ''}`}>
      <div className="demo-arena-heading"><span>{state.defeatedBossIds.includes(boss.id) && !defeated ? 'Тренировка без повторной награды' : currentRegion?.name || boss.theme}</span><h2>{boss.name}</h2><div className="demo-health" role="progressbar" aria-label="Силы соперника" aria-valuemin={0} aria-valuemax={boss.hp} aria-valuenow={state.battle.hp}><span style={{ width: `${Math.min(100, state.battle.hp / boss.hp * 100)}%` }} /><b>{state.battle.hp} / {boss.hp}</b></div></div>
      <Art src={boss.art} name={boss.name} className="demo-arena-boss" />
      {defeated ? <div className="demo-victory"><Trophy size={30} aria-hidden /><h2>Справились вместе!</h2><p>Каждое доброе дело было важным.</p></div> : <div className="demo-arena-party">{visibleChildren.map(item => <div key={item.id}><Character appearance={item.appearance} subtype={item.subtype} size={100} /><span className="demo-world-party-name">{item.name}</span></div>)}</div>}
      {!children.length && !defeated && <p className="demo-world-party-empty">Пока в команде нет детей. Взрослый может добавить героя в разделе «Семья».</p>}
      {partyPages > 1 && <div className="demo-scene-pages" aria-label="Группы команды">{Array.from({ length: partyPages }, (_, index) => <button key={index} aria-pressed={currentPartyPage === index} onClick={() => setPartyPage(index)}>Команда {index + 1}</button>)}</div>}
      <div className="demo-arena-controls">{user.role === 'child' ? <><span><Zap size={17} aria-hidden /> Ваша энергия: {user.energy}</span><Button disabled={busy || defeated || user.energy < 10} onClick={() => act({ action: 'attackBoss' })}><Swords size={21} aria-hidden />Мощный удар <small>−10 энергии</small></Button><p>{defeated ? 'Поход завершён. Взрослый выберет следующее приключение.' : user.energy < 10 ? 'Выполните одно дело, чтобы накопить силы.' : 'Один удар снимает 20 сил соперника.'}</p></> : <p><Shield size={19} aria-hidden />Вы поддерживаете команду. Взрослые не тратят энергию и не участвуют в боях.</p>}{defeated && user.role === 'parent' && <Button onClick={() => { setRegionId('all'); setQuery(''); setMode('book'); }}>Выбрать следующее приключение</Button>}</div>
    </section><aside className="demo-adventure-notes"><h2>Секрет соперника</h2><p>{boss.ability}</p><div className="demo-reward-note"><Trophy size={23} aria-hidden /><div><h3>Первая победа</h3><p><Money value={boss.reward.coins} /> в общую копилку</p><p>+{boss.reward.xp} опыта каждому участнику</p></div></div><p className="demo-muted">Повторный поход — тренировка, без повторной награды. Классы равны по силе. Покупками нельзя усилить удар.</p><h3>{currentRegion?.name || 'Другие встречи'}</h3><ol className="demo-campaign">{(currentRegion?.bosses || enabledBosses).slice(0, 8).map(item => <li key={item.id}><span>{state.defeatedBossIds.includes(item.id) ? <Check size={17} aria-hidden /> : <Shield size={17} aria-hidden />}</span><button onClick={() => setPreview(item)}>{item.name}</button></li>)}</ol><Button variant="quiet" onClick={() => currentRegion ? showRegion(currentRegion.id) : setMode('book')}><BookOpen size={18} aria-hidden />Открыть книгу</Button></aside></div> : <Empty>Текущий соперник не найден. Взрослый может выбрать новое приключение в книге.</Empty>)}

    {mode === 'book' && <section className="demo-world-book" aria-label="Книга соперников">
      <header className="demo-world-book-heading"><div><h2>{selectedRegion?.name || 'Книга соперников'}</h2><p>{selectedRegion?.description || 'Узнайте историю каждой встречи и выберите новый поход.'}</p></div><span>{bosses.length} / {enabledBosses.length}</span></header>
      <div className="demo-world-book-filters"><label className="demo-field"><span><Search size={16} aria-hidden />Найти соперника</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Имя или история" /></label><label className="demo-field">Место на карте<select value={regionId} onChange={event => setRegionId(event.target.value as WorldRegionId | 'all')}><option value="all">Все места</option>{regions.map(region => <option value={region.id} key={region.id}>{region.name}</option>)}</select></label></div>
      <div className="demo-world-boss-grid">{bosses.map(item => {
        const won = state.defeatedBossIds.includes(item.id);
        const active = state.battle.bossId === item.id;
        return <button key={item.id} className={`demo-world-boss-card ${won ? 'completed' : ''}`} onClick={() => setPreview(item)}>
          <div className="demo-world-boss-portrait"><Art src={item.art} name="" /><span className="demo-world-boss-status">{active && !defeated ? 'Текущий поход' : won ? <><Check size={13} aria-hidden />Побеждён</> : 'Новая встреча'}</span></div>
          <div className="demo-world-boss-copy"><h3>{item.name}</h3><span className="demo-world-boss-hp"><Shield size={14} aria-hidden />{item.hp} сил</span><div className="demo-world-boss-reward"><Money value={item.reward.coins} /><span>+{item.reward.xp} XP</span></div><small>{won ? 'Тренировка без награды' : 'За первую победу'}</small></div>
        </button>;
      })}</div>
      {!bosses.length && <Empty>{selectedRegion && !selectedRegion.bosses.length ? 'В этом месте пока нет соперников. Взрослый может добавить их в редакторе.' : 'По этому запросу соперников нет. Измените название или выберите другое место.'}</Empty>}
    </section>}

    {preview && <Modal title={preview.name} onClose={() => setPreview(null)}><div className="demo-world-boss-detail"><Art src={preview.art} name={preview.name} className="demo-boss-preview" /><p>{preview.description}</p><p>{preview.ability}</p><div className="demo-simple-row"><span>{preview.hp} сил</span><Money value={preview.reward.coins} /><span>+{preview.reward.xp} XP</span></div><p className="demo-muted">За первую победу: монеты в общую копилку, опыт — участникам похода.</p>{state.defeatedBossIds.includes(preview.id) && <p>Награда уже получена. Можно вернуться ради тренировки.</p>}<div className="demo-actions">{user.role === 'parent' && <Button disabled={busy || !preview.enabled} onClick={async () => { if (await act({ action: 'selectBoss', bossId: preview.id })) { setPreview(null); setMode('battle'); } }}>{state.defeatedBossIds.includes(preview.id) ? 'Начать тренировку' : 'Начать приключение'}</Button>}<Button variant="quiet" onClick={() => setPreview(null)}>Вернуться</Button></div>{user.role !== 'parent' && <p className="demo-muted">Следующего соперника выбирает взрослый.</p>}</div></Modal>}
  </div>;
}
