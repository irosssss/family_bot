import React, { useState } from 'react';
import { User, ShopItem, Pet, AppState } from '../../types';
import { PixelAvatar } from '../PixelAvatar';
import { LayeredAvatar } from '../LayeredAvatar';
import { get32BitAvatarLayers } from '../../utils/rpg32bitAssets';
import { Shirt, Shield, Crown, Wand2, Sparkles, Check, Package, UserCheck, Layers } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface WardrobeCustomizationSceneProps {
  appState: AppState;
  activeUser: User;
  onEquipItem: (itemId: number) => void;
  onBuyItem?: (itemId: number) => void;
}

export const WardrobeCustomizationScene: React.FC<WardrobeCustomizationSceneProps> = ({
  appState,
  activeUser,
  onEquipItem,
  onBuyItem,
}) => {
  const [activeTab, setActiveTab] = useState<'weapon' | 'body' | 'head' | 'pets'>('body');

  const userItems = appState.userItems.filter((ui) => ui.user_id === activeUser.id);
  const equippedItemIds = userItems.filter((ui) => ui.equipped === 1).map((ui) => ui.item_id);

  // Get items based on slot
  const categoryItems = appState.shopItems.filter((item) => {
    if (activeTab === 'weapon') return item.slot === 'weapon' || item.slot === 'shield';
    if (activeTab === 'body') return item.slot === 'body' || item.slot === 'cloak';
    if (activeTab === 'head') return item.slot === 'head';
    return false;
  });

  const equipped = activeUser.equipped || {};
  const layers = get32BitAvatarLayers(activeUser, equipped, null);

  return (
    <div className="relative w-full rounded-3xl overflow-hidden border-2 border-indigo-500/40 bg-slate-950 shadow-2xl transition-all">
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
          <span>Баланс: {activeUser.gold} 💰</span>
        </div>
      </div>

      {/* Main Studio View: Left Mirror Frame + Right Inventory Grid */}
      <div className="relative z-10 p-3 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-8 items-center">
        {/* Left Column: Player Mirror & Live Character Layer Assembly */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-900/90 backdrop-blur-md rounded-2xl sm:rounded-3xl border-2 border-indigo-500/30 shadow-2xl relative">
          <div className="absolute top-2.5 left-3 text-[9px] sm:text-[10px] uppercase font-bold text-indigo-300 font-pixel-sub flex items-center gap-1">
            <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-indigo-400" />
            <span>Зеркало Персонажа</span>
          </div>

          <div className="my-3 sm:my-6 relative">
            <div className="absolute -inset-4 rounded-full bg-indigo-500/20 blur-xl animate-pulse" />
            <div className="block sm:hidden">
              <LayeredAvatar layers={layers} size={110} animated={true} />
            </div>
            <div className="hidden sm:block">
              <LayeredAvatar layers={layers} size={160} animated={true} />
            </div>
          </div>

          <div className="text-center space-y-0.5 sm:space-y-1">
            <h3 className="text-sm sm:text-base font-bold text-white font-pixel-sub">
              {activeUser.display_name}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-400">
              {activeUser.class === 'warrior' ? 'Воин' : 'Маг'} • Уровень {Math.floor(activeUser.xp / 100) + 1}
            </p>
          </div>
        </div>

        {/* Right Column: Wardrobe Inventory Tabs & Items Grid */}
        <div className="lg:col-span-7 space-y-3 sm:space-y-4">
          {/* Inventory Category Tabs */}
          <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-white/10">
            <button
              onClick={() => {
                triggerHaptic('impact', 'light');
                setActiveTab('body');
              }}
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
              onClick={() => {
                triggerHaptic('impact', 'light');
                setActiveTab('weapon');
              }}
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
              onClick={() => {
                triggerHaptic('impact', 'light');
                setActiveTab('head');
              }}
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
              onClick={() => {
                triggerHaptic('impact', 'light');
                setActiveTab('pets');
              }}
              className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold font-pixel-sub transition flex items-center gap-1 sm:gap-1.5 shrink-0 ${
                activeTab === 'pets'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                  : 'bg-white/5 text-slate-400 hover:text-white'
              }`}
            >
              <span>Питомцы</span>
            </button>
          </div>

          {/* Items Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[320px] overflow-y-auto p-1 pr-2">
            {activeTab !== 'pets' ? (
              categoryItems.map((item) => {
                const isOwned = userItems.some((ui) => ui.item_id === item.id);
                const isEquipped = equippedItemIds.includes(item.id);

                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-2xl border transition flex flex-col justify-between ${
                      isEquipped
                        ? 'bg-indigo-600/20 border-indigo-400 shadow-lg shadow-indigo-500/20'
                        : isOwned
                        ? 'bg-slate-900/90 border-slate-700 hover:border-indigo-500/50'
                        : 'bg-slate-950/60 border-slate-800 opacity-80'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.title} className="w-8 h-8 object-contain" />
                      ) : null}
                      <div>
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
                        className="w-full py-1.5 rounded-xl bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center gap-1"
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
                        className="w-full py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 text-[10px] font-bold"
                      >
                        Надеть
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          triggerHaptic('impact', 'medium');
                          if (onBuyItem) onBuyItem(item.id);
                        }}
                        className="w-full py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 text-[10px] font-bold"
                      >
                        Купить ({item.cost} Золота)
                      </button>
                    )}
                  </div>
                );
              })
            ) : (
              appState.pets.map((pet) => (
                <div
                  key={pet.id}
                  className="p-3 rounded-2xl border border-amber-500/30 bg-slate-900/90 flex items-center gap-3"
                >
                  {pet.imageUrl ? (
                    <img src={pet.imageUrl} alt={pet.title} className="w-8 h-8 object-contain" />
                  ) : null}
                  <div>
                    <p className="text-xs font-bold text-amber-200">{pet.title}</p>
                    <span className="text-[10px] text-slate-400">Питомец-компаньон</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

