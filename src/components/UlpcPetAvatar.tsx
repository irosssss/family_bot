import React, { useEffect, useRef } from 'react';
import { Pet } from '../types';

interface UlpcPetAvatarProps {
  pet: Pet;
  size?: number;
  animated?: boolean;
  className?: string;
  /** Ряд спрайтшита: 0=up, 1=left(профиль), 2=down(вид сверху), 3=right.
   *  Для питомца у ног героя лучший вид — профиль (1), полноростовый 55px. */
  row?: number;
}

const UlpcPetAvatar: React.FC<UlpcPetAvatarProps> = ({
  pet,
  size = 64,
  animated = true,
  className = '',
  row = 1,
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
    const period = 500; // медленная анимация

    // Используем spriteSheetUrl если есть, иначе icon
    const sheetUrl = pet.spriteSheetUrl || pet.icon || pet.imageUrl;
    const cols = pet.spriteFrames || 8;
    const rows = pet.spriteRows || 4;
    const isSheet = !!pet.spriteSheetUrl;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = sheetUrl || '';
    img.onload = () => {
      if (cancelled) return;
      const frameSize = isSheet ? img.width / cols : img.width;
      const useRow = (row % rows + rows) % rows; // безопасный индекс ряда

      const draw = (frame: number) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;

        if (isSheet) {
          // Рисуем кадр из спрайтшита
          const sx = (frame % cols) * frameSize;
          const sy = (useRow % rows) * frameSize;
          ctx.drawImage(img, sx, sy, frameSize, frameSize, 0, 0, canvas.width, canvas.height);
        } else {
          // Просто иконка/статика
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
      };

      if (!animated || !isSheet) {
        draw(0);
        return;
      }

      // Idle-«дыхание» (Finch-эффект): лёгкий scale 1→1.04 по Y на 1-м кадре,
      // чтобы питомец выглядел живым, а не застывшим спрайтом.
      let breatheStart = 0;
      const breathe = (t: number) => {
        if (cancelled) return;
        if (!breatheStart) breatheStart = t;
        const phase = Math.sin(((t - breatheStart) / 700) * Math.PI * 2);
        const scaleY = 1 + 0.035 * phase;
        const sy = (useRow % rows) * frameSize;
        const sx = (frameRef.current % cols) * frameSize;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height);
        ctx.scale(1, scaleY);
        ctx.drawImage(img, sx, sy, frameSize, frameSize, -canvas.width / 2, -canvas.height, canvas.width, canvas.height);
        ctx.restore();
        raf = requestAnimationFrame(breathe);
      };
      breathe(0);
    };

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [pet.spriteSheetUrl, pet.icon, pet.imageUrl, pet.spriteFrames, pet.spriteRows, size, animated]);

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

export default UlpcPetAvatar;