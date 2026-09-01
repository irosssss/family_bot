/**
 * PartyView — экран «Обзор» в стиле Habitica.
 *
 * У Habitica нет «обзора карточек»: вместо него — список партии (Party):
 * компактная строка на игрока: мини-аватар, имя, Lvl, класс, питомец у ног.
 * Подробные статы (HP/MP/XP) — только у СВОЕГО персонажа (активного),
 * раскрываются по тапу; чужие — кратко, по тапу профильное действие.
 */
import React, { useState } from 'react';
import { User, AppState } from '../types';
import HabiticaAnimatedAvatar from './HabiticaAnimatedAvatar';
import { getUnifiedLook } from '../utils/unifiedLook';
import { habiticaPetSprite } from '../utils/shopLookMap';
import { CLASSES_CONFIG } from '../data/initialData';
import { Swords, Wand2, Sparkles, Flame, ChevronDown, ChevronUp } from 'lucide-react';

interface PartyViewProps {
  appState: AppState;
  activeUser: User;
  onOpenWardrobe: () => void;
  onOpenCharacterEditor: () => void;
}

const CLASS_ICON: Record<string, typeof Swords> = {
  warrior: Swords,
  mage: Wand2,
  rogue: Wand2,
  healer: Wand2,
};

const CLASS_RU: Record<string, string> = {
  warrior: 'Воин',
  mage: 'Маг',
  rogue: 'Разбойник',
  healer: 'Целитель',
};

/** Строка члена партии (Habitica party list). Разворачивается только у активного игрока. */
const PartyMemberRow: React.FC<{
  user: User;
  isMe: boolean;
  expanded: boolean;
  onToggle: () => void;
}> = ({ user, isMe, expanded, onToggle }) => {
  const hLook = getUnifiedLook(user);
  const level = Math.floor(user.xp / 100) + 1;
  const xpInLevel = user.xp % 100;
  const cls = user.class || 'warrior';
  const ClassIcon = CLASS_ICON[cls] || Swords;
  const petRecord = (user as any).__petRecord;
  const pet = petRecord ? (user as any).__pet : null;

  return (
    <div
      className={`rounded-2xl border transition-colors ${
        isMe
          ? 'border-amber-500/40 bg-slate-900/80'
          : 'border-white/10 bg-slate-900/50'
      }`}
    >
      <button
        onClick={onToggle}
        disabled={!isMe}
        className="w-full min-h-[64px] flex items-center gap-3 px-3 py-2.5 text-left"
        aria-expanded={expanded}
        aria-label={isMe ? `${user.display_name}, ваш профиль` : `${user.display_name}`}
      >
        {/* Мини-аватар: тот же единый образ */}
        <div className="relative shrink-0 w-12 h-14 flex items-end justify-center">
          <HabiticaAnimatedAvatar look={hLook} cls={cls} size={44} state="idle" gender={user.gender} />
        </div>

        {/* Имя / уровень / класс */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold text-sm text-white truncate">{user.display_name}</span>
            <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-pixel-sub">
              Lvl {level}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-400">
            <ClassIcon className="w-3 h-3 shrink-0" />
            <span>{CLASS_RU[cls] || cls}</span>
            {/* Питомец рядом с именем (как в Habitica: питомец из Stable) */}
            {pet && (
              <span className="flex items-center gap-1 ml-1 min-w-0">
                <img
                  src={habiticaPetSprite(pet.code)}
                  alt=""
                  width="18" height="22"
                  className="w-[18px] h-[22px] [image-rendering:pixelated] object-contain"
                />
                <span className="truncate">{pet.title}</span>
              </span>
            )}
          </div>
        </div>

        {/* Стрик (наш вклад — в Habitica аналога нет, не удаляем данные) */}
        <div className="shrink-0 text-right">
          <span className="text-[10px] font-pixel-sub text-orange-400 flex items-center gap-0.5 justify-end">
            <Flame className="w-3 h-3" /> {user.current_streak || 0}
          </span>
        </div>

        {/* Шеврон только у своего профиля */}
        {isMe && (
          <span className="shrink-0 text-slate-500">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        )}
      </button>

      {/* Развёрнутые статы — ТОЛЬКО свой профиль (как у Habitica: свои статы в шапке) */}
      {isMe && expanded && (
        <div className="px-3 pb-3 space-y-2.5 animate-in fade-in duration-200">
          {/* XP */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400 font-pixel-sub flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" /> Опыт до ур. {level + 1}
              </span>
              <span className="text-amber-300 font-pixel-retro text-xs font-bold">{xpInLevel}/100</span>
            </div>
            <div className="w-full h-2 bg-black/60 rounded-full overflow-hidden border border-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-400 to-amber-300 transition-[width] duration-700"
                style={{ width: `${Math.max(3, xpInLevel)}%` }}
              />
            </div>
          </div>

          {/* HP / MP */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="flex justify-between text-[10px] font-pixel-sub mb-0.5">
                <span className="text-red-400">HP</span>
                <span className="text-red-300">{user.hp ?? 50}/{user.max_hp ?? 50}</span>
              </div>
              <div className="h-2 bg-black/80 rounded-full overflow-hidden border border-red-500/40">
                <div
                  className="h-full jrpg-hp-fill transition-[width] duration-500"
                  style={{ width: `${Math.min(100, Math.round(((user.hp ?? 50) / (user.max_hp ?? 50)) * 100))}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[10px] font-pixel-sub mb-0.5">
                <span className="text-blue-400">MP</span>
                <span className="text-blue-300">{user.mp ?? 30}/{user.max_mp ?? 50}</span>
              </div>
              <div className="h-2 bg-black/80 rounded-full overflow-hidden border border-blue-500/40">
                <div
                  className="h-full jrpg-mp-fill transition-[width] duration-500"
                  style={{ width: `${Math.min(100, Math.round(((user.mp ?? 30) / (user.max_mp ?? 50)) * 100))}%` }}
                />
              </div>
            </div>
          </div>

          {/* Кошелёк */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 px-0.5">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" /> {user.gold ?? 0} золота
            </span>
            <span>{user.crystals ?? 0} кристаллов</span>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Обзор = Party (как у Habitica): компактный список семьи.
 * У активного игрока разворачиваются полные статы; у остальных — по тапу ничего
 * (их подробности живут в своих местах: хаб, арена, гардероб через переключатель профиля).
 */
export const PartyView: React.FC<PartyViewProps> = ({ appState, activeUser, onOpenWardrobe, onOpenCharacterEditor }) => {
  const [expandedId, setExpandedId] = useState<number | null>(activeUser.id);

  // Питомцы: активный питомец каждого игрока
  const withPets = appState.users.map((u) => {
    const mine = appState.userPets.filter((up) => up.user_id === u.id);
    const rec = mine.find((up) => up.is_active) || mine[0]; // активный или первый купленный
    const pet = rec ? appState.pets.find((p) => p.id === rec.pet_id) : null;
    return { user: u, pet };
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-bold text-white font-pixel-sub">Отряд семьи</h3>
        <span className="text-[11px] text-slate-500">{appState.users.length} героев</span>
      </div>

      <div className="space-y-2">
        {withPets.map(({ user, pet }) => (
          <PartyMemberRow
            key={user.id}
            user={{ ...user, __petRecord: !!pet, __pet: pet } as any}
            isMe={user.id === activeUser.id}
            expanded={expandedId === user.id}
            onToggle={() => setExpandedId(expandedId === user.id ? null : user.id)}
          />
        ))}
      </div>

      {/* Действия своего профиля (как у Habitica:customize под своим аватаром) */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onOpenWardrobe}
          className="flex-1 h-11 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 text-xs font-pixel-sub font-bold border border-slate-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          Гардероб
        </button>
        <button
          onClick={onOpenCharacterEditor}
          className="flex-1 h-11 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 text-xs font-pixel-sub font-bold border border-slate-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          Внешность
        </button>
      </div>
    </div>
  );
};
