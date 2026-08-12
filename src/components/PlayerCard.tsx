import React, { useState } from 'react';
import { User, GenderKey } from '../types';
import { Sparkles, Flame, Coins, Award, Shirt, Heart, Zap, UserCheck, Palette } from 'lucide-react';
import { CLASSES_CONFIG } from '../data/initialData';
import { PixelAvatar, RenderEnvironmentBg } from './PixelAvatar';
import { LayeredAvatar } from './LayeredAvatar';
import { get32BitAvatarLayers } from '../utils/rpg32bitAssets';
import { ShopItem, Pet } from '../types';

interface PlayerCardProps {
  user: User;
  shopItems: ShopItem[];
  pets: Pet[];
  onOpenWardrobe: () => void;
  onOpenCharacterEditor?: () => void;
  onOpenClassModal: () => void;
  onUseSkill?: () => void;
  onToggleGender?: (gender: GenderKey) => void;
  isPartner?: boolean;
}

export const PlayerCard: React.FC<PlayerCardProps> = ({
  user,
  shopItems,
  pets: allPets,
  onOpenWardrobe,
  onOpenCharacterEditor,
  onOpenClassModal,
  onUseSkill,
  onToggleGender,
  isPartner = false,
}) => {
  const [isAttacking, setIsAttacking] = useState(false);
  
  const handleSkillClick = () => {
    setIsAttacking(true);
    if (onUseSkill) onUseSkill();
    setTimeout(() => setIsAttacking(false), 600);
  };
  const level = Math.floor(user.xp / 100) + 1;
  const xpInLevel = user.xp % 100;
  const classConfig = user.class ? CLASSES_CONFIG[user.class] : null;

  const currentHp = user.hp ?? 50;
  const maxHp = user.max_hp ?? 50;
  const hpPercent = Math.min(100, Math.max(0, Math.round((currentHp / maxHp) * 100)));

  const currentMp = user.mp ?? 30;
  const maxMp = user.max_mp ?? 50;
  const mpPercent = Math.min(100, Math.max(0, Math.round((currentMp / maxMp) * 100)));

  const headEmoji = user.equipped?.head || '';
  const weaponEmoji = user.equipped?.weapon || '';
  const shieldEmoji = user.equipped?.shield || '';
  const bodyEmoji = user.equipped?.body || '';
  const cloakEmoji = user.equipped?.cloak || '';
  const accessoryEmoji = user.equipped?.accessory || '';
  const mountEmoji = user.equipped?.mount || '';
  const backgroundEmoji = user.equipped?.background || '';

  const pets = user.pets || [];
  const midIndex = Math.ceil(pets.length / 2);
  const leftPets = pets.slice(0, midIndex);
  const rightPets = pets.slice(midIndex);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border transition-all p-3.5 sm:p-5 backdrop-blur-md jrpg-card-gold ${
        isPartner
          ? 'border-pink-500/40 hover:border-pink-500/60'
          : 'border-amber-500/40 hover:border-amber-500/60'
      }`}
    >
      {/* Top Banner: Name, Gender & Class Badge */}
      <div className="flex items-start justify-between gap-2 sm:gap-4 mb-3 sm:mb-4">
        <div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight font-pixel-sub flex items-center gap-1.5 sm:gap-2">
              <span
                className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0 border border-white/20 shadow-sm"
                style={{ backgroundColor: user.character_color || user.color || '#f59e0b' }}
                title={`Уникальный цвет героя: ${user.character_color || user.color || '#f59e0b'}`}
              />
              <span>{user.display_name}</span>
            </h2>

            {/* Gender Toggle Button */}
            {onToggleGender && (
              <button
                onClick={() => onToggleGender(user.gender === 'female' ? 'male' : 'female')}
                className="text-[11px] sm:text-xs px-2 py-0.5 rounded-full font-pixel-sub bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition shrink-0"
                title="Сменить пол персонажа"
              >
                {user.gender === 'female' ? '👩 Жен.' : '👨 Муж.'}
              </button>
            )}
          </div>
        </div>

        {/* Level Badge */}
        <div className="text-right shrink-0">
          <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-400 font-pixel-sub block">
            УРОВЕНЬ
          </span>
          <span className="text-xl sm:text-2xl font-black font-pixel-heading text-amber-300 filter drop-shadow animate-pixel-glow">
            {level}
          </span>
        </div>
      </div>

      {/* Visual Pixel Avatar and Pet companions centered stage */}
      <div className="relative w-full bg-black/40 rounded-2xl p-4 border border-white/10 mb-4 shadow-inner flex flex-col items-center justify-center gap-2 overflow-hidden min-h-[140px]">
        {/* Full Environment Background across the stage box */}
        <RenderEnvironmentBg bgItem={backgroundEmoji} />

        {/* Wardrobe & Character Editor buttons in top right corner */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
          {onOpenCharacterEditor && (
            <button
              onClick={onOpenCharacterEditor}
              className="flex items-center gap-1 text-xs font-pixel-sub text-purple-200 hover:text-white bg-purple-950/80 hover:bg-purple-900/90 px-2.5 py-1.5 rounded-xl border border-purple-500/50 transition shadow-sm backdrop-blur-sm cursor-pointer"
              title="Редактор внешности персонажа"
            >
              <Palette className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Редактор</span>
            </button>
          )}

          <button
            onClick={onOpenWardrobe}
            className="flex items-center gap-1.5 text-xs font-pixel-sub text-slate-200 hover:text-white bg-slate-900/80 hover:bg-slate-800/90 px-2.5 py-1.5 rounded-xl border border-slate-700/80 transition shadow-sm backdrop-blur-sm cursor-pointer"
            title="Гардероб и фоны окружения"
          >
            <Shirt className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Гардероб</span>
          </button>
        </div>

        {/* Centered Character Stage with Pets standing on Left and Right */}
        <div className="relative z-10 flex items-end justify-center gap-3 sm:gap-5 w-full pt-3 pb-1">
          {/* Left Pets */}
          <div className="flex items-end gap-2 justify-end flex-1 min-w-0">
            {leftPets.map((pet, idx) => (
              <div
                key={`left-pet-${idx}`}
                className="hover:scale-125 transition-transform cursor-pointer shrink-0"
                title={`Верный питомец: ${pet}`}
              >
                <PixelAvatar type="pet" imageUrl={(pet as any).imageUrl || pet} fallbackEmoji={(pet as any).emoji || (typeof pet === 'string' ? pet : '')} size="sm" animated={true} />
              </div>
            ))}
          </div>

          {/* Main Centered Character Avatar */}
          <div className={`shrink-0 flex flex-col items-center z-10 ${isAttacking ? 'animate-pixel-attack' : ''}`}>
            <PixelAvatar
              type="character"
              classKey={user.class}
              gender={user.gender || 'male'}
              characterColor={user.character_color || user.color}
              customAvatarUrl={user.custom_avatar_url}
              headItem={user.equipped?.head}
              weaponItem={user.equipped?.weapon}
              shieldItem={user.equipped?.shield}
              bodyItem={user.equipped?.body}
              cloakItem={user.equipped?.cloak}
              accessoryItem={user.equipped?.accessory}
              mountItem={user.equipped?.mount}
              backgroundItem={user.equipped?.background}
              size="lg"
              animated={true}
            />
          </div>

          {/* Right Pets */}
          <div className="flex items-end gap-2 justify-start flex-1 min-w-0">
            {rightPets.map((pet, idx) => (
              <div
                key={`right-pet-${idx}`}
                className="hover:scale-125 transition-transform cursor-pointer shrink-0"
                title={`Верный питомец: ${pet}`}
              >
                <PixelAvatar type="pet" imageUrl={(pet as any).imageUrl || pet} fallbackEmoji={(pet as any).emoji || (typeof pet === 'string' ? pet : '')} size="sm" animated={true} />
              </div>
            ))}
          </div>
        </div>

        {/* Pet status text if no pets */}
        {pets.length === 0 && (
          <span className="relative z-10 text-slate-400 text-[11px] font-pixel-sub italic bg-black/40 px-2.5 py-0.5 rounded-full border border-white/5">
            Пока нет питомцев
          </span>
        )}
      </div>

      {/* Habitica HP & MP Vitals Bars (32-Bit JRPG Style) */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* HP Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] font-pixel-sub">
            <span className="text-red-400 flex items-center gap-1">
              <Heart className="w-3 h-3 text-red-500 fill-red-500" />
              HP Здоровье
            </span>
            <span className="text-red-300 font-pixel-retro">{currentHp}/{maxHp}</span>
          </div>
          <div className="w-full h-3 bg-black/80 rounded-full overflow-hidden p-0.5 border border-red-500/40 shadow-inner">
            <div
              className="h-full rounded-full jrpg-hp-fill transition-all duration-500"
              style={{ width: `${hpPercent}%` }}
            />
          </div>
        </div>

        {/* MP Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] font-pixel-sub">
            <span className="text-blue-400 flex items-center gap-1">
              <Zap className="w-3 h-3 text-blue-400 fill-blue-400" />
              MP Мания
            </span>
            <span className="text-blue-300 font-pixel-retro">{currentMp}/{maxMp}</span>
          </div>
          <div className="w-full h-3 bg-black/80 rounded-full overflow-hidden p-0.5 border border-blue-500/40 shadow-inner">
            <div
              className="h-full rounded-full jrpg-mp-fill transition-all duration-500"
              style={{ width: `${mpPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* XP Progress Bar */}
      <div className="space-y-1 mb-4">
        <div className="flex justify-between text-xs font-medium">
          <span className="text-slate-400 flex items-center gap-1 font-pixel-sub">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Опыт до уровня {level + 1}
          </span>
          <span className="text-amber-300 font-pixel-retro text-base font-bold">{xpInLevel} / 100 ⭐</span>
        </div>
        <div className="w-full h-2.5 bg-black/60 rounded-full overflow-hidden p-0.5 border border-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-400 to-amber-300 transition-all duration-700 shadow-sm shadow-indigo-500/50"
            style={{ width: `${Math.max(5, xpInLevel)}%` }}
          />
        </div>
      </div>

      {/* Core Stats Row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-900/60 rounded-xl p-2.5 text-center border border-slate-800">
          <span className="text-[10px] text-slate-400 font-pixel-sub flex items-center justify-center gap-1">
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            ЗОЛОТО
          </span>
          <span className="text-lg font-bold font-pixel-heading text-amber-300 mt-1 block">{user.gold} 💰</span>
        </div>

        <div className="bg-slate-900/60 rounded-xl p-2.5 text-center border border-slate-800">
          <span className="text-[10px] text-slate-400 font-pixel-sub flex items-center justify-center gap-1">
            <Flame className="w-3.5 h-3.5 text-orange-400" />
            СТРИК
          </span>
          <span className="text-lg font-bold font-pixel-heading text-orange-400 mt-1 block">{user.streak} дн.</span>
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
            <Award className="w-3.5 h-3.5 text-purple-400" />
            СКИЛЛ
          </span>
          <span className="text-xs font-pixel-sub font-bold mt-1 truncate">
            {user.skill_date ? 'Использован' : 'Каст ⚡'}
          </span>
        </button>
      </div>
    </div>
  );
};


