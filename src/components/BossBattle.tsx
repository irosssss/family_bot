import React, { useEffect, useState, useRef } from 'react';
import { Boss } from '../types';
import { ShieldAlert, Trophy } from 'lucide-react';
import BossAvatar from './BossAvatar';

interface BossBattleProps {
  boss: Boss;
  onUseSkill: () => void;
}

interface DamageNumber {
  id: number;
  amount: number;
  x: number;
  y: number;
}

export const BossBattle: React.FC<BossBattleProps> = ({ boss, onUseSkill }) => {
  const hp = Math.max(1, boss.hp);
  const damage = boss.damage;
  const percent = Math.min(100, Math.round((damage / hp) * 100));
  const isDefeated = !!boss.defeated;
  const prevDamageRef = useRef(damage);
  const [damageNumbers, setDamageNumbers] = useState<DamageNumber[]>([]);
  const [isHit, setIsHit] = useState(false);

  useEffect(() => {
    if (damage > prevDamageRef.current) {
      const amount = damage - prevDamageRef.current;
      const newNum: DamageNumber = {
        id: Date.now() + Math.random(),
        amount,
        x: Math.random() * 60 - 30,
        y: Math.random() * 20 - 10,
      };
      setDamageNumbers(prev => [...prev, newNum]);
      setIsHit(true);
      setTimeout(() => {
        setDamageNumbers(prev => prev.filter(n => n.id !== newNum.id));
      }, 1000);
      setTimeout(() => { setIsHit(false); }, 300);
    }
    prevDamageRef.current = damage;
  }, [damage]);

  return (
    <div
      className={`bg-gradient-to-br from-red-950/40 via-slate-900/90 to-purple-950/40 border-2 border-red-500/30 rounded-2xl p-5 backdrop-blur-md relative overflow-hidden shadow-xl transition-all duration-75 ${
        isHit ? 'translate-x-1 translate-y-1 brightness-150 border-red-400' : ''
      }`}
    >
      {/* Glow Effect */}
      <div
        className={`absolute -top-10 -right-10 w-36 h-36 rounded-full blur-2xl pointer-events-none transition-all ${
          isHit ? 'bg-red-500/60 scale-150' : 'bg-red-500/20'
        }`}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative">
        <div className="flex items-center gap-3 relative">
          <div className={`transition-transform duration-75 ${isHit ? 'scale-110 -rotate-6' : ''}`}>
            <BossAvatar
              spriteSheet={(boss as any).spriteSheetUrl || boss.imageUrl || (boss as any).icon}
              frames={boss.spriteSheetUrl ? 1 : 5}
              size={64}
              animated={!boss.spriteSheetUrl}
            />
          </div>

          {/* Floating Damage Numbers */}
          {damageNumbers.map(num => (
            <div
              key={num.id}
              className="absolute text-red-500 font-pixel-retro font-bold text-2xl drop-shadow-md pointer-events-none animate-float-up-fade"
              style={{
                left: `calc(20px + ${num.x}px)`,
                top: `calc(10px + ${num.y}px)`,
                zIndex: 50,
                textShadow: '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000',
              }}
            >
              -{num.amount}
            </div>
          ))}

          <div>
            <h2 className="text-lg font-bold text-white tracking-tight font-pixel-sub flex items-center gap-2">
              {boss.name}
            </h2>
            <p className="text-xs text-slate-400">Семейный босс недели (общий враг)</p>
          </div>
        </div>

        <span
          className={`text-xs px-3 py-1 rounded-full font-pixel-sub font-bold uppercase tracking-wider ${
            isDefeated
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
              : 'bg-red-500/20 text-red-300 border border-red-500/40'
          }`}
        >
          {isDefeated ? 'ПОБЕЖДЁН' : 'В БОЮ'}
        </span>
      </div>

      {/* HP Bar */}
      <div className="space-y-1.5 mb-3">
        <div className="flex justify-between text-xs font-semibold">
          <span className="text-slate-300 flex items-center gap-1 font-pixel-sub">
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            Здоровье босса
          </span>
          <span className="text-red-400 font-pixel-retro text-base font-bold">
            {damage} / {hp} HP ({percent}%)
          </span>
        </div>
        <div className="w-full h-3.5 bg-black/70 rounded-full overflow-hidden p-0.5 border border-red-500/30">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              isDefeated
                ? 'bg-emerald-400 shadow-lg shadow-emerald-500/50'
                : 'bg-gradient-to-r from-red-600 via-amber-500 to-orange-400 shadow-md shadow-red-500/50'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Narrative info */}
      <div className="flex items-center justify-between text-xs bg-black/40 p-3 rounded-xl border border-white/10">
        <div className="flex items-center gap-2 text-slate-300 font-pixel-sub text-[11px]">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span>Награда за победу: <b>оба получают +20 золото</b></span>
        </div>
        <span className="text-slate-500 text-[10px] font-mono">Ротация по понедельникам</span>
      </div>
    </div>
  );
};

export default BossBattle;