import { parseInstant, parseLocalDate } from '../contracts/primitives.js';
import { ValidationError } from '../contracts/errors.js';
import type { CalendarPeriod, GameWorld } from '../../v3-shared/game.js';

export function parseZone(value: unknown): string {
  if (typeof value !== 'string' || value.length > 80 || (!value.includes('/') && value !== 'UTC')) throw new ValidationError();
  try { return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone; }
  catch { throw new ValidationError(); }
}
export function localDate(instant: string, zone: string): string {
  parseInstant(instant);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant));
  const get = (key: string) => parts.find(part => part.type === key)!.value;
  return parseLocalDate(`${get('year')}-${get('month')}-${get('day')}`);
}
export function addDays(date: string, days: number): string {
  parseLocalDate(date);
  const at = new Date(`${date}T12:00:00Z`); at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}
export function weekday(date: string): number { return new Date(`${date}T12:00:00Z`).getUTCDay() || 7; }
/** Finds the actual boundary even across DST: no fixed 24-hour day arithmetic. */
export function dayBounds(now: string, zone: string): { startsAt: string; endsAt: string } {
  const current = localDate(now, zone), center = new Date(now).getTime();
  const boundary = (after: boolean) => {
    let low = center - 48 * 3600000, high = center + 48 * 3600000;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const date = localDate(new Date(mid).toISOString(), zone);
      if (after ? date <= current : date < current) low = mid + 1; else high = mid;
    }
    return new Date(low).toISOString();
  };
  return { startsAt: boundary(false), endsAt: boundary(true) };
}
export function currentPeriod(world: GameWorld, now: string, id: () => string): CalendarPeriod {
  const existing = world.periods.find(period => period.startsAt <= now && now < period.endsAt);
  if (existing) return existing;
  const settings = world.settings;
  if (settings.pendingZone && settings.zoneEffectiveAt && now >= settings.zoneEffectiveAt) {
    settings.zone = settings.pendingZone; settings.pendingZone = null; settings.zoneEffectiveAt = null; settings.revision++;
  }
  const bounds = dayBounds(now, settings.zone);
  const previous = world.periods.at(-1);
  const period: CalendarPeriod = {
    id: id(), sequence: (previous?.sequence ?? 0) + 1, date: localDate(now, settings.zone), zone: settings.zone,
    startsAt: previous && previous.endsAt > bounds.startsAt ? previous.endsAt : bounds.startsAt,
    endsAt: bounds.endsAt, revision: settings.revision,
  };
  world.periods.push(period);
  return period;
}
