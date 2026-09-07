import type { DemoBoss } from './types';

/** Editorial regions are a view over the catalog, never an unlock or reward rule. */
export const WORLD_REGIONS = [
  { id: 'village', name: 'Долина добрых дел', description: 'Маленькие домашние победы складываются в большое приключение.', x: 25, y: 72, sourceRef: '16_10_51' },
  { id: 'forest', name: 'Лес открытий', description: 'Сказочные встречи для любопытной команды.', x: 22, y: 35, sourceRef: '16_23_34' },
  { id: 'mountain', name: 'Вершина хранителей', description: 'Древние хранители ждут следующего шага вашей семьи.', x: 56, y: 17, sourceRef: '16_23_40' },
  { id: 'lake', name: 'Озеро спокойствия', description: 'Учимся замечать трудности и помогать друг другу.', x: 73, y: 46, sourceRef: '16_23_45' },
  { id: 'cave', name: 'Пещера отвлечений', description: 'Вернуть внимание важному — уже маленькая победа.', x: 72, y: 85, sourceRef: '16_23_53' },
] as const;

export type WorldRegionId = typeof WORLD_REGIONS[number]['id'];
export interface WorldRegion {
  id: WorldRegionId;
  name: string;
  description: string;
  x: number;
  y: number;
  bosses: DemoBoss[];
  defeatedCount: number;
}

export function bossRegionId(boss: Pick<DemoBoss, 'id' | 'sourceRef'>): WorldRegionId {
  const authored = WORLD_REGIONS.find(region => region.sourceRef === boss.sourceRef);
  if (authored) return authored.id;
  // Imported entries have no source sheet. Their stable ID keeps the region unchanged
  // when a parent renames, reorders, hides or adds other catalog entries.
  const hash = Array.from(boss.id).reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0, 0);
  return WORLD_REGIONS[hash % WORLD_REGIONS.length].id;
}

export function getWorldRegions(bosses: readonly DemoBoss[], defeatedBossIds: readonly string[]): WorldRegion[] {
  const defeated = new Set(defeatedBossIds);
  const ordered = bosses.filter(boss => boss.enabled).slice().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return WORLD_REGIONS.map(region => {
    const members = ordered.filter(boss => bossRegionId(boss) === region.id);
    return { ...region, bosses: members, defeatedCount: members.filter(boss => defeated.has(boss.id)).length };
  });
}
