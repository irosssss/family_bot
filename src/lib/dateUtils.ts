/**
 * Чистые утилиты для работы с датами (без побочных эффектов).
 *
 * Вынесены из server.ts на Фазе 1 рефакторинга. Логика идентична
 * исходным функциям — только перенос, без изменения поведения.
 */

/** Ключ недели в формате `2026-W32` (используется для еженедельных боссов). */
export function getWeekKey(): string {
  const d = new Date();
  const year = d.getFullYear();
  const onejan = new Date(year, 0, 1);
  const millisecsInDay = 86400000;
  const dayOfYear = Math.ceil((d.getTime() - onejan.getTime()) / millisecsInDay);
  const weekNum = Math.ceil((dayOfYear + onejan.getDay() + 1) / 7);
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

/** Локальная дата `YYYY-MM-DD` (для completions, streak, perfect-day). */
export function getTodayStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Дата+время `YYYY-MM-DD HH:MM` (для временных меток событий). */
export function getNowTimestamp(): string {
  const d = new Date();
  const time = d.toTimeString().slice(0, 5);
  return `${getTodayStr()} ${time}`;
}
