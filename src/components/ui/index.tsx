/**
 * ============================================================
 * FAMILY CHORES RPG — Design System
 * ============================================================
 * Единая система UI-компонентов по принципам:
 * - frontend-component-build: 6 измерений (anatomy, variants, states, props, a11y, tests)
 * - accessibility-audit: WCAG 2.1 AA
 * - Mobile-first: tap targets 44x44px минимум
 *
 * Использование:
 * import { PixelButton } from './ui';
 * <PixelButton variant="primary" size="md" icon={Plus}>Задача</PixelButton>
 */

import React from 'react';

// ============================================================
// ДИЗАЙН-ТОКЕНЫ (semantic layer поверх Telegram theme)
// ============================================================

export const tokens = {
  // Tap targets — Apple HIG / Android
  minTouch: '44px',

  // Радиусы (32-bit стиль: скруглённые, но не круглые)
  radiusSm: '8px',
  radiusMd: '12px',
  radiusLg: '16px',
  radiusFull: '9999px',

  // Отступы (кратны 4)
  space1: '4px',
  space2: '8px',
  space3: '12px',
  space4: '16px',
  space5: '20px',

  // Шрифты 32-bit
  fontHeading: "'Press Start 2P', cursive, monospace",
  fontSub: "'Silkscreen', cursive, monospace",
  fontRetro: "'VT323', monospace",

  // Z-слои
  zBase: 0,
  zRaised: 10,
  zModal: 50,
  zToast: 60,
} as const;

// ============================================================
// PIXEL BUTTON — единая кнопка проекта
// ============================================================
// Variants: primary | secondary | ghost | danger | success
// Sizes: sm | md | lg
// States: default, hover, focus, active, disabled, loading

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'strike';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface PixelButtonProps {
  /** Визуальный вариант кнопки */
  variant?: ButtonVariant;
  /** Размер (все ≥44px высота для md/lg) */
  size?: ButtonSize;
  /** Lucide-иконка слева от текста */
  icon?: React.ReactNode;
  /** Состояние загрузки (блокирует клики, показывает спиннер) */
  loading?: boolean;
  /** Disabled — блокирует клики и помечает aria-disabled */
  disabled?: boolean;
  /** Тип кнопки */
  type?: 'button' | 'submit';
  /** Полная ширина */
  fullWidth?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  className?: string;
  'aria-label'?: string;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-blue-500/40 shadow-blue-500/25 shadow-md',
  secondary:
    'bg-white/5 hover:bg-white/10 text-slate-200 border-white/15',
  ghost:
    'bg-transparent hover:bg-white/5 text-slate-400 hover:text-white border-transparent',
  danger:
    'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white border-red-500/40 shadow-red-500/25 shadow-md',
  success:
    'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border-emerald-500/40 shadow-emerald-500/25 shadow-md',
  // Мощный удар (арена): красный→оранжевый→янтарный, крупный акцент.
  // Стопы -700/-800 подобраны измерением: белый текст даёт >= 4.9:1 на всех
  // стопах (WCAG AA; исходные -500 давали 2.1-2.9:1 — fail, см. accessibility-check).
  strike:
    'bg-gradient-to-r from-red-800 via-orange-700 to-amber-700 text-white border-amber-700/40 shadow-red-800/30 shadow-xl text-base active:brightness-110',
};

const buttonSizes: Record<ButtonSize, string> = {
  // Все размеры >= 44px высоты (Apple HIG) кроме sm (использовать только для бейджей)
  sm: 'min-h-[36px] px-2.5 text-[11px] gap-1 rounded-lg',
  md: 'min-h-[44px] px-4 text-xs gap-1.5 rounded-xl',
  lg: 'min-h-[52px] px-6 text-sm gap-2 rounded-xl',
};

export const PixelButton: React.FC<PixelButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  type = 'button',
  fullWidth = false,
  onClick,
  children,
  className = '',
  ...ariaProps
}) => {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center font-semibold transition-[colors,transform,box-shadow] duration-150 border select-none cursor-pointer
        active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900
        ${buttonVariants[variant]}
        ${buttonSizes[size]}
        ${fullWidth ? 'w-full' : ''}
        ${isDisabled ? 'opacity-50 cursor-not-allowed active:scale-100' : ''}
        ${className}`}
      {...ariaProps}
    >
      {loading ? (
        <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" role="status" aria-live="polite" />
      ) : (
        icon && <span className="shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>
      )}
      {children}
    </button>
  );
};

// ============================================================
// PIXEL ICON BUTTON — квадратная иконка-кнопка (для тулбаров)
// ============================================================
// Гарантирует 44x44px tap target даже при маленькой иконке

export interface PixelIconButtonProps {
  /** Lucide-иконка */
  icon: React.ReactNode;
  /** Обязательный aria-label — иконка без текста! */
  'aria-label': string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export const PixelIconButton: React.FC<PixelIconButtonProps> = ({
  icon,
  variant = 'ghost',
  size = 'md',
  onClick,
  disabled = false,
  className = '',
  ...ariaProps
}) => {
  const sizes = {
    sm: 'w-11 h-11 rounded-lg', // 44px!
    md: 'w-12 h-12 rounded-xl', // 48px
  };

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={`inline-flex items-center justify-center border transition-[colors,box-shadow] duration-150 select-none cursor-pointer
        active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60
        ${buttonVariants[variant]}
        ${sizes[size]}
        ${disabled ? 'opacity-50 cursor-not-allowed active:scale-100' : ''}
        ${className}`}
      {...ariaProps}
    >
      <span className="[&>svg]:w-5 [&>svg]:h-5">{icon}</span>
    </button>
  );
};

// ============================================================
// PIXEL CARD — контейнер контента
// ============================================================

export interface PixelCardProps {
  /** Вариант рамки/фона */
  tone?: 'default' | 'required' | 'quest' | 'success';
  padding?: 'none' | 'sm' | 'md';
  className?: string;
  children?: React.ReactNode;
  onClick?: () => void;
}

const cardTones = {
  default: 'bg-white/5 border-white/10',
  required: 'bg-red-950/20 border-red-500/30',
  quest: 'bg-amber-950/20 border-amber-500/30',
  success: 'bg-emerald-950/20 border-emerald-500/30',
};

export const PixelCard: React.FC<PixelCardProps> = ({
  tone = 'default',
  padding = 'md',
  className = '',
  children,
  onClick,
}) => {
  const isClickable = !!onClick;
  return (
    <div
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={`rounded-2xl border backdrop-blur-md ${cardTones[tone]} ${
        padding === 'none' ? '' : padding === 'sm' ? 'p-3' : 'p-4'
      }
      ${isClickable ? 'cursor-pointer hover:border-white/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60' : ''}
      ${className}`}
    >
      {children}
    </div>
  );
};

// ============================================================
// PIXEL BADGE — маленький ярлык статуса
// ============================================================

export interface PixelBadgeProps {
  tone?: 'amber' | 'red' | 'green' | 'blue' | 'cyan' | 'purple';
  children: React.ReactNode;
  className?: string;
}

const badgeTones = {
  amber: 'bg-amber-400/10 text-amber-300 border-amber-400/20',
  red: 'bg-red-400/10 text-red-300 border-red-400/20',
  green: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20',
  blue: 'bg-blue-400/10 text-blue-300 border-blue-400/20',
  cyan: 'bg-cyan-400/10 text-cyan-300 border-cyan-400/20',
  purple: 'bg-purple-400/10 text-purple-300 border-purple-400/20',
};

export const PixelBadge: React.FC<PixelBadgeProps> = ({ tone = 'blue', children, className = '' }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-semibold ${badgeTones[tone]} ${className}`}>
    {children}
  </span>
);

// ============================================================
// PIXEL COIN — пиксельное золото с числом (замена эмодзи)
// ============================================================

export const PixelCoin: React.FC<{ amount: number; crystals?: number }> = ({ amount, crystals }) => (
  <span className="inline-flex items-center gap-1">
    {crystals != null && crystals > 0 && (
      <>
        <img src="/assets/game/habitica/shop/shop_gem.png" alt="" aria-hidden="true" className="w-3.5 h-3.5 pixel-art opacity-70" />
        <span className="text-cyan-300">+{crystals}</span>
      </>
    )}
    <img src="/assets/game/backgrounds/Previews/coin.png" alt="" aria-hidden="true" className="w-3.5 h-3.5 pixel-art" />
    <span>+{amount}</span>
  </span>
);
