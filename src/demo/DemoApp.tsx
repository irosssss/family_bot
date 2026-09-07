import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Compass, Home, ScrollText, Shirt, Users, X, RefreshCw, Sparkles } from 'lucide-react';
import { apiFetch, apiJson } from '../utils/apiFetch';
import { initTelegramWebApp } from '../utils/haptics';
import type { DemoAction, DemoState } from './types';
import { Button, Money, type Act } from './ui';
import { HomeScreen } from './HomeScreen';
import { TasksScreen } from './TasksScreen';
import { AdventureScreen } from './AdventureScreen';
import { WardrobeScreen } from './WardrobeScreen';
import { FamilyScreen } from './FamilyScreen';
import { CharacterCatalogContext } from './Character';
import './demo.css';
import './home-scene.css';

const tabs = [ ['home', 'Дом', Home], ['tasks', 'Дела', ScrollText], ['adventure', 'Мир', Compass], ['wardrobe', 'Гардероб', Shirt], ['family', 'Семья', Users] ] as const;
type Tab = typeof tabs[number][0];
const pendingKey = 'family-demo-unconfirmed-request';
function readPending(): DemoAction | null {
  try { const value = JSON.parse(sessionStorage.getItem(pendingKey) || 'null'); return value?.requestId && value?.actorId && value?.action ? value : null; }
  catch { return null; }
}
export default function DemoApp() {
  const [state, setState] = useState<DemoState | null>(null);
  const [actorId, setActorId] = useState(() => localStorage.getItem('family-demo-profile') || '');
  const [tab, setTab] = useState<Tab>('home');
  const [wardrobeSection, setWardrobeSection] = useState('appearance');
  const [busy, setBusy] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<DemoAction | null>(readPending);
  const inFlight = useRef(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [loadError, setLoadError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const data = await apiJson<{ state: DemoState }>('/api/demo/state');
      setState(current => !current || data.state.revision >= current.revision ? data.state : current);
      setLoadError('');
    } catch (error) { setLoadError(error instanceof Error ? error.message : 'Не удалось открыть дом'); }
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(() => { if (!inFlight.current) void refresh(); }, 15000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => { initTelegramWebApp(); document.title = 'Семейный дом — локальная демо'; document.body.classList.add('family-demo-body'); return () => document.body.classList.remove('family-demo-body'); }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), notice.error ? 10000 : 5500); return () => clearTimeout(timer); }, [notice]);
  const user = state?.users.find(item => item.id === actorId && !item.archived) || state?.users.find(item => item.role === 'child' && !item.archived) || state?.users.find(item => !item.archived);
  const send = async (request: DemoAction) => {
    if (inFlight.current) return false;
    inFlight.current = true; setBusy(true);
    setPendingRequest(request); sessionStorage.setItem(pendingKey, JSON.stringify(request));
    try {
      const response = await apiFetch('/api/demo/action', { method: 'POST', json: request });
      const data = await response.json() as { state: DemoState; message: string; error?: string };
      // A 503 can follow an uncertain database commit. Preserve its logical request id.
      if (response.status >= 500) throw new Error(data.error || 'Связь прервана до подтверждения');
      sessionStorage.removeItem(pendingKey); setPendingRequest(null);
      if (!response.ok) { setNotice({ text: data.error || 'Действие не сохранено', error: true }); return false; }
      setState(data.state); setNotice({ text: data.message, error: false }); return true;
    } catch { setNotice({ text: 'Ответ не получен. Проверьте результат той же попытки: повторной покупки или награды не будет.', error: true }); return false; }
    finally { setBusy(false); inFlight.current = false; }
  };
  const act: Act = async payload => {
    if (!user || pendingRequest || inFlight.current) return false;
    return send({ ...payload, actorId: user.id, requestId: payload.requestId || crypto.randomUUID() });
  };
  const go = (next: Tab, section?: string) => { if (section) setWardrobeSection(section); setTab(next); window.scrollTo({ top: 0, behavior: 'instant' }); };
  if (!state || !user) return <main className="demo-loading"><BookOpen size={40} /><h1>Открываем семейный дом</h1><p>{loadError || 'Загружаем сохранённую семью…'}</p>{loadError && <Button onClick={refresh}><RefreshCw size={18} /> Повторить</Button>}</main>;
  const props = { state, user, act, busy: busy || !!pendingRequest };
  const todayPending = state.completions.filter(item => item.status === 'pending' && (user.role === 'parent' || item.userId === user.id)).length;
  return <CharacterCatalogContext.Provider value={state.catalog.items}><div className="family-demo">
    <header className="demo-topbar">
      <button className="demo-brand" onClick={() => go('home')} aria-label="Семейный дом, на главную"><span className="demo-brand-crest"><Home size={23} /></span><span>Семейный дом<small>Наше общее приключение</small></span></button>
      <div className="demo-profile"><label htmlFor="demo-profile" className="sr-only">Ваш профиль в локальной демо</label><select id="demo-profile" value={user.id} disabled={busy || !!pendingRequest} onChange={event => { setActorId(event.target.value); localStorage.setItem('family-demo-profile', event.target.value); }}>{state.users.filter(item => !item.archived).map(item => <option key={item.id} value={item.id}>{item.name}{item.role === 'parent' ? ' · взрослый' : ''}</option>)}</select></div>
    </header>
    <div className="demo-wallet-strip"><div className="demo-profile-progress">{user.role === 'parent' ? <span><Users size={15} /> Поддержка семьи</span> : <><span><Sparkles size={14} /> Уровень {user.level}<small>{user.xp} опыта</small></span><div className="demo-xp-track" role="progressbar" aria-label="Опыт до следующего уровня" aria-valuenow={user.xp % 100} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${user.xp % 100}%` }} /></div></>}</div><span className="demo-family-wallet"><small>Семейная копилка</small><Money value={state.wallet.coins} /></span></div>
    {pendingRequest && !busy && <section className="demo-pending-request" role="alert"><p>Сервер ещё не подтвердил последнюю попытку. Новые действия приостановлены, чтобы не повторить покупку или удар.</p><Button onClick={() => send(pendingRequest)}>Проверить результат</Button></section>}
    <main className="demo-main" key={`${tab}:${user.id}`}>
      {tab === 'home' && <HomeScreen {...props} go={go} />}
      {tab === 'tasks' && <TasksScreen {...props} />}
      {tab === 'adventure' && <AdventureScreen {...props} />}
      {tab === 'wardrobe' && <WardrobeScreen {...props} initialSection={wardrobeSection} />}
      {tab === 'family' && <FamilyScreen {...props} />}
    </main>
    <nav className="demo-nav" aria-label="Основная навигация">{tabs.map(([id, label, Icon]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}><span className="demo-nav-icon"><Icon size={23} />{id === 'tasks' && todayPending > 0 && <span className="demo-nav-badge" aria-label={`${todayPending} на проверке`}>{todayPending}</span>}</span><span>{label}</span></button>)}</nav>
    {notice && <div className={`demo-toast ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}><span>{notice.text}</span><button onClick={() => setNotice(null)} aria-label="Скрыть сообщение"><X size={18} /></button></div>}
    {loadError && <div className="demo-connection" role="status">Связь с сервером прервана. Сохранённые данные показаны без обновления.</div>}
  </div></CharacterCatalogContext.Provider>;
}
