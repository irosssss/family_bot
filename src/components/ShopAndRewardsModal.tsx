import React, { useState } from 'react';
import { Reward, ShopItem, Pet, Achievement, User, ClassKey, GenderKey } from '../types';
import { X, Gift, ShoppingBag, PawPrint, Trophy, Shirt, Check, Swords, Wand2, Coins, Sparkles, UserCheck, Eye, ShieldAlert, Lock } from 'lucide-react';
import { CLASSES_CONFIG } from '../data/initialData';
import { RenderEnvironmentBg } from './legacy/PixelAvatar';
import { ConfirmModal } from './ConfirmModal';
import { habiticaItemIcon, applyItemLook, ULPC_TORSO_TIER } from '../utils/shopLookMap';
import { getUnifiedLook } from '../utils/unifiedLook';
import HabiticaAnimatedAvatar from './HabiticaAnimatedAvatar';
import { DEFAULT_LOOKS } from '../utils/habiticaAssets';
import { PetsTab } from './PetsTab';
import { ArmoireTab } from './ArmoireTab';

interface ShopAndRewardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'rewards' | 'shop' | 'pets' | 'achievements' | 'class' | 'wardrobe';
  activeUser: User;
  rewards: Reward[];
  shopItems: ShopItem[];
  pets: Pet[];
  achievements: Achievement[];
  userItems: { user_id: number; item_id: number; equipped: number }[];
  userPets: { user_id: number; pet_id: number }[];
  onBuyReward: (rewardId: number) => void;
  onBuyShopItem: (itemId: number) => void;
  onEquipItem: (itemId: number) => void;
  onSelectClass: (className: ClassKey) => void;
  onToggleGender?: (gender: GenderKey) => void;
  onOpenAddRewardModal: () => void;
  onPetsChanged?: () => void;
}

export const ShopAndRewardsModal: React.FC<ShopAndRewardsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'rewards',
  activeUser,
  rewards,
  shopItems,
  pets,
  achievements,
  userItems,
  userPets,
  onBuyReward,
  onBuyShopItem,
  onEquipItem,
  onSelectClass,
  onToggleGender,
    onOpenAddRewardModal,
    onPetsChanged,
  }) => {
  const [tab, setTab] = useState<'rewards' | 'shop' | 'pets' | 'achievements' | 'class' | 'wardrobe'>(initialTab);
  const [shopCategoryFilter, setShopCategoryFilter] = useState<'all' | 'weapon' | 'shield' | 'head' | 'body' | 'cloak' | 'accessory' | 'mount' | 'background'>('all');
  const [wardrobeSlotFilter, setWardrobeSlotFilter] = useState<'all' | 'weapon' | 'shield' | 'head' | 'body' | 'cloak' | 'accessory' | 'mount' | 'background'>('all');
  const [rewardToConfirm, setRewardToConfirm] = useState<Reward | null>(null);
  const [shopItemToConfirm, setShopItemToConfirm] = useState<ShopItem | null>(null);
  const [previewItem, setPreviewItem] = useState<ShopItem | null>(null);

  if (!isOpen) return null;

  const userOwnedItemIds = userItems
    .filter((ui) => ui.user_id === activeUser.id)
    .map((ui) => ui.item_id);

  const userEquippedItemIds = userItems
    .filter((ui) => ui.user_id === activeUser.id && ui.equipped === 1)
    .map((ui) => ui.item_id);

  // Compute current equipped items for live fitting stage preview
  const currentEquippedHeadItem = shopItems.find(
    (item) => item.slot === 'head' && userEquippedItemIds.includes(item.id)
  );
  const currentEquippedWeaponItem = shopItems.find(
    (item) => item.slot === 'weapon' && userEquippedItemIds.includes(item.id)
  );
  const currentEquippedShieldItem = shopItems.find(
    (item) => item.slot === 'shield' && userEquippedItemIds.includes(item.id)
  );
  const currentEquippedBodyItem = shopItems.find(
    (item) => item.slot === 'body' && userEquippedItemIds.includes(item.id)
  );
  const currentEquippedCloakItem = shopItems.find(
    (item) => item.slot === 'cloak' && userEquippedItemIds.includes(item.id)
  );
  const currentEquippedAccessoryItem = shopItems.find(
    (item) => item.slot === 'accessory' && userEquippedItemIds.includes(item.id)
  );
  const currentEquippedMountItem = shopItems.find(
    (item) => item.slot === 'mount' && userEquippedItemIds.includes(item.id)
  );
  const currentEquippedBackgroundItem = shopItems.find(
    (item) => item.slot === 'background' && userEquippedItemIds.includes(item.id)
  );

  const renderFittingStage = () => {
    // Единый образ + живая примерка (тот же персонаж, что везде)
    const fittingLook = previewItem
      ? applyItemLook(getUnifiedLook(activeUser), previewItem.code)
      : getUnifiedLook(activeUser);
    return (
      <div className="relative w-full bg-slate-950/90 rounded-2xl p-4 border border-blue-500/40 shadow-xl overflow-hidden flex flex-col items-center justify-center gap-3 min-h-[170px] mb-4">
        {/* Background in fitting stage */}
        <RenderEnvironmentBg
          bgItem={
            previewItem?.slot === 'background'
              ? previewItem.code
              : currentEquippedBackgroundItem?.code
          }
        />

        <div className="relative z-10 flex items-center justify-between w-full text-xs font-bold px-2">
          <span className="text-amber-300 font-pixel-sub flex items-center gap-1.5 bg-black/75 px-3 py-1 rounded-xl border border-white/10 shadow-md">
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            {previewItem ? (
              <span>
                Примерка: <span className="text-white font-bold">{previewItem.title}</span> {previewItem.emoji ? `(${previewItem.emoji})` : ''}
              </span>
            ) : (
              <span>Примерочная героя (Твой текущий образ)</span>
            )}
          </span>

          {previewItem && (
            <button
              onClick={() => setPreviewItem(null)}
              className="text-[11px] text-slate-300 hover:text-white bg-black/75 hover:bg-black/95 px-2.5 py-1 rounded-xl border border-white/15 transition cursor-pointer"
            >
              Сбросить примерку
            </button>
          )}
        </div>

        {/* Live Character Avatar */}
        <div className="relative z-10 my-1">
          <HabiticaAnimatedAvatar
            look={fittingLook}
            cls={activeUser.class || 'warrior'}
            size={120}
            state="idle"
          />
        </div>

        {/* Action button inside fitting stage */}
        {previewItem && (
          <div className="relative z-10 flex items-center gap-2">
            {userOwnedItemIds.includes(previewItem.id) ? (
              <button
                onClick={() => {
                  onEquipItem(previewItem.id);
                  setPreviewItem(null);
                }}
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg transition flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4 text-emerald-300" />
                <span>{userEquippedItemIds.includes(previewItem.id) ? 'Уже надето' : 'Надеть этот предмет'}</span>
              </button>
            ) : (
              <button
                disabled={activeUser.gold < previewItem.cost}
                onClick={() => {
                  setShopItemToConfirm(previewItem);
                }}
                className={`px-4 py-1.5 rounded-xl font-bold text-xs shadow-lg transition flex items-center gap-1.5 ${
                  activeUser.gold >= previewItem.cost
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <span>Купить за {previewItem.cost} золота</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const userOwnedPetIds = userPets
    .filter((up) => up.user_id === activeUser.id)
    .map((up) => up.pet_id);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      {/* Confirm Reward Purchase Modal */}
      <ConfirmModal
        isOpen={!!rewardToConfirm}
        onClose={() => setRewardToConfirm(null)}
        onConfirm={() => {
          if (rewardToConfirm) {
            onBuyReward(rewardToConfirm.id);
            setRewardToConfirm(null);
          }
        }}
        title="Подтверждение покупки награды"
        description={
          rewardToConfirm
            ? `Вы уверены, что хотите приобрести награду «${rewardToConfirm.title}» за ${rewardToConfirm.cost} золота?`
            : ''
        }
        confirmText="Да, купить"
        cancelText="Отмена"
        badgeText={rewardToConfirm ? `Спишется: ${rewardToConfirm.cost} золота` : undefined}
        iconType="reward"
      />

      {/* Confirm Shop Item Purchase Modal */}
      <ConfirmModal
        isOpen={!!shopItemToConfirm}
        onClose={() => setShopItemToConfirm(null)}
        onConfirm={() => {
          if (shopItemToConfirm) {
            onBuyShopItem(shopItemToConfirm.id);
            setShopItemToConfirm(null);
          }
        }}
        title="Подтверждение покупки предмета"
        description={
          shopItemToConfirm
            ? `Вы уверены, что хотите купить «${shopItemToConfirm.emoji || ''} ${shopItemToConfirm.title}» за ${shopItemToConfirm.cost} золота?`
            : ''
        }
        confirmText="Да, купить"
        cancelText="Отмена"
        badgeText={shopItemToConfirm ? `Спишется: ${shopItemToConfirm.cost} золота` : undefined}
        iconType="shop"
      />

      <div className="bg-[#171c28] border-t sm:border border-white/15 rounded-t-3xl sm:rounded-2xl w-full max-w-3xl max-h-[90vh] sm:max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up sm:animate-none">
        {/* Mobile Drag/Grab Handle Bar */}
        <div className="w-12 h-1 bg-white/20 rounded-full mx-auto my-2 shrink-0 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3 min-w-0">
            <ShoppingBag className="w-6 h-6 text-amber-300 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                Магазин и Награды
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs text-slate-400">
                <span>Баланс:</span>
                <span className="font-bold text-amber-300 flex items-center gap-1 shrink-0">
                  <Coins className="w-3.5 h-3.5 text-amber-400 inline" />
                  {activeUser.gold} золота
                </span>
                <span className="hidden sm:inline">•</span>
                <span className="truncate max-w-[120px] sm:max-w-none">
                  Игрок: {activeUser.display_name}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition shrink-0 ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center overflow-x-auto gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 border-b border-white/10 bg-black/30 text-xs scrollbar-none">
          <button
            onClick={() => setTab('rewards')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition whitespace-nowrap shrink-0 ${
              tab === 'rewards'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Gift className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Награды</span>
          </button>

          <button
            onClick={() => setTab('shop')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition whitespace-nowrap shrink-0 ${
              tab === 'shop'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>Лавка вещей</span>
          </button>

          <button
            onClick={() => setTab('wardrobe')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition whitespace-nowrap shrink-0 ${
              tab === 'wardrobe'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Shirt className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>Гардероб</span>
          </button>

          <button
            onClick={() => setTab('pets')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition whitespace-nowrap shrink-0 ${
              tab === 'pets'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <PawPrint className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Питомцы</span>
          </button>

          <button
            onClick={() => setTab('achievements')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition whitespace-nowrap shrink-0 ${
              tab === 'achievements'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span>Достижения</span>
          </button>

          <button
            onClick={() => setTab('class')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition whitespace-nowrap shrink-0 ${
              tab === 'class'
                ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-pink-400 shrink-0" />
            <span>Выбор класса</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* TAB 1: Rewards */}
          {tab === 'rewards' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Реальные награды за золото</h3>
                  <p className="text-xs text-slate-400">
                    Купленная награда списывает золото и уведомляет партнёра.
                  </p>
                </div>
                <button
                  onClick={onOpenAddRewardModal}
                  className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-xl transition"
                >
                  + Своя награда
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {rewards.map((reward) => {
                  const canAfford = activeUser.gold >= reward.cost;
                  return (
                    <div
                      key={reward.id}
                      className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-3 hover:bg-white/10 transition"
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">{reward.title}</p>
                        <span className="text-[11px] text-slate-400 capitalize">
                          {reward.reward_type === 'personal' ? 'Личная награда' : 'Совместная награда'}
                        </span>
                      </div>

                      <button
                        disabled={!canAfford}
                        onClick={() => setRewardToConfirm(reward)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                          canAfford
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 cursor-pointer'
                            : 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5'
                        }`}
                      >
                        <span>{reward.cost}</span>
                        <Coins className="w-3.5 h-3.5 text-amber-400" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: Equipment Shop */}
                    {tab === 'shop' && (
                      <div className="space-y-4">
                        {/* Этап 8.2: Волшебный сундук */}
                        <ArmoireTab activeUser={activeUser} onOpen={onPetsChanged} />

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white">Лавка экипировки & Фонов RPG</h3>
                  <p className="text-xs text-slate-400">
                    Покупайте мечи, короны, мантии и волшебные фоны окружения для своего аватара!
                  </p>
                </div>
              </div>

              {/* Character Live Fitting Stage */}
              {renderFittingStage()}

              {/* Shop Slot Category Filters */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
                {[
                  { key: 'all', label: 'Все' },
                  { key: 'weapon', label: 'Оружие' },
                  { key: 'shield', label: 'Щиты' },
                  { key: 'head', label: 'Голова' },
                  { key: 'body', label: 'Одежда' },
                  { key: 'cloak', label: 'Плащи' },
                  { key: 'accessory', label: 'Аксессуары' },
                  { key: 'mount', label: 'Верховые' },
                  { key: 'background', label: 'Фоны' },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setShopCategoryFilter(f.key as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                      shopCategoryFilter === f.key
                        ? 'bg-blue-500 text-white shadow-md'
                        : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Stars IAP Button */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-blue-900/50 to-indigo-900/50 border border-blue-500/30">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-amber-300">Мешок Золота (1000 золота)</span>
                  <span className="text-xs text-blue-200">Через Telegram Stars</span>
                </div>
                <button 
                  onClick={() => alert("Интеграция Telegram.WebApp.openInvoice('...')")}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-lg shadow-blue-500/20"
                >
                  Купить за 50 кристаллов
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {shopItems
                  .filter((item) =>
                    shopCategoryFilter === 'all' ? true : item.slot === shopCategoryFilter
                  )
                  .map((item) => {
                    const isOwned = userOwnedItemIds.includes(item.id);
                    const isEquipped = userEquippedItemIds.includes(item.id);
                    const isPreviewing = previewItem?.id === item.id;
                    const canAfford = activeUser.gold >= item.cost;

                    const slotLabels: Record<string, string> = {
                      weapon: 'Оружие',
                      shield: 'Щит / 2-я рука',
                      head: 'Голова',
                      body: 'Одежда',
                      cloak: 'Плащ / Крылья',
                      accessory: 'Аксессуар',
                      mount: 'Верховое',
                      background: 'Фон окружения',
                    };

                    return (
                      <div
                        key={item.id}
                        className={`p-3.5 rounded-2xl border transition flex flex-col justify-between gap-3 ${
                          isPreviewing
                            ? 'bg-purple-950/60 border-purple-400 ring-2 ring-purple-500/40'
                            : isEquipped
                            ? 'bg-blue-950/40 border-blue-500/50'
                            : isOwned
                            ? 'bg-white/10 border-white/20'
                            : 'bg-white/5 border-white/10'
                        }`}
                      >
                        {/* Background Thumbnail Preview if background slot */}
                        {item.slot === 'background' ? (
                          <div className="relative w-full h-24 rounded-xl overflow-hidden border border-white/10 bg-slate-950 shadow-inner">
                            <RenderEnvironmentBg bgItem={item.imageUrl || item.code} />
                            <div className="absolute inset-0 bg-black/20" />
                            <div className="absolute bottom-1 right-2 text-xl font-bold px-1.5 py-0.5 rounded bg-black/70 border border-white/10 text-white flex items-center gap-1">
                              <span>{item.emoji}</span>
                            </div>
                          </div>
                        ) : null}

                        <div className="flex items-center gap-3">
                          {item.slot !== 'background' && (
                            <img src={habiticaItemIcon(item.code, item.slot)} alt="" className="w-10 h-10 [image-rendering:pixelated] object-contain" draggable={false} />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate">{item.title}</p>
                            <span className="text-[11px] text-slate-400 capitalize">
                              Слот: {slotLabels[item.slot] || item.slot}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-white/5 gap-2">
                          <span className="text-xs font-bold text-amber-300">{item.cost} золота</span>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setPreviewItem(item)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 border cursor-pointer ${
                                isPreviewing
                                  ? 'bg-purple-600 border-purple-400 text-white shadow-md'
                                  : 'bg-white/10 hover:bg-white/20 border-white/15 text-slate-200'
                              }`}
                              title="Примерить на аватаре"
                            >
                              <Eye className="w-3.5 h-3.5 text-amber-300" />
                              <span>Примерка</span>
                            </button>

                            {isOwned ? (
                              <button
                                onClick={() => onEquipItem(item.id)}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer ${
                                  isEquipped
                                    ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/50'
                                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                                }`}
                              >
                                {isEquipped ? 'Надето' : 'Надеть'}
                              </button>
                            ) : (
                              <button
                                disabled={!canAfford}
                                onClick={() => setShopItemToConfirm(item)}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                                  canAfford
                                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
                                    : 'bg-white/5 text-slate-500 cursor-not-allowed'
                                }`}
                              >
                                Купить
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* TAB 3: Wardrobe */}
          {tab === 'wardrobe' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white">Твой гардероб и экипировка</h3>
                <p className="text-xs text-slate-400">
                  Управляйте экипировкой и фоном героя. Только 1 предмет на каждый слот одновременно!
                </p>
              </div>

              {/* Character Live Fitting Stage */}
              {renderFittingStage()}

              {/* Active Slots Overview Box */}
              <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-amber-400 font-pixel-sub flex items-center gap-1.5">
                    <Shirt className="w-4 h-4 text-amber-400" /> Активные слоты экипировки:
                  </span>
                  <span className="text-[10px] text-slate-400">1 предмет на слот</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {[
                    { key: 'weapon', name: 'Оружие', icon: '' },
                    { key: 'shield', name: 'Щит / 2-я рука', icon: '' },
                    { key: 'head', name: 'Голова', icon: '' },
                    { key: 'body', name: 'Тело / Доспех', icon: '' },
                    { key: 'cloak', name: 'Плащ / Крылья', icon: '' },
                    { key: 'accessory', name: 'Аксессуар', icon: '' },
                    { key: 'mount', name: 'Верховое', icon: '' },
                    { key: 'background', name: 'Фон', icon: '' },
                  ].map((slotInfo) => {
                    const equippedItem = shopItems.find(
                      (item) => item.slot === slotInfo.key && userEquippedItemIds.includes(item.id)
                    );

                    return (
                      <div
                        key={slotInfo.key}
                        className={`p-2.5 rounded-xl border flex flex-col justify-between gap-1.5 transition ${
                          equippedItem
                            ? 'bg-blue-950/40 border-blue-500/50 text-white'
                            : 'bg-slate-950/50 border-slate-800/80 text-slate-500'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-slate-400 truncate">
                            {slotInfo.icon} {slotInfo.name}
                          </span>
                          {equippedItem && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold shrink-0">
                              Активно
                            </span>
                          )}
                        </div>

                        {equippedItem ? (
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-xs truncate">
                              {equippedItem.emoji || ''} {equippedItem.title}
                            </span>
                            <button
                              onClick={() => onEquipItem(equippedItem.id)}
                              className="text-[10px] text-rose-400 hover:text-rose-300 underline font-semibold shrink-0"
                            >
                              Снять
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] italic text-slate-600">Пусто</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rules Notice */}
              <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl flex items-start gap-2 text-xs text-amber-200">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="leading-snug">
                  <b>Правило гардероба:</b> Нельзя одновременно надеть несколько предметов одного типа (например, два меча или две мантии). При надевании нового предмета предыдущий в том же слоте снимается!
                </p>
              </div>

              {/* Slot Category Filters */}
              {userOwnedItemIds.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
                  {[
                    { key: 'all', label: 'Все' },
                    { key: 'weapon', label: 'Оружие' },
                    { key: 'shield', label: 'Щиты' },
                    { key: 'head', label: 'Голова' },
                    { key: 'body', label: 'Тело' },
                    { key: 'cloak', label: 'Плащи' },
                    { key: 'accessory', label: 'Аксессуары' },
                    { key: 'mount', label: 'Верховые' },
                    { key: 'background', label: 'Окружение (Фоны)' },
                  ].map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setWardrobeSlotFilter(f.key as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                        wardrobeSlotFilter === f.key
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}

              {userOwnedItemIds.length === 0 ? (
                <div className="text-center py-10 bg-white/5 rounded-xl border border-dashed border-white/10">
                  <p className="text-slate-400 text-sm">Гардероб пуст. Загляните в Лавку вещей!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {shopItems
                    .filter((item) => userOwnedItemIds.includes(item.id))
                    .filter((item) =>
                      wardrobeSlotFilter === 'all' ? true : item.slot === wardrobeSlotFilter
                    )
                    .map((item) => {
                      const isEquipped = userEquippedItemIds.includes(item.id);
                      const isPreviewing = previewItem?.id === item.id;
                      const slotLabels: Record<string, string> = {
                        weapon: 'Оружие',
                        head: 'Голова',
                        body: 'Тело',
                        accessory: 'Аксессуар',
                        background: 'Фон окружения',
                      };
                      const classNames: Record<string, string> = {
                        warrior: 'Воин',
                        mage: 'Маг',
                        rogue: 'Разбойник',
                        healer: 'Целитель',
                      };

                      return (
                        <div
                          key={item.id}
                          className={`p-3.5 rounded-2xl border flex flex-col justify-between gap-3 transition ${
                            isPreviewing
                              ? 'bg-purple-950/60 border-purple-400 ring-2 ring-purple-500/40'
                              : isEquipped
                              ? 'bg-blue-950/30 border-blue-500/50 shadow-md shadow-blue-500/10'
                              : 'bg-white/5 border-white/10 hover:border-slate-700'
                          }`}
                        >
                          {/* Background Thumbnail if background slot */}
                          {item.slot === 'background' && (
                            <div className="relative w-full h-24 rounded-xl overflow-hidden border border-white/10 bg-slate-950 shadow-inner">
                              <RenderEnvironmentBg bgItem={item.imageUrl || item.code} />
                              <div className="absolute inset-0 bg-black/20" />
                              <div className="absolute bottom-1 right-2 text-xl font-bold px-1.5 py-0.5 rounded bg-black/70 border border-white/10 text-white flex items-center gap-1">
                                <span>{item.emoji}</span>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-3">
                            {item.slot !== 'background' && (
                              <img src={habiticaItemIcon(item.code, item.slot)} alt="" className="w-10 h-10 [image-rendering:pixelated] object-contain" draggable={false} />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white flex items-center gap-1.5 truncate">
                                <span>{item.title}</span>
                                {isEquipped && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500 text-white font-bold shrink-0">
                                    Надето
                                  </span>
                                )}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                                  Слот: {slotLabels[item.slot] || item.slot}
                                </span>
                                {item.recommendedClass && (
                                  <span className="text-[10px] text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                                    {classNames[item.recommendedClass] || item.recommendedClass}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
                            <button
                              onClick={() => setPreviewItem(item)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 border cursor-pointer ${
                                isPreviewing
                                  ? 'bg-purple-600 border-purple-400 text-white shadow'
                                  : 'bg-white/10 hover:bg-white/20 border-white/15 text-slate-200'
                              }`}
                              title="Примерить на аватаре"
                            >
                              <Eye className="w-3.5 h-3.5 text-amber-300" />
                              <span>Примерка</span>
                            </button>

                            <button
                              onClick={() => onEquipItem(item.id)}
                              className={`px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                                isEquipped
                                  ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30'
                                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow'
                              }`}
                            >
                              {isEquipped ? 'Снять' : 'Надеть'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Pets (Этап 8.1) */}
                    {tab === 'pets' && (
                      <PetsTab
                        activeUser={activeUser}
                        userOwnedPetIds={userOwnedPetIds}
                        onPetsChanged={onPetsChanged}
                      />
                    )}

                    {/* TAB 5: Achievements */}
          {tab === 'achievements' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white">Достижения и бонусы</h3>
                <p className="text-xs text-slate-400">
                  Открывайте ачивки и получайте разовые золотые награды.
                </p>
              </div>

              <div className="space-y-2.5">
                {achievements.map((ach) => (
                  <div
                    key={ach.id}
                    className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition ${
                      ach.unlocked
                        ? 'bg-purple-950/20 border-purple-500/30'
                        : 'bg-white/5 border-white/5 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{ach.unlocked ? <Trophy className="w-6 h-6 text-amber-300" /> : <Lock className="w-6 h-6 text-slate-500" />}</span>
                      <div>
                        <p className="text-sm font-bold text-white">{ach.title}</p>
                        <p className="text-xs text-slate-400">{ach.description}</p>
                      </div>
                    </div>

                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-400/10 text-amber-300 border border-amber-400/20">
                      +{ach.bonus} золота
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: Class & Gender Selection */}
          {tab === 'class' && (
            <div className="space-y-5">
              {/* Gender Selection Section */}
              <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
                <h3 className="text-sm font-bold text-white font-pixel-sub flex items-center gap-2 mb-1">
                  <UserCheck className="w-4 h-4" /> Выбор пола персонажа (Habitica Avatar)
                </h3>
                <p className="text-xs text-slate-400 mb-3">
                  Влияет на пиксельный облик вашего героя, причёски, доспехи и анимацию.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => onToggleGender && onToggleGender('male')}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition font-pixel-sub text-xs ${
                      activeUser.gender !== 'female'
                        ? 'bg-blue-950/40 border-blue-500 text-blue-300 font-bold'
                        : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    <HabiticaAnimatedAvatar look={DEFAULT_LOOKS.misha} cls={activeUser.class} size={36} state="idle" />
                    <span>Мужской</span>
                  </button>

                  <button
                    onClick={() => onToggleGender && onToggleGender('female')}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition font-pixel-sub text-xs ${
                      activeUser.gender === 'female'
                        ? 'bg-pink-950/40 border-pink-500 text-pink-300 font-bold'
                        : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    <HabiticaAnimatedAvatar look={DEFAULT_LOOKS.regina} cls={activeUser.class} size={36} state="idle" />
                    <span>Женский</span>
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-white font-pixel-sub">Выбор RPG класса (Habitica)</h3>
                <p className="text-xs text-slate-400">
                  Класс усиливает персонажа уникальными пассивными бонусами и заклинаниями за ману (MP).
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Warrior */}
                <div
                  onClick={() => onSelectClass('warrior')}
                  className={`p-5 rounded-2xl border cursor-pointer transition flex flex-col justify-between gap-4 ${
                    activeUser.class === 'warrior'
                      ? 'bg-amber-950/30 border-amber-500/50 shadow-lg shadow-amber-500/10'
                      : 'bg-white/5 border-white/10 hover:border-amber-500/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <HabiticaAnimatedAvatar look={activeUser.gender === 'female' ? DEFAULT_LOOKS.regina : DEFAULT_LOOKS.misha} cls="warrior" size={56} state="idle" />
                    <div>
                      <h4 className="font-bold text-white text-base font-pixel-sub">Воин</h4>
                      <span className="text-xs text-amber-400 font-medium">Защитник & Атака</span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-300 space-y-1.5 bg-black/30 p-3 rounded-xl border border-white/5">
                    <p><b>Пассивный бонус:</b> +1 золото за тяжёлые задачи</p>
                    <p><b>Скилл (10 MP):</b> «Мощный удар» — 15 прямого урона боссу</p>
                  </div>

                  <button
                    className={`w-full py-2 rounded-xl text-xs font-bold transition font-pixel-sub ${
                      activeUser.class === 'warrior'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-white/10 text-slate-300 hover:bg-white/20'
                    }`}
                  >
                    {activeUser.class === 'warrior' ? 'Текущий класс' : 'Выбрать Воина'}
                  </button>
                </div>

                {/* Mage */}
                <div
                  onClick={() => onSelectClass('mage')}
                  className={`p-5 rounded-2xl border cursor-pointer transition flex flex-col justify-between gap-4 ${
                    activeUser.class === 'mage'
                      ? 'bg-purple-950/30 border-purple-500/50 shadow-lg shadow-purple-500/10'
                      : 'bg-white/5 border-white/10 hover:border-purple-500/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <HabiticaAnimatedAvatar look={activeUser.gender === 'female' ? DEFAULT_LOOKS.regina : DEFAULT_LOOKS.misha} cls="mage" size={56} state="idle" />
                    <div>
                      <h4 className="font-bold text-white text-base font-pixel-sub">Маг</h4>
                      <span className="text-xs text-purple-400 font-medium">Повелитель опыта</span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-300 space-y-1.5 bg-black/30 p-3 rounded-xl border border-white/5">
                    <p><b>Пассивный бонус:</b> +20% опыта за каждую задачу</p>
                    <p><b>Скилл (15 MP):</b> «Взрыв магии» — +25 опыта мгновенно</p>
                  </div>

                  <button
                    className={`w-full py-2 rounded-xl text-xs font-bold transition font-pixel-sub ${
                      activeUser.class === 'mage'
                        ? 'bg-purple-500 text-white'
                        : 'bg-white/10 text-slate-300 hover:bg-white/20'
                    }`}
                  >
                    {activeUser.class === 'mage' ? 'Текущий класс' : 'Выбрать Мага'}
                  </button>
                </div>

                {/* Rogue */}
                <div
                  onClick={() => onSelectClass('rogue')}
                  className={`p-5 rounded-2xl border cursor-pointer transition flex flex-col justify-between gap-4 ${
                    activeUser.class === 'rogue'
                      ? 'bg-emerald-950/30 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                      : 'bg-white/5 border-white/10 hover:border-emerald-500/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <HabiticaAnimatedAvatar look={activeUser.gender === 'female' ? DEFAULT_LOOKS.regina : DEFAULT_LOOKS.misha} cls="rogue" size={56} state="idle" />
                    <div>
                      <h4 className="font-bold text-white text-base font-pixel-sub">Разбойник</h4>
                      <span className="text-xs text-emerald-400 font-medium">Добытчик золота</span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-300 space-y-1.5 bg-black/30 p-3 rounded-xl border border-white/5">
                    <p><b>Пассивный бонус:</b> +30% золота за задачи</p>
                    <p><b>Скилл (12 MP):</b> «Карманная кража» — +15 золота</p>
                  </div>

                  <button
                    className={`w-full py-2 rounded-xl text-xs font-bold transition font-pixel-sub ${
                      activeUser.class === 'rogue'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-white/10 text-slate-300 hover:bg-white/20'
                    }`}
                  >
                    {activeUser.class === 'rogue' ? 'Текущий класс' : 'Выбрать Разбойника'}
                  </button>
                </div>

                {/* Healer */}
                <div
                  onClick={() => onSelectClass('healer')}
                  className={`p-5 rounded-2xl border cursor-pointer transition flex flex-col justify-between gap-4 ${
                    activeUser.class === 'healer'
                      ? 'bg-rose-950/30 border-rose-500/50 shadow-lg shadow-rose-500/10'
                      : 'bg-white/5 border-white/10 hover:border-rose-500/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <HabiticaAnimatedAvatar look={activeUser.gender === 'female' ? DEFAULT_LOOKS.regina : DEFAULT_LOOKS.misha} cls="healer" size={56} state="idle" />
                    <div>
                      <h4 className="font-bold text-white text-base font-pixel-sub">Целитель</h4>
                      <span className="text-xs text-rose-400 font-medium">Хранитель жизни</span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-300 space-y-1.5 bg-black/30 p-3 rounded-xl border border-white/5">
                    <p><b>Пассивный бонус:</b> Восстановление HP себе и партнеру</p>
                    <p><b>Скилл (15 MP):</b> «Исцеляющий свет» — +20 HP здоровья семье</p>
                  </div>

                  <button
                    className={`w-full py-2 rounded-xl text-xs font-bold transition font-pixel-sub ${
                      activeUser.class === 'healer'
                        ? 'bg-rose-500 text-white'
                        : 'bg-white/10 text-slate-300 hover:bg-white/20'
                    }`}
                  >
                    {activeUser.class === 'healer' ? 'Текущий класс' : 'Выбрать Целителя'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
