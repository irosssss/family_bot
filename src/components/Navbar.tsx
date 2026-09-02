import React from 'react';
import { Sparkles, Swords, RefreshCw, Volume2, VolumeX, Shield, Wand2, Bell, UserPlus, Share2, Gift, CheckSquare, Smartphone, Settings, Heart, Droplets } from 'lucide-react';
import { User, Boss } from '../types';
import { isTelegramMiniApp, shareMiniApp } from '../utils/haptics';
// === PlayerStatusBars (Этап 1, паттерн Habitica: HP/XP/MP всегда на виду) ===
// Уровень/XP — та же формула, что в PartyView/achievementService: level = floor(xp/100)+1
const GemIcon: React.FC = () => (
  <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 shrink-0" aria-hidden="true">
    <path d="M6 1 L10 4.5 L6 11 L2 4.5 Z" fill="#e879f9" stroke="#a21caf" strokeWidth="0.8" />
    <path d="M2 4.5 H10 M6 1 L4.5 4.5 L6 11 L7.5 4.5 Z" fill="none" stroke="#f5d0fe" strokeWidth="0.5" />
  </svg>
);
const PlayerStatusBars: React.FC<{ user: User }> = ({ user }) => {
  const isPlayer = user.family_role !== 'parent'; // родители НЕ играют (AGENTS.md)
  if (!isPlayer) return null;
  const level = Math.floor(user.xp / 100) + 1;
  const xpInLevel = user.xp % 100;
  const hpPct = Math.max(0, Math.min(100, Math.round(((user.hp ?? 50) / (user.max_hp || 50)) * 100)));
  const mpPct = Math.max(0, Math.min(100, Math.round(((user.mp ?? 30) / (user.max_mp || 30)) * 100)));
  const xpPct = Math.max(0, Math.min(100, xpInLevel));
  const Bar: React.FC<{ pct: number; fill: string; icon: React.ReactNode; label: string }> = ({ pct, fill, icon, label }) => (
    <div className="flex items-center gap-1 min-w-0" title={label}>
      <span className="shrink-0">{icon}</span>
      <div className="flex-1 h-1.5 bg-slate-950 rounded-full overflow-hidden border border-white/10 min-w-[26px]">
        <div className={`h-full transition-all duration-500 ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
  return (
    <div className="flex items-center gap-2 sm:gap-2.5 px-2 py-1 rounded-lg bg-slate-900/70 border border-white/10">
      <span className="text-[9px] sm:text-[10px] font-bold font-pixel-sub text-amber-300 whitespace-nowrap" title={`Уровень ${level} · опыт ${user.xp}`}>
        LVL {level}
      </span>
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        <Bar pct={hpPct} fill="bg-red-500" icon={<Heart className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-red-400 shrink-0" />} label={`Здоровье ${user.hp ?? 50}/${user.max_hp || 50}`} />
        <Bar pct={xpPct} fill="bg-amber-400" icon={<Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-400 shrink-0" />} label={`Опыт до уровня: ${xpInLevel}/100`} />
        <Bar pct={mpPct} fill="bg-sky-500" icon={<Droplets className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-sky-400 shrink-0" />} label={`Мана (для скиллов) ${user.mp ?? 30}/${user.max_mp || 30}`} />
      </div>
      <span className="text-[9px] sm:text-[10px] font-bold font-pixel-sub text-amber-200 whitespace-nowrap flex items-center gap-0.5" title={`Золото: ${user.gold}`}>
        {user.gold} <Sparkles className="w-2.5 h-2.5 text-amber-400 shrink-0" />
      </span>
      {(user.crystals ?? 0) > 0 && (
        <span className="text-[9px] sm:text-[10px] font-bold font-pixel-sub text-fuchsia-300 whitespace-nowrap flex items-center gap-0.5" title={`Кристаллы: ${user.crystals}`}>
          {user.crystals} <GemIcon />
        </span>
      )}
    </div>
  );
};
 interface NavbarProps { activeUser: User; users: User[]; onSelectUser: (user: User) => void; boss: Boss; onUseSkill?: () => void; soundEnabled: boolean; onToggleSound: () => void; onRefresh: () => void; isRefreshing: boolean; onOpenAddModal: () => void; onOpenFamilyModal?: () => void; onOpenFamilySettings?: () => void; onOpenRegisterModal?: () => void; onOpenReferralModal?: () => void; onOpenChecklistModal?: () => void; onOpenUpgradeGuide?: () => void;
} export const Navbar: React.FC<NavbarProps> = ({ activeUser, users, onSelectUser, boss, onUseSkill, soundEnabled, onToggleSound, onRefresh, isRefreshing, onOpenAddModal, onOpenFamilyModal, onOpenFamilySettings, onOpenRegisterModal, onOpenReferralModal, onOpenChecklistModal, onOpenUpgradeGuide,
}) => { const bossHpPercent = Math.min(100, Math.round((boss.damage / boss.hp) * 100)); return ( <header className="sticky top-0 z-40 bg-[#0e1118]/90 backdrop-blur-md border-b border-white/10 px-2.5 sm:px-4 lg:px-8 py-2 sm:py-3 transition-colors"> <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 sm:gap-4"> {/* Brand & Title */} <div className="flex items-center gap-2 sm:gap-3"> <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-500 to-amber-400 p-0.5 shadow-lg shadow-indigo-500/20 flex items-center justify-center animate-float shrink-0"> <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-white" /> </div> <div> <div className="flex items-center gap-1.5 sm:gap-2"> <h1 className="font-bold text-base sm:text-lg text-white tracking-tight font-pixel-sub flex items-center gap-1.5"> <Swords className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" /> <span>Family Chores</span> </h1> </div> <p className="text-xs text-slate-400 hidden sm:block"> Семейная игра домашних дел: кооператив Миши и Регины </p> </div> </div> {/* Мобильный компактный босс-бар (Этап 11 #8): виден на телефоне, скрыт на lg */}
 <div className="flex lg:hidden items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900/60 border border-amber-500/30 min-w-0 flex-1 sm:flex-none">
   <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
   <span className="text-[9px] font-bold text-amber-200 font-pixel-sub uppercase tracking-wider truncate">{boss.name}</span>
   <div className="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden border border-amber-700/40 min-w-[40px]">
     <div className={`h-full transition-colors duration-500 ${boss.defeated ? 'bg-emerald-500' : 'jrpg-hp-fill'}`} style={{ width: `${bossHpPercent}%` }} />
   </div>
   <span className="text-[9px] font-bold text-white font-pixel-sub whitespace-nowrap">
     {boss.defeated ? 'ПОБЕДА' : `${Math.max(0, boss.hp - boss.damage)}/${boss.hp}`}
   </span>
 </div>
 {/* Статус активного игрока: LVL + HP/XP/MP + кошелёк (Habitica-паттерн; у родителей скрыт) */}
 <PlayerStatusBars user={activeUser} />
 {/* 32-Bit HD-2D JRPG Boss Status Bar (Octopath Style) */}
 <div className="hidden lg:flex flex-col items-center justify-center min-w-[280px]"> <div className="jrpg-boss-frame px-6 py-1 flex flex-col items-center w-full shadow-2xl"> <div className="flex items-center gap-2 text-xs font-bold text-slate-100 tracking-wider font-pixel-sub uppercase"> <Shield className="w-3.5 h-3.5 text-amber-400" /> <span className="text-amber-200 drop-shadow">{boss.name}</span> </div> {/* Health Meter with metallic border */} <div className="w-full bg-slate-950/90 h-3.5 rounded-full overflow-hidden border border-amber-500/50 mt-1 relative"> <div className={`h-full transition-colors duration-500 ${ boss.defeated ? 'bg-emerald-500 shadow-md' : 'jrpg-hp-fill' }`} style={{ width: `${bossHpPercent}%` }} /> <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)]"> {boss.defeated ? 'БОСС ПОВЕРЖЕН' : `${Math.max(0, boss.hp - boss.damage)}/${boss.hp} HP`} </span> </div> </div> </div> {/* Десктоп: статус активного игрока рядом с босс-баром */}
 <div className="hidden lg:flex">
   <PlayerStatusBars user={activeUser} />
 </div>
 {/* Right Action Tools: Player Switcher, Skill Button, Sound, Add Task */} <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap justify-end max-w-full"> {/* Player Switcher Tabs */} <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/10 gap-1 overflow-x-auto max-w-full scrollbar-none" style={{maskImage: "linear-gradient(to right, black 92%, transparent 100%)", WebkitMaskImage: "linear-gradient(to right, black 92%, transparent 100%)"}}> {users.map((u) => { const isActive = u.id === activeUser.id; const isWarrior = u.class === 'warrior'; return ( <button key={u.id} onClick={() => onSelectUser(u)} className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 whitespace-nowrap ${ isActive ? isWarrior ? 'bg-blue-600/90 text-white shadow-md shadow-blue-500/20 font-semibold' : 'bg-pink-600/90 text-white shadow-md shadow-pink-500/20 font-semibold' : 'text-slate-400 hover:text-white hover:bg-white/5' }`} > {isWarrior ? ( <Swords className="w-3.5 h-3.5 text-blue-300 shrink-0" /> ) : ( <Wand2 className="w-3.5 h-3.5 text-pink-300 shrink-0" /> )} <span>{u.display_name}</span> <span className="text-[10px] opacity-75 ml-0.5 flex items-center gap-0.5 text-amber-300 font-semibold"> ({u.gold} <Sparkles className="w-2.5 h-2.5 text-amber-400 inline shrink-0" />) </span> </button> ); })} {onOpenRegisterModal && ( <button onClick={onOpenRegisterModal} className="p-2.5 -m-1.5 rounded-lg text-amber-300 hover:text-white hover:bg-amber-500/20 transition flex items-center gap-1 text-xs font-semibold shrink-0 whitespace-nowrap min-h-[44px] min-w-[44px] justify-center" title="Зарегистрировать или добавить нового игрока" aria-label="Добавить игрока" > <UserPlus className="w-3.5 h-3.5 text-amber-400 shrink-0" /> <span className="hidden md:inline">+ Игрок</span> </button> )} {/* Family Settings (Admin Only) */} {onOpenFamilySettings && (activeUser.is_admin || activeUser.family_role === 'parent') && ( <button onClick={onOpenFamilySettings} className="p-2.5 -m-1.5 rounded-lg text-blue-300 hover:text-white hover:bg-blue-500/20 transition flex items-center gap-1 text-xs font-semibold shrink-0 whitespace-nowrap min-h-[44px] min-w-[44px] justify-center" title="Настройки семьи (управление детьми)" aria-label="Настройки семьи" > <Settings className="w-3.5 h-3.5 text-blue-400 shrink-0" /> <span className="hidden md:inline">Семья</span> </button> )} </div>  </div> </div> </header> );
};
