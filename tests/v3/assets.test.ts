import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AssetSlot } from '../../src/v3/assets/AssetSlot';
import { ASSET_FREE_POLICY } from '../../src/v3/assets/contracts';
import { assetSlots, getAssetSlot } from '../../src/v3/assets/registry';

describe('V3 asset-free layout contract', () => {
  it('covers every required place with independent stable identities', () => {
    const required = ['home.room', 'hero.adult', 'hero.child', 'hero.portrait', 'boss.main',
      'adventure.map', 'pet.egg', 'pet.companion', 'pet.corner', 'item.outfit', 'item.weapon',
      'home.furniture', 'family.trophy', 'collection.cover'];
    expect(new Set(assetSlots.map(slot => slot.id)).size).toBe(assetSlots.length);
    for (const id of required) expect(getAssetSlot(id)?.id).toBe(id);
    expect(getAssetSlot('hero.unknown')).toBeUndefined();
  });

  it('keeps candidates consistent and future paths inert', () => {
    expect(Object.isFrozen(assetSlots)).toBe(true);
    for (const slot of assetSlots) {
      expect(slot.id).toMatch(/^[a-z]+\.[a-z_]+$/);
      expect(slot.status).toBe('planned');
      expect(slot.geometryStatus).toBe('candidate');
      expect(slot.targetPath).toMatch(/^public\/assets\/game\/family_life_v3\/v1\/.+__r<revision>\.png$/);
      expect(slot.targetPath).not.toMatch(/https?:|\.\.|\\/);
      const [widthRatio, heightRatio] = slot.aspectRatio.split('/').map(Number);
      expect(widthRatio).toBeGreaterThan(0);
      expect(heightRatio).toBeGreaterThan(0);
      expect(slot.logicalCanvas.width / slot.logicalCanvas.height).toBeCloseTo(widthRatio / heightRatio);
      expect(slot.anchor.space).toBe('normalized');
      for (const coordinate of [slot.anchor.x, slot.anchor.y]) {
        expect(coordinate).toBeGreaterThanOrEqual(0);
        expect(coordinate).toBeLessThanOrEqual(1);
      }
      for (const list of [slot.layers, slot.states, slot.screens]) {
        expect(list.length).toBeGreaterThan(0);
        expect(new Set(list).size).toBe(list.length);
        expect(Object.isFrozen(list)).toBe(true);
      }
      expect(Object.isFrozen(slot)).toBe(true);
      expect(Object.isFrozen(slot.anchor)).toBe(true);
      expect(Object.isFrozen(slot.logicalCanvas)).toBe(true);
      expect(slot).not.toHaveProperty('src');
      expect(slot).not.toHaveProperty('url');
      expect(slot).not.toHaveProperty('assetRef');
    }
  });

  it('renders all places as labelled layout without any resource-bearing elements', () => {
    const fetchGuard = vi.fn(() => { throw new Error('A slot must never fetch'); });
    vi.stubGlobal('fetch', fetchGuard);
    try {
      for (const slot of assetSlots) {
        const html = renderToStaticMarkup(createElement(AssetSlot, { slotId: slot.id }));
        expect(html).toContain(`data-asset-slot="${slot.id}"`);
        expect(html).toContain('data-resource-state="not_supplied"');
        expect(html).toContain('aria-label=');
        expect(html).toContain(slot.label);
        expect(html).not.toMatch(/<(img|svg|canvas|video|audio|picture|source|object|embed|iframe|link|script)\b/i);
        expect(html).not.toMatch(/\s(src|srcset|href|poster)=|url\s*\(/i);
        expect(html).not.toContain(slot.targetPath);
        expect(html).not.toContain('<button');
      }
      expect(fetchGuard).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps an unknown slot explicit and escapes caller labels', () => {
    const html = renderToStaticMarkup(createElement(AssetSlot, {
      slotId: 'unknown.slot', label: '<img src="https://example.test/family">',
    }));
    expect(html).toContain('data-asset-status="unregistered"');
    expect(html).toContain('Место не зарегистрировано');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('Семейный дом');
  });

  it('provides a separate named inspector only when explicitly connected', () => {
    const onInspect = vi.fn();
    const html = renderToStaticMarkup(createElement(AssetSlot, { slotId: 'hero.adult', inspect: true, onInspect }));
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Параметры места: Взрослый герой"');
    expect(onInspect).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(createElement(AssetSlot, { slotId: 'hero.adult', inspect: true }))).not.toContain('<button');
    expect(ASSET_FREE_POLICY).toMatchObject({ canLoadResources: false, preserveSelection: true, substituteAnotherAsset: false });
  });
});
