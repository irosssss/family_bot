import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Lamp } from 'lucide-react';
import { canRenderSittingPose, Character } from './Character';
import { getHomeFamilyLayout } from './homeFamilyLayout';
import { getHomeSceneProjection, type HomeSceneRect } from './homeSceneProjection';
import type { AuthoredHomeScene } from './homeScenes';
import type { DemoDecorSlot, DemoState, DemoTheme, DemoUser } from './types';

const position = (rect: HomeSceneRect): CSSProperties => ({
  left: rect.x, top: rect.y, width: rect.width, height: rect.height,
});

export function AuthoredRoom({ state, theme, scene, onMember, compact = false }: {
  state: DemoState; theme: DemoTheme; scene: AuthoredHomeScene;
  onMember?: (user: DemoUser) => void; compact?: boolean;
}) {
  const [page, setPage] = useState(0);
  const roomRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = roomRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const layout = getHomeFamilyLayout(state.users, page, scene.stage,
    member => canRenderSittingPose(member.appearance, state.catalog.items));
  // Keep the SSR tree (including owned pets) intact, but hide the artwork until
  // ResizeObserver has measured it. Every layer then uses exactly one projection.
  const projection = getHomeSceneProjection({ source: scene.stage.sourceSize,
    viewport: size.width && size.height ? size : scene.stage.sourceSize, fit: 'cover',
    rectangles: Object.fromEntries([
      ...(layout?.members.map(item => [`member:${item.member.id}`, item.rect] as const) ?? []),
      ...Object.entries(scene.decor).map(([key, rect]) => [`decor:${key}`, rect] as const),
      ...Object.entries(scene.pets).map(([key, rect]) => [`pet:${key}`, rect] as const),
    ]),
  });
  const ready = size.width > 0 && size.height > 0;
  return <div className={`demo-room-wrap authored ${compact ? 'compact' : ''}`}>
    <div className="demo-room demo-authored-room" data-theme={theme.id} data-layout={theme.layoutPresetId} ref={roomRef}>
      <img className="demo-room-background" src={scene.art} alt={theme.name} draggable={false}
        style={projection && ready ? { ...position(projection.sceneBounds), right: 'auto', bottom: 'auto', maxWidth: 'none' } : undefined} />
      {!compact && <div className="demo-room-caption"><h1>Наша семья</h1><p>Маленькие шаги — большие перемены</p></div>}
      {projection && <div className="demo-authored-layers" style={{ visibility: ready ? 'visible' : 'hidden' }}>
        {Object.entries(state.home.decor).map(([slot, id]) => {
          const item = state.catalog.items.find(entry => entry.id === id && entry.kind === 'decor'
            && entry.slot === slot && state.ownedDecorIds.includes(entry.id));
          const rect = projection.rectangles[`decor:${slot as DemoDecorSlot}`];
          return item && rect && <img key={slot} src={item.art} alt={item.name} draggable={false}
            className="demo-authored-decor" data-decor-slot={slot} style={{ ...position(rect), zIndex: slot === 'floor' ? 30 : 4 }} />;
        })}
        {layout?.members.map(({ member, slotId, pose, zIndex }) => {
          const rect = projection.rectangles[`member:${member.id}`];
          const pet = state.catalog.pets.find(item => item.id === member.activePetId && member.petIds.includes(item.id));
          const petRect = projection.rectangles[`pet:${slotId}`];
          return <div key={member.id} className="demo-authored-entity" data-member-id={member.id}>
            <div className={`demo-authored-member ${member.role} ${slotId.startsWith('adult-') ? 'back-row' : ''}`} data-pose={pose} style={{ ...position(rect), zIndex }}>
              <button className="demo-member-button" onClick={() => onMember?.(member)} disabled={!onMember}
                aria-label={`${member.name}: посмотреть дела`}>
                <Character appearance={member.appearance} subtype={member.subtype} size={rect.height}
                  items={state.catalog.items} pose={pose} showWeapon={false} title={member.name} />
                <span className="demo-member-name">{member.name}</span>
              </button>
            </div>
            {pet && petRect && <img src={pet.art} alt={`Питомец ${member.name}: ${pet.name}`} draggable={false}
              className="demo-authored-pet" style={{ ...position(petRect), zIndex: 35 }} />}
          </div>;
        })}
      </div>}
      {layout?.total === 0 && <p className="demo-room-empty">Добавьте семью в разделе «Семья».</p>}
      {!layout && <p className="demo-room-empty">Не удалось расположить семью. Проверьте участников в разделе «Семья».</p>}
      <div className="demo-room-label"><Lamp size={14} />{theme.name}</div>
    </div>
    {layout && layout.pageCount > 1 && <div className="demo-scene-pages" aria-label="Группы семьи">
      <span>В доме {layout.total} человек</span>
      {Array.from({ length: layout.pageCount }, (_, index) => <button key={index} aria-pressed={index === layout.page}
        onClick={() => setPage(index)}>Группа {index + 1}</button>)}
    </div>}
  </div>;
}
