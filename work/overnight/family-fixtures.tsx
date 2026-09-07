import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createDemoUser, createInitialDemoState } from '../../src/demo/catalog';
import { Room } from '../../src/demo/HomeScreen';
import { CharacterCatalogContext } from '../../src/demo/Character';
import '../../src/demo/demo.css';
import '../../src/demo/home-scene.css';

// No API, database, storage, network mutations or reuse of the user's world.
function Fixtures() {
  const [count, setCount] = useState(4);
  const [parents, setParents] = useState(2);
  const [pets, setPets] = useState(false);
  const [custom, setCustom] = useState(false);
  const [selected, setSelected] = useState('Никто');
  const state = createInitialDemoState('2026-09-05');
  state.users = Array.from({ length: count }, (_, index) => createDemoUser(`fixture-${index}`,
    index < parents ? (index ? 'Мама' : 'Папа') : `Ребёнок ${index - parents + 1}`,
    index < parents ? (index ? 'mother' : 'father') : index % 2 ? 'daughter' : 'son', index < parents ? 35 : 8));
  if (pets) state.users.forEach((user, index) => {
    const pet = state.catalog.pets[index % state.catalog.pets.length];
    user.petIds = [pet.id]; user.activePetId = pet.id;
  });
  if (custom) {
    const item = { ...state.catalog.items.find(item => item.id === 'starter-warrior-body')!,
      id: 'fixture-custom-body', layerArt: '/assets/game/demo/characters/rare-warrior-body-peach.png' };
    state.catalog.items.push(item);
    state.users.forEach(user => { user.appearance.bodyId = item.id; });
  }
  return <CharacterCatalogContext.Provider value={state.catalog.items}><div className="family-demo" style={{ paddingBottom:24 }}>
    <header style={{ padding:12 }}><h1 style={{ fontSize:18 }}>Проверка расстановки</h1><p>Изолированный просмотр. Данные семьи не меняются.</p>
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:10 }}>
        <label>Участников <select aria-label="Участников" value={count} onChange={event => setCount(Number(event.target.value))} style={{ minHeight:44 }}>
          {[0, 1, 2, 4, 6, 8, 13].map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>Взрослых <select aria-label="Взрослых" value={parents} onChange={event => setParents(Number(event.target.value))} style={{ minHeight:44 }}>
          {[0, 1, 2].map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label style={{ minHeight:44, display:'flex', alignItems:'center' }}><input type="checkbox" checked={pets} onChange={event => setPets(event.target.checked)} />Полученные питомцы</label>
        <label style={{ minHeight:44, display:'flex', alignItems:'center' }}><input type="checkbox" checked={custom} onChange={event => setCustom(event.target.checked)} />Одежда без сидячей позы</label>
      </div>
    </header>
    <div className="demo-home-scene"><Room state={state} onMember={member => setSelected(member.id)} /></div>
    <p style={{ padding:12 }}>Выбран: <output>{selected}</output></p>
  </div></CharacterCatalogContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixtures />);
