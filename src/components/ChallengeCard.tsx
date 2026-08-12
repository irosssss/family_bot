import React from 'react';
import { Challenge } from '../types';
import { Target, Trophy, Sparkles, CheckCircle2 } from 'lucide-react';

interface ChallengeCardProps {
  challenge: Challenge;
}

export const ChallengeCard: React.FC<ChallengeCardProps> = ({ challenge }) => {
  const progress = challenge.progress || 0;
  const target = challenge.target;
  const isDone = challenge.completed || progress >= target;
  const percent = Math.min(100, Math.round((progress / target) * 100));

  return (
    <div className="bg-gradient-to-br from-amber-950/20 via-slate-900/70 to-indigo-950/20 border border-amber-500/20 rounded-2xl p-5 backdrop-blur-md relative overflow-hidden">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight font-pixel-sub">Челлендж недели: {challenge.title}</h3>
            <p className="text-xs text-slate-400">{challenge.description}</p>
          </div>
        </div>

        <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-amber-400/10 text-amber-300 border border-amber-400/20 flex-shrink-0">
          +{challenge.bonus} 💰
        </span>
      </div>

      {/* Progress */}
      <div className="space-y-1 mt-3">
        <div className="flex justify-between text-xs text-slate-300 font-medium">
          <span>Прогресс недели</span>
          <span className="font-semibold text-amber-300">
            {isDone ? '✅ Выполнен!' : `${progress} / ${target}`}
          </span>
        </div>
        <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden p-0.5 border border-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
};
