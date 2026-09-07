import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createInitialDemoState } from '../src/demo/catalog';
import { CharacterCatalogContext } from '../src/demo/Character';
import { FamilyScreen } from '../src/demo/FamilyScreen';
import { HomeScreen, Room } from '../src/demo/HomeScreen';
import { TasksScreen } from '../src/demo/TasksScreen';
import { WardrobeScreen } from '../src/demo/WardrobeScreen';
import type { DemoState } from '../src/demo/types';

const initial = () => createInitialDemoState('2026-09-05');
const render = (state: DemoState, element: React.ReactNode) => renderToStaticMarkup(
  createElement(CharacterCatalogContext.Provider, { value: state.catalog.items }, element),
);

describe('visual redesign keeps the family product boundaries', () => {
  it.each(['father', 'mother', 'son', 'daughter'])('offers beard customization only to the father (%s)', id => {
    const state = initial();
    const user = state.users.find(person => person.id === id)!;
    const output = render(state, createElement(WardrobeScreen, {
      state, user, act: vi.fn(async () => true), busy: false, initialSection: 'appearance',
    }));
    expect(output.includes('Борода')).toBe(id === 'father');
  });

  it('does not expose the adult cosmetic checkout in a child wardrobe', () => {
    const state = initial();
    const output = render(state, createElement(WardrobeScreen, {
      state, user: state.users.find(person => person.id === 'son')!,
      act: vi.fn(async () => true), busy: false, initialSection: 'appearance',
    }));
    expect(output).not.toContain('Особый декор');
    expect(output).not.toContain('Борода');
  });

  it('never fills the family scene with a pet that is not both owned and selected', () => {
    const state = initial();
    const child = state.users.find(person => person.id === 'son')!;
    const pet = state.catalog.pets[0];
    child.activePetId = pet.id;
    const unowned = render(state, createElement(Room, { state }));
    expect(unowned).not.toContain(`src="${pet.art}"`);
    child.petIds = [pet.id];
    expect(render(state, createElement(Room, { state }))).toContain(`src="${pet.art}"`);
    child.activePetId = null;
    expect(render(state, createElement(Room, { state }))).not.toContain(`src="${pet.art}"`);
  });

  it('opening home, tasks, family and try-on does not change the world or dispatch a purchase', () => {
    const state = initial();
    const before = structuredClone(state);
    const act = vi.fn(async () => true);
    for (const id of ['father', 'son']) {
      const props = { state, user: state.users.find(person => person.id === id)!, act, busy: false };
      render(state, createElement(HomeScreen, { ...props, go: vi.fn() }));
      render(state, createElement(TasksScreen, props));
      render(state, createElement(FamilyScreen, props));
      render(state, createElement(WardrobeScreen, { ...props, initialSection: 'appearance' }));
    }
    expect(state).toEqual(before);
    expect(act).not.toHaveBeenCalled();
  });
});
