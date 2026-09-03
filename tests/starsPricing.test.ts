/**
 * Тесты SKU-прайса Stars (финансовая математика DAT-01).
 * Импортирует живой SKUS из starsRoutes — упадёт при расхождении прайса.
 */
import { describe, it, expect } from 'vitest';
import { SKUS } from '../src/api/starsRoutes';

const GEM_PACKS = ['gems_small', 'gems_medium', 'gems_large'];

describe('Stars SKU-прайс (живые данные из starsRoutes)', () => {
  it('все gem-пакеты имеют положительную цену и начисление', () => {
    for (const sku of GEM_PACKS) {
      const s = SKUS[sku];
      expect(s, sku).toBeDefined();
      expect(s.stars, sku).toBeGreaterThan(0);
      expect(s.gems, sku).toBeGreaterThan(0);
    }
  });

  it('крупные пакеты выгоднее за кристалл (стимул покупать больше)', () => {
    const perGem = GEM_PACKS.map((sku) => SKUS[sku].stars / SKUS[sku].gems);
    expect(perGem[1]).toBeLessThan(perGem[0]);
    expect(perGem[2]).toBeLessThan(perGem[1]);
  });

  it('курс в разумных пределах: 1.5-2.5 Stars за кристалл', () => {
    for (const sku of GEM_PACKS) {
      const rate = SKUS[sku].stars / SKUS[sku].gems;
      expect(rate, sku).toBeGreaterThanOrEqual(1.5);
      expect(rate, sku).toBeLessThanOrEqual(2.5);
    }
  });

  it('family_pro не начисляет кристаллы, но даёт дни Pro', () => {
    const pro = SKUS['family_pro'];
    expect(pro).toBeDefined();
    expect(pro.proDays).toBeGreaterThan(0);
    expect(pro.gems).toBe(0);
  });

  it('family_pro дороже любого gem-пака (подписка = высший SKU)', () => {
    for (const sku of GEM_PACKS) {
      expect(SKUS['family_pro'].stars).toBeGreaterThan(SKUS[sku].stars);
    }
  });
});
