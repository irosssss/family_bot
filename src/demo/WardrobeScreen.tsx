import { useEffect, useState, type CSSProperties } from 'react';
import { Check, Heart, Palette, Scissors, ShieldCheck, Shirt, ShoppingBag, Sparkles, Sword, Zap } from 'lucide-react';
import { Character } from './Character';
import { Room } from './HomeScreen';
import { Art, Button, classes, Empty, Modal, Money, SectionTitle, subtypes, type ScreenProps } from './ui';
import type { DemoAppearance, DemoItem, DemoTheme } from './types';
import './wardrobe-v2.css';

const skins = { peach: ['Светлая', '#f3c49d'], warm: ['Тёплая', '#d99b65'], brown: ['Смуглая', '#ad704d'], deep: ['Тёмная', '#754a35'] };
const hairs = { short: 'Короткая', bob: 'Каре', long: 'Длинная', curly: 'Кудри', ponytail: 'Хвост' };
const colors = { chestnut: ['Каштан', '#684331'], blond: ['Блонд', '#e4bd63'], black: ['Чёрный', '#29252a'], ginger: ['Рыжий', '#ae542d'], silver: ['Седой', '#bdc4c6'] };
const slots = { shelf: 'Полка', floor: 'На полу', wall: 'Стена' };
type LookSection = 'hair' | 'skin' | 'class' | 'beard';
type OutfitFilter = 'all' | 'body' | 'weapon' | 'owned';
export function WardrobeScreen({ state, user, act, busy, initialSection }: ScreenProps & { initialSection: string }) {
  const [section, setSection] = useState(initialSection);
  const [lookSection, setLookSection] = useState<LookSection>('hair');
  const [outfitFilter, setOutfitFilter] = useState<OutfitFilter>('all');
  const [draft, setDraft] = useState<DemoAppearance>({ ...user.appearance });
  const [themePreview, setThemePreview] = useState<DemoTheme | null>(null);
  const [decorPreview, setDecorPreview] = useState<DemoItem | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [petView, setPetView] = useState('mine');
  const [petQuery, setPetQuery] = useState('');
  // Polling returns new object references; only a real saved-look change resets a draft.
  const savedAppearance = JSON.stringify(user.appearance);
  useEffect(() => setDraft(JSON.parse(savedAppearance)), [savedAppearance, user.id]);
  useEffect(() => setSection(initialSection), [initialSection]);
  const changed = JSON.stringify(draft) !== JSON.stringify(user.appearance);
  const classSaved = draft.classId === user.appearance.classId;
  const missingPreviewItems = [draft.bodyId, draft.weaponId].filter(id => !user.ownedItemIds.includes(id) && !(!classSaved && id.startsWith(`starter-${draft.classId}-`)));
  const available = state.catalog.items.filter(item => (item.enabled || user.ownedItemIds.includes(item.id)) && item.kind !== 'decor' && (item.classId === draft.classId || item.classId === 'all')).filter(item => outfitFilter === 'all' || (outfitFilter === 'owned' ? user.ownedItemIds.includes(item.id) : item.kind === outfitFilter)).sort((a, b) => a.order - b.order);
  const petCatalog = state.catalog.pets.filter(pet => pet.enabled || user.petIds.includes(pet.id) || user.eggIds.includes(pet.id));
  const shownPets = petCatalog.filter(pet => (petView === 'catalog' || user.petIds.includes(pet.id) || user.eggIds.includes(pet.id)) && pet.name.toLocaleLowerCase('ru').includes(petQuery.toLocaleLowerCase('ru')));
  const savedDraft = async () => { await act({ action: 'saveAppearance', appearance: draft }); };
  return <div className="demo-v2-wardrobe">
    <SectionTitle title="Гардероб героя" text="Свой характер. Свой образ. Примеряйте и выбирайте то, что нравится." />
    <div className="demo-tabs" aria-label="Разделы гардероба">{[['appearance', 'Образ', Palette], ['outfits', 'Снаряжение', Shirt], ['home', 'Дом', ShoppingBag], ['pets', 'Питомцы', Heart], ...(user.role === 'parent' ? [['shop', 'Особый декор', Sparkles]] : [])].map(([id, label, Icon]) => { const I = Icon as typeof Palette; return <button key={id as string} aria-pressed={section === id} onClick={() => setSection(id as string)}><I size={17} />{label as string}</button>; })}</div>
    {(section === 'appearance' || section === 'outfits') && <div className="demo-v2-wardrobe-layout">
      <section className="demo-v2-fitting-room" aria-label="Примерочная героя">
        <div className={`demo-v2-fitting-status ${changed ? 'is-draft' : ''}`} role="status">
          {changed ? <Palette size={15} /> : <Check size={15} />}
          {changed ? 'Примерка — ещё не сохранено' : 'Сохранённый образ'}
        </div>
        <div className="demo-v2-hero-showcase">
          <div className="demo-v2-hero-pedestal"><Character appearance={draft} subtype={user.subtype} size={210} title={`Образ ${user.name}`} /></div>
          <div className="demo-v2-hero-details">
            <span className="demo-v2-role-label">{subtypes[user.subtype]}</span><h2>{user.name}</h2>
            <p className="demo-v2-hero-class"><Sword size={15} />{classes[draft.classId]}</p>
            {user.role === 'child' ? <div className="demo-v2-hero-progress">
              <strong>Уровень {user.level}</strong>
              <progress value={user.xp % 100} max={100} aria-label={`До следующего уровня: ${user.xp % 100} из 100 опыта`} />
              <small>{user.xp % 100} / 100 XP до уровня {user.level + 1}</small>
              <span><Zap size={15} />Энергия {user.energy} / 100</span>
            </div> : <p className="demo-v2-parent-role"><ShieldCheck size={18} />Забота и поддержка<br /><small>Класс меняет только образ</small></p>}
          </div>
        </div>
        <div className="demo-v2-fitting-actions">
          <Button disabled={!changed || busy || missingPreviewItems.length > 0} onClick={savedDraft}>Сохранить образ</Button>
          <Button variant="quiet" disabled={!changed || busy} onClick={() => setDraft({ ...user.appearance })}>Отменить</Button>
        </div>
        {missingPreviewItems.length > 0 && <p className="demo-v2-fitting-hint">Сначала получите примеренные вещи в коллекцию.</p>}
      </section>
      <section className="demo-v2-look-controls" aria-label={section === 'appearance' ? 'Настройка внешности' : 'Коллекция снаряжения'}>
        {section === 'appearance' ? <>
          <div className="demo-v2-control-heading"><Scissors size={19} /><h2>Ваш неповторимый герой</h2></div>
          <div className="demo-v2-segmented" aria-label="Настройки образа">
            {([['hair', 'Волосы'], ['skin', 'Кожа'], ['class', 'Класс'], ...(user.subtype === 'father' ? [['beard', 'Борода']] : [])] as [LookSection, string][]).map(([id, name]) =>
              <button key={id} aria-pressed={lookSection === id} onClick={() => setLookSection(id)}>{name}</button>,
            )}
          </div>
          {lookSection === 'hair' && <>
            <fieldset><legend>Причёска</legend><div className="demo-v2-portrait-grid">
              {Object.entries(hairs).map(([id, name]) => <button className="demo-v2-portrait-choice" key={id} aria-pressed={draft.hair === id} onClick={() => setDraft({ ...draft, hair: id as DemoAppearance['hair'] })}>
                <span className="demo-v2-portrait-window"><Character appearance={{ ...draft, hair: id as DemoAppearance['hair'] }} subtype={user.subtype} size={160} showWeapon={false} shadow={false} /></span>
                <span>{name}</span>{draft.hair === id && <Check className="demo-v2-choice-check" size={15} />}
              </button>)}
            </div></fieldset>
            <fieldset><legend>Цвет волос</legend><div className="demo-v2-color-grid">
              {Object.entries(colors).map(([id, [name, color]]) => <button key={id} aria-pressed={draft.hairColor === id} onClick={() => setDraft({ ...draft, hairColor: id as DemoAppearance['hairColor'] })}>
                <span className="demo-v2-color-chip" style={{ '--swatch': color } as CSSProperties}>{draft.hairColor === id && <Check size={17} />}</span><span>{name}</span>
              </button>)}
            </div></fieldset>
          </>}
          {lookSection === 'skin' && <fieldset><legend>Цвет кожи</legend><div className="demo-v2-portrait-grid skin-grid">
            {Object.entries(skins).map(([id, [name, color]]) => <button className="demo-v2-portrait-choice" key={id} aria-pressed={draft.skin === id} onClick={() => setDraft({ ...draft, skin: id as DemoAppearance['skin'] })}>
              <span className="demo-v2-portrait-window"><Character appearance={{ ...draft, skin: id as DemoAppearance['skin'] }} subtype={user.subtype} size={160} showWeapon={false} shadow={false} /></span>
              <span><i className="demo-v2-skin-dot" style={{ background: color }} />{name}</span>{draft.skin === id && <Check className="demo-v2-choice-check" size={15} />}
            </button>)}
          </div><p className="demo-muted">Все оттенки доступны сразу и сочетаются с любой одеждой.</p></fieldset>}
          {lookSection === 'beard' && user.subtype === 'father' && <fieldset><legend>Борода папы</legend><div className="demo-v2-portrait-grid">
            {Object.entries({ none: 'Без бороды', short: 'Короткая', full: 'Пышная' }).map(([id, name]) => <button className="demo-v2-portrait-choice" key={id} aria-pressed={draft.beard === id} onClick={() => setDraft({ ...draft, beard: id as DemoAppearance['beard'] })}>
              <span className="demo-v2-portrait-window beard-window"><Character appearance={{ ...draft, beard: id as DemoAppearance['beard'] }} subtype={user.subtype} size={160} showWeapon={false} shadow={false} /></span>
              <span>{name}</span>{draft.beard === id && <Check className="demo-v2-choice-check" size={15} />}
            </button>)}
          </div><p className="demo-muted">Цвет бороды совпадает с выбранным цветом волос.</p></fieldset>}
          {lookSection === 'class' && <fieldset><legend>{user.role === 'parent' ? 'Косметический архетип' : 'Выберите свой класс'}</legend><div className="demo-v2-class-grid">
            {Object.entries(classes).map(([id, name]) => <button key={id} aria-pressed={draft.classId === id} onClick={() => setDraft({ ...draft, classId: id as DemoAppearance['classId'], bodyId: `starter-${id}-body`, weaponId: `starter-${id}-weapon` })}>
              <Character appearance={{ ...draft, classId: id as DemoAppearance['classId'], bodyId: `starter-${id}-body`, weaponId: `starter-${id}-weapon` }} subtype={user.subtype} size={126} />
              <strong>{name}</strong><small>Стартовый комплект бесплатно</small>{draft.classId === id && <Check className="demo-v2-choice-check" size={16} />}
            </button>)}
          </div><p className="demo-muted">Все классы равны по силе. Опыт, покупки и выполненные дела сохраняются.</p></fieldset>}
        </> : <>
          <div className="demo-v2-control-heading"><Shirt size={19} /><h2>Снаряжение: {classes[draft.classId]}</h2></div>
          <div className="demo-v2-segmented" aria-label="Фильтр снаряжения">
            {([['all', 'Всё'], ['body', 'Одежда'], ['weapon', 'Оружие'], ['owned', 'Получено']] as const).map(([id, name]) =>
              <button key={id} aria-pressed={outfitFilter === id} onClick={() => setOutfitFilter(id)}>{name}</button>,
            )}
          </div>
          {!classSaved && <p className="demo-review-note">Сохраните новый класс, чтобы покупать его снаряжение.</p>}
          <div className="demo-catalog-grid item-grid demo-v2-collection-grid">
            {available.map(item => {
              const owned = user.ownedItemIds.includes(item.id);
              const wearing = draft[item.kind === 'body' ? 'bodyId' : 'weaponId'] === item.id;
              return <article className={`demo-item-card ${wearing ? 'is-selected' : ''}`} key={item.id}>
                <div className="demo-v2-item-art"><Art src={item.art} name={item.name} />{wearing && <span className="demo-v2-item-marker"><Check size={15} />Примерка</span>}</div>
                <span className="demo-v2-item-kind">{item.kind === 'body' ? 'Одежда' : 'Оружие'}</span><h3>{item.name}</h3>
                <p>{owned ? <span className="demo-v2-owned"><Check size={14} />В коллекции</span> : <Money value={item.price} />}</p>
                <Button variant="quiet" disabled={busy || wearing} onClick={() => setDraft({ ...draft, [item.kind === 'body' ? 'bodyId' : 'weaponId']: item.id })}>{wearing ? 'Примерено' : 'Примерить'}</Button>
                {!owned && <Button disabled={busy || !classSaved || state.wallet.coins < item.price} onClick={() => act({ action: 'buyItem', itemId: item.id })}>Получить за {item.price}</Button>}
              </article>;
            })}
          </div>
          {!available.length && <Empty>В этом разделе пока нет вещей. Посмотрите другие категории.</Empty>}
          <p className="demo-muted">Покупка добавляет вещь в коллекцию. Чтобы надеть её, примеряйте и сохраняйте образ.</p>
        </>}
      </section>
    </div>}
    {section === 'home' && <>
      <h2 className="demo-subtitle">Места, где хорошо вместе</h2>
      <div className="demo-theme-grid">
        {state.catalog.themes.filter(item => (item.enabled || state.ownedThemeIds.includes(item.id)) && (item.currency === 'coins' || user.role === 'parent' || state.ownedThemeIds.includes(item.id))).sort((a, b) => a.order - b.order).map(theme =>
          <button className="demo-theme-card" key={theme.id} onClick={() => setThemePreview(theme)}>
            <Art src={theme.art} name={theme.name} />
            <span><strong>{theme.name}</strong><small>{state.home.themeId === theme.id ? 'Сейчас дома' : state.ownedThemeIds.includes(theme.id) ? 'В коллекции' : 'Примерить комнату'}</small></span>
          </button>,
        )}
      </div>
      <h2 className="demo-subtitle">Детали нашего дома</h2>
      <p className="demo-muted">По одному предмету на полке, на стене и на полу. Заменённая вещь остаётся в коллекции.</p>
      <div className="demo-decor-slots">
        {Object.entries(slots).map(([slot, name]) => {
          const id = state.home.decor[slot as keyof typeof slots];
          return <div key={slot}><strong>{name}</strong><span>{state.catalog.items.find(item => item.id === id)?.name || 'Свободное место'}</span>
            {id && <Button variant="quiet" disabled={busy} onClick={() => act({ action: 'equipDecor', slot: slot as keyof typeof slots })}>Убрать</Button>}
          </div>;
        })}
      </div>
      <div className="demo-catalog-grid">
        {state.catalog.items.filter(item => (item.enabled || state.ownedDecorIds.includes(item.id)) && item.kind === 'decor' && item.currency === 'coins').map(item =>
          <article className="demo-item-card" key={item.id}>
            <Art src={item.art} name={item.name} /><h3>{item.name}</h3>
            <p>{state.ownedDecorIds.includes(item.id) ? 'В вашей коллекции' : <Money value={item.price} />}</p>
            <Button variant="quiet" onClick={() => setDecorPreview(item)}>Примерить дома</Button>
          </article>,
        )}
      </div>
    </>}
    {section === 'pets' && <>
      <div className="demo-pet-intro">
        <img className="demo-egg-art" src="/assets/game/demo/egg.png" alt="" aria-hidden="true" />
        <div><h2>Дружба начинается с заботы</h2><p>Первое яйцо — за выполненное дело. Вид известен заранее, вылупление бесплатное.</p></div>
      </div>
      {user.role === 'parent'
        ? <Empty>Питомцы сопровождают детей. Выберите детский профиль в верхней панели, чтобы посмотреть его коллекцию.</Empty>
        : <>
          <div className="demo-v2-segmented" aria-label="Коллекция питомцев">
            <button aria-pressed={petView === 'mine'} onClick={() => setPetView('mine')}>Мои · {user.petIds.length + user.eggIds.length}</button>
            <button aria-pressed={petView === 'catalog'} onClick={() => setPetView('catalog')}>Все виды · {petCatalog.length}</button>
          </div>
          <label className="demo-field">Поиск спутника<input type="search" value={petQuery} onChange={event => setPetQuery(event.target.value)} placeholder="Котёнок, дракончик…" /></label>
          <div className="demo-catalog-grid pet-grid">
            {shownPets.map(pet => {
              const owned = user.petIds.includes(pet.id);
              const egg = user.eggIds.includes(pet.id);
              const active = owned && user.activePetId === pet.id;
              return <article key={pet.id} className={`demo-item-card ${active ? 'is-selected' : ''}`}>
                <div className="demo-pet-art">
                  <Art src={pet.art} name={pet.name} />
                  {egg && <span className="demo-egg-badge"><img className="demo-egg-art" src="/assets/game/demo/egg.png" alt="" aria-hidden="true" />В яйце</span>}
                </div>
                <h3>{pet.name}</h3><p>{owned ? active ? 'Сейчас рядом' : 'В коллекции' : egg ? 'Готов встретиться с тобой' : <Money value={pet.price} />}</p>
                <Button variant={active ? 'quiet' : 'primary'} disabled={busy || (!owned && !egg && state.wallet.coins < pet.price)} onClick={() => act({ action: owned ? 'equipPet' : egg ? 'hatchEgg' : 'buyEgg', petId: active ? null : pet.id })}>
                  {owned ? active ? 'Отправить отдыхать' : 'Взять с собой' : egg ? 'Вылупить бесплатно' : 'Получить яйцо'}
                </Button>
              </article>;
            })}
          </div>
          {!shownPets.length && <Empty>{petQuery ? 'Такой спутник не найден. Попробуйте другое название.' : 'Здесь пока тихо. Выполните первое дело или выберите известное яйцо во вкладке «Все виды».'}</Empty>}
        </>}
    </>}
    {section === 'shop' && user.role === 'parent' && <>
      <section className="demo-shop-intro">
        <Sparkles size={30} /><h2>Особенный декор, без особой силы</h2><p>Только украшения. Ни опыта, ни энергии, ни ускоренного выполнения дел.</p>
        <div className="demo-simple-row"><span>Демо-кристаллы декора</span><Money premium value={state.wallet.decorativeCredits} /></div>
        <p className="demo-demo-disclaimer">Демонстрация покупки. Реальных списаний нет.</p>
        <Button onClick={() => setCheckout(true)}>Открыть демонстрацию покупки</Button>
      </section>
      <div className="demo-catalog-grid">
        {state.catalog.items.filter(item => (item.enabled || state.ownedDecorIds.includes(item.id)) && item.kind === 'decor' && item.currency === 'decorativeCredits').map(item =>
          <article className="demo-item-card" key={item.id}>
            <Art src={item.art} name={item.name} /><h3>{item.name}</h3><p>{state.ownedDecorIds.includes(item.id) ? 'В коллекции' : <Money premium value={item.price} />}</p>
            <Button variant="quiet" onClick={() => setDecorPreview(item)}>Примерить дома</Button>
          </article>,
        )}
      </div>
    </>}
    {themePreview && <Modal title={themePreview.name} onClose={() => setThemePreview(null)}>
      <p className="demo-demo-disclaimer">Примерка комнаты. Ваш дом пока не изменён.</p>
      <Room state={state} themeId={themePreview.id} compact /><p>{themePreview.description}</p>
      {themePreview.currency === 'decorativeCredits' && <p className="demo-demo-disclaimer">Демонстрация покупки. Реальных списаний нет. Открытие и применение особой комнаты доступны взрослому.</p>}
      <div className="demo-actions">
        {state.ownedThemeIds.includes(themePreview.id)
          ? <Button disabled={busy || state.home.themeId === themePreview.id || (themePreview.currency === 'decorativeCredits' && user.role !== 'parent')} onClick={async () => { if (await act({ action: 'equipTheme', themeId: themePreview.id })) setThemePreview(null); }}>{state.home.themeId === themePreview.id ? 'Уже дома' : 'Переехать сюда'}</Button>
          : <Button disabled={busy || state.wallet[themePreview.currency] < themePreview.price || (themePreview.currency === 'decorativeCredits' && user.role !== 'parent')} onClick={() => act({ action: 'buyTheme', themeId: themePreview.id })}>Открыть за {themePreview.price} {themePreview.currency === 'coins' ? 'монет' : 'демо-кристаллов'}</Button>}
        <Button variant="quiet" onClick={() => setThemePreview(null)}>Отменить примерку</Button>
      </div>
    </Modal>}
    {decorPreview && <Modal title={decorPreview.name} onClose={() => setDecorPreview(null)}>
      <p className="demo-demo-disclaimer">Примерка декора. Изменения ещё не сохранены.</p>
      <Room state={{ ...state, home: { ...state.home, decor: { ...state.home.decor, [decorPreview.slot!]: decorPreview.id } } }} compact /><p>{decorPreview.description}</p>
      <div className="demo-actions">
        {state.ownedDecorIds.includes(decorPreview.id)
          ? <Button disabled={busy || state.home.decor[decorPreview.slot!] === decorPreview.id} onClick={async () => { if (await act({ action: 'equipDecor', itemId: decorPreview.id, slot: decorPreview.slot })) setDecorPreview(null); }}>{state.home.decor[decorPreview.slot!] === decorPreview.id ? 'Уже установлен' : 'Поставить дома'}</Button>
          : <Button disabled={busy || state.wallet[decorPreview.currency] < decorPreview.price} onClick={() => act({ action: 'buyItem', itemId: decorPreview.id })}>Получить за {decorPreview.price} {decorPreview.currency === 'coins' ? 'монет' : 'демо-кристаллов'}</Button>}
        <Button variant="quiet" onClick={() => setDecorPreview(null)}>Отменить примерку</Button>
      </div>
    </Modal>}
    {checkout && <Modal title="Демонстрация покупки" onClose={() => setCheckout(false)}>
      <div className="demo-checkout">
        <Sparkles size={48} /><h3>120 демо-кристаллов декора</h3><p>Для знакомства с сезонными украшениями. Это не Telegram Stars и не настоящий платёж.</p>
        <p className="demo-demo-disclaimer">Демонстрация покупки. Реальных списаний нет.</p>
      </div>
      <div className="demo-actions">
        <Button disabled={busy} onClick={async () => { if (await act({ action: 'simulatePurchase' })) setCheckout(false); }}>Смоделировать покупку</Button>
        <Button variant="quiet" onClick={() => setCheckout(false)}>Отмена</Button>
      </div>
    </Modal>}
  </div>;
}
