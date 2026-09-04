import React, { useMemo, useState } from 'react';
import { User, AppState } from '../../types';
import HabiticaAnimatedAvatar from '../HabiticaAnimatedAvatar';
import { HabiticaLook } from '../../utils/habiticaAssets';
import { getUnifiedLook } from '../../utils/unifiedLook';
import { applyItemLook, habiticaItemIcon, habiticaPetSprite, ULPC_TORSO_TIER } from '../../utils/shopLookMap';
import { Check, Crown, Package, PawPrint, Shirt, Sparkles, Star, X } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface WardrobeCustomizationSceneProps {
  appState: AppState;
  activeUser: User;
  onEquipItem: (itemId: number) => void;
  /** Купить предмет после примерки. */
  onBuyItem?: (itemId: number) => void;
  /** Выбрать питомца-компаньона (POST /api/zoo/active). */
  onSetActivePet?: (petId: number) => void;
}

type WorkshopTab = 'weapon' | 'body' | 'head' | 'pets';

const workshopTabs: Array<{ id: WorkshopTab; label: string; icon: typeof Shirt }> = [
  { id: 'body', label: 'Одежда', icon: Shirt },
  { id: 'weapon', label: 'Вещи', icon: Package },
  { id: 'head', label: 'Шляпы', icon: Crown },
  { id: 'pets', label: 'Питомцы', icon: PawPrint },
];

const itemSlotLabel = (slot: string) => {
  if (slot === 'body' || slot === 'cloak') return 'Одежда';
  if (slot === 'head') return 'Шляпа';
  return 'Вещь';
};

export const WardrobeCustomizationScene: React.FC<WardrobeCustomizationSceneProps> = ({
  appState,
  activeUser,
  onEquipItem,
  onBuyItem,
  onSetActivePet,
}) => {
  const [activeTab, setActiveTab] = useState<WorkshopTab>('body');
  // Примерка не меняет инвентарь: предмет становится купленным только через явную покупку.
  const [previewItemId, setPreviewItemId] = useState<number | null>(null);

  const userItems = appState.userItems.filter((userItem) => userItem.user_id === activeUser.id);
  const equippedItemIds = userItems.filter((userItem) => userItem.equipped === 1).map((userItem) => userItem.item_id);

  const categoryItems = appState.shopItems.filter((item) => {
    if (activeTab === 'weapon') return item.slot === 'weapon' || item.slot === 'shield';
    if (activeTab === 'body') return item.slot === 'body' || item.slot === 'cloak';
    if (activeTab === 'head') return item.slot === 'head';
    return false;
  });

  const equippedCodes = (activeUser as any).equipped_codes || {};
  const previewItem = previewItemId != null
    ? categoryItems.find((item) => item.id === previewItemId) || null
    : null;

  // Один и тот же слой персонажа используется во всех сценах, а примерка только временно
  // перекрывает нужный слот. Для ULPC-торсов отдельный тир нужен до покупки.
  const hLook = useMemo(() => {
    let base: HabiticaLook = getUnifiedLook(activeUser);
    base = applyItemLook(base, equippedCodes.weapon);
    base = applyItemLook(base, equippedCodes.shield);
    base = applyItemLook(base, equippedCodes.head);
    base = applyItemLook(base, equippedCodes.body);

    if (previewItem) {
      base = applyItemLook(base, previewItem.code);
      const torsoTier = ULPC_TORSO_TIER[previewItem.code];
      if (torsoTier != null && (base.armorTier ?? 0) < torsoTier) {
        base.armorTier = torsoTier;
      }
    }

    return base;
  }, [activeUser, equippedCodes, previewItem]);

  const myPets = appState.userPets.filter((userPet) => userPet.user_id === activeUser.id);
  const myPetIds = new Set(myPets.map((userPet) => userPet.pet_id));
  const activePetId = myPets.find((userPet) => userPet.is_active)?.pet_id ?? null;
  const activePet = activePetId != null ? appState.pets.find((pet) => pet.id === activePetId) : null;

  const changeTab = (tab: WorkshopTab) => {
    triggerHaptic('impact', 'light');
    setPreviewItemId(null);
    setActiveTab(tab);
  };

  const clearPreview = () => {
    triggerHaptic('impact', 'light');
    setPreviewItemId(null);
  };

  const buyPreview = (itemId: number) => {
    triggerHaptic('notification', 'success');
    onBuyItem?.(itemId);
    setPreviewItemId(null);
  };

  return (
    <section className="relative isolate w-full overflow-hidden rounded-[28px] border-2 border-[#5f4934] bg-[#eadfc7] text-[#35291f] shadow-[0_10px_0_#5f4934]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-45"
        style={{
          backgroundImage: 'radial-gradient(#a88b68 0.8px, transparent 0.8px)',
          backgroundSize: '7px 7px',
        }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-[#b88652]" />

      <header className="relative border-b-2 border-[#5f4934] bg-[#765638] px-4 pb-4 pt-5 text-[#fff8e8] sm:px-6 sm:py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[#402f20] bg-[#eac98f] text-[#4d3826] shadow-[3px_3px_0_#402f20]">
              <Shirt className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <p className="font-pixel-sub text-[10px] uppercase tracking-[0.16em] text-[#f6d89b]">Личный уголок</p>
              <h2 className="mt-0.5 font-pixel-sub text-base font-bold leading-tight sm:text-lg">Домашняя мастерская</h2>
              <p className="mt-1 text-xs leading-snug text-[#f4e5c6]">Примеряй вещи у верстака и собирай свой образ.</p>
            </div>
          </div>

          <div className="shrink-0 rounded-lg border border-[#f2d093]/70 bg-[#4d3826]/55 px-2.5 py-2 text-right shadow-inner">
            <p className="text-[9px] font-bold uppercase tracking-wide text-[#f4d99f]">В запасе</p>
            <p className="font-pixel-sub text-xs font-bold text-[#fff5d8]">{activeUser.gold} монет</p>
          </div>
        </div>
      </header>

      <div className="relative grid gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)] lg:gap-5">
        <aside className="relative overflow-hidden rounded-2xl border-2 border-[#8b6948] bg-[#f8eed9] p-3 shadow-[4px_4px_0_#8b6948] sm:p-4">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-3 top-12 bottom-24 rounded-xl opacity-35"
            style={{ backgroundImage: 'repeating-linear-gradient(45deg, #d9c198 0, #d9c198 1px, transparent 1px, transparent 10px)' }}
          />
          <div className="relative flex items-center justify-between gap-2">
            <div>
              <p className="font-pixel-sub text-[10px] uppercase tracking-[0.12em] text-[#896747]">Зеркало у верстака</p>
              <p className="mt-0.5 text-[11px] leading-snug text-[#735a41]">Так образ выглядит прямо сейчас.</p>
            </div>
            {previewItem && (
              <div className="max-w-[126px] rounded-md border border-[#b87435] bg-[#fff0c6] px-2 py-1 text-right text-[10px] font-bold leading-tight text-[#704318]">
                Примерка: {previewItem.title}
              </div>
            )}
          </div>

          <div className="relative mx-auto mt-3 flex min-h-[192px] max-w-[242px] items-center justify-center rounded-[30px] border-[9px] border-[#765638] bg-[#d9c198] shadow-[inset_0_0_0_2px_#f8e5ba,4px_4px_0_#4d3826]">
            <div className="absolute inset-2 rounded-[19px] border border-[#97714e] bg-[#eadfc7]" />
            <div className="relative translate-y-2 scale-95 sm:scale-100">
              <HabiticaAnimatedAvatar
                look={hLook}
                cls={activeUser.class || 'warrior'}
                size={150}
                state="idle"
                gender={activeUser.gender}
              />
            </div>
          </div>

          <div className="relative mt-3 flex items-center gap-2 rounded-xl border border-[#c5aa81] bg-[#fff8e8]/85 px-3 py-2">
            {activePet ? (
              <>
                <img
                  src={habiticaPetSprite(activePet.code)}
                  alt=""
                  className="h-10 w-9 shrink-0 object-contain [image-rendering:pixelated]"
                  draggable={false}
                />
                <p className="min-w-0 text-[11px] leading-snug text-[#614931]">
                  <span className="font-bold">Рядом {activePet.title}</span>
                  <br />
                  Помогает выбирать вещи.
                </p>
              </>
            ) : (
              <>
                <PawPrint className="h-5 w-5 shrink-0 text-[#896747]" />
                <p className="text-[11px] leading-snug text-[#614931]">Выбери питомца на соседней полке.</p>
              </>
            )}
          </div>

          <div className="relative mt-3 text-center">
            <h3 className="font-pixel-sub text-sm font-bold text-[#3e2e20]">{activeUser.display_name}</h3>
            <p className="mt-0.5 text-[11px] text-[#765638]">Уровень {Math.floor(activeUser.xp / 100) + 1}</p>
          </div>

          {previewItem ? (
            <div className="relative mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => buyPreview(previewItem.id)}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-[#80501e] bg-[#dfa651] px-3 text-xs font-bold text-[#3f2a14] shadow-[2px_2px_0_#80501e] transition active:translate-x-px active:translate-y-px active:shadow-none"
              >
                <Package className="h-3.5 w-3.5" />
                Купить за {previewItem.cost}
              </button>
              <button
                type="button"
                onClick={clearPreview}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border-2 border-[#9c8060] bg-[#fff8e8] text-[#604831] shadow-[2px_2px_0_#9c8060] transition active:translate-x-px active:translate-y-px active:shadow-none"
                aria-label="Отменить примерку"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <p className="relative mt-3 rounded-lg border border-dashed border-[#b99b75] bg-[#f4e7cb] px-3 py-2 text-center text-[10px] leading-snug text-[#72583e]">
              Новую вещь можно сначала спокойно примерить.
            </p>
          )}
        </aside>

        <div className="min-w-0 rounded-2xl border-2 border-[#8b6948] bg-[#f8eed9] p-3 shadow-[4px_4px_0_#8b6948] sm:p-4">
          <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
            <div>
              <p className="font-pixel-sub text-[10px] uppercase tracking-[0.12em] text-[#896747]">Полка с находками</p>
              <h3 className="mt-0.5 font-pixel-sub text-sm font-bold text-[#3e2e20]">
                {activeTab === 'pets' ? 'Кто пойдёт рядом' : 'Вещи для твоего уголка'}
              </h3>
            </div>
            <p className="text-[10px] text-[#765638]">Сначала потрогай глазами, потом решай.</p>
          </div>

          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="Разделы мастерской">
            {workshopTabs.map((tab) => {
              const TabIcon = tab.icon;
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => changeTab(tab.id)}
                  aria-pressed={selected}
                  className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border-2 px-3 text-xs font-bold transition ${
                    selected
                      ? 'border-[#5d7b45] bg-[#dce9bd] text-[#38512c] shadow-[2px_2px_0_#5d7b45]'
                      : 'border-[#c3a77e] bg-[#fff8e8] text-[#684e36] shadow-[2px_2px_0_#c3a77e] active:translate-x-px active:translate-y-px active:shadow-none'
                  }`}
                >
                  <TabIcon className="h-4 w-4" strokeWidth={2.25} />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {activeTab !== 'pets' ? (
            categoryItems.length ? (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:max-h-[508px] lg:overflow-y-auto lg:pr-2">
                {categoryItems.map((item) => {
                  const isOwned = userItems.some((userItem) => userItem.item_id === item.id);
                  const isEquipped = equippedItemIds.includes(item.id);
                  const isPreviewing = previewItemId === item.id;

                  const itemCardClass = isEquipped
                    ? 'border-[#66864a] bg-[#e6efce] shadow-[3px_3px_0_#66864a]'
                    : isPreviewing
                      ? 'border-[#b87435] bg-[#fff0c6] shadow-[3px_3px_0_#b87435]'
                      : isOwned
                        ? 'border-[#ae9170] bg-[#fffaf0] shadow-[3px_3px_0_#ae9170]'
                        : 'border-[#c7aa82] bg-[#f1e6d1] shadow-[3px_3px_0_#c7aa82]';

                  return (
                    <article key={item.id} className={`flex min-w-0 flex-col rounded-xl border-2 p-2.5 ${itemCardClass}`}>
                      <div className="flex min-w-0 items-start gap-2">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#c3a77e] bg-[#ead8b7]">
                          <img
                            src={habiticaItemIcon(item.code, item.slot)}
                            alt=""
                            className="h-9 w-9 object-contain [image-rendering:pixelated]"
                            draggable={false}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-[#3e2e20]">{item.title}</p>
                          <p className="mt-0.5 text-[10px] text-[#765638]">{itemSlotLabel(item.slot)}</p>
                        </div>
                      </div>

                      <div className="mt-2 min-h-[22px]">
                        {isEquipped ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#cde2a8] px-1.5 py-1 text-[9px] font-bold text-[#3f5b2d]">
                            <Check className="h-3 w-3" /> Сейчас на тебе
                          </span>
                        ) : isPreviewing ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#ffe1a1] px-1.5 py-1 text-[9px] font-bold text-[#754818]">
                            <Sparkles className="h-3 w-3" /> На примерке
                          </span>
                        ) : isOwned ? (
                          <span className="inline-flex rounded-md bg-[#ede2cc] px-1.5 py-1 text-[9px] font-bold text-[#70563d]">Твоя вещь</span>
                        ) : (
                          <span className="inline-flex rounded-md bg-[#e5d4b7] px-1.5 py-1 text-[9px] font-bold text-[#7a5a37]">{item.cost} монет</span>
                        )}
                      </div>

                      <div className="mt-auto pt-2">
                        {isEquipped ? (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('impact', 'medium');
                              onEquipItem(item.id);
                            }}
                            className="flex min-h-[44px] w-full items-center justify-center gap-1 rounded-lg border-2 border-[#66864a] bg-[#d7e8b5] px-2 text-[10px] font-bold text-[#39512b] shadow-[2px_2px_0_#66864a] transition active:translate-x-px active:translate-y-px active:shadow-none"
                          >
                            <Check className="h-3.5 w-3.5" /> Надето
                          </button>
                        ) : isOwned ? (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('impact', 'medium');
                              onEquipItem(item.id);
                            }}
                            className="min-h-[44px] w-full rounded-lg border-2 border-[#77593e] bg-[#e7c783] px-2 text-[10px] font-bold text-[#44301e] shadow-[2px_2px_0_#77593e] transition active:translate-x-px active:translate-y-px active:shadow-none"
                          >
                            Надеть
                          </button>
                        ) : isPreviewing ? (
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => buyPreview(item.id)}
                              className="flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-lg border-2 border-[#80501e] bg-[#dfa651] px-2 text-[10px] font-bold text-[#3f2a14] shadow-[2px_2px_0_#80501e] transition active:translate-x-px active:translate-y-px active:shadow-none"
                            >
                              <Package className="h-3.5 w-3.5" /> Купить
                            </button>
                            <button
                              type="button"
                              onClick={clearPreview}
                              aria-label="Отменить примерку"
                              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border-2 border-[#9c8060] bg-[#fff8e8] text-[#604831] shadow-[2px_2px_0_#9c8060] transition active:translate-x-px active:translate-y-px active:shadow-none"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('impact', 'medium');
                              setPreviewItemId(item.id);
                            }}
                            className="min-h-[44px] w-full rounded-lg border-2 border-[#a66b2c] bg-[#f5d59a] px-2 text-[10px] font-bold text-[#623b16] shadow-[2px_2px_0_#a66b2c] transition active:translate-x-px active:translate-y-px active:shadow-none"
                          >
                            Примерить
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 flex min-h-[180px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#c3a77e] bg-[#fff8e8]/70 p-5 text-center">
                <Package className="h-7 w-7 text-[#9b7753]" />
                <p className="mt-2 text-xs font-bold text-[#5d4733]">На этой полке пока пусто</p>
                <p className="mt-1 text-[11px] leading-snug text-[#806247]">Новые находки появятся здесь, когда они будут готовы.</p>
              </div>
            )
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:max-h-[508px] lg:overflow-y-auto lg:pr-2">
              {appState.pets.map((pet) => {
                const owned = myPetIds.has(pet.id);
                const isActive = activePetId === pet.id;
                const petCardClass = isActive
                  ? 'border-[#66864a] bg-[#e6efce] shadow-[3px_3px_0_#66864a]'
                  : owned
                    ? 'border-[#ae9170] bg-[#fffaf0] shadow-[3px_3px_0_#ae9170]'
                    : 'border-[#c7aa82] bg-[#f1e6d1] shadow-[3px_3px_0_#c7aa82]';

                return (
                  <article key={pet.id} className={`flex min-w-0 flex-col rounded-xl border-2 p-2.5 ${petCardClass}`}>
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="flex h-12 w-11 shrink-0 items-center justify-center rounded-lg border border-[#c3a77e] bg-[#ead8b7]">
                        <img
                          src={habiticaPetSprite(pet.code)}
                          alt=""
                          className="h-11 w-10 object-contain [image-rendering:pixelated]"
                          draggable={false}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-[#3e2e20]">{pet.title}</p>
                        <p className="mt-0.5 text-[10px] leading-snug text-[#765638]">
                          {isActive ? 'Рядом сейчас' : owned ? 'Ждёт в уголке' : 'Пока не знакомы'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-auto pt-3">
                      {owned && onSetActivePet && (
                        isActive ? (
                          <div className="flex min-h-[44px] w-full items-center justify-center gap-1 rounded-lg border-2 border-[#66864a] bg-[#d7e8b5] px-2 text-[10px] font-bold text-[#39512b] shadow-[2px_2px_0_#66864a]">
                            <Check className="h-3.5 w-3.5" /> Рядом
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('notification', 'success');
                              onSetActivePet(pet.id);
                            }}
                            className="flex min-h-[44px] w-full items-center justify-center gap-1 rounded-lg border-2 border-[#5d7b45] bg-[#dce9bd] px-2 text-[10px] font-bold text-[#38512c] shadow-[2px_2px_0_#5d7b45] transition active:translate-x-px active:translate-y-px active:shadow-none"
                          >
                            <Star className="h-3.5 w-3.5" /> Позвать рядом
                          </button>
                        )
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
