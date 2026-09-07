import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createDemoUser, createInitialDemoState } from '../src/demo/catalog';
import { Room } from '../src/demo/HomeScreen';
import { getHomeFamilyLayout } from '../src/demo/homeFamilyLayout';
import { getHomeSceneProjection } from '../src/demo/homeSceneProjection';
import { eveningHomeScene, resolveAuthoredHomeScene } from '../src/demo/homeScenes';

describe('bundled evening room integration', () => {
  it('upgrades only exact bundled artwork, preserving an edited room', () => {
    expect(resolveAuthoredHomeScene({ art:'/assets/game/demo/home-fireplace.webp', layoutPresetId:'fireplace' })).toBe(eveningHomeScene);
    expect(resolveAuthoredHomeScene({ art:eveningHomeScene.art, layoutPresetId:'fireplace' })).toBe(eveningHomeScene);
    expect(resolveAuthoredHomeScene({ art:'/assets/game/custom-room.png', layoutPresetId:'fireplace' })).toBeNull();
    expect(resolveAuthoredHomeScene({ art:eveningHomeScene.art, layoutPresetId:'library' })).toBeNull();
  });

  it.each([375, 390, 720])('keeps all six actual authored character canvases inside the %spx room', width => {
    const users = Array.from({ length:6 }, (_, i) => createDemoUser(`user-${i}`, `Человек ${i}`,
      i === 0 ? 'father' : i === 1 ? 'mother' : 'son', 9));
    const layout = getHomeFamilyLayout(users, 0, eveningHomeScene.stage, () => true)!;
    const height = width < 700 ? width * 4 / 3 : width * 941 / 1672;
    const projection = getHomeSceneProjection({ source:layout.sourceSize, viewport:{ width,height }, fit:'cover',
      rectangles:Object.fromEntries(layout.members.map(item => [item.member.id,item.rect])) })!;
    Object.values(projection.rectangles).forEach(rect => {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(height);
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.height).toBeGreaterThanOrEqual(44);
    });
  });

  it('shows a selected owned pet for a seated parent as well as a child', () => {
    const state = createInitialDemoState('2026-09-05');
    const parent = state.users[0], pet = state.catalog.pets[0];
    parent.activePetId = pet.id;
    expect(renderToStaticMarkup(createElement(Room,{ state }))).not.toContain(`src="${pet.art}"`);
    parent.petIds = [pet.id];
    expect(renderToStaticMarkup(createElement(Room,{ state }))).toContain(`src="${pet.art}"`);
    parent.archived = true;
    expect(renderToStaticMarkup(createElement(Room,{ state }))).not.toContain(`src="${pet.art}"`);
  });

  it('shows only owned decor in its one assigned slot, without mutating the world', () => {
    const state = createInitialDemoState('2026-09-05');
    const item = state.catalog.items.find(item => item.kind === 'decor' && item.slot === 'shelf')!;
    state.home.decor.shelf = item.id;
    expect(renderToStaticMarkup(createElement(Room,{ state }))).not.toContain(`src="${item.art}"`);
    state.ownedDecorIds = [item.id];
    const before = structuredClone(state);
    const html = renderToStaticMarkup(createElement(Room,{ state }));
    expect(html.split(`src="${item.art}"`).length - 1).toBe(1);
    expect(state).toEqual(before);
    state.home.decor.wall = item.id;
    expect(renderToStaticMarkup(createElement(Room,{ state })).split(`src="${item.art}"`).length - 1).toBe(1);
  });
});
