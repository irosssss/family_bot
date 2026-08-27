/**
 * Habitica Habits: привычки [+/-] с динамической ценностью (Task Value Decay).
 *
 * Формула (MASTER_SPECIFICATION §3A):
 *   V(t+1) = clamp(V + delta, -10, +10)
 *   Выполнение:  delta = +1.5 × (1 − sigmoid(V))
 *   Пропуск/[−]: delta = −2.0 × sigmoid(V)
 *
 * Множитель золота от цвета:
 *   V ≤ −5 → ×2.0 | −5<V≤−1 → ×1.5 | −1<V<2 → ×1.0 | 2≤V<6 → ×0.85 | V≥6 → ×0.7
 */

const CLAMP_MIN = -10;
const CLAMP_MAX = 10;

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function clampValue(v: number): number {
  return Math.max(CLAMP_MIN, Math.min(CLAMP_MAX, v));
}

export function decayOnSuccess(value: number): number {
  return clampValue(value + 1.5 * (1 - sigmoid(value)));
}

export function decayOnMiss(value: number): number {
  return clampValue(value - 2.0 * sigmoid(value));
}

/** Цвет бейджа по значению */
export function valueColor(value: number): { name: string; hex: string; goldMultiplier: number } {
  if (value <= -5) return { name: 'Тёмно-красная', hex: '#991b1b', goldMultiplier: 2.0 };
  if (value <= -1) return { name: 'Красно-оранжевая', hex: '#ea580c', goldMultiplier: 1.5 };
  if (value < 2) return { name: 'Жёлтая', hex: '#eab308', goldMultiplier: 1.0 };
  if (value < 6) return { name: 'Зелёная', hex: '#16a34a', goldMultiplier: 0.85 };
  return { name: 'Синяя', hex: '#2563eb', goldMultiplier: 0.7 };
}

/**
 * Обработка клика [+]: возвращает начисления и новое значение.
 */
export function scoreHabitUp(habit: {
  value: number; up_points: number; counter_up: number;
}) {
  const newValue = decayOnSuccess(habit.value);
  const mult = valueColor(newValue).goldMultiplier;
  // Чем хуже привычка закреплена — тем больше награда
  const gold = Math.max(1, Math.round(habit.up_points * mult));
  const xp = Math.max(1, Math.round(gold * 0.6));

  return {
    newValue,
    gold,
    xp,
    counter_up: habit.counter_up + 1,
  };
}

/**
 * Обработка клика [−]: урон HP персонажа.
 */
export function scoreHabitDown(habit: {
  value: number; down_damage: number; counter_down: number;
}) {
  const newValue = decayOnMiss(habit.value);
  const damage = Math.max(1, Math.round(habit.down_damage));

  return {
    newValue,
    damage,
    counter_down: habit.counter_down + 1,
  };
}
