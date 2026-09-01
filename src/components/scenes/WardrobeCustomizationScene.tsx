import React, { useState, useMemo, useEffect, useRef } from 'react';
import { User, ShopItem, Pet, AppState } from '../../types';
import HabiticaAnimatedAvatar from '../HabiticaAnimatedAvatar';
import { HabiticaLook } from '../../utils/habiticaAssets';
import { getUnifiedLook } from '../../utils/unifiedLook';
import { applyItemLook, habiticaItemIcon, habiticaPetSprite, ULPC_TORSO_TIER } from '../../utils/shopLookMap';
import { Shirt, Shield, Crown, Wand2, Sparkles, Check, X, Package, PawPrint, Star } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface WardrobeCustomizationSceneProps {
 appState: AppState;
 activeUser: User;
 onEquipItem: (itemId: number) => void;
 onBuyItem?: (itemId: number) => void;
 /** Выбрать питомца-компаньона (POST /api/zoo/active) */
 onSetActivePet?: (petId: number) => void;
}

/** Кадр 0 выбранного ряда спрайтшита → квадратная иконка (без «полосатых» превью). */
const SheetThumb: React.FC<{ src?: string; size?: number; row?: number; className?: string }> = ({
 src, size = 40, row = 2, className = '',
}) => {
 const ref = useRef<HTMLCanvasElement>(null);
 useEffect(() => {
   const canvas = ref.current;
   if (!canvas || !src) return;
   let dead = false;
   const img = new Image();
   img.onload = () => {
     if (dead) return;
     const ctx = canvas.getContext('2d');
     if (!ctx) return;
     ctx.imageSmoothingEnabled = false;
     ctx.clearRect(0, 0, canvas.width, canvas.height);
     const fw = img.width / Math.round(img.width / 64);
     const rows = Math.round(img.height / 64);
     const r = Math.min(row, rows - 1);
     ctx.drawImage(img, 0, r * 64, fw, 64, 0, 0, canvas.width, canvas.height);
   };
   img.src = src;
   return () => { dead = true; };
 }, [src, row]);
 if (!src) return null;
 return <canvas ref={ref} width={size} height={size} className={`[image-rendering:pixelated] shrink-0 ${className}`} />;
};

export const WardrobeCustomizationScene: React.FC<WardrobeCustomizationSceneProps> = ({
 appState,
 activeUser,
 onEquipItem,
 onBuyItem,
 onSetActivePet,
}) => {
 const [activeTab, setActiveTab] = useState<'weapon' | 'body' | 'head' | 'pets'>('body');
 // Превью до покупки (UX-аудит P1): выбранный некупленный предмет показывается на персонаже,
 // покупка подтверждается только после явного «Купить» — никакого «кота в мешке».
 const [previewItemId, setPreviewItemId] = useState<number | null>(null);

 const userItems = appState.userItems.filter((ui) => ui.user_id === activeUser.id);
 const equippedItemIds = userItems.filter((ui) => ui.equipped === 1).map((ui) => ui.item_id);

 // Get items based on slot
 const categoryItems = appState.shopItems.filter((item) => {
  if (activeTab === 'weapon') return item.slot === 'weapon' || item.slot === 'shield';
  if (activeTab === 'body') return item.slot === 'body' || item.slot === 'cloak';
  if (activeTab === 'head') return item.slot === 'head';
  return false;
 });

 // Коды надетых предметов (для маппинга «предмет → образ»)
 const equippedCodes = (activeUser as any).equipped_codes || {};
 // Предмет в режиме примерки
 const previewItem = previewItemId != null ? categoryItems.find((i) => i.id === previewItemId) || null : null;

 // === Образ зеркала: единый look приложения + тиры надетых предметов + живая примерка ===
 const hLook = useMemo(() => {
   let base: HabiticaLook = getUnifiedLook(activeUser);
   // Тиры надетых предметов (weapon/shield/head, старые 16-bit брони)
   base = applyItemLook(base, equippedCodes.weapon);
   base = applyItemLook(base, equippedCodes.shield);
   base = applyItemLook(base, equippedCodes.head);
   // body: ULPC-торсы не входят в ITEM_LOOK_MAP (их тир поднимает getUnifiedLook),
   // старые 16-bit брони — входят; applyItemLook сам игнорирует неизвестные коды.
   base = applyItemLook(base, equippedCodes.body);
   // Живая примерка: предмет в примерке перекрывает свой слот
   if (previewItem) {
     base = applyItemLook(base, previewItem.code);
     // ULPC-торсы не входят в ITEM_LOOK_MAP — их тир поднимаем по ULPC_TORSO_TIER
     const ut = ULPC_TORSO_TIER[previewItem.code];
     if (ut != null && (base.armorTier ?? 0) < ut) base.armorTier = ut;
   }
   return base;
 }, [activeUser, previewItem, equippedCodes]);

 // Питомцы: свои (владельцы) + активный
 const myPets = appState.userPets.filter((up) => up.user_id === activeUser.id);
 const myPetIds = new Set(myPets.map((up) => up.pet_id));
 const activePetId = myPets.find((up) => up.is_active)?.pet_id ?? null;

 // Сброс примерки при смене вкладки
 const changeTab = (tab: typeof activeTab) => {
   triggerHaptic('impact', 'light');
   setPreviewItemId(null);
   setActiveTab(tab);
 };

 return (
 <div className="relative w-full rounded-3xl overflow-hidden border-2 border-indigo-500/40 bg-slate-950 shadow-2xl transition-[colors,transform,box-shadow]">
 {/* Real Game Background Image: /assets/game/wardrobe_bg.png */}
 <div
   className="absolute inset-0 bg-cover bg-center bg-no-repeat"
   style={{
     backgroundImage: `url('/assets/game/wardrobe_bg.png')`,
     backgroundSize: 'cover',
     backgroundColor: '#0f172a'
   }}
 />

 {/* Mirror Room Vignette Overlay */}
 <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/70 via-slate-950/80 to-slate-950/90 pointer-events-none" />

 {/* Top Header */}
 <div className="relative z-10 p-3 sm:p-6 flex flex-wrap items-center justify-between gap-3 bg-slate-950/80 backdrop-blur-md border-b border-indigo-500/30">
 <div className="flex items-center gap-2.5 sm:gap-3">
 <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-300 shadow-lg shrink-0">
 <Shirt className="w-5 h-5 sm:w-6 sm:h-6" />
 </div>
 <div>
 <h2 className="text-sm sm:text-lg font-bold text-white font-pixel-sub flex items-center gap-2">
   Гардероб и кастомизация
 </h2>
 <p className="text-[11px] sm:text-xs text-slate-400">
   Сборка персонажа • Персональные настройки стиля
 </p>
 </div>
 </div>

 <div className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-amber-400/10 border border-amber-400/30 text-[11px] sm:text-xs font-bold text-amber-300 shrink-0">
 <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
 <span>Баланс: {activeUser.gold} </span>
 </div>
 </div>

 {/* Main Studio View: Left Mirror Frame + Right Inventory Grid */}
 <div className="relative z-10 p-3 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-8 items-start">
 {/* Left Column: Player Mirror — sticky на мобиле, чтобы примерка всегда в поле зрения */}
 <div className="lg:col-span-5 flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-900/90 backdrop-blur-md rounded-2xl sm:rounded-3xl border-2 border-indigo-500/30 shadow-2xl relative lg:sticky lg:top-2">
 <div className="absolute top-2.5 left-3 text-[9px] sm:text-[10px] uppercase font-bold text-indigo-300 font-pixel-sub flex items-center gap-1">
 <Shirt className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-indigo-400" />
 <span>Зеркало Персонажа</span>
 </div>

 {previewItem && (
   <div className="absolute top-2.5 right-3 flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[9px] sm:text-[10px] font-bold uppercase">
     Примерка: {previewItem.title}
   </div>
 )}

 <div className="my-3 sm:my-6 relative">
 <div className="absolute -inset-4 rounded-full bg-indigo-500/20 blur-xl animate-pulse" />
 {/* Зеркало: единый Habitica-персонаж (дизайн-канон — один стиль ассетов) */}
 <HabiticaAnimatedAvatar look={hLook} cls={activeUser.class || 'warrior'} size={150} state="idle" />
 </div>

 {/* Активный питомец-компаньон у ног (как в хабе) */}
 {(() => {
   const ap = activePetId != null ? appState.pets.find((p) => p.id === activePetId) : null;
   return ap ? (
     <div className="mb-2 flex items-center gap-2">
       <img src={habiticaPetSprite(ap.code)} alt="" className="w-10 h-12 [image-rendering:pixelated] object-contain" draggable={false} />
       <span className="text-[10px] text-slate-400">Рядом: {ap.title}</span>
     </div>
   ) : null;
 })()}

 <div className="text-center space-y-0.5 sm:space-y-1">
 <h3 className="text-sm sm:text-base font-bold text-white font-pixel-sub">
 {activeUser.display_name}
 </h3>
 <p className="text-[11px] sm:text-xs text-slate-400">
 {activeUser.class === 'warrior' ? 'Воин' : 'Маг'} • Уровень {Math.floor(activeUser.xp / 100) + 1}
 </p>
 </div>

 {/* Панель управления примеркой: только когда предмет выбран для покупки */}
 {previewItem && (
   <div className="w-full mt-3 sm:mt-4 flex items-center gap-2">
     <button
       onClick={() => {
         triggerHaptic('notification', 'success');
         if (onBuyItem) onBuyItem(previewItem.id);
         setPreviewItemId(null);
       }}
       className="flex-1 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 transition text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/30"
     >
       <Package className="w-3.5 h-3.5" />
       Купить за {previewItem.cost}
     </button>
     <button
       onClick={() => {
         triggerHaptic('impact', 'light');
         setPreviewItemId(null);
       }}
       className="min-h-[44px] px-4 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 transition text-slate-300 text-xs font-bold flex items-center justify-center gap-1 border border-white/10"
     >
       <X className="w-3.5 h-3.5" />
       Отмена
     </button>
   </div>
 )}
 </div>

 {/* Right Column: Wardrobe Inventory Tabs & Items Grid */}
 <div className="lg:col-span-7 space-y-3 sm:space-y-4">
 {/* Inventory Category Tabs */}
 <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-white/10">
 <button
 onClick={() => changeTab('body')}
 className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold font-pixel-sub transition flex items-center gap-1 sm:gap-1.5 shrink-0 ${
 activeTab === 'body'
 ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
 : 'bg-white/5 text-slate-400 hover:text-white'
 }`}
 >
 <Shirt className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
 <span>Одежда</span>
 </button>

 <button
 onClick={() => changeTab('weapon')}
 className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold font-pixel-sub transition flex items-center gap-1 sm:gap-1.5 shrink-0 ${
 activeTab === 'weapon'
 ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
 : 'bg-white/5 text-slate-400 hover:text-white'
 }`}
 >
 <Wand2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
 <span>Оружие</span>
 </button>

 <button
 onClick={() => changeTab('head')}
 className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold font-pixel-sub transition flex items-center gap-1 sm:gap-1.5 shrink-0 ${
 activeTab === 'head'
 ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
 : 'bg-white/5 text-slate-400 hover:text-white'
 }`}
 >
 <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
 <span>Шляпы</span>
 </button>

 <button
 onClick={() => changeTab('pets')}
 className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold font-pixel-sub transition flex items-center gap-1 sm:gap-1.5 shrink-0 ${
 activeTab === 'pets'
 ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
 : 'bg-white/5 text-slate-400 hover:text-white'
 }`}
 >
 <PawPrint className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
 <span>Питомцы</span>
 </button>
 </div>

 {/* Items Grid */}
 <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 lg:max-h-[480px] lg:overflow-y-auto p-1 pr-2">
 {activeTab !== 'pets' ? (
 categoryItems.map((item) => {
 const isOwned = userItems.some((ui) => ui.item_id === item.id);
 const isEquipped = equippedItemIds.includes(item.id);
 const isPreviewing = previewItemId === item.id;

 return (
 <div
 key={item.id}
 className={`p-3 rounded-2xl border transition flex flex-col justify-between ${
 isEquipped
 ? 'bg-indigo-600/20 border-indigo-400 shadow-lg shadow-indigo-500/20'
 : isPreviewing
   ? 'bg-amber-500/15 border-amber-400 shadow-lg shadow-amber-500/20'
   : isOwned
     ? 'bg-slate-900/90 border-slate-700 hover:border-indigo-500/50'
     : 'bg-slate-950/60 border-slate-800 opacity-80'
 }`}
 >
 <div className="flex items-center gap-2 mb-2">
 {/* Иконка: Habitica-спрайт того же тира, что надевается (единый стиль) */}
 <img src={habiticaItemIcon(item.code, item.slot)} alt="" className="w-9 h-9 [image-rendering:pixelated] object-contain shrink-0" draggable={false} />
 <div className="min-w-0">
 <p className="text-xs font-semibold text-slate-100 truncate">{item.title}</p>
 <span className="text-[10px] text-slate-400">{item.slot}</span>
 </div>
 </div>

 {isEquipped ? (
 <button
 onClick={() => {
 triggerHaptic('impact', 'medium');
 onEquipItem(item.id);
 }}
 className="w-full py-2.5 min-h-[44px] rounded-xl bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center gap-1"
 >
 <Check className="w-3 h-3" />
 <span>Надето</span>
 </button>
 ) : isOwned ? (
 <button
 onClick={() => {
 triggerHaptic('impact', 'medium');
 onEquipItem(item.id);
 }}
 className="w-full py-2.5 min-h-[44px] rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 active:scale-95 transition text-indigo-200 border border-indigo-500/40 text-[10px] font-bold"
 >
 Надеть
 </button>
 ) : (
 <div className="flex items-center gap-1.5">
   {isPreviewing ? (
     <>
       <button
         onClick={() => {
           triggerHaptic('notification', 'success');
           if (onBuyItem) onBuyItem(item.id);
           setPreviewItemId(null);
         }}
         className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 transition text-slate-950 text-[10px] font-bold flex items-center justify-center gap-1"
       >
         <Package className="w-3 h-3" />
         Купить
       </button>
       <button
         onClick={() => {
           triggerHaptic('impact', 'light');
           setPreviewItemId(null);
         }}
         className="p-2.5 min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 transition text-slate-400 border border-white/10"
         aria-label="Отменить примерку"
       >
         <X className="w-3.5 h-3.5" />
       </button>
     </>
   ) : (
     <button
       onClick={() => {
         triggerHaptic('impact', 'medium');
         setPreviewItemId(item.id);
       }}
       className="w-full py-2.5 min-h-[44px] rounded-xl bg-amber-500/20 hover:bg-amber-500/30 active:scale-95 transition text-amber-300 border border-amber-400/40 text-[10px] font-bold flex items-center justify-center gap-1"
     >
       Примерка (бесплатно)
       </button>
   )}
 </div>
 )}
 </div>
 );
 })
 ) : (
 <>
 {appState.pets.map((pet) => {
   const owned = myPetIds.has(pet.id);
   const isActive = activePetId === pet.id;
   return (
   <div
   key={pet.id}
   className={`p-3 rounded-2xl border flex flex-col justify-between ${
     isActive
       ? 'border-emerald-400 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
       : owned
         ? 'border-amber-500/30 bg-slate-900/90'
         : 'border-slate-800 bg-slate-950/60 opacity-75'
   }`}
   >
   <div className="flex items-center gap-2 mb-2">
   <img src={habiticaPetSprite(pet.code)} alt="" className="w-10 h-12 [image-rendering:pixelated] object-contain" draggable={false} />
   <div className="min-w-0">
   <p className="text-xs font-bold text-amber-200 truncate">{pet.title}</p>
   <span className="text-[10px] text-slate-400">
     {isActive ? 'Активный компаньон' : owned ? 'Живёт в зоопарке' : 'Ещё не вылупился'}
   </span>
   </div>
   </div>
   {owned && onSetActivePet && (
     isActive ? (
       <div className="w-full py-2.5 min-h-[44px] rounded-xl bg-emerald-500/20 text-emerald-300 text-[10px] font-bold flex items-center justify-center gap-1">
         <Check className="w-3.5 h-3.5" />
         <span>С тобой</span>
       </div>
     ) : (
       <button
         onClick={() => {
           triggerHaptic('notification', 'success');
           onSetActivePet(pet.id);
         }}
         className="w-full py-2.5 min-h-[44px] rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 active:scale-95 transition text-emerald-200 border border-emerald-500/40 text-[10px] font-bold flex items-center justify-center gap-1"
       >
         <Star className="w-3.5 h-3.5" />
         Взять с собой
       </button>
     )
   )}
   </div>
   );
 })}
 </>
 )}
 </div>
 </div>
 </div>
 </div>
 );
};
