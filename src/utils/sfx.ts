/**
 * Лёгкие Web Audio SFX для UI-компонентов (PetsTab, ArmoireTab).
 * Не зависит от App.tsx — каждый компонент может играть звук сам.
 * Zero-emoji: только синтезированные тоны.
 */

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!_ctx) _ctx = new AudioCtx();
  const ctx = _ctx as AudioContext;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.15) {
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  gain.gain.setValueAtTime(vol, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur);
}

/** Монеты: восходящий дубль (инкубация, покупка) */
export function sfxCoin() {
  tone(987.77, 0, 0.15, 'sine');
  tone(1318.51, 0.08, 0.2, 'sine');
}

/** Сундук: мажорный аккорд (открытие) */
export function sfxChest() {
  [523.25, 659.25, 783.99].forEach((f, i) => tone(f, i * 0.08, 0.35, 'triangle'));
}

/** Еда/кормление: короткий "ном-ном" вниз */
export function sfxFeed() {
  tone(880, 0, 0.08, 'square', 0.08);
  tone(700, 0.08, 0.1, 'square', 0.08);
}

/** Ошибка: низкий "бум" */
export function sfxError() {
  tone(220, 0, 0.25, 'sawtooth', 0.1);
  tone(160, 0.12, 0.3, 'sawtooth', 0.08);
}

/** Левел-ап: арпеджио вверх */
export function sfxLevelUp() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.1, 0.3, 'triangle'));
}

/** Удар по боссу: низкий савевочный */
export function sfxBossHit() {
  tone(180, 0, 0.2, 'sawtooth', 0.12);
  tone(120, 0.1, 0.25, 'sawtooth', 0.1);
}

/** Уведомление: короткий диng */
export function sfxPing() {
  tone(1568, 0, 0.12, 'sine', 0.1);
}
