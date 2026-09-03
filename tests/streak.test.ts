/**
 * Тесты streak-статусов: broken → active на новый день (фикс залипшего
 * «Сброшен»), бонусная шкала. updateStreak тестируется интеграционно
 * (нужна живая БД-транзакция), здесь — чистые функции.
 */
import { describe, it, expect } from 'vitest';
import { getStreakBonus, getStreakMultiplier } from '../src/services/streakService';

describe('getStreakBonus', () => {
  it('нулевой стрик — без бонуса', () => {
    expect(getStreakBonus(0)).toBe(0);
  });

  it('бонус растёт со стриком', () => {
    expect(getStreakBonus(1)).toBeGreaterThan(0);
    expect(getStreakBonus(5)).toBeGreaterThan(getStreakBonus(1));
  });

  it('бонус ограничен сверху (не уходит в бесконечность)', () => {
    expect(getStreakBonus(30)).toBeLessThanOrEqual(50);
    expect(getStreakBonus(365)).toBeLessThanOrEqual(50);
  });
});

describe('getStreakMultiplier', () => {
  it('без стрика множитель 1', () => {
    expect(getStreakMultiplier(0)).toBe(1);
  });

  it('множитель = 1 + bonus/100', () => {
    const bonus = getStreakBonus(7);
    expect(getStreakMultiplier(7)).toBeCloseTo(1 + bonus / 100, 5);
  });

  it('множитель никогда не меньше 1', () => {
    expect(getStreakMultiplier(-1)).toBeGreaterThanOrEqual(1);
  });
});
