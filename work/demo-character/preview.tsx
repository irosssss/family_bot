import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Character } from '../../src/demo/Character';
import { getSceneLayout } from '../../src/demo/sceneLayout';
import type { DemoAppearance, DemoSubtype } from '../../src/demo/types';

const starting = [
  { id: 'father', name: 'Папа', role: 'parent', subtype: 'father', appearance: { skin: 'peach', hair: 'short', hairColor: 'chestnut', beard: 'short', classId: 'warrior', bodyId: 'starter-warrior-body', weaponId: 'starter-warrior-weapon' } },
  { id: 'mother', name: 'Мама', role: 'parent', subtype: 'mother', appearance: { skin: 'peach', hair: 'long', hairColor: 'chestnut', beard: 'none', classId: 'healer', bodyId: 'starter-healer-body', weaponId: 'starter-healer-weapon' } },
  { id: 'son', name: 'Сын', role: 'child', subtype: 'son', appearance: { skin: 'peach', hair: 'short', hairColor: 'chestnut', beard: 'none', classId: 'rogue', bodyId: 'starter-rogue-body', weaponId: 'starter-rogue-weapon' } },
  { id: 'daughter', name: 'Дочка', role: 'child', subtype: 'daughter', appearance: { skin: 'peach', hair: 'bob', hairColor: 'ginger', beard: 'none', classId: 'mage', bodyId: 'starter-mage-body', weaponId: 'starter-mage-weapon' } },
] as { id: string; name: string; role: string; subtype: DemoSubtype; appearance: DemoAppearance }[];

function Preview() {
  const [theme, setTheme] = useState('fireplace');
  const [count, setCount] = useState(4);
  const [page, setPage] = useState(0);
  const people = Array.from({ length: count }, (_, i) => ({ ...starting[i % 4], id: String(i) }));
  const layout = getSceneLayout(people, page, theme);
  return <main style={{ fontFamily: 'Arial, sans-serif', background: '#f3ead9', color: '#483824', minHeight: '100vh', padding: 16 }}>
    <h1 style={{ fontSize: 22 }}>Проверка семьи и слоёв</h1>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
      {['fireplace','library','conservatory'].map(value => <button style={{ minHeight:44 }} key={value} onClick={() => setTheme(value)}>{value}</button>)}
      <label>Человек <input type="number" min="1" max="16" value={count} onChange={e => setCount(Math.max(1, Number(e.target.value)))} style={{width:48,minHeight:44}} /></label>
    </div>
    <section style={{ position:'relative', width:'100%', maxWidth:390, aspectRatio:'2/3', overflow:'hidden', borderRadius:18 }}>
      <img src={`/assets/game/demo/home-${theme}.webp`} style={{ width:'100%',height:'100%',objectFit:'cover' }} />
      {layout.members.map(({member,x,y,scale,zIndex}) => <div key={member.id} style={{ position:'absolute',left:`${x}%`,top:`${y}%`,transform:'translate(-50%,-100%)',zIndex, textAlign:'center' }}>
        <Character appearance={member.appearance} subtype={member.subtype} size={125*scale} showWeapon={false} title={member.name} />
        <div style={{background:'#382619dd',color:'#fff7e9',borderRadius:10,padding:'3px 8px',fontSize:11}}>{member.name}</div>
      </div>)}
    </section>
    <nav style={{display:'flex',gap:8,margin:'12px 0'}}>{Array.from({length:layout.pageCount},(_,i)=><button style={{minHeight:44}} key={i} onClick={()=>setPage(i)}>Группа {i+1}</button>)}</nav>
    <h2 style={{fontSize:18}}>Четыре класса</h2><div style={{display:'flex',flexWrap:'wrap'}}>{starting.map(person => <div key={person.id}><Character appearance={person.appearance} subtype={person.subtype} size={160} title={person.name} /></div>)}</div>
    <h2 style={{fontSize:18}}>Кожа, волосы, борода</h2><div style={{display:'flex',flexWrap:'wrap'}}>{(['peach','warm','brown','deep'] as const).map((skin,i)=><Character key={skin} appearance={{...starting[0].appearance,skin,beard:i%2?'full':'short',hair:(['short','bob','curly','ponytail'] as const)[i],hairColor:(['chestnut','blond','black','silver'] as const)[i]}} subtype="father" size={140} title={skin} />)}</div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
