import React, { useState, useMemo } from 'react';
import { X, Sparkles, User, Palette, Check, Scissors, Smile, Eye, Shirt, Brush } from 'lucide-react';
import { User as UserType, GenderKey } from '../types';
import HabiticaAnimatedAvatar from './HabiticaAnimatedAvatar';
import type { HabiticaLook } from '../utils/habiticaAssets';

interface CharacterEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeUser: UserType;
  onSaveCharacter: (updates: {
    gender?: GenderKey;
    character_color?: string;
    skin_tone?: string;
    hair_style?: string;
    hair_color?: string;
    eye_color?: string;
    custom_avatar_url?: string;
    ulpc_hair?: string;
    ulpc_hair_color?: string;
    habitica_equipped?: Partial<HabiticaLook>;
  }) => void;
}

export const SKIN_TONES = [
  { id: 'f5d70f', name: 'Светлая' },
  { id: 'f5a76e', name: 'Персиковая' },
  { id: 'ea8349', name: 'Загорелая' },
  { id: 'c06534', name: 'Смуглая' },
  { id: '915533', name: 'Тёмная' },
  { id: '98461a', name: 'Шоколад' },
];

export const HAIR_COLORS = [
  { id: 'blond', name: 'Блонд' },
  { id: 'brown', name: 'Каштан' },
  { id: 'black', name: 'Чёрный' },
  { id: 'red', name: 'Рыжий' },
  { id: 'white', name: 'Белый' },
  { id: 'green', name: 'Зелёный' },
  { id: 'blue', name: 'Синий' },
  { id: 'purple', name: 'Фиолетовый' },
  { id: 'candycane', name: 'Карамель' },
  { id: 'rainbow', name: 'Радуга' },
  { id: 'zombie', name: 'Зомби' },
];

export const AURA_COLORS = [
  { id: '#3b82f6', name: 'Лазурная' },
  { id: '#8b5cf6', name: 'Фиолетовая' },
  { id: '#10b981', name: 'Изумрудная' },
  { id: '#f43f5e', name: 'Пламя' },
  { id: '#f59e0b', name: 'Золотая' },
  { id: '#06b6d4', name: 'Мороз' },
  { id: '#ec4899', name: 'Искра' },
];

/**
 * Редактор внешности V3 (Habitica): кожа (62 тона), причёска (20 стилей),
 * чёлка (4), цвет волос (45), борода (3), аура. Живой предпросмотр слоёного аватара.
 */
export const CharacterEditorModal: React.FC<CharacterEditorModalProps> = ({
  isOpen,
  onClose,
  activeUser,
  onSaveCharacter,
}) => {
  const prev = (activeUser as any).habitica_equipped || {};

  // Дефолт по имени
  const defKey =
    activeUser.display_name.toLowerCase().includes('миша') ? 'misha'
    : activeUser.display_name.toLowerCase().includes('регина') || activeUser.display_name.toLowerCase().includes('regina') ? 'regina'
    : activeUser.display_name.toLowerCase().includes('папа') ? 'papa'
    : activeUser.display_name.toLowerCase().includes('мама') ? 'mama'
    : 'misha';

  const [skin, setSkin] = useState<string>(prev.skin || DEFAULT_SKIN(defKey));
  const [hairStyle, setHairStyle] = useState<number>(prev.hairBase ?? DEFAULT_HAIR(defKey));
  const [bangs, setBangs] = useState<number | undefined>(prev.hairBangs);
  const [beard, setBeard] = useState<number | undefined>(prev.beard);
  const [hairColor, setHairColor] = useState<string>(prev.hairColor || DEFAULT_HAIRCOLOR(defKey));
  const [armorTier, setArmorTier] = useState<number>(prev.armorTier ?? 0);
  const [auraColor, setAuraColor] = useState<string>(
    activeUser.character_color || activeUser.color || '#3b82f6'
  );

  // Живой образ для превью
  const look: HabiticaLook = useMemo(() => ({
    skin,
    hairBase: hairStyle,
    hairBangs: bangs,
    hairColor,
    beard,
    armorTier,
    headTier: 0,
    weaponTier: 0,
  }), [skin, hairStyle, bangs, hairColor, beard, armorTier]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveCharacter({
      character_color: auraColor,
      habitica_equipped: { skin, hairBase: hairStyle, hairBangs: bangs, hairColor, beard, armorTier } as Partial<HabiticaLook>,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-purple-500/40 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Шапка */}
        <div className="p-4 border-b border-purple-500/20 bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/20 border border-purple-400/40 text-purple-300">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Редактор внешности</span>
              </h2>
              <p className="text-xs text-slate-400">
                Habitica: кожа, причёска, цвет волос, сет
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Предпросмотр */}
          <div className="relative w-full bg-slate-950/90 rounded-2xl p-4 border border-purple-500/30 flex flex-col items-center justify-center shadow-inner gap-2 min-h-[200px]">
            <span className="text-[10px] uppercase font-pixel-sub text-purple-300 tracking-wider">
              Предпросмотр
            </span>
            <HabiticaAnimatedAvatar look={look} cls={activeUser.class || 'warrior'} size={150} state="idle" />
          </div>

          {/* 1. Кожа */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Smile className="w-4 h-4 text-amber-400" />
              <span>1. Тон кожи:</span>
            </label>
            <div className="grid grid-cols-6 gap-2">
              {SKIN_TONES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSkin(s.id)}
                  title={s.name}
                  className={`aspect-square rounded-xl border transition-transform relative cursor-pointer ${
                    skin === s.id ? 'border-amber-400 scale-110 shadow-lg' : 'border-slate-700 hover:scale-105'
                  }`}
                  style={{ backgroundColor: `#${s.id}` }}
                >
                  {skin === s.id && <Check className="w-4 h-4 text-slate-900 drop-shadow absolute inset-0 m-auto" />}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Причёска (20 стилей) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Scissors className="w-4 h-4 text-amber-400" />
              <span>2. Причёска (20 стилей):</span>
            </label>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 max-h-36 overflow-y-auto pr-1">
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setHairStyle(n)}
                  className={`aspect-square rounded-lg border overflow-hidden transition cursor-pointer relative ${
                    hairStyle === n ? 'border-amber-400 scale-105 shadow-lg' : 'border-slate-700 hover:border-slate-500'
                  }`}
                  style={{ backgroundColor: '#1a2030' }}
                  title={`Причёска ${n}`}
                >
                  <img
                    src={`/assets/game/habitica/customize/hair/hair_base_${n}_${HAIR_COLORS.find(c => c.id === hairColor) ? hairColor : 'brown'}.png`}
                    alt=""
                    className="w-full h-full object-contain [image-rendering:pixelated]"
                    onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.15'; }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* 3. Цвет волос */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Palette className="w-4 h-4 text-amber-400" />
              <span>3. Цвет волос:</span>
            </label>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
              {HAIR_COLORS.map((hc) => (
                <button
                  key={hc.id}
                  onClick={() => setHairColor(hc.id)}
                  title={hc.name}
                  className={`py-1.5 px-1 rounded-lg border text-[9px] font-medium transition cursor-pointer truncate ${
                    hairColor === hc.id
                      ? 'border-amber-400 scale-105 shadow-lg bg-amber-500/10 text-amber-200 font-bold'
                      : 'border-slate-700 hover:border-slate-500 text-slate-300'
                  }`}
                >
                  {hc.name}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Одежда (тир сета) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Shirt className="w-4 h-4 text-amber-400" />
              <span>4. Одежда (классовый сет):</span>
            </label>
            <div className="grid grid-cols-6 gap-1.5">
              {[{ t: 0, n: 'База' }, { t: 1, n: 'I' }, { t: 2, n: 'II' }, { t: 3, n: 'III' }, { t: 4, n: 'IV' }, { t: 5, n: 'V' }].map(({ t, n }) => (
                <button
                  key={t}
                  onClick={() => setArmorTier(t)}
                  className={`py-2 rounded-xl border text-[10px] font-bold transition cursor-pointer ${
                    armorTier === t
                      ? 'bg-indigo-600/40 border-indigo-400 text-indigo-100 shadow-md'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* 5. Аура */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Brush className="w-4 h-4 text-amber-400" />
              <span>5. Цвет ауры:</span>
            </label>
            <div className="grid grid-cols-7 gap-2">
              {AURA_COLORS.map((ac) => (
                <button
                  key={ac.id}
                  onClick={() => setAuraColor(ac.id)}
                  title={ac.name}
                  className={`h-9 rounded-xl border transition-transform relative flex items-center justify-center cursor-pointer ${
                    auraColor === ac.id ? 'border-amber-400 scale-110 shadow-lg' : 'border-slate-700 hover:scale-105'
                  }`}
                  style={{ backgroundColor: ac.id }}
                >
                  {auraColor === ac.id && <Check className="w-4 h-4 text-slate-900 drop-shadow" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Подвал */}
        <div className="p-4 border-t border-purple-500/20 bg-slate-950 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs transition cursor-pointer"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-purple-600/30 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4 text-emerald-300" />
            <span>Сохранить внешность</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/** Дефолты по ключу семьи */
function DEFAULT_SKIN(key: string): string {
  const map: Record<string, string> = { misha: 'ea8349', regina: 'f5a76e', papa: 'c06534', mama: 'f5d70f' };
  return map[key] || 'ea8349';
}
function DEFAULT_HAIR(key: string): number {
  const map: Record<string, number> = { misha: 3, regina: 12, papa: 1, mama: 5 };
  return map[key] ?? 3;
}
function DEFAULT_HAIRCOLOR(key: string): string {
  const map: Record<string, string> = { misha: 'blond', regina: 'red', papa: 'brown', mama: 'brown' };
  return map[key] || 'brown';
}
