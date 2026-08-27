import React, { useEffect, useRef } from 'react';

/**
 * ============================================================
 * ULPC Layered Avatar (Universal LPC)
 * ============================================================
 * Спрайтшиты: idle = 128x256 (2 кадра x 4 направления, 64x64)
 *             walk = 576x256 (9 кадров x 4 направления)
 * Ряды: 0=up(спина), 1=left, 2=down(ЛИЦО — дефолт), 3=right
 *
 * Порядок слоёв ULPC (снизу вверх):
 * body → legs → feet → torso → arms → head → eyes → hair_bg
 * → [weapon_bg] → hair_fg → [weapon_fg] → hat
 *
 * Оружие: fg = В РУКЕ (передний слой), bg = за спиной
 */

export type UlpcAnim = 'idle' | 'walk' | 'slash' | 'thrust' | 'hurt' | 'emote' | 'combat_idle';

/** Число кадров и скорость (мс/кадр) по анимации. Кадры берутся из ширины спрайтшита. */
export const ULPC_ANIM_CONFIG: Record<UlpcAnim, { period: number; loop: boolean }> = {
  idle: { period: 600, loop: true },
  walk: { period: 150, loop: true },
  combat_idle: { period: 350, loop: true },
  slash: { period: 100, loop: false },   // разовый удар
  thrust: { period: 100, loop: false },  // разовый удар
  hurt: { period: 120, loop: false },    // разовая реакция
  emote: { period: 300, loop: true },    // празднование (цикл)
};

export interface UlpcLayer {
  url: string;
  /** z-порядок внутри персонажа */
  z: number;
}

export interface UlpcAvatarProps {
  /** Слои в правильном ULPC порядке */
  layers: UlpcLayer[];
  /** idle | walk */
  anim?: UlpcAnim;
  /** Направление: 0=up 1=left 2=down(лицо) 3=right */
  row?: number;
  size?: number;
  className?: string;
  /** Анимировать (переключать кадры idle 0↔1) */
  animated?: boolean;
}

/** Базовый путь к ULPC ассетам */
export const ULPC_BASE = '/assets/game/characters/ulpc/';

const UlpcAvatar: React.FC<UlpcAvatarProps> = ({
  layers,
  anim = 'idle',
  row = 2,
  size = 128,
  className = '',
  animated = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;
    let raf = 0;
    let lastSwitch = 0;
    const animCfg = ULPC_ANIM_CONFIG[anim] || ULPC_ANIM_CONFIG.idle;

    const loadAll = async () => {
      const imgs = await Promise.all(
        layers.map(
          (l) =>
            new Promise<HTMLImageElement | null>((resolve) => {
              if (!l.url) { resolve(null); return; }
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = () => resolve(null);
              img.src = l.url.startsWith('http') || l.url.startsWith('/')
                ? l.url
                : ULPC_BASE + l.url;
            })
        )
      );
      return imgs.filter(Boolean) as HTMLImageElement[];
    };

    const draw = (loaded: HTMLImageElement[], frame: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;

      // Тень под ногами
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(canvas.width / 2, canvas.height - size * 0.05, size * 0.22, size * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();

      // hurt — один ряд (64px высота), остальные 4 ряда по 64
      const sheetH = loaded[0]?.height || 256;
      const rows = sheetH / 64;
      const r = row % rows;

      for (const img of loaded) {
        const cols = img.width / 64;
        const sx = (frame % cols) * 64;
        const sy = (img.height === sheetH ? r : 0) * 64;
        ctx.drawImage(img, sx, sy, 64, 64, 0, 0, canvas.width, canvas.height);
      }
    };

    loadAll().then((loaded) => {
      if (cancelled) return;
      if (loaded.length === 0) return;

      // Число кадров — из ширины первого слоя
      const cols = loaded[0].width / 64;
      let done = false;

      if (!animated || cols <= 1) {
        draw(loaded, 0);
        return;
      }

      const tick = (t: number) => {
        if (cancelled) return;
        if (t - lastSwitch > animCfg.period) {
          lastSwitch = t;
          frameRef.current += 1;
          // Разовые анимации останавливаются на последнем кадре
          if (frameRef.current >= cols) {
            if (animCfg.loop) {
              frameRef.current = 0;
            } else {
              frameRef.current = cols - 1;
              if (!done) { draw(loaded, frameRef.current); done = true; }
              return;
            }
          }
          draw(loaded, frameRef.current);
        }
        raf = requestAnimationFrame(tick);
      };
      draw(loaded, 0);
      raf = requestAnimationFrame(tick);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [layers.map((l) => l.url).join('|'), anim, row, size, animated]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={className}
      style={{ imageRendering: 'pixelated', width: size, height: size }}
      aria-hidden="true"
    />
  );
};

export default UlpcAvatar;