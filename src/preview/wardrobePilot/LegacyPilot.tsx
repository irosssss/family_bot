import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Check, Download, RotateCcw, Scissors, Shirt } from 'lucide-react';
import { ASSETS, HAIRS, OUTFITS, loadArt, renderLook, type LoadedArt, type Look } from './rig';
import './style.css';

const initial: Look = { outfit: 'ranger', hair: 'waves' };
const saveKey = 'family-rpg-wardrobe-pilot-v1';
function readLook(): Look {
  try { const v = JSON.parse(localStorage.getItem(saveKey) ?? 'null');
    if (v && OUTFITS.some(o => o.id === v.outfit) && HAIRS.some(h => h.id === v.hair)) return v;
  } catch { /* Storage is optional in the preview. */ } return initial;
}
function App() {
  const [art, setArt] = useState<LoadedArt | null>(null);
  const [look, setLook] = useState<Look>(readLook);
  const [tab, setTab] = useState<'outfit' | 'hair'>('outfit');
  const [backdrop, setBackdrop] = useState('room');
  const [reference, setReference] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => { let live = true; loadArt().then(a => { if (live) setArt(a); }).catch(() => { if (live) setError('Не удалось загрузить изображения. Обновите страницу.'); }); return () => { live = false; }; }, []);
  useEffect(() => { if (art && canvas.current) renderLook(canvas.current, art, look); }, [art, look]);
  useEffect(() => { try { localStorage.setItem(saveKey, JSON.stringify(look)); } catch { /* Preview can work without storage. */ } }, [look]);
  function download(layer: 'all' | 'body' | 'outfit' | 'hands' | 'hair' = 'all') {
    if (!art) return;
    const c = document.createElement('canvas'); renderLook(c, art, look, layer);
    c.toBlob(blob => { if (!blob) return; const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
      a.download = `boy-${layer}-${look.outfit}-${look.hair}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(layer === 'all' ? 'PNG с прозрачным фоном подготовлен' : 'Прозрачный слой подготовлен');
    }, 'image/png');
  }
  return <main className="fitting-app">
    <header><div><p className="family-name">Family RPG</p><h1>Примерочная</h1></div><button className="reset" onClick={() => { setLook(initial); setReference(false); setMessage('Начальный образ восстановлен'); }} aria-label="Сбросить образ"><RotateCcw size={20}/></button></header>
    <div className="fitting-layout">
      <section className={`stage ${backdrop}`} aria-label="Примерка мальчика">
        <div className="stage-caption"><span>Мальчик</span><button aria-pressed={reference} onClick={() => setReference(v => !v)}>{reference ? 'К примерке' : 'Исходник'}</button></div>
        <div className="figure-space">
          <div className="platform"/>
          <canvas ref={canvas} className={reference ? 'is-hidden' : ''} role="img" aria-label={`Мальчик: ${OUTFITS.find(o => o.id === look.outfit)?.name}, причёска ${HAIRS.find(h => h.id === look.hair)?.name}`}/>
          {reference && <img className="reference" src={ASSETS.reference} alt="Исходный персонаж"/>}
          {!art && <p className="loading" role="status">{error || 'Открываем гардероб…'}</p>}
        </div>
        <div className="backgrounds" aria-label="Фон примерки">{[['room','Комната'],['light','Светлый'],['dark','Тёмный'],['grid','Сетка']].map(([id,label]) => <button key={id} className={`swatch ${id}`} aria-label={label} title={label} aria-pressed={backdrop===id} onClick={() => setBackdrop(id)}>{backdrop===id && <Check size={16}/>}</button>)}</div>
      </section>
      <section className="wardrobe" aria-label="Выбор образа">
        <div className="wardrobe-heading"><h2>Собери свой образ</h2><p>Одежда и волосы меняются независимо.</p></div>
        <div className="tabs" role="group" aria-label="Раздел гардероба"><button aria-pressed={tab==='outfit'} onClick={() => setTab('outfit')}><Shirt size={18}/>Одежда</button><button aria-pressed={tab==='hair'} onClick={() => setTab('hair')}><Scissors size={18}/>Причёски</button></div>
        <div className="choices">{tab==='outfit' ? OUTFITS.map(o => <button key={o.id} className="choice" aria-pressed={look.outfit===o.id} disabled={!art} onClick={() => { setLook(v => ({...v,outfit:o.id})); setReference(false); }}><span className={`mini outfit-${o.id}`}>{o.id==='base' ? <Shirt size={30}/> : <img src={ASSETS.wardrobe} alt=""/>}</span><span><strong>{o.name}</strong><small>{o.detail}</small></span>{look.outfit===o.id && <Check className="selected" size={18}/>}</button>) : HAIRS.map(h => <button key={h.id} className="choice" aria-pressed={look.hair===h.id} disabled={!art} onClick={() => { setLook(v => ({...v,hair:h.id})); setReference(false); }}><span className={`mini hair-${h.id}`}>{h.id==='none' ? <Scissors size={28}/> : <img src={ASSETS.wardrobe} alt=""/>}</span><span><strong>{h.name}</strong><small>Каштановый</small></span>{look.hair===h.id && <Check className="selected" size={18}/>}</button>)}</div>
        <button className="download" disabled={!art} onClick={() => download()}><Download size={18}/>Сохранить образ PNG</button>
        <p className="status" role="status">{message || 'Выбранный образ сохраняется на этом устройстве.'}</p>
        <details><summary>Отдельные слои для игры</summary><p>PNG 1024 × 1536. Порядок наложения: основа, одежда, кисти, волосы. Фон примерочной в них не входит.</p><div className="exports"><button disabled={!art} onClick={() => download('body')}>Основа</button><button disabled={!art || look.outfit==='base'} onClick={() => download('outfit')}>Одежда</button><button disabled={!art || look.outfit==='base'} onClick={() => download('hands')}>Кисти</button><button disabled={!art || look.hair==='none'} onClick={() => download('hair')}>Волосы</button></div></details>
      </section>
    </div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
