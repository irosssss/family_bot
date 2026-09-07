import { describe, expect, it } from 'vitest';
import { createBossCatalog } from '../src/demo/catalog';
import { bossRegionId, getWorldRegions, WORLD_REGIONS } from '../src/demo/worldMap';
import type { DemoBoss } from '../src/demo/types';

describe('demo illustrated world map', () => {
  it('places all 49 enabled reference entries exactly once without creating unlock rules', () => {
    const catalog = createBossCatalog();
    const regions = getWorldRegions(catalog, []);
    const ids = regions.flatMap(region => region.bosses.map(boss => boss.id));
    expect(ids).toHaveLength(49);
    expect(new Set(ids).size).toBe(49);
    expect(ids.slice().sort()).toEqual(catalog.map(boss => boss.id).sort());
    expect(regions.map(region => region.bosses.length)).toEqual([8, 12, 8, 12, 9]);
    expect(regions.every(region => region.defeatedCount === 0)).toBe(true);
    expect(regions.every(region => !('locked' in region))).toBe(true);
  });

  it('counts actual unique defeats only among the currently enabled members', () => {
    const catalog = createBossCatalog();
    catalog[1].enabled = false;
    const regions = getWorldRegions(catalog, [catalog[0].id, catalog[0].id, catalog[1].id, 'missing-boss']);
    expect(regions.reduce((total, region) => total + region.defeatedCount, 0)).toBe(1);
    expect(regions.flatMap(region => region.bosses)).toHaveLength(48);
    expect(regions[0].defeatedCount).toBe(1);
  });

  it('keeps a custom entry in one stable region when other catalog entries change', () => {
    const catalog = createBossCatalog();
    const custom: DemoBoss = { ...catalog[0], id: 'custom-moon-spirit', sourceRef: undefined, name: 'Лунный дух', order: 1000 };
    const id = bossRegionId(custom);
    for (const entries of [[custom], [...catalog, custom], [custom, ...catalog.slice().reverse()]]) {
      const regions = getWorldRegions(entries, [custom.id]);
      expect(regions.find(region => region.id === id)?.bosses).toContain(custom);
      expect(regions.flatMap(region => region.bosses).filter(boss => boss.id === custom.id)).toHaveLength(1);
    }
    expect(bossRegionId({ ...custom, name: 'Новое имя', order: -10 } as DemoBoss)).toBe(id);
    expect(bossRegionId({ ...custom, sourceRef: 'unknown-sheet' })).toBe(id);
  });

  it('honors known source groups without inferring a region from renamed text', () => {
    const boss = createBossCatalog()[0];
    expect(bossRegionId({ ...boss, id: 'other-id', name: 'Озеро' } as DemoBoss)).toBe('village');
    for (const region of WORLD_REGIONS) expect(bossRegionId({ id: 'custom', sourceRef: region.sourceRef })).toBe(region.id);
  });

  it('sorts inside regions without mutating input and keeps empty regions honest', () => {
    const catalog = createBossCatalog().reverse();
    const before = catalog.map(boss => boss.id);
    for (const region of getWorldRegions(catalog, [])) {
      expect(region.bosses.map(boss => boss.order)).toEqual(region.bosses.map(boss => boss.order).sort((a, b) => a - b));
    }
    expect(catalog.map(boss => boss.id)).toEqual(before);
    expect(getWorldRegions([], ['procrastination']).every(region => region.bosses.length === 0 && region.defeatedCount === 0)).toBe(true);
  });

  it('keeps label anchors away from map edges and neighboring labels at mobile scale', () => {
    const width = 335;
    const height = width * 1.5;
    for (const point of WORLD_REGIONS) {
      expect(width * point.x / 100 - 66).toBeGreaterThan(0);
      expect(width * point.x / 100 + 66).toBeLessThan(width);
      expect(height * point.y / 100 - 40).toBeGreaterThan(0);
      expect(height * point.y / 100 + 40).toBeLessThan(height);
      for (const other of WORLD_REGIONS.filter(region => region.id !== point.id)) {
        const dx = Math.abs(point.x - other.x) / 100 * width;
        const dy = Math.abs(point.y - other.y) / 100 * height;
        expect(dx >= 132 || dy >= 80).toBe(true);
      }
    }
  });
});
