import React, { useState, useEffect } from 'react';
import {
 X,
 UserPlus,
 Shield,
 Swords,
 Wand2,
 Sparkles,
 Check,
 Heart,
 UserCheck,
 Flame,
 Lock,
 Key,
 Palette,
 AlertCircle,
 CheckCircle2,
 Gift,
} from 'lucide-react';
import { User, ClassKey, GenderKey } from '../types';
import { PixelAvatar } from './PixelAvatar';

export interface CharacterColorOption {
 id: string;
 name: string;
 hex: string;
 bgClass: string;
 borderClass: string;
 ringClass: string;
 textClass: string;
 gradient: string;
}

export const CHARACTER_COLORS: CharacterColorOption[] = [
 {
 id: 'amber',
 name: 'Золотой Дракон',
 hex: '#f59e0b',
 bgClass: 'bg-amber-500',
 borderClass: 'border-amber-400',
 ringClass: 'ring-amber-400',
 textClass: 'text-amber-300',
 gradient: 'from-amber-500/20 to-orange-500/10',
 },
 {
 id: 'blue',
 name: 'Сапфировый Рыцарь',
 hex: '#3b82f6',
 bgClass: 'bg-blue-500',
 borderClass: 'border-blue-400',
 ringClass: 'ring-blue-400',
 textClass: 'text-blue-300',
 gradient: 'from-blue-500/20 to-indigo-500/10',
 },
 {
 id: 'emerald',
 name: 'Изумрудный Следопыт',
 hex: '#10b981',
 bgClass: 'bg-emerald-500',
 borderClass: 'border-emerald-400',
 ringClass: 'ring-emerald-400',
 textClass: 'text-emerald-300',
 gradient: 'from-emerald-500/20 to-teal-500/10',
 },
 {
 id: 'purple',
 name: 'Аметистовый Чародей',
 hex: '#a855f7',
 bgClass: 'bg-purple-500',
 borderClass: 'border-purple-400',
 ringClass: 'ring-purple-400',
 textClass: 'text-purple-300',
 gradient: 'from-purple-500/20 to-violet-500/10',
 },
 {
 id: 'rose',
 name: 'Рубиновый Огонь',
 hex: '#f43f5e',
 bgClass: 'bg-rose-500',
 borderClass: 'border-rose-400',
 ringClass: 'ring-rose-400',
 textClass: 'text-rose-300',
 gradient: 'from-rose-500/20 to-red-500/10',
 },
 {
 id: 'cyan',
 name: 'Лазурный Легендарный',
 hex: '#06b6d4',
 bgClass: 'bg-cyan-500',
 borderClass: 'border-cyan-400',
 ringClass: 'ring-cyan-400',
 textClass: 'text-cyan-300',
 gradient: 'from-cyan-500/20 to-blue-500/10',
 },
 {
 id: 'pink',
 name: 'Нефритовая Роза',
 hex: '#ec4899',
 bgClass: 'bg-pink-500',
 borderClass: 'border-pink-400',
 ringClass: 'ring-pink-400',
 textClass: 'text-pink-300',
 gradient: 'from-pink-500/20 to-rose-500/10',
 },
 {
 id: 'indigo',
 name: 'Сумеречный Страж',
 hex: '#6366f1',
 bgClass: 'bg-indigo-500',
 borderClass: 'border-indigo-400',
 ringClass: 'ring-indigo-400',
 textClass: 'text-indigo-300',
 gradient: 'from-indigo-500/20 to-purple-500/10',
 },
];

interface RegistrationModalProps {
 isOpen: boolean;
 onClose: () => void;
 users: User[];
 onRegisterUser: (userData: {
 name: string;
 classKey: ClassKey;
 gender: GenderKey;
 familyCode?: string;
 customAvatarUrl?: string;
 characterColor?: string;
 color?: string;
 refCode?: string;
 }) => void;
 onSelectActiveUser: (userId: number) => void;
 activeUserId?: number;
}

const CLASS_OPTIONS = [
 {
 key: 'warrior' as ClassKey,
 title: ' Воин',
 perk: '+1 за сложные задачи (≥4 б.)',
 skill: '«Мощный удар» (15 урона боссу за -10 MP)',
 color: 'from-amber-500/20 to-orange-500/10 border-amber-500/40 text-amber-300',
 btnColor: 'bg-amber-600 hover:bg-amber-500',
 },
 {
 key: 'mage' as ClassKey,
 title: ' Маг',
 perk: '+20% дополнительного опыта',
 skill: '«Взрыв магии» (+25 опыта за -15 MP)',
 color: 'from-purple-500/20 to-indigo-500/10 border-purple-500/40 text-purple-300',
 btnColor: 'bg-purple-600 hover:bg-purple-500',
 },
 {
 key: 'rogue' as ClassKey,
 title: ' Разбойник',
 perk: 'Шанс крит-золота x2 за простые задачи',
 skill: '«Карманная кража» (+15 за -12 MP)',
 color: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/40 text-emerald-300',
 btnColor: 'bg-emerald-600 hover:bg-emerald-500',
 },
 {
 key: 'healer' as ClassKey,
 title: ' Целитель',
 perk: '+10% к восстановлению MP всей семьи',
 skill: '«Исцеляющий свет» (+20 HP всей семье за -15 MP)',
 color: 'from-pink-500/20 to-rose-500/10 border-pink-500/40 text-pink-300',
 btnColor: 'bg-pink-600 hover:bg-pink-500',
 },
];

export const RegistrationModal: React.FC<RegistrationModalProps> = ({
 isOpen,
 onClose,
 users,
 onRegisterUser,
 onSelectActiveUser,
 activeUserId,
}) => {
 const [tab, setTab] = useState<'register' | 'switch'>('register');
 const [name, setName] = useState('');
 const [selectedClass, setSelectedClass] = useState<ClassKey>('warrior');
 const [gender, setGender] = useState<GenderKey>('male');
 const [selectedColor, setSelectedColor] = useState<string>('#f59e0b');
 const [familyCode, setFamilyCode] = useState('FAM-7892');
 const [refCode, setRefCode] = useState('');
 const [error, setError] = useState<string | null>(null);

 // Automatically select an available unique color when opening
 useEffect(() => {
 if (isOpen) {
 const takenHexes = users.map((u) => (u.character_color || u.color || '').toLowerCase());
 const available = CHARACTER_COLORS.find((c) => !takenHexes.includes(c.hex.toLowerCase()));
 if (available) {
 setSelectedColor(available.hex);
 }
 }
 }, [isOpen, users]);

 if (!isOpen) return null;

 const trimmedName = name.trim();
 const existingUserWithName = users.find(
 (u) => u.display_name.trim().toLowerCase() === trimmedName.toLowerCase()
 );
 const isNameTaken = Boolean(trimmedName && existingUserWithName);

 const existingUserWithColor = users.find(
 (u) => (u.character_color || u.color || '').toLowerCase() === selectedColor.toLowerCase()
 );
 const isColorTaken = Boolean(existingUserWithColor);

 const activeColorObj =
 CHARACTER_COLORS.find((c) => c.hex.toLowerCase() === selectedColor.toLowerCase()) ||
 CHARACTER_COLORS[0];

 const handleSubmit = (e: React.FormEvent) => {
 e.preventDefault();
 if (!trimmedName) {
 setError('Пожалуйста, введите имя героя');
 return;
 }

 if (isNameTaken) {
 setError(
 `Имя «${trimmedName}» уже занято героем ${existingUserWithName?.display_name}! Придумайте другое имя.`
 );
 return;
 }

 if (isColorTaken) {
 setError(
 `Цвет «${activeColorObj.name}» уже принадлежит герою ${existingUserWithColor?.display_name}! Выберите свободный цвет.`
 );
 return;
 }

 setError(null);
 onRegisterUser({
 name: trimmedName,
 classKey: selectedClass,
 gender,
 characterColor: selectedColor,
 color: selectedColor,
 familyCode,
 refCode: refCode.trim(),
 });
 setName('');
 setRefCode('');
 onClose();
 };

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
 <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
 {/* Header */}
 <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-indigo-600 to-purple-600 p-0.5 shadow-lg shadow-amber-500/20 flex items-center justify-center">
 <UserPlus className="w-5 h-5 text-white" />
 </div>
 <div>
 <h2 className="text-lg font-bold text-white tracking-wide">
 Регистрация & Войти в Семью
 </h2>
 <p className="text-xs text-slate-400">
 Создайте нового RPG-героя с уникальным цветом или переключитесь
 </p>
 </div>
 </div>
 <button
 onClick={onClose}
 className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
 aria-label="Закрыть"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* Navigation Tabs */}
 <div className="flex border-b border-slate-800 bg-slate-950/30 px-6 pt-3 gap-3 overflow-x-auto scrollbar-none whitespace-nowrap">
 <button
 onClick={() => setTab('register')}
 className={`pb-3 text-xs font-bold uppercase tracking-wider transition border-b-2 ${
 tab === 'register'
 ? 'border-amber-400 text-amber-300'
 : 'border-transparent text-slate-400 hover:text-slate-200'
 }`}
 >
 Зарегистрировать нового героя
 </button>
 <button
 onClick={() => setTab('switch')}
 className={`pb-3 text-xs font-bold uppercase tracking-wider transition border-b-2 ${
 tab === 'switch'
 ? 'border-amber-400 text-amber-300'
 : 'border-transparent text-slate-400 hover:text-slate-200'
 }`}
 >
 Участники семьи ({users.length})
 </button>
 </div>

 {/* Content Body */}
 <div className="p-6 overflow-y-auto space-y-5 flex-1">
 {tab === 'register' ? (
 <form onSubmit={handleSubmit} className="space-y-5">
 {/* Name Input with Uniqueness Validation */}
 <div>
 <div className="flex items-center justify-between mb-2">
 <label
 htmlFor="hero-name"
 className="block text-xs font-semibold text-slate-300 uppercase tracking-wider"
 >
 Имя Игрока / Героя: <span className="text-amber-400">*</span>
 </label>
 {trimmedName && (
 <span
 className={`text-[11px] font-semibold flex items-center gap-1 ${
 isNameTaken ? 'text-red-400' : 'text-emerald-400'
 }`}
 >
 {isNameTaken ? (
 <>
 <AlertCircle className="w-3.5 h-3.5" />
 <span>Имя уже занято</span>
 </>
 ) : (
 <>
 <CheckCircle2 className="w-3.5 h-3.5" />
 <span>Имя свободно</span>
 </>
 )}
 </span>
 )}
 </div>

 <div className="relative">
 <input
 id="hero-name"
 type="text"
 required
 value={name}
 onChange={(e) => {
 setName(e.target.value);
 if (error) setError(null);
 }}
 placeholder="Например: Алексей, Катя, Артем..."
 className={`w-full bg-slate-950 border rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none transition ${
 isNameTaken
 ? 'border-red-500/80 focus:border-red-400 ring-1 ring-red-500/30'
 : trimmedName
 ? 'border-emerald-500/60 focus:border-emerald-400'
 : 'border-slate-700 focus:border-amber-400'
 }`}
 />
 </div>

 {isNameTaken && (
 <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
 <AlertCircle className="w-3.5 h-3.5 shrink-0" />
 <span>
 Игрок «{trimmedName}» уже состоит в вашей семье! Пожалуйста, укажите уникальное
 имя.
 </span>
 </p>
 )}
 </div>

 {/* Unique Color Selection */}
 <div>
 <div className="flex items-center justify-between mb-2">
 <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
 <Palette className="w-4 h-4 text-amber-400" />
 <span>Уникальный цвет героя:</span>
 </label>
 <span className="text-[11px] text-slate-400 italic">
 Для различия в списках семьи
 </span>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
 {CHARACTER_COLORS.map((col) => {
 const isSelected = selectedColor.toLowerCase() === col.hex.toLowerCase();
 const userHoldingColor = users.find(
 (u) =>
 (u.character_color || u.color || '').toLowerCase() === col.hex.toLowerCase()
 );
 const isTaken = Boolean(userHoldingColor);

 return (
 <button
 key={col.id}
 type="button"
 onClick={() => {
 setSelectedColor(col.hex);
 if (error) setError(null);
 }}
 className={`relative p-2.5 rounded-xl border transition-all text-left flex items-center gap-2.5 ${
 isSelected
 ? `bg-slate-800 border-2 ${col.borderClass} ${col.ringClass} ring-2 shadow-lg scale-[1.02]`
 : isTaken
 ? 'bg-slate-950/60 border-slate-800 opacity-60 hover:opacity-80'
 : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
 }`}
 >
 <span
 className="w-5 h-5 rounded-full shrink-0 shadow-md border border-white/20 flex items-center justify-center text-white"
 style={{ backgroundColor: col.hex }}
 >
 {isSelected && <Check className="w-3 h-3 text-white drop-shadow" />}
 </span>

 <div className="min-w-0 flex-1">
 <div className="text-xs font-bold text-white truncate">{col.name}</div>
 {isTaken ? (
 <span className="text-[10px] text-amber-400/90 font-medium truncate flex items-center gap-0.5">
 <Lock className="w-2.5 h-2.5" />
 <span>{userHoldingColor?.display_name}</span>
 </span>
 ) : (
 <span className="text-[10px] text-emerald-400 font-medium">
 Свободен
 </span>
 )}
 </div>
 </button>
 );
 })}
 </div>

 {isColorTaken && (
 <p className="mt-2 text-xs text-amber-400 flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg">
 <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
 <span>
 Этот цвет уже выбран героем «{existingUserWithColor?.display_name}». Вы можете
 выбрать его, но для полного визуального различия лучше использовать уникальный цвет!
 </span>
 </p>
 )}
 </div>

 {/* Gender Selection */}
 <div>
 <label className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">
 Пол персонажа:
 </label>
 <div className="grid grid-cols-2 gap-3">
 <button
 type="button"
 onClick={() => setGender('male')}
 className={`py-2.5 px-4 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
 gender === 'male'
 ? 'bg-blue-600/30 border-blue-400 text-white shadow-md'
 : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-white'
 }`}
 >
 <span> Мужской</span>
 </button>
 <button
 type="button"
 onClick={() => setGender('female')}
 className={`py-2.5 px-4 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
 gender === 'female'
 ? 'bg-pink-600/30 border-pink-400 text-white shadow-md'
 : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-white'
 }`}
 >
 <span> Женский</span>
 </button>
 </div>
 </div>

 {/* Class Selection */}
 <div>
 <label className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">
 Игровой Класс:
 </label>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 {CLASS_OPTIONS.map((c) => {
 const isSelected = selectedClass === c.key;
 return (
 <div
 key={c.key}
 onClick={() => setSelectedClass(c.key)}
 className={`p-3.5 rounded-xl border cursor-pointer transition flex flex-col justify-between bg-gradient-to-br ${
 c.color
 } ${
 isSelected
 ? 'ring-2 ring-amber-400 shadow-lg scale-[1.01]'
 : 'opacity-70 hover:opacity-100'
 }`}
 >
 <div className="flex items-center justify-between mb-1">
 <span className="font-bold text-sm text-white">{c.title}</span>
 {isSelected && <Check className="w-4 h-4 text-amber-400" />}
 </div>
 <p className="text-[11px] text-slate-300 mb-1">{c.perk}</p>
 <p className="text-[10px] text-slate-400 italic">{c.skill}</p>
 </div>
 );
 })}
 </div>
 </div>

 {/* Hero Live Preview Card */}
 <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center gap-4">
 <PixelAvatar
 type="character"
 classKey={selectedClass}
 gender={gender}
 characterColor={selectedColor}
 size="md"
 animated={true}
 />
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2">
 <span
 className="w-3 h-3 rounded-full shrink-0 border border-white/20 shadow-sm"
 style={{ backgroundColor: selectedColor }}
 />
 <h4 className="text-sm font-bold text-white truncate">
 {trimmedName || 'Новый Герой'}
 </h4>
 <span className="text-[10px] bg-slate-800 border border-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-mono">
 1 ур.
 </span>
 </div>
 <p className="text-xs text-slate-400 mt-0.5">
 Класс:{' '}
 <span className="text-amber-300 font-semibold">
 {CLASS_OPTIONS.find((c) => c.key === selectedClass)?.title}
 </span>{' '}
 · {gender === 'female' ? ' Жен.' : ' Муж.'}
 </p>
 </div>
 </div>

 {/* Referral Code Optional Input */}
 <div>
 <label
 htmlFor="ref-code"
 className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider flex items-center justify-between"
 >
 <span className="flex items-center gap-1.5 text-amber-400">
 <Gift className="w-3.5 h-3.5" />
 Реферальный код друга (Опционально):
 </span>
 <span className="text-[10px] text-emerald-400 font-bold font-mono">+50 +15</span>
 </label>
 <input
 id="ref-code"
 type="text"
 value={refCode}
 onChange={(e) => setRefCode(e.target.value)}
 placeholder="Например: ref_1 или имя друга"
 className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition"
 />
 </div>

 {/* Family Code Input */}
 <div>
 <label
 htmlFor="family-code"
 className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider"
 >
 Код Семьи (для синхронизации):
 </label>
 <div className="flex gap-2">
 <input
 id="family-code"
 type="text"
 value={familyCode}
 onChange={(e) => setFamilyCode(e.target.value.toUpperCase())}
 placeholder="FAM-7892"
 className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white uppercase font-mono tracking-wider focus:outline-none focus:border-amber-400"
 />
 <span className="px-3 py-2.5 bg-slate-800 text-slate-400 rounded-xl text-xs flex items-center gap-1 font-semibold">
 <Shield className="w-3.5 h-3.5 text-amber-400" />
 <span>Семья</span>
 </span>
 </div>
 </div>

 {error && (
 <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 flex items-center gap-2">
 <AlertCircle className="w-4 h-4 shrink-0" />
 <span>{error}</span>
 </div>
 )}

 {/* Submit Button */}
 <button
 type="submit"
 disabled={isNameTaken}
 className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm text-white shadow-xl transition flex items-center justify-center gap-2 ${
 isNameTaken
 ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
 : 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 shadow-amber-500/20 hover:opacity-95 active:scale-[0.99]'
 }`}
 >
 <Sparkles className="w-4 h-4 text-amber-200" />
 <span>Зарегистрировать Героя и Войти</span>
 </button>
 </form>
 ) : (
 /* Switch User Tab */
 <div className="space-y-4">
 <p className="text-xs text-slate-400">
 Выберите активный профиль для выполнения задач, применения скиллов и покупки наград:
 </p>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 {users.map((u) => {
 const isActive = u.id === activeUserId;
 const userColor = u.character_color || u.color || '#f59e0b';
 const isWarrior = u.class === 'warrior';

 return (
 <div
 key={u.id}
 onClick={() => {
 onSelectActiveUser(u.id);
 onClose();
 }}
 className={`p-4 rounded-xl border cursor-pointer transition flex items-center justify-between ${
 isActive
 ? 'bg-amber-500/20 border-amber-400 text-white ring-2 ring-amber-400/50'
 : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
 }`}
 >
 <div className="flex items-center gap-3">
 <div
 className="w-10 h-10 rounded-xl border border-white/20 flex items-center justify-center text-lg shadow-md shrink-0 relative"
 style={{ backgroundColor: `${userColor}33` }}
 >
 <span
 className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full border border-white/30"
 style={{ backgroundColor: userColor }}
 />
 <PixelAvatar
 type="character"
 classKey={u.class}
 gender={u.gender || 'male'}
 characterColor={userColor}
 size="sm"
 animated={false}
 />
 </div>
 <div>
 <div className="font-bold text-sm text-white flex items-center gap-2">
 <span
 className="w-2.5 h-2.5 rounded-full shrink-0"
 style={{ backgroundColor: userColor }}
 />
 <span>{u.display_name}</span>
 {isActive && (
 <span className="text-[10px] bg-amber-400 text-slate-950 font-bold px-1.5 py-0.2 rounded">
 Активен
 </span>
 )}
 </div>
 <p className="text-xs text-slate-400">
 {Math.floor(u.xp / 100) + 1} ур. · {u.gold} · {u.current_streak || 0} дн.
 </p>
 </div>
 </div>
 <UserCheck
 className={`w-5 h-5 ${isActive ? 'text-amber-400' : 'text-slate-600'}`}
 />
 </div>
 );
 })}
 </div>

 <button
 onClick={() => setTab('register')}
 className="w-full py-3 px-4 rounded-xl border border-dashed border-amber-500/40 text-amber-300 hover:bg-amber-500/10 text-xs font-semibold transition flex items-center justify-center gap-2 mt-4"
 >
 <UserPlus className="w-4 h-4" />
 <span>+ Добавить ещё одного члена семьи</span>
 </button>
 </div>
 )}
 </div>
 </div>
 </div>
 );
};
