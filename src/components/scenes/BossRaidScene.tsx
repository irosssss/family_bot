import React, { useState, useEffect, useRef } from 'react';
import { AppState, User } from '../../types';
import { Swords, Flame, Zap, Trophy, Skull, Heart, AlertTriangle } from 'lucide-react';
import { StreakBadge } from '../StreakBadge';
import BossAvatar from '../BossAvatar';
import HabiticaAnimatedAvatar from '../HabiticaAnimatedAvatar';
import { DEFAULT_LOOKS } from '../../utils/habiticaAssets';
import { triggerHaptic } from '../../utils/haptics';
import { sfxBossHit } from '../../utils/sfx';
import { PixelButton } from '../ui';

interface BossRaidSceneProps {
  appState: AppState;
  activeUser: User;
  onUseSkill: () => void;
  // === Этап 9: family HP + статус Истощение ===
  familyHp?: {
    family_hp: number;
    max_family_hp: number;
    exhausted_until: string | null;
  } | null;
}

interface FloatingDamage {
  id: number;
  amount: number;
  x: number;
  y: number;
  attackerName: string;
}

/**
 * Босс-рейд: семья слева (ULPC, боевые позы) vs босс справа.
 * При нанесении урона активный персонаж играет slash-анимацию.
 */
export const BossRaidScene: React.FC<BossRaidSceneProps> = ({
  appState,
  activeUser,
  onUseSkill,
  familyHp,
}) => {
  const boss = appState.boss;
    const hp = Math.max(1, boss.hp);
    const maxHp = boss.hp;
    const damage = boss.damage;
    const remainingHp = Math.max(0, maxHp - damage);
    const percent = Math.min(100, Math.round((damage / maxHp) * 100));
    const healthPercent = Math.min(100, Math.round((remainingHp / maxHp) * 100));
    const isDefeated = !!boss.defeated;

  // Family HP (Этап 9): процент + danger-флаг для анимации
  const familyPct = familyHp ? Math.max(0, Math.min(100, (familyHp.family_hp / Math.max(1, familyHp.max_family_hp)) * 100)) : 0;
  const familyDanger = familyHp ? familyHp.family_hp / Math.max(1, familyHp.max_family_hp) < 0.3 : false;

  const [floatingDamages, setFloatingDamages] = useState<FloatingDamage[]>([]);
  const [isHit, setIsHit] = useState(false);
  /** Кто атакует (id пользователя) — играет slash */
  const [attackerId, setAttackerId] = useState<number | null>(null);
  const prevDamageRef = useRef(damage);
  const attackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (damage > prevDamageRef.current) {
      const diff = damage - prevDamageRef.current;
      const newDmg: FloatingDamage = {
        id: Date.now() + Math.random(),
        amount: diff,
        x: Math.random() * 80 - 40,
        y: Math.random() * 40 - 20,
        attackerName: activeUser.display_name,
      };
      setFloatingDamages((prev) => [...prev, newDmg]);
      setIsHit(true);
      // Активный персонаж играет slash-анимацию ~600мс (6 кадров x 100мс)
      setAttackerId(activeUser.id);
      if (attackTimerRef.current) clearTimeout(attackTimerRef.current);
      attackTimerRef.current = setTimeout(() => {
        setAttackerId(null);
        setIsHit(false);
      }, 650);
      setTimeout(() => {
        setFloatingDamages((prev) => prev.filter((d) => d.id !== newDmg.id));
      }, 1200);
    }
    prevDamageRef.current = damage;
  }, [damage, activeUser.display_name, activeUser.id]);

  useEffect(() => () => {
    if (attackTimerRef.current) clearTimeout(attackTimerRef.current);
  }, []);

  const handleManualHit = () => {
    triggerHaptic('impact', 'heavy');
    sfxBossHit();
    onUseSkill();
  };

  return (
    <div className="relative w-full rounded-3xl overflow-hidden border-2 border-red-600/40 bg-slate-950 shadow-2xl transition-all">
      {/* Фон арены */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat [image-rendering:pixelated]"
        style={{
          backgroundImage: `url('/assets/game/arena_bg.png')`,
          backgroundSize: 'cover',
          backgroundColor: '#180808',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-red-950/70 via-slate-950/80 to-slate-950/90 pointer-events-none" />

      {/* Шапка рейда */}
      <div className="relative z-10 p-3 sm:p-6 flex flex-wrap items-center justify-between gap-3 bg-slate-950/80 backdrop-blur-md border-b border-red-500/30">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-red-600/20 border border-red-500/50 flex items-center justify-center text-red-400 shadow-lg animate-pulse shrink-0">
            <Swords className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h2 className="text-sm sm:text-lg font-bold text-white font-pixel-sub flex items-center gap-2">
              Битва с боссом
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400">
              Кооперативный рейд всей семьи • Общее здоровье босса
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap justify-end">
          <StreakBadge
            currentStreak={activeUser.current_streak || 0}
            bestStreak={activeUser.best_streak}
            status={activeUser.streak_status || 'active'}
            bonusPercentage={Math.min(50, (activeUser.current_streak || 0) * 5)}
          />
          {/* === Этап 9: полоска Family HP + статус «Истощение» === */}
          {familyHp && (
            <div className={`flex items-center gap-2 bg-amber-950/50 border border-amber-500/40 rounded-xl px-2.5 py-1.5 ${familyDanger ? 'animate-hp-glow border-rose-500/60' : ''}`}>
              <Heart className={`w-4 h-4 shrink-0 ${familyDanger ? 'text-rose-400 animate-pulse' : 'text-rose-400'}`} />
              <div className="flex flex-col gap-0.5 min-w-[80px]">
                <span className="text-[9px] uppercase font-bold text-amber-300 font-pixel-sub tracking-wider">
                  Семья
                </span>
                <div className="w-20 h-2 bg-slate-900 rounded-full overflow-hidden border border-amber-700/40">
                  <div
                    className={`h-full transition-all duration-500 ${
                      familyDanger
                        ? 'bg-gradient-to-r from-rose-600 to-red-500 animate-hp-danger'
                        : 'bg-gradient-to-r from-rose-500 via-orange-400 to-amber-400'
                    }`}
                    style={{ width: `${familyPct}%` }}
                  />
                </div>
              </div>
              <span className="text-xs font-bold text-white font-pixel-sub whitespace-nowrap">
                {familyHp.family_hp}/{familyHp.max_family_hp}
              </span>
            </div>
          )}
          {familyHp?.exhausted_until && new Date(familyHp.exhausted_until) > new Date() && (
            <div className="flex items-center gap-1.5 bg-rose-900/70 border border-rose-500/60 rounded-xl px-2.5 py-1.5 animate-pulse">
              <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0" />
              <span className="text-[10px] sm:text-xs font-bold text-rose-200 font-pixel-sub uppercase tracking-wider">
                Истощение −15% золота
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Поле боя */}
      <div className="relative min-h-[320px] sm:min-h-[440px] p-3 sm:p-10 flex flex-col justify-between gap-4">
        {/* HP босса: лёгкий оверлей без рамки-карточки */}
        <div className="relative z-10 max-w-xl mx-auto w-full bg-slate-950/60 px-3 py-2 rounded-xl backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-red-200 font-pixel-sub text-xs sm:text-base">
                {boss.name}
              </span>
            </div>
            <span
              className={`text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold uppercase font-pixel-sub ${
                isDefeated
                  ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-400/50 animate-pulse'
                  : 'bg-red-500/30 text-red-300 border border-red-400/50'
              }`}
            >
              {isDefeated ? 'ПОБЕЖДЁН' : `Здоровье: ${remainingHp}/${maxHp} HP`}
            </span>
          </div>
          <div className="w-full bg-slate-950 h-4 sm:h-5 rounded-full overflow-hidden border border-red-500/50 relative p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isDefeated
                  ? 'bg-emerald-400 shadow-lg shadow-emerald-500/50'
                  : 'bg-gradient-to-r from-red-600 via-amber-500 to-orange-400 shadow-lg shadow-red-500/50'
              }`}
              style={{ width: `${healthPercent}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] sm:text-[11px] font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)] font-pixel-retro">
                          {healthPercent}% HP
                        </span>
          </div>
        </div>

        {/* Герои (слева) vs Босс (справа) */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 items-center my-3 sm:my-6">
          {/* Семья: Habitica-аватары, атакующий делает рывок с оружием (процедурная анимация) */}
          <div className="flex flex-wrap items-end justify-center md:justify-start gap-3 sm:gap-4">
            {appState.users.filter((u) => u.family_role !== 'parent').map((u) => {
              const isAttackingNow = attackerId === u.id;
              const hLook = { ...DEFAULT_LOOKS[
                u.display_name.toLowerCase().includes('миша') ? 'misha'
                : u.display_name.toLowerCase().includes('регина') || u.display_name.toLowerCase().includes('regina') ? 'regina'
                : 'misha'
              ], ...((u as any).habitica_equipped || {}) };
              return (
                <div
                  key={u.id}
                  className={`relative flex flex-col items-center transition-transform hover:scale-105 ${
                    isAttackingNow ? 'translate-x-2 sm:translate-x-4' : ''
                  }`}
                >
                  {/* Имя над головой: чистый текст с тенью (JRPG-стиль, без подложки) */}
                  <div
                    className="absolute -top-5 text-[9px] sm:text-[11px] font-bold text-white font-pixel-sub pointer-events-none"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.8)' }}
                  >
                    {u.display_name}
                  </div>
                  <HabiticaAnimatedAvatar
                    look={hLook}
                    cls={u.class || 'warrior'}
                    size={72}
                    className="hidden sm:block"
                    state={isDefeated ? 'idle' : isAttackingNow ? 'attack' : 'idle'}
                  />
                  <HabiticaAnimatedAvatar
                    look={hLook}
                    cls={u.class || 'warrior'}
                    size={56}
                    className="block sm:hidden"
                    state={isDefeated ? 'idle' : isAttackingNow ? 'attack' : 'idle'}
                  />
                </div>
              );
            })}
          </div>

          {/* Босс */}
          <div className="relative flex flex-col items-center justify-center">
            {/* Всплывающий урон */}
            {floatingDamages.map((fd) => (
              <div
                key={fd.id}
                className="absolute -top-10 text-amber-400 font-pixel-retro font-black text-2xl sm:text-3xl drop-shadow-[0_2px_4px_rgba(0,0,0,1)] animate-bounce z-30"
                style={{ transform: `translate(${fd.x}px, ${fd.y}px)` }}
              >
                -{fd.amount} HP!
              </div>
            ))}
            <div className={`relative transition-transform duration-100 ${isHit ? 'scale-110 brightness-150 rotate-3' : ''}`}>
                          {isDefeated ? (
                            <div className="w-32 h-32 sm:w-44 sm:h-44 rounded-3xl bg-slate-900/80 border-2 border-emerald-500/50 flex flex-col items-center justify-center gap-2">
                              <Skull className="w-12 h-12 sm:w-16 sm:h-16 text-emerald-400" />
                              <span className="text-emerald-300 font-pixel-sub text-xs font-bold">ПОБЕЖДЁН</span>
                            </div>
                          ) : (
                            <>
                              {/* Habitica-босс недели (статичный PNG) либо ULPC-спрайтшит слайма */}
                              <div className="block sm:hidden">
                                <BossAvatar spriteSheet={appState.boss.spriteSheetUrl || '/assets/game/entities/bosses/boss_main_sheet.png'} frames={appState.boss.spriteSheetUrl ? 1 : 5} size={144} animated={!appState.boss.spriteSheetUrl} />
                              </div>
                              <div className="hidden sm:block">
                                <BossAvatar spriteSheet={appState.boss.spriteSheetUrl || '/assets/game/entities/bosses/boss_main_sheet.png'} frames={appState.boss.spriteSheetUrl ? 1 : 5} size={200} animated={!appState.boss.spriteSheetUrl} />
                              </div>
                            </>
                          )}
                        </div>
          </div>
        </div>

        {/* Лента рейда */}
        <div className="relative z-10 bg-slate-950/90 p-2.5 sm:p-3 rounded-2xl border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-slate-300 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
            <span>
              Уведомление: <b>{floatingDamages.length > 0 ? `${floatingDamages[floatingDamages.length - 1].attackerName} наносит удар по боссу!` : 'Семья готова к бою!'}</b>
            </span>
          </div>
          <div className="flex items-center gap-1 text-amber-300 font-semibold font-pixel-sub shrink-0">
            <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
            <span>Награда: +20 Золота всем</span>
          </div>
        </div>

        {/* Мощный удар: большая кнопка внизу сцены (thumb zone, UX-аудит QW-2) — только дети */}
        {activeUser.family_role !== 'parent' && !isDefeated && (
          <PixelButton
            variant="strike"
            size="lg"
            fullWidth
            onClick={handleManualHit}
            className="relative z-10 h-14 text-base font-bold"
          >
            <Flame className="w-5 h-5 text-amber-200 animate-bounce shrink-0" />
            <span>Мощный Удар (15 урона)</span>
          </PixelButton>
        )}
      </div>
    </div>
  );
};