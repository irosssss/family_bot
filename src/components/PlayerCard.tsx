import React, { useState, useMemo } from 'react';
import {
  Heart, Zap, Sparkles, Coins, Flame, Award, Shirt, Palette, ChevronDown, ChevronUp,
} from 'lucide-react';
import { ShopItem, Pet } from '../types';
import { CLASSES_CONFIG } from '../data/initialData';
import HabiticaAnimatedAvatar from './HabiticaAnimatedAvatar';
import { getUnifiedLook } from '../utils/unifiedLook';
import { habiticaPetSprite, habiticaBgUrl } from '../utils/shopLookMap';
import { triggerHaptic } from '../utils/haptics';

interface PlayerCardProps {
  user: any;
  shopItems: ShopItem[];
  pets: Pet[];
  onOpenWardrobe: () => void;
  onOpenCharacterEditor?: () => void;
  onOpenClassModal: () => void;
  onUseSkill?: () => void;
  onToggleGender?: (gender: any) => void;
  isPartner?: boolean;
}

/**
 * Карточка игрока: компактный режим по умолчанию (UX-аудит QW-3).
 * Компакт: аватар ULPC + имя + уровень + XP-полоска. Остальное — по тапу «Подробнее».
 */
export const PlayerCard: React.FC<PlayerCardProps> = ({
  user,
  shopItems,
  pets: allPets,
  onOpenWardrobe,
  onOpenCharacterEditor,
  onUseSkill,
  isPartner = false,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [isAttacking, setIsAttacking] = useState(false);

  const handleSkillClick = () => {
    setIsAttacking(true);
    if (onUseSkill) onUseSkill();
    setTimeout(() => setIsAttacking(false), 600);
  };

  const level = Math.floor(user.xp / 100) + 1;
  const xpInLevel = user.xp % 100;
  const classConfig = user.class ? (CLASSES_CONFIG as Record<string, any>)[user.class] : null;
  const currentHp = user.hp ?? 50;
  const maxHp = user.max_hp ?? 50;
  const hpPercent = Math.min(100, Math.max(0, Math.round((currentHp / maxHp) * 100)));
  const currentMp = user.mp ?? 30;
  const maxMp = user.max_mp ?? 50;
  const mpPercent = Math.min(100, Math.max(0, Math.round((currentMp / maxMp) * 100)));
  const backgroundEmoji = user.equipped?.background || '';
  const pets = user.pets || [];
  const midIndex = Math.ceil(pets.length / 2);
  const leftPets = pets.slice(0, midIndex);
  const rightPets = pets.slice(midIndex);

  // Единый образ (unifiedLook): тот же персонаж, что в хабе/арене/гардеробе
  const hLook = useMemo(() => getUnifiedLook(user), [user]);
  // Фон карточки: свой для каждого игрока (по id), из кропов home_bg
  const CARD_BACKGROUNDS = [
    '/assets/game/backgrounds/cards/hero_home.png',
    '/assets/game/backgrounds/cards/hero_hall.png',
    '/assets/game/backgrounds/cards/hero_corner.png',
    '/assets/game/backgrounds/cards/hero_study.png',
  ];
  const cardBg = CARD_BACKGROUNDS[(user.id - 1) % CARD_BACKGROUNDS.length];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border transition-colors p-3.5 sm:p-5 ${
        isPartner ? 'border-pink-500/30' : 'border-amber-500/30'
      }`}
      style={{
        backgroundImage: `url('${cardBg}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
      }}
    >
      {/* Затемнение поверх фона для читаемости */}
      <div className="absolute inset-0 bg-slate-950/55 pointer-events-none" />
      <div className="relative">
      {/* Шапка: имя + уровень + раскрытие */}
      <div className="flex items-start justify-between gap-2 sm:gap-4 mb-3">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
          <span
            className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0 border border-white/20 shadow-sm"
            style={{ backgroundColor: user.character_color || user.color || '#f59e0b' }}
          />
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight font-pixel-sub truncate">
            {user.display_name}
          </h2>
          <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-pixel-sub shrink-0">
            Ур. {level}
          </span>
          {classConfig && (
            <span className="text-[10px] sm:text-xs text-slate-400 font-pixel-sub truncate">
              {user.class === 'warrior' ? 'Воин' : user.class === 'mage' ? 'Маг' : user.class}
            </span>
          )}
        </div>
        <button
          onClick={() => {
            triggerHaptic('impact', 'light');
            setExpanded((e) => !e);
          }}
          className="shrink-0 w-11 h-11 -mr-1 -mt-1 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
          aria-label={expanded ? 'Свернуть' : 'Подробнее'}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </div>

      {/* Компакт: аватар + XP-полоска */}
      <div className="relative w-full bg-black/30 rounded-2xl p-3 border border-white/5 mb-3 flex items-center gap-4 overflow-hidden min-h-[120px]">
        {backgroundEmoji && (
          <div className="absolute inset-0 opacity-40 pointer-events-none bg-cover bg-center"
            style={{ backgroundImage: `url(${habiticaBgUrl(backgroundEmoji)})` }}
          />
        )}

        {/* Питомцы слева: Habitica-спрайты, тень на одной линии с ногами героя */}
        <div className="relative z-10 flex items-end gap-2 shrink-0 -mr-1">
          {leftPets.map((pet: any, idx: number) => (
            <div key={`lp-${idx}`} className="flex flex-col items-center">
              <img
                src={habiticaPetSprite(pet.code)}
                alt=""
                draggable={false}
                width="48" height="56" className="w-10 h-12 sm:w-12 sm:h-14 [image-rendering:pixelated] object-contain"
              />
              <div className="w-6 h-1 bg-black/40 blur-[1px] rounded-full -mt-0.5 pointer-events-none" />
            </div>
          ))}
        </div>

        {/* ULPC герой в центре */}
        <div
          className={`relative z-10 flex-1 flex justify-center ${isAttacking ? 'animate-pixel-attack' : ''}`}
        >
          <div className="block sm:hidden">
            <HabiticaAnimatedAvatar look={hLook} cls={user.class || 'warrior'} size={96} state="idle" />
          </div>
          <div className="hidden sm:block">
            <HabiticaAnimatedAvatar look={hLook} cls={user.class || 'warrior'} size={120} state="idle" />
          </div>
        </div>

        {/* Питомцы справа: Habitica-спрайты (см. левых) */}
        <div className="relative z-10 flex items-end gap-2 shrink-0 -ml-1">
          {rightPets.map((pet: any, idx: number) => (
            <div key={`rp-${idx}`} className="flex flex-col items-center">
              <img
                src={habiticaPetSprite(pet.code)}
                alt=""
                draggable={false}
                width="48" height="56" className="w-10 h-12 sm:w-12 sm:h-14 [image-rendering:pixelated] object-contain"
              />
              <div className="w-6 h-1 bg-black/40 blur-[1px] rounded-full -mt-0.5 pointer-events-none" />
            </div>
          ))}
        </div>
      </div>

      {/* XP полоска (всегда видна) */}
      <div className="space-y-1 mb-3">
        <div className="flex justify-between text-xs">
          <span className="text-slate-400 font-pixel-sub flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Опыт до ур. {level + 1}
          </span>
          <span className="text-amber-300 font-pixel-retro text-sm font-bold">{xpInLevel}/100</span>
        </div>
        <div className="w-full h-2.5 bg-black/60 rounded-full overflow-hidden border border-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-400 to-amber-300 transition-colors duration-700"
            style={{ width: `${Math.max(3, xpInLevel)}%` }}
          />
        </div>
      </div>

      {/* Развёрнутый блок: HP/MP, статы, кнопки */}
      {expanded && (
        <div className="space-y-3 animate-fadeIn">
          {/* HP / MP */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-pixel-sub">
                <span className="text-red-400 flex items-center gap-1">
                  <Heart className="w-3 h-3 text-red-500 fill-red-500" /> HP
                </span>
                <span className="text-red-300 font-pixel-retro">{currentHp}/{maxHp}</span>
              </div>
              <div className="w-full h-3 bg-black/80 rounded-full overflow-hidden p-0.5 border border-red-500/40">
                <div className="h-full rounded-full jrpg-hp-fill transition-colors duration-500" style={{ width: `${hpPercent}%` }} />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-pixel-sub">
                <span className="text-blue-400 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-blue-400 fill-blue-400" /> MP
                </span>
                <span className="text-blue-300 font-pixel-retro">{currentMp}/{maxMp}</span>
              </div>
              <div className="w-full h-3 bg-black/80 rounded-full overflow-hidden p-0.5 border border-blue-500/40">
                <div className="h-full rounded-full jrpg-mp-fill transition-colors duration-500" style={{ width: `${mpPercent}%` }} />
              </div>
            </div>
          </div>

          {/* Статы */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-900/60 rounded-xl p-2.5 text-center border border-slate-800">
              <span className="text-[10px] text-slate-400 font-pixel-sub flex items-center justify-center gap-1">
                <Coins className="w-3.5 h-3.5 text-amber-400" /> ЗОЛОТО
              </span>
              <span className="text-lg font-bold font-pixel-heading text-amber-300 mt-1 block">{user.gold}</span>
            </div>
            <div className="bg-slate-900/60 rounded-xl p-2.5 text-center border border-slate-800">
              <span className="text-[10px] text-slate-400 font-pixel-sub flex items-center justify-center gap-1">
                <Flame className="w-3.5 h-3.5 text-orange-400" /> СТРИК
              </span>
              <span className="text-lg font-bold font-pixel-heading text-orange-400 mt-1 block">{user.current_streak || 0} дн.</span>
            </div>
            <button
              onClick={handleSkillClick}
              disabled={!classConfig || !!user.skill_date}
              className={`rounded-xl p-2.5 text-center border transition flex flex-col items-center justify-center cursor-pointer ${
                user.skill_date
                  ? 'bg-slate-900/40 border-slate-800 text-slate-500 opacity-60'
                  : 'bg-purple-950/40 border-purple-500/30 hover:bg-purple-900/50 text-purple-300'
              }`}
            >
              <span className="text-[10px] font-pixel-sub flex items-center gap-1">
                <Award className="w-3.5 h-3.5 text-purple-400" /> СКИЛЛ
              </span>
              <span className="text-xs font-pixel-sub font-bold mt-1 truncate">
                {user.skill_date ? 'Использован' : 'Каст'}
              </span>
            </button>
          </div>

          {/* Кнопки: Гардероб + Редактор */}
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenWardrobe}
              className="flex-1 h-11 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 text-xs font-pixel-sub font-bold border border-slate-700 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Shirt className="w-4 h-4 text-blue-400" />
              Гардероб
            </button>
            {onOpenCharacterEditor && (
              <button
                onClick={onOpenCharacterEditor}
                className="flex-1 h-11 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 text-xs font-pixel-sub font-bold border border-slate-700 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Palette className="w-4 h-4 text-purple-400" />
                Внешность
              </button>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
};