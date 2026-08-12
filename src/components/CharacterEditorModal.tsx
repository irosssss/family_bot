import React, { useState } from 'react';
import { X, Sparkles, User, Palette, Check, RefreshCw, Scissors, Smile, Eye } from 'lucide-react';
import { User as UserType, GenderKey, ClassKey } from '../types';
import { PixelAvatar } from './PixelAvatar';

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
  }) => void;
}

export const SKIN_TONES = [
  { id: '#fef08a', name: 'Светлая (Алебастр)' },
  { id: '#fde047', name: 'Золотистая' },
  { id: '#f97316', name: 'Загорелая' },
  { id: '#b45309', name: 'Смуглая' },
  { id: '#78350f', name: 'Темнокожая' },
  { id: '#38bdf8', name: 'Ледяной эльф' },
  { id: '#a855f7', name: 'Сумеречная орчиха' },
  { id: '#22c55e', name: 'Гоблинская зелень' },
];

export const HAIR_STYLES = [
  { id: 'side_braid', name: 'Коса набок 👧' },
  { id: 'spiky', name: 'Ежик / Растрепанные ⚡' },
  { id: 'short', name: 'Короткие стрижки ✂️' },
  { id: 'long', name: 'Длинные локоны 💇‍♀️' },
  { id: 'ponytail', name: 'Хвост 👱‍♀️' },
  { id: 'afro', name: 'Пышное афро 🧑‍🦱' },
  { id: 'braids', name: 'Дреды / Косички 🪢' },
  { id: 'bald', name: 'Налысо 👨‍🦲' },
];

export const HAIR_COLORS = [
  { id: '#f59e0b', name: 'Блонд / Золотой' },
  { id: '#d97706', name: 'Рыжий / Огненный' },
  { id: '#78350f', name: 'Каштановый' },
  { id: '#1c1917', name: 'Брюнет / Брюнетка' },
  { id: '#ef4444', name: 'Алый / Красный' },
  { id: '#38bdf8', name: 'Лазурный' },
  { id: '#a855f7', name: 'Фиолетовый маг' },
  { id: '#ec4899', name: 'Розовый неоновый' },
  { id: '#e2e8f0', name: 'Седой / Серебряный' },
];

export const EYE_COLORS = [
  { id: '#0f172a', name: 'Тёмно-карие' },
  { id: '#38bdf8', name: 'Голубые' },
  { id: '#22c55e', name: 'Изумрудные' },
  { id: '#f59e0b', name: 'Янтарные' },
  { id: '#a855f7', name: 'Фиолетовые' },
  { id: '#ef4444', name: 'Алые рубины' },
];

export const AURA_COLORS = [
  { id: '#3b82f6', name: 'Лазурная аура 🛡️' },
  { id: '#8b5cf6', name: 'Фиолетовая магия 🔮' },
  { id: '#10b981', name: 'Изумрудный следопыт 🍃' },
  { id: '#f43f5e', name: 'Пламя заката ⚔️' },
  { id: '#f59e0b', name: 'Золотой свет 👑' },
  { id: '#06b6d4', name: 'Кристальный мороз ❄️' },
  { id: '#ec4899', name: 'Розовая искра ✨' },
];

export const CharacterEditorModal: React.FC<CharacterEditorModalProps> = ({
  isOpen,
  onClose,
  activeUser,
  onSaveCharacter,
}) => {
  const [gender, setGender] = useState<GenderKey>(activeUser.gender || 'male');
  const [skinTone, setSkinTone] = useState<string>(activeUser.skin_tone || '#fef08a');
  const [hairStyle, setHairStyle] = useState<string>(activeUser.hair_style || 'short');
  const [hairColor, setHairColor] = useState<string>(activeUser.hair_color || '#f59e0b');
  const [eyeColor, setEyeColor] = useState<string>(activeUser.eye_color || '#0f172a');
  const [auraColor, setAuraColor] = useState<string>(activeUser.character_color || activeUser.color || '#3b82f6');
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string>(activeUser.custom_avatar_url || '');

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveCharacter({
      gender,
      skin_tone: skinTone,
      hair_style: hairStyle,
      hair_color: hairColor,
      eye_color: eyeColor,
      character_color: auraColor,
      custom_avatar_url: customAvatarUrl,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-purple-500/40 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 border-b border-purple-500/20 bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/20 border border-purple-400/40 text-purple-300">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Редактор Внешности Персонажа</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/30 text-purple-300 font-normal">
                  Habitica RPG Style
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Настройте цвет кожи, причёску, цвет глаз и уникальную ауру персонажа
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Centered Character Preview Stage */}
          <div className="relative w-full bg-slate-950/90 rounded-2xl p-4 border border-purple-500/30 flex flex-col items-center justify-center shadow-inner gap-2">
            <span className="text-[10px] uppercase font-pixel-sub text-purple-300 tracking-wider">
              Предпросмотр внешности
            </span>
            <div className="scale-125 my-2">
              <PixelAvatar
                type="character"
                classKey={activeUser.class}
                gender={gender}
                characterColor={auraColor}
                skinTone={skinTone}
                hairStyle={hairStyle}
                hairColor={hairColor}
                eyeColor={eyeColor}
                customAvatarUrl={customAvatarUrl}
                size="lg"
                animated={true}
              />
            </div>
          </div>

          {/* 1. Пол Персонажа */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Smile className="w-4 h-4 text-amber-400" />
              <span>1. Пол и Телосложение:</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setGender('male')}
                className={`py-2.5 px-4 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                  gender === 'male'
                    ? 'bg-blue-600/30 border-blue-400 text-blue-200 shadow-md'
                    : 'bg-slate-800/60 border-slate-700/80 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <span>👨 Мужской герой</span>
              </button>
              <button
                onClick={() => setGender('female')}
                className={`py-2.5 px-4 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                  gender === 'female'
                    ? 'bg-pink-600/30 border-pink-400 text-pink-200 shadow-md'
                    : 'bg-slate-800/60 border-slate-700/80 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <span>👩 Женская героиня</span>
              </button>
            </div>
          </div>

          {/* 2. Цвет Кожи */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Palette className="w-4 h-4 text-amber-400" />
              <span>2. Тон и Цвет кожи:</span>
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {SKIN_TONES.map((tone) => (
                <button
                  key={tone.id}
                  onClick={() => setSkinTone(tone.id)}
                  title={tone.name}
                  className={`h-9 rounded-xl border transition-transform relative flex items-center justify-center cursor-pointer ${
                    skinTone === tone.id ? 'border-amber-400 scale-110 shadow-lg' : 'border-slate-700 hover:scale-105'
                  }`}
                  style={{ backgroundColor: tone.id }}
                >
                  {skinTone === tone.id && <Check className="w-4 h-4 text-slate-900 drop-shadow" />}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Причёска */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Scissors className="w-4 h-4 text-amber-400" />
              <span>3. Стиль и Причёска:</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {HAIR_STYLES.map((style) => (
                <button
                  key={style.id}
                  onClick={() => setHairStyle(style.id)}
                  className={`py-2 px-3 rounded-xl border text-xs font-medium transition cursor-pointer text-left truncate ${
                    hairStyle === style.id
                      ? 'bg-purple-600/30 border-purple-400 text-purple-200 font-bold'
                      : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {style.name}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Цвет Волос */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>4. Цвет Волос:</span>
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-9 gap-2">
              {HAIR_COLORS.map((hc) => (
                <button
                  key={hc.id}
                  onClick={() => setHairColor(hc.id)}
                  title={hc.name}
                  className={`h-8 rounded-xl border transition-transform relative flex items-center justify-center cursor-pointer ${
                    hairColor === hc.id ? 'border-amber-400 scale-110 shadow-lg' : 'border-slate-700 hover:scale-105'
                  }`}
                  style={{ backgroundColor: hc.id }}
                >
                  {hairColor === hc.id && <Check className="w-4 h-4 text-white drop-shadow" />}
                </button>
              ))}
            </div>
          </div>

          {/* 5. Цвет Глаз */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-amber-400" />
              <span>5. Цвет Глаз:</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {EYE_COLORS.map((ec) => (
                <button
                  key={ec.id}
                  onClick={() => setEyeColor(ec.id)}
                  className={`py-2 px-3 rounded-xl border text-xs font-medium transition cursor-pointer flex items-center gap-2 ${
                    eyeColor === ec.id
                      ? 'bg-indigo-600/30 border-indigo-400 text-indigo-200 font-bold'
                      : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: ec.id }} />
                  <span className="truncate">{ec.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 6. Цвет Ауры Персонажа */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>6. Цвет Классовой Ауры:</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {AURA_COLORS.map((ac) => (
                <button
                  key={ac.id}
                  onClick={() => setAuraColor(ac.id)}
                  className={`py-2 px-2.5 rounded-xl border text-[11px] font-medium transition cursor-pointer flex items-center gap-2 ${
                    auraColor === ac.id
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold'
                      : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ac.id }} />
                  <span className="truncate">{ac.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
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
