import React, { useState, useEffect } from 'react';
import { Flame, Sparkles, Shield, Heart } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';
import confetti from 'canvas-confetti';

type StreakStatus = 'active' | 'paused' | 'frozen' | 'broken';

interface StreakBadgeProps {
  currentStreak: number;
  bestStreak?: number;
  status?: StreakStatus;
  bonusPercentage: number;
  onStreakUpdate?: (streak: number, bonusPercent: number) => void;
}

function getStreakColor(streak: number): string {
  if (streak >= 10) return 'max';
  if (streak >= 7) return 'high';
  if (streak >= 3) return 'medium';
  return 'low';
}

function playSound(filename: string, volume: number = 0.5) {
  try {
    const audio = new Audio(`/assets/sounds/${filename}`);
    audio.volume = volume;
    audio.play().catch(err => console.log('Audio play failed:', err));
  } catch (err) {
    console.log('Audio not available:', err);
  }
}

export const StreakBadge: React.FC<StreakBadgeProps> = ({
  currentStreak,
  bestStreak,
  status = 'active',
  bonusPercentage,
  onStreakUpdate,
}) => {
  const [prevStreak, setPrevStreak] = useState(currentStreak);
  const [showMilestone, setShowMilestone] = useState(false);
  const [milestoneData, setMilestoneData] = useState<{ level: number; text: string } | null>(null);
  const colorLevel = getStreakColor(currentStreak);

  useEffect(() => {
    if (currentStreak > prevStreak) {
      handleStreakIncrease(currentStreak);
    }
    setPrevStreak(currentStreak);
  }, [currentStreak, prevStreak]);

  const handleStreakIncrease = (newStreak: number) => {
    triggerHaptic('notification', 'success');
    if (newStreak === 3) {
      triggerMilestone3();
    } else if (newStreak === 7) {
      triggerMilestone7();
    } else if (newStreak === 10) {
      triggerMilestone10();
    } else {
      triggerConfetti();
    }
  };

  const triggerMilestone3 = () => {
    playSound('notification_soft.mp3', 0.5);
    confetti({ particleCount: 30, spread: 50, origin: { y: 0.6 }, colors: ['#FB923C', '#FCD34D'], scalar: 0.8 });
    setMilestoneData({ level: 3, text: '3 дня подряд! Ты на верном пути' });
    setShowMilestone(true);
    setTimeout(() => setShowMilestone(false), 3000);
  };

  const triggerMilestone7 = () => {
    playSound('achievement_unlock.mp3', 0.6);
    confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 }, colors: ['#FB923C', '#EF4444'] });
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    setMilestoneData({ level: 7, text: 'НЕДЕЛЯ ЗАВЕРШЕНА! +35% к наградам' });
    setShowMilestone(true);
    setTimeout(() => setShowMilestone(false), 5000);
  };

  const triggerMilestone10 = () => {
    playSound('legendary_achievement.mp3', 0.7);
    confetti({ particleCount: 200, spread: 160, origin: { y: 0.6 }, colors: ['#A855F7', '#EC4899', '#F59E0B'], scalar: 1.5 });
    if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 800]);
    setMilestoneData({ level: 10, text: 'МАКСИМАЛЬНЫЙ STREAK! +50% к наградам' });
    setShowMilestone(true);
    setTimeout(() => setShowMilestone(false), 5000);
  };

  const triggerConfetti = () => {
    confetti({ particleCount: 30, spread: 40, origin: { y: 0.4 }, colors: ['#f59e0b', '#fbbf24'], scalar: 0.8 });
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'paused': return <span className="text-slate-400 text-base">||</span>;
      case 'frozen': return <Shield className="w-4 h-4 text-blue-300" />;
      case 'broken': return <Heart className="w-4 h-4 text-red-400" />;
      default: return <Flame className="w-4 h-4" />;
    }
  };

  const getBadgeColors = () => {
    if (status !== 'active') return 'bg-slate-800/20 border-slate-600/40';
    switch (colorLevel) {
      case 'max': return 'bg-purple-900/30 border-purple-500/50 shadow-purple-500/20';
      case 'high': return 'bg-red-900/30 border-red-500/50 shadow-red-500/20';
      case 'medium': return 'bg-orange-900/30 border-orange-500/50 shadow-orange-500/20';
      default: return 'bg-yellow-900/30 border-yellow-500/50 shadow-yellow-500/20';
    }
  };

  const getTextColor = () => {
    if (status !== 'active') return 'text-slate-400';
    switch (colorLevel) {
      case 'max': return 'text-purple-300';
      case 'high': return 'text-red-300';
      case 'medium': return 'text-orange-300';
      default: return 'text-yellow-300';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'paused': return 'На паузе';
      case 'frozen': return 'Заморожен';
      case 'broken': return 'Сброшен';
      default: return null;
    }
  };

  return (
    <div className="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-sm transition-all duration-300"
      style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
      <div className={`flex items-center gap-1.5 ${getBadgeColors()} px-2.5 py-0.5 rounded-full`}>
        <span className={getTextColor()}>{getStatusIcon()}</span>
        <span className={`font-bold text-sm ${getTextColor()}`}>
          {currentStreak}
        </span>
      </div>
      <span className={`text-xs font-semibold ${getTextColor()}`}>
        +{bonusPercentage}%
      </span>
      {status === 'active' && currentStreak > 0 && (
        <span className="text-[10px] text-slate-500 hidden sm:inline">
          {bestStreak && currentStreak >= bestStreak ? 'Лучший!' : `макс: ${bestStreak || 0}`}
        </span>
      )}
      {getStatusText() && (
        <span className="text-[10px] text-slate-400">{getStatusText()}</span>
      )}
      {showMilestone && milestoneData && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900 text-white text-xs px-3 py-1 rounded-full shadow-lg animate-bounce">
          {milestoneData.text}
        </div>
      )}
    </div>
  );
};

export default StreakBadge;