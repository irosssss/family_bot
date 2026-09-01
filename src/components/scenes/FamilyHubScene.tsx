import React, { useState } from 'react';
import { User, Task, Pet, AppState } from '../../types';
import HabiticaAnimatedAvatar from '../HabiticaAnimatedAvatar';
import { getUnifiedLook } from '../../utils/unifiedLook';
import { habiticaPetSprite } from '../../utils/shopLookMap';
import { MessageSquare, Home, Plus, Check } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

/** Фоны комнаты: пользовательский home_bg + LPC интерьеры (ротация) */
const ROOM_BACKGROUNDS = [
  '/assets/game/home_bg.png',
  '/assets/game/backgrounds/lpc_interior/house_room_top.png',
  '/assets/game/backgrounds/lpc_interior/house_room_bottom.png',
  '/assets/game/backgrounds/lpc_interior/house_room_left_2x.png',
  '/assets/game/backgrounds/lpc_interior/house_room_right_2x.png',
];

interface FamilyHubSceneProps {
 appState: AppState;
 activeUser: User;
 onSelectUser: (user: User) => void;
 onCompleteTask?: (taskId: number) => void;
 onOpenAddTask?: () => void;
}

export const FamilyHubScene: React.FC<FamilyHubSceneProps> = ({
 appState,
 activeUser,
 onSelectUser,
 onCompleteTask,
 onOpenAddTask,
}) => {
  const [selectedUserForBubble, setSelectedUserForBubble] = useState<User | null>(null);
  const [bgIndex, setBgIndex] = useState(() => Math.floor(Math.random() * ROOM_BACKGROUNDS.length));

  // Кнопка "Новое дело" + смена фона при нажатии на дом (клик по сцене)
  const cycleBg = () => setBgIndex((i) => (i + 1) % ROOM_BACKGROUNDS.length);

 // Calculate Family Room Cleanliness Level
 const totalTasksDone = appState.completions.length;
 const houseLevel = Math.min(5, Math.floor(totalTasksDone / 10) + 1);

 return (
   <div className="relative w-full rounded-3xl overflow-hidden border-2 border-amber-500/30 bg-slate-950 shadow-2xl transition-[colors,transform,box-shadow]">
     {/* Фон комнаты: cover с позицией top — мебель не режется, пол дорисовывается градиентом */}
     <div
       className="absolute inset-0 bg-no-repeat [image-rendering:pixelated]"
       style={{
         backgroundImage: `url('${ROOM_BACKGROUNDS[bgIndex]}')`,
         backgroundSize: 'cover',
         backgroundPosition: 'center top',
         backgroundColor: '#1a1410'
       }}
     />
     {/* Пол комнаты: тёмный градиент снизу (персонажи стоят на "полу") */}
     <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-[#241a12] via-[#241a12]/85 to-transparent pointer-events-none" />

 {/* Subtle Ambient Vignette Overlay */}
 <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-transparent to-slate-950/80 pointer-events-none" />

 {/* Top Header Information Overlay */}
 <div className="relative z-10 p-3 sm:p-6 flex flex-wrap items-center justify-between gap-3 sm:gap-4 bg-slate-950/80 backdrop-blur-md border-b border-white/10">
 <div className="flex items-center gap-2.5 sm:gap-3">
 <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shadow-lg animate-pulse shrink-0">
 <Home className="w-5 h-5 sm:w-6 sm:h-6" />
 </div>
 <div>
 <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
 <h2 className="text-sm sm:text-lg font-bold text-white font-pixel-sub flex items-center gap-2">
 Семейный дом
 </h2>
 <span className="text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-pixel-sub border border-amber-400/30 whitespace-nowrap">
 Уровень Дома {houseLevel}
 </span>
 </div>
 <p className="text-[11px] sm:text-xs text-slate-400">
 Семейный Общий Хаб • Выполнено дел: {totalTasksDone}
 </p>
 </div>
 </div>

 <div className="flex items-center gap-2">
 {onOpenAddTask && (
 <button
 onClick={() => {
 triggerHaptic('impact', 'light');
 onOpenAddTask();
 }}
 className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] sm:text-xs font-semibold font-pixel-sub flex items-center gap-1 sm:gap-1.5 transition active:scale-95 shadow-md cursor-pointer"
 >
 <Plus className="w-3.5 h-3.5" />
 <span>Новое дело</span>
 </button>
 )}
 </div>
 </div>

 {/* Main Isometric Room Stage */}
 <div className="relative min-h-[360px] sm:min-h-[480px] p-4 sm:p-10 flex flex-col justify-end">
 {/* Family Members: сетка 2x2 на мобиле (375px), ряд на десктопе (UX-аудит P0) */}
 <div className="relative z-10 grid grid-cols-2 sm:flex sm:items-end sm:justify-center gap-6 sm:gap-24 pt-12 pb-4 justify-items-center">
 {appState.users.map((user) => {
 const isCurrent = user.id === activeUser.id;
 const isBubbleOpen = selectedUserForBubble?.id === user.id;

 // Check pending tasks for this user
 const pendingUserTasks = appState.tasks.filter((t) => {
 if (t.done) return false;
 if (user.assignee === 'misha') return t.assignee === 'misha' || t.assignee === 'both';
 if (user.assignee === 'regina') return t.assignee === 'regina' || t.assignee === 'both';
 return true;
 });
 const hasPendingTasks = pendingUserTasks.length > 0;

 // Единый образ персонажа (unifiedLook): habitica_equipped + ULPC-торсы из
          // магазина (маппятся в тиры брони) — один и тот же образ во всех сценах.
          const hLook = getUnifiedLook(user);

 // User's active pet
 const userPetRecord = appState.userPets.find((up) => up.user_id === user.id);
 const petObj = userPetRecord
 ? appState.pets.find((p) => p.id === userPetRecord.pet_id)
 : null;

 return (
 <div 
 key={user.id} 
 className="relative flex flex-col items-center group cursor-pointer"
 >
 {/* Classic RPG Speech Bubble Callout if active/clicked */}
 {isBubbleOpen && (
 <div className="absolute -top-36 sm:-top-40 left-1/2 -translate-x-1/2 z-40 w-60 sm:w-80 max-w-[calc(100vw-24px)] p-3 sm:p-4 rounded-2xl bg-slate-900/95 border-2 border-amber-400 text-white shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
 <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/10">
 <span className="text-xs font-bold text-amber-300 font-pixel-sub flex items-center gap-1.5">
 <MessageSquare className="w-3.5 h-3.5" />
 Задачи: {user.display_name}
 </span>
 <button
 onClick={(e) => {
 e.stopPropagation();
 setSelectedUserForBubble(null);
 }}
 className="text-[10px] text-slate-400 hover:text-white px-2 py-0.5 rounded-lg bg-white/10 transition cursor-pointer"
 >
 Закрыть 
 </button>
 </div>

 <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 text-left">
 {pendingUserTasks.length === 0 ? (
 <p className="text-xs text-slate-400 italic text-center py-2">
 Все квесты выполнены!
 </p>
 ) : (
 pendingUserTasks.map((t) => (
 <div
 key={t.id}
 className="p-2 rounded-xl bg-slate-800/90 border border-amber-500/20 flex items-center justify-between gap-2 hover:border-amber-400/50 transition"
 >
 <div className="min-w-0 flex-1">
 <p className="text-xs font-medium text-slate-100 truncate">{t.title}</p>
 <span className="text-[10px] text-amber-400 font-bold">+{t.points} Золота</span>
 </div>
 {onCompleteTask && (
 <button
 onClick={(e) => {
 e.stopPropagation();
 triggerHaptic('notification', 'success');
 onCompleteTask(t.id);
 }}
 className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold transition shrink-0 active:scale-95 flex items-center gap-1 cursor-pointer"
 >
 <Check className="w-3 h-3" />
 <span>Сдать</span>
 </button>
 )}
 </div>
 ))
 )}
 </div>

 {/* Pointer Arrow pointing down to character */}
 <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-900 border-r-2 border-b-2 border-amber-400 rotate-45" />
 </div>
 )}

 {/* Classic Animated Pixel Exclamation Mark '!' over character head */}
 {hasPendingTasks && !isBubbleOpen && (
 <div
 onClick={(e) => {
 e.stopPropagation();
 triggerHaptic('impact', 'medium');
 setSelectedUserForBubble(user);
 }}
 className="relative z-30 -mb-1 flex flex-col items-center cursor-pointer group-hover:scale-110 transition-transform"
 title="Есть невыполненные квесты! Нажмите, чтобы просмотреть"
 >
 <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-amber-400 border-2 border-slate-950 text-slate-950 font-black flex items-center justify-center text-base sm:text-xl font-pixel-retro shadow-xl animate-pulse">
 !
 </div>
 </div>
 )}

 {/* Character Sprite Container - Transparent (No Gray Boxes) */}
           <div
             onClick={() => {
               triggerHaptic('impact', 'medium');
               // Только пузырь задач. Смена профиля — через селектор в шапке (UX-аудит: 1 тап = 1 действие)
               setSelectedUserForBubble(isBubbleOpen ? null : user);
             }}
             className="relative transition-transform duration-300 transform group-hover:-translate-y-2 flex flex-col items-center justify-end"
           >
 {/* ~35% Enlarged Pixel Sprite — Habitica animated avatar (пивот V3) */}
           <div className="block sm:hidden [image-rendering:pixelated]">
             <HabiticaAnimatedAvatar look={hLook} cls={user.class || 'warrior'} size={110} state="idle" gender={user.gender} />
           </div>
           <div className="hidden sm:block [image-rendering:pixelated]">
             <HabiticaAnimatedAvatar look={hLook} cls={user.class || 'warrior'} size={140} state="idle" gender={user.gender} />
           </div>

 {/* Feet Radial Shadow on Room Floor */}
 <div className="w-16 sm:w-24 h-2.5 sm:h-3 bg-black/40 blur-[2px] rounded-full -mt-1 sm:-mt-2 pointer-events-none" />

 {/* Clean Character Nameplate Badge under feet */}
 <div className={`relative z-20 mt-2 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold whitespace-nowrap shadow-lg backdrop-blur-md transition ${
 isCurrent
 ? 'bg-amber-500/90 text-slate-950 border border-amber-300 font-pixel-sub'
 : 'bg-slate-900/80 text-amber-200 border border-white/10 font-pixel-sub'
 }`}>
 {user.display_name} • Lvl {Math.floor(user.xp / 100) + 1}
 </div>
 </div>

 {/* Питомец-компаньон: сбоку-сзади, без рамок, на одной линии с ногами героя.
     Масштаб ~45% от роста (герой 110/140 → питомец 56/64).
     animate-bounce убран — питомец СТОИТ, а не плавает. */}
 {petObj && (
   <div className="absolute -right-3 sm:-right-6 -bottom-1 sm:bottom-0 z-10 flex flex-col items-center pointer-events-none">
     <img
       src={habiticaPetSprite(petObj.code)}
       alt=""
       draggable={false}
       width="56" height="64"
       className="w-12 h-14 [image-rendering:pixelated] object-contain"
     />
     {/* Тень под ногами питомца */}
     <div className="w-7 h-1.5 bg-black/40 blur-[1px] rounded-full -mt-1 pointer-events-none" />
   </div>
 )}
 </div>
 );
 })}
 </div>
 </div>
 </div>
 );
};


