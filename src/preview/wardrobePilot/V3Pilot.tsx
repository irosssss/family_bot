import React, { useState } from 'react';
import assets from './v3Assets.json';
import './v3.css';

const roles = [{ id: 'father', name: 'Папа', scale: 1 }, { id: 'mother', name: 'Мама', scale: .93 },
  { id: 'son', name: 'Сын', scale: .77 }, { id: 'daughter', name: 'Дочь', scale: .65 }];
const title = (asset: typeof assets[number]) => `${asset.collection === 'basic' ? 'Базовый' : 'Сезонный'} ${asset.number}`;
const price = (asset: typeof assets[number]) => asset.collection === 'basic' ? [0, 48, 72][asset.number - 1] : 120;
export default function V3Pilot() {
  const [role, setRole] = useState('father');
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [background, setBackground] = useState('light');
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<'single' | 'family'>('single');
  const current = (id: string) => assets.find(a => a.id === selected[id] && a.role === id) ?? assets.find(a => a.role === id && a.collection === 'basic' && a.number === 1)!;
  const active = current(role);
  function portrait(asset: typeof assets[number], small = false) {
    return <div className={`portrait ${small ? 'small' : ''}`}>
      <img src={asset.src} alt={`${roles.find(r => r.id === asset.role)?.name}: ${title(asset)}`} loading={small ? 'lazy' : 'eager'}
        style={{ transform: `translateY(${asset.offsetY / asset.height * 100}%)` }}
        onLoad={() => setLoaded(value => ({ ...value, [asset.id]: true }))}
        onError={() => setFailed(value => ({ ...value, [asset.id]: true }))} />
      {failed[asset.id] && <span role="alert">Не удалось загрузить комплект</span>}
    </div>;
  }
  return <main className="v3-pilot">
    <header><p className="eyebrow">Family Life · V3</p><h1>Примерочная семьи</h1><p>Проверка готовых образов. Примерка не покупает комплект и не меняет игру.</p></header>
    <nav aria-label="Персонаж">{roles.map(item => <button key={item.id} aria-pressed={role === item.id} onClick={() => setRole(item.id)}>{item.name}</button>)}</nav>
    <div className="controls" aria-label="Режим просмотра"><button aria-pressed={view === 'single'} onClick={() => setView('single')}>Один персонаж</button><button aria-pressed={view === 'family'} onClick={() => setView('family')}>Вся семья</button></div>
    <div className="controls" aria-label="Фон">{[{id:'light',name:'Светлый'},{id:'dark',name:'Тёмный'},{id:'grid',name:'Прозрачность'}].map(item => <button key={item.id} aria-pressed={background === item.id} onClick={() => setBackground(item.id)}>{item.name}</button>)}</div>
    <section className={`stage ${background} ${view === 'family' ? 'family-stage' : ''}`} aria-label="Предпросмотр">
      {view === 'single' ? portrait(active) : <div className="family">{roles.map(item => <div key={item.id} className="family-member" style={{width: `${item.scale * 29}%`}}>{portrait(current(item.id))}</div>)}</div>}
    </section>
    <p className="selection" aria-live="polite">{roles.find(r => r.id === role)?.name} · {title(active)}{failed[active.id] ? ' · Ошибка загрузки' : loaded[active.id] ? '' : ' · Загружается'}</p>
    <h2>Комплекты</h2><p className="hint">Первый базовый — бесплатно. Остальные цены показаны для прототипа.</p>
    <div className="outfits">{assets.filter(a => a.role === role).sort((a,b) => a.collection.localeCompare(b.collection) || a.number - b.number).map(asset => <button key={asset.id} aria-pressed={active.id === asset.id} onClick={() => setSelected(value => ({...value, [role]:asset.id}))}>
      {portrait(asset,true)}<strong>{title(asset)}</strong><span>{price(asset) === 0 ? 'Бесплатно' : `${price(asset)} ${price(asset) === 72 ? 'монеты' : 'монет'}`}</span>
    </button>)}</div>
    <details><summary>О проверке образов</summary><p>Цельный PNG без растяжения. Волосы, глаза и одежда здесь не разделяются на слои. Положение спортивного комплекта дочери учитывает сохранённую поправку Figma.</p><p>Семейный вид сравнивает пропорции 100 / 93 / 77 / 65. Это не готовая сцена дома; размещение с мебелью и питомцами проверяется отдельно.</p></details>
  </main>;
}
