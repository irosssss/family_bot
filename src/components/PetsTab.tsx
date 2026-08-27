/**
 * PetsTab (Этап 8.1) — отдельный компонент вкладки «Питомцы».
 *
 * Содержит:
 *   A) Инкубация: выбор яйца + зелья → POST /api/zoo/hatch
 *   B) Список моих питомцев: GET /api/zoo/list + кнопка «Покормить» → POST /api/zoo/feed
 *
 * Прогресс 0..100, на 100 питомец становится маунтом (иконка + смена спрайта).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { User } from '../types';
import { EGGS, POTIONS, SPECIES_RU, petSpriteUrl, mountIconUrl } from '../services/zooService';
import { Sparkles, Apple, Shirt, Egg as EggIcon, Fish, Drumstick, Beef, UtensilsCrossed, Cookie, Croissant } from 'lucide-react';
import { sfxCoin, sfxFeed, sfxError, sfxLevelUp } from '../utils/sfx';

interface MyPet {
  id: number;
  code: string;
  title: string;
  species: string;
  potion: string;
  spriteUrl: string;
  mountIconUrl: string;
  feed_points: number;
  is_mount: boolean;
}

interface PetsTabProps {
  activeUser: User;
  userOwnedPetIds: number[];
  onPetsChanged?: () => void;
}

// Доступные виды (для селекта; захардкожен список самых интересных)
const SPECIES_LIST = Object.keys(SPECIES_RU).sort();

const FOOD_COST = 5;
const HATCH_BASE_COST = 50; // яйцо Base + зелье Base (для отображения «от»)

export const PetsTab: React.FC<PetsTabProps> = ({ activeUser, userOwnedPetIds, onPetsChanged }) => {
  const isParent = activeUser.family_role === 'parent';
  const userId = activeUser.id;
  const gold = activeUser.gold ?? 0;

  // === Состояние: инкубация ===
  const [hatchEgg, setHatchEgg] = useState<string>('Base');
  const [hatchPotion, setHatchPotion] = useState<string>('Base');
  const [hatchSpecies, setHatchSpecies] = useState<string>('Wolf');
  const [hatching, setHatching] = useState(false);
  const [hatchErr, setHatchErr] = useState<string | null>(null);
  const [hatchOk, setHatchOk] = useState<string | null>(null);

  // === Состояние: мои питомцы ===
  const [myPets, setMyPets] = useState<MyPet[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedingId, setFeedingId] = useState<number | null>(null);
  const [feedErr, setFeedErr] = useState<string | null>(null);

  const selectedEgg = useMemo(() => EGGS.find((e) => e.id === hatchEgg), [hatchEgg]);
  const selectedPotion = useMemo(() => POTIONS.find((p) => p.id === hatchPotion), [hatchPotion]);
  const hatchCost = (selectedEgg?.cost ?? 0) + (selectedPotion?.cost ?? 0);
  const canHatch = !isParent && !hatching && gold >= hatchCost;

  // Загрузка моих питомцев
  const loadMyPets = async () => {
    setLoading(true);
    setFeedErr(null);
    try {
      const res = await fetch(`/api/zoo/list?userId=${userId}`);
      const json = await res.json();
      if (json.success) {
        setMyPets(json.pets || []);
      } else {
        setFeedErr(json.error || 'Не удалось загрузить питомцев');
      }
    } catch (e: any) {
      setFeedErr(`Ошибка соединения: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) loadMyPets();
  }, [userId]);

  // === Инкубация ===
  const handleHatch = async () => {
    if (!canHatch) return;
    setHatching(true);
    setHatchErr(null);
    setHatchOk(null);
    try {
      const res = await fetch('/api/zoo/hatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, species: hatchSpecies, eggId: hatchEgg, potionId: hatchPotion }),
      });
      const json = await res.json();
      if (json.success) {
        setHatchOk(`Вылупился ${SPECIES_RU[hatchSpecies] || hatchSpecies} (${selectedPotion?.name})!`);
        sfxCoin();
        await loadMyPets();
        onPetsChanged?.();
        // Авто-скрыть успех через 4с
        setTimeout(() => setHatchOk(null), 4000);
      } else {
        setHatchErr(json.error || 'Ошибка инкубации');
        sfxError();
      }
    } catch (e: any) {
      setHatchErr(`Ошибка соединения: ${e.message}`);
    } finally {
      setHatching(false);
    }
  };

  // === Кормление ===
  const handleFeed = async (petId: number) => {
    if (isParent || feedingId !== null) return;
    if (gold < FOOD_COST) {
      setFeedErr(`Нужно ${FOOD_COST} золота на еду`);
      return;
    }
    setFeedingId(petId);
    setFeedErr(null);
    try {
      const res = await fetch('/api/zoo/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, petId }),
      });
      const json = await res.json();
      if (json.success) {
        // Локально обновляем feed_points
        setMyPets((prev) =>
          prev.map((p) => (p.id === petId ? { ...p, feed_points: json.feed_points, is_mount: json.is_mount || p.is_mount } : p))
        );
        if (json.is_mount) {
          sfxLevelUp();
        } else {
          sfxFeed();
        }
        onPetsChanged?.();
      } else {
        setFeedErr(json.error || 'Ошибка кормления');
        sfxError();
      }
    } catch (e: any) {
      setFeedErr(`Ошибка соединения: ${e.message}`);
    } finally {
      setFeedingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* === СЕКЦИЯ A: Инкубация === */}
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <EggIcon className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-bold text-white font-pixel-sub uppercase tracking-wider">Инкубировать питомца</h3>
        </div>
        <p className="text-xs text-slate-400">Выбери вид, яйцо и зелье — питомец вылупится с заданным окрасом</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Вид */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-emerald-300 uppercase font-pixel-sub">Вид</span>
            <select
              value={hatchSpecies}
              onChange={(e) => setHatchSpecies(e.target.value)}
              disabled={isParent || hatching}
              className="min-h-[44px] bg-slate-900 border border-emerald-700/50 rounded-xl px-3 py-2 text-sm text-white font-medium"
            >
              {SPECIES_LIST.map((sp) => (
                <option key={sp} value={sp}>
                  {SPECIES_RU[sp]}
                </option>
              ))}
            </select>
          </label>

          {/* Яйцо */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-emerald-300 uppercase font-pixel-sub">Яйцо</span>
            <select
              value={hatchEgg}
              onChange={(e) => setHatchEgg(e.target.value)}
              disabled={isParent || hatching}
              className="min-h-[44px] bg-slate-900 border border-emerald-700/50 rounded-xl px-3 py-2 text-sm text-white font-medium"
            >
              {EGGS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} — {e.cost}з
                </option>
              ))}
            </select>
          </label>

          {/* Зелье */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-emerald-300 uppercase font-pixel-sub">Зелье</span>
            <select
              value={hatchPotion}
              onChange={(e) => setHatchPotion(e.target.value)}
              disabled={isParent || hatching}
              className="min-h-[44px] bg-slate-900 border border-emerald-700/50 rounded-xl px-3 py-2 text-sm text-white font-medium"
            >
              {POTIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.cost}з
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Превью + кнопка */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
          <div className="flex-1 flex items-center gap-3 bg-slate-950/60 rounded-xl p-3 border border-emerald-700/30">
            <img
              src={petSpriteUrl(hatchSpecies, hatchPotion)}
              alt="Превью питомца"
              className="w-16 h-16 [image-rendering:pixelated] object-contain shrink-0"
              onError={(e) => {
                // Fallback на Base-комбинацию, если спрайта нет
                (e.currentTarget as HTMLImageElement).src = petSpriteUrl('Wolf', 'Base');
              }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white font-pixel-sub truncate">
                {SPECIES_RU[hatchSpecies] || hatchSpecies}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                Окрас: {selectedPotion?.name} • Стоимость: {hatchCost} золота
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleHatch}
            disabled={!canHatch}
            className={`min-h-[48px] px-5 rounded-xl font-bold text-sm font-pixel-sub transition flex items-center justify-center gap-2 ${
              canHatch
                ? 'bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 text-white shadow-lg shadow-emerald-500/30 active:scale-95'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <EggIcon className="w-4 h-4" />
            {hatching ? 'Инкубируем...' : `Инкубировать (${hatchCost}з)`}
          </button>
        </div>

        {hatchErr && <p className="text-xs text-rose-300 bg-rose-950/40 border border-rose-700/50 rounded-lg px-3 py-2 animate-drop-toast">{hatchErr}</p>}
        {hatchOk && <p className="text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-700/50 rounded-lg px-3 py-2 animate-drop-toast">{hatchOk}</p>}
        {isParent && (
          <p className="text-xs text-amber-300 bg-amber-950/30 border border-amber-700/40 rounded-lg px-3 py-2">
            Родители не играют — войди как ребёнок, чтобы инкубировать питомцев
          </p>
        )}
      </div>

      {/* === СЕКЦИЯ Б: Мои питомцы === */}
      <div className="rounded-2xl border border-purple-500/30 bg-purple-950/20 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h3 className="text-sm font-bold text-white font-pixel-sub uppercase tracking-wider">
              Мои питомцы ({myPets.length})
            </h3>
          </div>
          <button
            type="button"
            onClick={loadMyPets}
            disabled={loading}
            className="text-[11px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition disabled:opacity-50 min-h-[36px]"
          >
            {loading ? 'Загрузка...' : 'Обновить'}
          </button>
        </div>

        {feedErr && <p className="text-xs text-rose-300 bg-rose-950/40 border border-rose-700/50 rounded-lg px-3 py-2 animate-drop-toast">{feedErr}</p>}

        {myPets.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">
            У тебя пока нет питомцев. Инкубируй первого выше!
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {myPets.map((pet) => {
              const isFeeding = feedingId === pet.id;
              const percent = Math.min(100, (pet.feed_points / 100) * 100);
              const isMount = pet.is_mount || pet.feed_points >= 100;
              const sprite = isMount ? pet.mountIconUrl : pet.spriteUrl;
              return (
                <div
                  key={pet.id}
                  className={`rounded-xl border p-3 flex items-center gap-3 transition ${
                    isMount
                      ? 'bg-emerald-950/30 border-emerald-500/50'
                      : 'bg-slate-900/60 border-slate-700/50'
                  }`}
                >
                  <img
                    src={sprite}
                    alt={pet.title}
                    className="w-14 h-14 [image-rendering:pixelated] object-contain shrink-0"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = petSpriteUrl('Wolf', 'Base');
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white font-pixel-sub truncate">
                      {SPECIES_RU[pet.species] || pet.species}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      Окрас: {pet.potion} {isMount && <span className="text-emerald-300 font-bold">• МАУНТ</span>}
                    </p>
                    {/* Прогресс-бар 0..100 */}
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-700/50">
                        <div
                          className={`h-full transition-all duration-500 ${
                            isMount
                              ? 'bg-gradient-to-r from-emerald-500 to-green-400'
                              : 'bg-gradient-to-r from-amber-500 to-orange-400'
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-white font-pixel-sub w-9 text-right">
                        {pet.feed_points}/100
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleFeed(pet.id)}
                    disabled={isMount || isFeeding || isParent || gold < FOOD_COST}
                    className={`shrink-0 min-h-[44px] px-3 rounded-xl text-xs font-bold font-pixel-sub transition flex items-center gap-1 ${
                      isMount
                        ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-600/40 cursor-default'
                        : gold < FOOD_COST
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-amber-600 hover:bg-amber-500 active:scale-95 text-white shadow-md'
                    }`}
                    title={isMount ? 'Уже маунт' : `Покормить за ${FOOD_COST} золота`}
                  >
                    {isMount ? (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        Маунт
                      </>
                    ) : isFeeding ? (
                      '...'
                    ) : (
                      <>
                        <UtensilsCrossed className="w-3.5 h-3.5" />
                        −{FOOD_COST}з
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PetsTab;
