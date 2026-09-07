import { describe, expect, it } from 'vitest';
import { getHomeSceneProjection, type HomeSceneProjectionInput } from '../src/demo/homeSceneProjection';

// Synthetic geometry only, not proposed coordinates or artwork for the real home.
const fixture: HomeSceneProjectionInput = {
  source: { width: 750, height: 1200 },
  viewport: { width: 375, height: 600 },
  fit: 'contain',
  anchors: { first: { x: 150, y: 480 }, second: { x: 450, y: 600 } },
  rectangles: {
    furniture: { x: 75, y: 400, width: 600, height: 200 },
    character: { x: 110, y: 380, width: 80, height: 100 },
    pet: { x: 350, y: 650, width: 70, height: 50 },
    label: { x: 100, y: 490, width: 100, height: 30 },
  },
};

describe('one authored home scene projection', () => {
  it('projects every layer through the same 375px transform', () => {
    const result = getHomeSceneProjection(fixture)!;
    expect(result.scale).toBe(0.5);
    expect(result.offset).toEqual({ x: 0, y: 0 });
    expect(result.sceneBounds).toEqual({ x: 0, y: 0, width: 375, height: 600 });
    expect(result.anchors.first).toEqual({ x: 75, y: 240 });
    expect(result.rectangles.furniture).toEqual({ x: 37.5, y: 200, width: 300, height: 100 });
    expect(result.rectangles.character).toEqual({ x: 55, y: 190, width: 40, height: 50 });
    expect(result.rectangles.pet).toEqual({ x: 175, y: 325, width: 35, height: 25 });
    expect(result.rectangles.label).toEqual({ x: 50, y: 245, width: 50, height: 15 });
  });

  it('scales 390px geometry uniformly without a separate child or furniture scale', () => {
    const result = getHomeSceneProjection({ ...fixture, viewport: { width: 390, height: 624 } })!;
    expect(result.scale).toBe(0.52);
    expect(result.offset).toEqual({ x: 0, y: 0 });
    expect(result.anchors.second.x - result.anchors.first.x).toBeCloseTo(300 * 0.52);
    expect(result.anchors.second.y - result.anchors.first.y).toBeCloseTo(120 * 0.52);
    expect(result.rectangles.character.width / result.rectangles.character.height).toBeCloseTo(0.8);
  });

  it('letterboxes a short viewport with contain instead of rearranging the composition', () => {
    const result = getHomeSceneProjection({ ...fixture, viewport: { width: 375, height: 320 } })!;
    expect(result.scale).toBeCloseTo(320 / 1200);
    expect(result.sceneBounds).toEqual({ x: 87.5, y: 0, width: 200, height: 320 });
    expect(result.anchors.first.x).toBeCloseTo(127.5);
    expect(result.rectangles.character.y + result.rectangles.character.height).toBeCloseTo(result.anchors.first.y);
  });

  it('crops a short viewport with cover using one shared negative offset', () => {
    const result = getHomeSceneProjection({ ...fixture, viewport: { width: 375, height: 320 }, fit: 'cover' })!;
    expect(result.scale).toBe(0.5);
    expect(result.sceneBounds).toEqual({ x: 0, y: -140, width: 375, height: 600 });
    expect(result.anchors.first).toEqual({ x: 75, y: 100 });
    expect(result.rectangles.furniture.y).toBe(60);
    expect(result.rectangles.label.y).toBe(105);
  });

  it('centers a scene in a wide desktop viewport', () => {
    const result = getHomeSceneProjection({ ...fixture, viewport: { width: 1440, height: 1000 } })!;
    expect(result.scale).toBeCloseTo(1000 / 1200);
    expect(result.sceneBounds.width).toBe(625);
    expect(result.offset.x).toBe(407.5);
    expect(result.offset.y).toBe(0);
  });

  it.each(['contain', 'cover'] as const)('preserves relative distances, proportions and contact anchors with %s', fit => {
    for (const viewport of [{ width: 375, height: 402 }, { width: 390, height: 434 }, { width: 1440, height: 1000 }]) {
      const result = getHomeSceneProjection({ ...fixture, fit, viewport })!;
      const first = result.anchors.first;
      const second = result.anchors.second;
      expect(Math.hypot(second.x - first.x, second.y - first.y)).toBeCloseTo(Math.hypot(300, 120) * result.scale);
      const character = result.rectangles.character;
      expect(character.x + character.width / 2).toBeCloseTo(first.x);
      expect(character.y + character.height).toBeCloseTo(first.y);
      for (const [name, original] of Object.entries(fixture.rectangles!)) {
        const projected = result.rectangles[name];
        expect(projected.width / projected.height).toBeCloseTo(original.width / original.height);
      }
    }
  });

  it('preserves out-of-frame anchors and rectangles instead of silently clipping or dropping them', () => {
    const result = getHomeSceneProjection({
      ...fixture, fit: 'cover', viewport: { width: 375, height: 320 },
      anchors: { outside: { x: -10, y: 0 } },
      rectangles: { mask: { x: -20, y: -20, width: 790, height: 1240 } },
    })!;
    expect(result.anchors.outside).toEqual({ x: -5, y: -140 });
    expect(result.rectangles.mask).toEqual({ x: -10, y: -150, width: 395, height: 620 });
  });

  it('accepts empty authored collections and degenerate marker rectangles', () => {
    const result = getHomeSceneProjection({ source: fixture.source, viewport: fixture.viewport, fit: 'contain' })!;
    expect(result.anchors).toEqual({});
    expect(result.rectangles).toEqual({});
    expect(getHomeSceneProjection({ ...fixture, rectangles: { point: { x: 10, y: 20, width: 0, height: 0 } } })!.rectangles.point)
      .toEqual({ x: 5, y: 10, width: 0, height: 0 });
  });

  it('does not mutate or reuse the caller’s objects', () => {
    const input = structuredClone(fixture);
    const before = structuredClone(input);
    Object.freeze(input.source); Object.freeze(input.viewport);
    for (const point of Object.values(input.anchors!)) Object.freeze(point);
    for (const rect of Object.values(input.rectangles!)) Object.freeze(rect);
    Object.freeze(input.anchors); Object.freeze(input.rectangles); Object.freeze(input);
    const result = getHomeSceneProjection(input)!;
    expect(input).toEqual(before);
    expect(result.source).not.toBe(input.source);
    expect(result.viewport).not.toBe(input.viewport);
    expect(result.anchors.first).not.toBe(input.anchors!.first);
    expect(result.rectangles.character).not.toBe(input.rectangles!.character);
  });

  it.each([0, -1, NaN, Infinity, -Infinity, '375', undefined, null])('rejects invalid dimensions (%s) without unsafe output', value => {
    for (const target of ['source', 'viewport'] as const) {
      for (const axis of ['width', 'height'] as const) {
        const input = { ...fixture, [target]: { ...fixture[target], [axis]: value } } as HomeSceneProjectionInput;
        expect(getHomeSceneProjection(input)).toBeNull();
      }
    }
  });

  it('rejects malformed input, fit and geometry instead of hiding individual layers', () => {
    const invalid = [
      null, undefined, {}, { ...fixture, source: null }, { ...fixture, viewport: null },
      { ...fixture, fit: 'stretch' }, { ...fixture, anchors: null }, { ...fixture, rectangles: [] },
      { ...fixture, anchors: { bad: null } }, { ...fixture, anchors: { bad: { x: 10, y: NaN } } },
      { ...fixture, anchors: { bad: { x: '10', y: 20 } } },
      { ...fixture, rectangles: { bad: { x: 0, y: 0, width: -1, height: 20 } } },
      { ...fixture, rectangles: { bad: { x: 0, y: 0, width: 20, height: Infinity } } },
    ];
    for (const input of invalid) expect(getHomeSceneProjection(input as HomeSceneProjectionInput)).toBeNull();
  });

  it('rejects overflow or underflow even when individual inputs are finite', () => {
    const invalid: HomeSceneProjectionInput[] = [
      { ...fixture, source: { width: Number.MIN_VALUE, height: Number.MIN_VALUE } },
      { ...fixture, source: { width: Number.MAX_VALUE, height: Number.MAX_VALUE }, viewport: { width: Number.MIN_VALUE, height: Number.MIN_VALUE } },
      { ...fixture, source: { width: 1, height: Number.MAX_VALUE }, fit: 'cover' },
      { ...fixture, viewport: { width: 1500, height: 2400 }, anchors: { bad: { x: Number.MAX_VALUE, y: 0 } } },
      { ...fixture, rectangles: { bad: { x: Number.MAX_VALUE, y: 0, width: Number.MAX_VALUE, height: 1 } } },
    ];
    for (const input of invalid) expect(getHomeSceneProjection(input)).toBeNull();
  });

  it('retains authored record names safely, including prototype-like names', () => {
    const anchors = Object.fromEntries([['__proto__', { x: 10, y: 20 }], ['constructor', { x: 30, y: 40 }]]);
    const result = getHomeSceneProjection({ ...fixture, anchors })!;
    expect(Object.keys(result.anchors)).toEqual(['__proto__', 'constructor']);
    expect(Object.getPrototypeOf(result.anchors)).toBe(Object.prototype);
    expect(result.anchors.__proto__).toEqual({ x: 5, y: 10 });
  });
});
