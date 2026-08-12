import React, { useState, useEffect, useRef } from 'react';
import { User, Boss, AppState } from '../../types';
import { PixelAvatar } from '../PixelAvatar';
import { LayeredAvatar } from '../LayeredAvatar';
import { get32BitAvatarLayers } from '../../utils/rpg32bitAssets';
import { ShieldAlert, Swords, Trophy, Sparkles, Flame, Zap, Volume2 } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface BossRaidSceneProps {
  appState: AppState;
  activeUser: User;
  onUseSkill: () => void;
}

interface FloatingDamage {
  id: number;
  amount: number;
  x: number;
  y: number;
  attackerName: string;
}

export const BossRaidScene: React.FC<BossRaidSceneProps> = ({
  appState,
  activeUser,
  onUseSkill,
}) => {
  const boss = appState.boss;
  const hp = Math.max(1, boss.hp);
  const damage = boss.damage;
  const percent = Math.min(100, Math.round((damage / hp) * 100));
  const isDefeated = !!boss.defeated;

  const [floatingDamages, setFloatingDamages] = useState<FloatingDamage[]>([]);
  const [isHit, setIsHit] = useState(false);
  const prevDamageRef = useRef(damage);

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

      setTimeout(() => {
        setFloatingDamages((prev) => prev.filter((d) => d.id !== newDmg.id));
      }, 1200);

      setTimeout(() => setIsHit(false), 300);
    }
    prevDamageRef.current = damage;
  }, [damage, activeUser.display_name]);

  const handleManualHit = () => {
    triggerHaptic('impact', 'heavy');
    onUseSkill();
  };

  return (
    <div className="relative w-full rounded-3xl overflow-hidden border-2 border-red-600/40 bg-slate-950 shadow-2xl transition-all">
      {/* Real Game Background Image: /assets/game/arena_bg.png */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ 
          backgroundImage: `url('/assets/game/arena_bg.png')`,
          backgroundSize: 'cover',
          backgroundColor: '#180808'
        }}
      />

      {/* Dark Raid Dungeon Ambient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-red-950/70 via-slate-950/80 to-slate-950/90 pointer-events-none" />

      {/* Top Raid Header */}
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

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleManualHit}
            className="w-full sm:w-auto justify-center px-3 py-2 sm:px-4 sm:py-2 rounded-2xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-xs font-pixel-sub shadow-lg border border-amber-400/50 transition active:scale-95 flex items-center gap-2"
          >
            <Flame className="w-4 h-4 text-amber-300 animate-bounce shrink-0" />
            <span>Мощный Удар (-150 HP)</span>
          </button>
        </div>
      </div>

      {/* Main Raid Combat Stage */}
      <div className="relative min-h-[320px] sm:min-h-[440px] p-3 sm:p-10 flex flex-col justify-between gap-4">
        {/* Boss HP Health Bar */}
        <div className="relative z-10 max-w-xl mx-auto w-full bg-slate-950/90 p-3 sm:p-4 rounded-2xl border-2 border-red-500/50 shadow-2xl">
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
              {isDefeated ? 'ПОБЕЖДЁН' : `Здоровье: ${damage}/${hp} HP`}
            </span>
          </div>

          <div className="w-full bg-slate-950 h-4 sm:h-5 rounded-full overflow-hidden border border-red-500/50 relative p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isDefeated
                  ? 'bg-emerald-400 shadow-lg shadow-emerald-500/50'
                  : 'bg-gradient-to-r from-red-600 via-amber-500 to-orange-400 shadow-lg shadow-red-500/50'
              }`}
              style={{ width: `${percent}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] sm:text-[11px] font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)] font-pixel-retro">
              {percent}% HP
            </span>
          </div>
        </div>

        {/* Combat Area: Family Heroes (Left) vs Boss Slime King (Right) */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 items-center my-3 sm:my-6">
          {/* Left Side: Family Heroes Formation */}
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 sm:gap-4">
            {appState.users.map((u) => {
              const layers = get32BitAvatarLayers(u, u.equipped || {}, null);
              return (
                <div
                  key={u.id}
                  className="relative flex flex-col items-center group transition-transform hover:scale-105"
                >
                  <div className="absolute -top-3 px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[9px] sm:text-[10px] font-bold shadow">
                    {u.display_name}
                  </div>
                  <div className="p-1.5 sm:p-2 rounded-2xl bg-slate-900/90 border border-indigo-500/40 shadow-xl backdrop-blur-sm">
                    <div className="block sm:hidden">
                      <LayeredAvatar layers={layers} size={68} animated={true} />
                    </div>
                    <div className="hidden sm:block">
                      <LayeredAvatar layers={layers} size={88} animated={true} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Side: Boss Monster Sprite */}
          <div className="relative flex flex-col items-center justify-center">
            {/* Floating Damage Numbers */}
            {floatingDamages.map((fd) => (
              <div
                key={fd.id}
                className="absolute -top-10 text-amber-400 font-pixel-retro font-black text-2xl sm:text-3xl drop-shadow-[0_2px_4px_rgba(0,0,0,1)] animate-bounce z-30"
                style={{
                  transform: `translate(${fd.x}px, ${fd.y}px)`,
                }}
              >
                -{fd.amount} HP!
              </div>
            ))}

            <div className={`relative transition-transform duration-100 ${isHit ? 'scale-110 brightness-150 rotate-3' : ''}`}>
              <div className="block sm:hidden">
                <PixelAvatar
                  type="boss"
                  imageUrl={boss.imageUrl}
                  fallbackEmoji=""
                  bossName={boss.name}
                  size="lg"
                />
              </div>
              <div className="hidden sm:block">
                <PixelAvatar
                  type="boss"
                  imageUrl={boss.imageUrl}
                  fallbackEmoji=""
                  bossName={boss.name}
                  size="xl"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Live Telegram Raid Feed Log */}
        <div className="relative z-10 bg-slate-950/90 p-2.5 sm:p-3 rounded-2xl border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-slate-300 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
            <span>
              Уведомление: <b>Миша нанес Боссу 150 ед. урона!</b>
            </span>
          </div>
          <div className="flex items-center gap-1 text-amber-300 font-semibold font-pixel-sub shrink-0">
            <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
            <span>Награда: +20 Золота всем</span>
          </div>
        </div>
      </div>
    </div>
  );
};

