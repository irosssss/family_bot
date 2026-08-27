import React, { useEffect, useRef } from 'react';

interface BossAvatarProps {
  /** Спрайтшит босса (кадры по 64px в ряд) */
  spriteSheet?: string;
  /** Кадров в спрайтшите */
  frames?: number;
  size?: number;
  animated?: boolean;
  className?: string;
  /** Период кадра (мс) */
  period?: number;
}

/**
 * Анимированный босс: canvas-нарезка спрайтшита (64px кадры в один ряд).
 * Фолбэк: статичная иконка, если спрайтшита нет.
 */
const BossAvatar: React.FC<BossAvatarProps> = ({
  spriteSheet = '/assets/game/entities/bosses/slime_idle_sheet.png',
  frames = 5,
  size = 160,
  animated = true,
  className = '',
  period = 220,
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

    const img = new Image();
    img.src = spriteSheet;
    img.onload = () => {
      if (cancelled) return;
      // Habitica-боссы — статичные PNG (1 кадр на весь файл): рисуем целиком
      // с сохранением пропорций (не квадратные: 219x219, 204x177 и т.п.)
      if (frames <= 1 || img.width === img.height && frames === 1) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
        return;
      }
      const fw = img.width / frames; // ширина кадра

      const draw = (frame: number) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, frame * fw, 0, fw, img.height, 0, 0, canvas.width, canvas.height);
      };

      if (!animated || frames <= 1) {
        draw(0);
        return;
      }

      const tick = (t: number) => {
        if (cancelled) return;
        if (t - lastSwitch > period) {
          lastSwitch = t;
          frameRef.current = (frameRef.current + 1) % frames;
          draw(frameRef.current);
        }
        raf = requestAnimationFrame(tick);
      };
      draw(0);
      raf = requestAnimationFrame(tick);
    };

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [spriteSheet, frames, size, animated, period]);

  return (
    <div className={`relative inline-flex items-center justify-center select-none ${className}`}>
      {/* Аура босса */}
      <div className="absolute inset-0 bg-red-600/30 rounded-full blur-2xl animate-pulse" />
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="relative drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]"
        style={{ imageRendering: 'pixelated', width: size, height: size }}
        aria-hidden="true"
      />
    </div>
  );
};

export default BossAvatar;