import React, { useEffect, useRef, useState } from 'react';
import { buildHabiticaLayers, DEFAULT_LOOKS, HabiticaLook, CLASS_MAP } from '../utils/habiticaAssets';

export type HabiticaAnimState = 'idle' | 'attack' | 'hurt';

interface HabiticaAnimatedAvatarProps {
  look: HabiticaLook;
  cls?: string;                 // warrior | mage(wizard) | rogue | healer
  size?: number;                // ширина холста (высота = size * 147/140)
  state?: HabiticaAnimState;    // процедурное состояние
  petUrl?: string;              // питомец-компаньон (Z-110)
  gender?: string;              // пол: определяет форму корпуса (broad/slim)
  mountIconUrl?: string;        // иконка маунта в подножие (опционально)
  className?: string;
  /** Тень под ногами */
  shadow?: boolean;
}

/**
 * Habitica Animated Avatar: DOM-слои (12 Z-уровней) + процедурные анимации.
 *
 * Процедурные состояния:
 *  - IDLE: дыхание Y=sin(t*3)*1.5px, оружие с фазовым сдвигом 0.4 rad
 *  - ATTACK: рывок translateX(+24px), поворот оружия -20°→+65° за 200ms
 *  - HURT: отскок -12px, красная вспышка filter 150ms
 *
 * DOM вместо Canvas: GPU-transform'ы, интеграция с Tailwind-сценами бесплатно.
 */

const CANVAS_W = 140;
const CANVAS_H = 147;

const HabiticaAnimatedAvatar: React.FC<HabiticaAnimatedAvatarProps> = ({
  look,
  cls = 'warrior',
  size = 120,
  state = 'idle',
  petUrl,
  gender,
  className = '',
  shadow = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layersLoaded, setLayersLoaded] = useState(0);
  const layers = React.useMemo(
    () => buildHabiticaLayers(look, cls, gender),
    [look.skin, look.hairBase, look.hairBangs, look.hairColor, look.beard, look.armorTier, look.headTier, look.weaponTier, look.shieldTier, cls]
  );
  const hcls = CLASS_MAP[cls] || 'warrior';

  // Процедурная анимация: rAF-цикл пишет transform напрямую в style (без ре-рендеров)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let raf = 0;
    let start = 0;
    // Фазы для attack/hurt: 0 → 1 за длительность состояния
    let actionT = 0;

    const tick = (t: number) => {
      if (!start) start = t;
      const time = (t - start) / 1000;

      let dx = 0, dy = 0, rot = 0;
      let filter = '';

      switch (state) {
        case 'idle': {
          dy = Math.sin(time * 3) * 1.5;
          break;
        }
        case 'attack': {
          actionT = Math.min(1, (t % 600) / 200); // цикл удара 600ms, фаза 200ms
          dx = actionT < 1 ? Math.sin(actionT * Math.PI) * 24 : 0;
          rot = -20 + actionT * 85;               // -20deg → +65deg
          break;
        }
        case 'hurt': {
          actionT = Math.min(1, (t % 400) / 150);
          dx = actionT < 1 ? -Math.sin(actionT * Math.PI) * 12 : 0;
          if (actionT < 0.5) filter = 'brightness(2.5) saturate(0) sepia(1) hue-rotate(-50deg)';
          break;
        }
      }

      // Всё тело: дыхание + сдвиг состояния
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.style.filter = filter;

      // Оружие: отставание по фазе 0.4 rad (idle) или вращение при атаке
      const weaponEl = el.querySelector<HTMLElement>('[data-layer="weapon"]');
      if (weaponEl) {
        if (state === 'attack') {
          weaponEl.style.transform = `rotate(${rot}deg)`;
          weaponEl.style.transformOrigin = '20% 80%'; // из руки
        } else {
          const phase = Math.sin(time * 3 - 0.4) * 1.2;
          weaponEl.style.transform = `translateY(${phase}px) rotate(${phase * 2}deg)`;
          weaponEl.style.transformOrigin = 'center';
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  const height = Math.round((size * CANVAS_H) / CANVAS_W);

  return (
    <div className={`relative select-none ${className}`} style={{ width: size, height }} aria-hidden="true">
      {/* Тень на полу */}
      {shadow && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bg-black/40 blur-[2px] rounded-full pointer-events-none"
          style={{ width: size * 0.55, height: Math.max(4, size * 0.05), bottom: -2 }}
        />
      )}

      {/* Сцена персонажа (transform применяется сюда) */}
      <div ref={containerRef} className="absolute inset-0 will-change-transform">
        {layers.map(({ z, url }) => (
          <img
            key={z}
            data-z={z}
            data-layer={z === 90 ? 'weapon' : undefined}
            src={url}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full object-contain [image-rendering:pixelated] pointer-events-none"
            style={{ zIndex: z }}
            onLoad={() => setLayersLoaded((n) => n + 1)}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ))}
      </div>

      {/* Питомец-компаньон: справа у ног (Z-110) */}
      {petUrl && (
        <img
          src={petUrl}
          alt=""
          draggable={false}
          className="absolute [image-rendering:pixelated] pointer-events-none"
          style={{
            width: size * 0.45,
            right: -size * 0.32,
            bottom: 0,
            zIndex: 110,
          }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
    </div>
  );
};

/**
 * Хук: образ пользователя из users.habitica_equipped (jsonb) с фолбэком на дефолт.
 */
export function useHabiticaLook(user: { display_name: string; habitica_equipped?: any }, fallbackKey?: string): HabiticaLook {
  return React.useMemo(() => {
    const key =
      fallbackKey ||
      (user.display_name.toLowerCase().includes('миша') ? 'misha'
      : user.display_name.toLowerCase().includes('регина') || user.display_name.toLowerCase().includes('regina') ? 'regina'
      : user.display_name.toLowerCase().includes('папа') ? 'papa'
      : user.display_name.toLowerCase().includes('мама') ? 'mama'
      : 'misha');
    return { ...DEFAULT_LOOKS[key], ...(user.habitica_equipped || {}) } as HabiticaLook;
  }, [user.display_name, user.habitica_equipped, fallbackKey]);
}

export default HabiticaAnimatedAvatar;
