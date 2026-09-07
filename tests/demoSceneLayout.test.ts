import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getSceneLayout, getSceneSeats } from '../src/demo/sceneLayout';
import { canRenderSittingPose, Character, CharacterCatalogContext, getCharacterLayerPaths, getCharacterRenderState } from '../src/demo/Character';
import type { DemoAppearance, DemoItem, DemoSubtype } from '../src/demo/types';

describe('demo family scene layout', () => {
  const roster = (count: number) => Array.from({ length: count }, (_, index) => ({
    id: String(index), role: index === 0 ? 'parent' : 'child',
  }));

  it.each([0, 1, 2, 4, 5, 8, 13])('keeps every member of a %s-person family reachable without substitutes', count => {
    const people = roster(count);
    const first = getSceneLayout(people);
    const seen = Array.from({ length: first.pageCount }, (_, page) => getSceneLayout(people, page))
      .flatMap(layout => layout.members.map(item => item.member.id));
    expect(seen).toEqual(people.map(person => person.id));
    expect(new Set(seen).size).toBe(count);
    expect(first.total).toBe(count);
  });

  it('preserves ordering and references, and explicitly excludes archived members', () => {
    const people = [{ id: 'daughter', role: 'child' }, { id: 'old', archived: true }, { id: 'mother', role: 'parent' }];
    const layout = getSceneLayout(people);
    expect(layout.members.map(item => item.member.id)).toEqual(['daughter', 'mother']);
    expect(layout.members[0].member).toBe(people[0]);
    expect(layout.members[0].scale).toBeLessThan(layout.members[1].scale);
  });

  it('clamps a stale page after a roster shrinks and tolerates invalid page inputs', () => {
    for (const page of [-7, Infinity, NaN, 99]) expect(getSceneLayout(roster(2), page).page).toBe(0);
    expect(getSceneLayout(roster(13), 1.9).page).toBe(1);
  });

  it.each(['fireplace', 'library', 'conservatory', 'custom-room'])('keeps %s anchors and scale inside the floor', theme => {
    for (let count = 1; count <= 6; count++) {
      const result = getSceneLayout(roster(count), 0, theme);
      for (const member of result.members) {
        expect(member.x).toBeGreaterThanOrEqual(18);
        expect(member.x).toBeLessThanOrEqual(82);
        expect(member.y).toBeGreaterThanOrEqual(65);
        expect(member.y).toBeLessThanOrEqual(92);
        expect(member.scale).toBeGreaterThan(0.7);
        expect(member.scale).toBeLessThanOrEqual(1);
      }
    }
  });

  it.each(['fireplace', 'library', 'conservatory'] as const)('projects optional %s seats through the exact centered room crop', preset => {
    const full = getSceneSeats(preset, 343, 514.5);
    const short = getSceneSeats(preset, 343, 402);
    expect(full).toHaveLength(2);
    expect(short).toHaveLength(2);
    for (let index = 0; index < full.length; index++) {
      expect(short[index].x).toBeCloseTo(full[index].x);
      expect(short[index].size).toBeCloseTo(full[index].size);
      expect(short[index].y).toBeCloseTo(full[index].y - (514.5 - 402) / 2);
      expect(short[index].canvasTop).toBeCloseTo(short[index].y - short[index].size * 234 / 320);
    }
  });

  it('does not return cropped-out seats or accept invalid room geometry', () => {
    expect(getSceneSeats('fireplace', 343, 150)).toEqual([]);
    expect(getSceneSeats('fireplace', 0, 515)).toEqual([]);
    expect(getSceneSeats('library', 343, NaN)).toEqual([]);
    expect(getSceneSeats('conservatory', Infinity, 515)).toEqual([]);
  });
});

describe('unified demo appearance raster contract', () => {
  const appearance: DemoAppearance = {
    skin: 'peach', hair: 'short', hairColor: 'chestnut', beard: 'full',
    classId: 'warrior', bodyId: 'rare-warrior-body', weaponId: 'starter-warrior-weapon',
  };

  it.each(['mother', 'son', 'daughter'] as DemoSubtype[])('never renders a beard for %s even from malformed imported state', subtype => {
    expect(getCharacterLayerPaths(appearance, subtype).some(path => path.includes('/beard-'))).toBe(false);
  });

  it('renders the father beard and actual equipped body consistently, and can hide a weapon at home', () => {
    const paths = getCharacterLayerPaths(appearance, 'father', false);
    expect(paths).toContain('/assets/game/demo/characters/beard-full-chestnut.png');
    expect(paths).toContain('/assets/game/demo/characters/rare-warrior-body-peach.png');
    expect(paths.some(path => path.includes('-weapon'))).toBe(false);
  });

  it('renders editor-created clothing from its explicit catalog layer instead of a silent starter substitute', () => {
    const items = [{ id: 'winter-coat', kind: 'body', layerArt: '/assets/game/demo/characters/rare-warrior-body-peach.png' }] as DemoItem[];
    const result = getCharacterRenderState({ ...appearance, bodyId: 'winter-coat' }, 'father', true, items);
    expect(result.errors).toEqual([]);
    expect(result.paths[0]).toBe(items[0].layerArt);
    expect(result.paths).not.toContain('/assets/game/demo/characters/starter-warrior-body-peach.png');
  });

  it('makes missing or unsafe custom layers explicit and never substitutes their purchased appearance', () => {
    for (const layerArt of [undefined, 'https://example.com/coat.png', '/assets/game/../coat.png', '/assets/game/%2e%2e/coat.png']) {
      const items = [{ id: 'custom-coat', kind: 'body', layerArt }] as DemoItem[];
      const result = getCharacterRenderState({ ...appearance, bodyId: 'custom-coat' }, 'father', false, items);
      expect(result.errors).toContain('Нет слоя одежды');
      expect(result.paths.some(path => path.includes('-body-'))).toBe(false);
    }
  });

  it('inherits the catalog from its React tree while keeping independent roots isolated', () => {
    const bodyId = 'custom-coat';
    const firstItems = [{ id: bodyId, kind: 'body', layerArt: '/assets/game/demo/characters/rare-warrior-body-peach.png' }] as DemoItem[];
    const secondItems = [{ id: bodyId, kind: 'body', layerArt: '/assets/game/demo/characters/rare-mage-body-peach.png' }] as DemoItem[];
    const render = (items: DemoItem[]) => renderToStaticMarkup(createElement(CharacterCatalogContext.Provider,
      { value: items }, createElement(Character, { appearance: { ...appearance, bodyId }, subtype: 'father' })));
    expect(render(firstItems)).toContain(firstItems[0].layerArt);
    expect(render(secondItems)).toContain(secondItems[0].layerArt);
    expect(render(firstItems)).not.toContain(secondItems[0].layerArt);
  });

  it('allows an explicit draft catalog to override the surrounding persisted catalog', () => {
    const persisted = [{ id: 'custom-coat', kind: 'body', layerArt: '/assets/game/demo/characters/rare-warrior-body-peach.png' }] as DemoItem[];
    const draft = [{ ...persisted[0], layerArt: '/assets/game/demo/characters/rare-healer-body-peach.png' }];
    const output = renderToStaticMarkup(createElement(CharacterCatalogContext.Provider, { value: persisted },
      createElement(Character, { appearance: { ...appearance, bodyId: 'custom-coat' }, subtype: 'father', items: draft })));
    expect(output).toContain(draft[0].layerArt);
    expect(output).not.toContain(persisted[0].layerArt);
  });

  it('uses authored sitting bodies while keeping the same heads, hair and father beard', () => {
    const standing = getCharacterRenderState(appearance, 'father', false);
    const sitting = getCharacterRenderState(appearance, 'father', false, undefined, 'sitting');
    expect(sitting.errors).toEqual([]);
    expect(sitting.paths[0]).toBe('/assets/game/demo/characters/sitting/rare-warrior-body-peach.png');
    expect(sitting.paths.slice(1)).toEqual(standing.paths.slice(1));
    expect(canRenderSittingPose(appearance)).toBe(true);
    const output = renderToStaticMarkup(createElement(Character, { appearance, subtype: 'father', pose: 'sitting' }));
    expect(output).toContain('data-pose="sitting"');
    expect(output).not.toContain('-weapon.png');
    expect(output).not.toContain('data-asset-error');
  });

  it('never turns a custom or overridden purchased body into a built-in seated outfit', () => {
    for (const bodyId of ['custom-coat', appearance.bodyId]) {
      const items = [{ id: bodyId, kind: 'body', layerArt: '/assets/game/demo/characters/rare-healer-body-peach.png' }] as DemoItem[];
      const customAppearance = { ...appearance, bodyId };
      expect(canRenderSittingPose(customAppearance, items)).toBe(false);
      const result = getCharacterRenderState(customAppearance, 'father', false, items, 'sitting');
      expect(result.errors).toContain('Для этой одежды нет сидячей позы');
      expect(result.paths.some(path => path.includes('/sitting/'))).toBe(false);
    }
    expect(canRenderSittingPose({ ...appearance, bodyId: 'unknown-coat' })).toBe(false);
    expect(getCharacterRenderState(appearance, 'father', true, undefined, 'sitting').errors).toContain('Оружие доступно только в стоячей позе');
  });

  it('has every authored sitting skin and rarity file without changing the default standing API', () => {
    for (const skin of ['peach', 'warm', 'brown', 'deep'] as const)
      for (const classId of ['warrior', 'mage', 'healer', 'rogue'] as const)
        for (const rarity of ['starter', 'rare']) {
          const variant = { ...appearance, skin, classId, bodyId: `${rarity}-${classId}-body` };
          const sitting = getCharacterRenderState(variant, 'father', false, undefined, 'sitting');
          expect(sitting.errors).toEqual([]);
          for (const path of sitting.paths) expect(existsSync(resolve('public', path.slice(1))), path).toBe(true);
          expect(getCharacterLayerPaths(variant, 'father', false)[0]).not.toContain('/sitting/');
        }
  });

  it('has a prepared transparent raster file for every supported appearance layer', () => {
    const paths = new Set<string>();
    for (const skin of ['peach', 'warm', 'brown', 'deep'] as const)
      for (const hair of ['short', 'bob', 'long', 'curly', 'ponytail'] as const)
        for (const hairColor of ['chestnut', 'blond', 'black', 'ginger', 'silver'] as const)
          for (const beard of ['none', 'short', 'full'] as const)
            for (const classId of ['warrior', 'mage', 'healer', 'rogue'] as const)
              for (const rarity of ['starter', 'rare']) {
                getCharacterLayerPaths({ skin, hair, hairColor, beard, classId,
                  bodyId: `${rarity}-${classId}-body`, weaponId: `${rarity}-${classId}-weapon`,
                }, 'father').forEach(path => paths.add(path));
              }
    for (const path of paths) expect(existsSync(resolve('public', path.slice(1))), path).toBe(true);
  });
});
