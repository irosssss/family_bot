import React, { useState, useEffect } from 'react';
import { Users, Crown, Key, Copy, CheckCircle, Sparkles, Shield, UserPlus, CreditCard, Zap, Gift, Check, Bell, Send, CheckCircle2, Smartphone, Settings, Volume2, VolumeX, RefreshCw, RotateCcw, UploadCloud } from 'lucide-react';
import { User } from '../types';
import { UploadAssets } from './UploadAssets';

interface FamilyManagementModalProps {
 isOpen: boolean;
 onClose: () => void;
 users: User[];
 activeUser: User;
 onAddUser?: (name: string, role: 'parent' | 'child', classKey?: string) => void;
 soundEnabled?: boolean;
 onToggleSound?: () => void;
 onRefresh?: () => void;
 isRefreshing?: boolean;
 onOpenResetModal?: () => void;
}

export const FamilyManagementModal: React.FC<FamilyManagementModalProps> = ({
 isOpen,
 onClose,
 users,
 activeUser,
 onAddUser,
 soundEnabled = true,
 onToggleSound,
 onRefresh,
 isRefreshing = false,
 onOpenResetModal,
}) => {
 const [activeTab, setActiveTab] = useState<'family' | 'app_settings' | 'add_member' | 'plans' | 'mobile_ux' | 'assets'>('family');
 const [familyCode, setFamilyCode] = useState('FAM-1234');
 const [familyName, setFamilyName] = useState('Семья Героев');
 const [isCopied, setIsCopied] = useState(false);

 // New member form
 const [newMemberName, setNewMemberName] = useState('');
 const [newMemberRole, setNewMemberRole] = useState<'parent' | 'child'>('child');
 const [newMemberClass, setNewMemberClass] = useState<'warrior' | 'mage'>('warrior');

 // Telegram Push State
 const [botToken, setBotToken] = useState('');
 const [chatId, setChatId] = useState('');
 const [pushEnabled, setPushEnabled] = useState(true);
 const [isSavingTg, setIsSavingTg] = useState(false);
 const [tgSaveStatus, setTgSaveStatus] = useState<string | null>(null);
 const [isTestingTg, setIsTestingTg] = useState(false);

 // Subscription state simulation
 const [isPremium, setIsPremium] = useState(false);
 const [purchasingPlan, setPurchasingPlan] = useState<string | null>(null);

 useEffect(() => {
 if (isOpen) {
 fetch('/api/haptics/config')
 .then((res) => res.json())
 .then((data) => {
 if (data) {
 setBotToken(data.botToken || '');
 setChatId(data.chatId || '');
 setPushEnabled(data.enabled ?? true);
 }
 })
 .catch((err) => console.warn('Failed to load telegram config:', err));

 // ARC-02: реальный код семьи вместо хардкода
 fetch(`/api/family/code/${activeUser.id}`)
 .then((res) => (res.ok ? res.json() : null))
 .then((data) => {
 if (data?.family_code) setFamilyCode(data.family_code);
 })
 .catch((err) => console.warn('Failed to load family code:', err));
 }
 }, [isOpen, activeUser.id]);

 if (!isOpen) return null;

 const handleCopyCode = () => {
 navigator.clipboard.writeText(familyCode);
 setIsCopied(true);
 setTimeout(() => setIsCopied(false), 2000);
 };

 const handleAddMember = (e: React.FormEvent) => {
 e.preventDefault();
 if (!newMemberName.trim()) return;
 if (onAddUser) {
 onAddUser(newMemberName.trim(), newMemberRole, newMemberClass);
 }
 setNewMemberName('');
 setActiveTab('family');
 };

 const handleSaveTelegramConfig = async (e: React.FormEvent) => {
 e.preventDefault();
 setIsSavingTg(true);
 setTgSaveStatus(null);
 try {
 const res = await fetch('/api/haptics/config', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ botToken, chatId, enabled: pushEnabled }),
 });
 const data = await res.json();
 if (data.success) {
 setTgSaveStatus(' Настройки Telegram Push сохранены!');
 } else {
 setTgSaveStatus(' Ошибка сохранения');
 }
 } catch (e) {
 setTgSaveStatus(' Ошибка сети');
 } finally {
 setIsSavingTg(false);
 }
 };

 const handleTestTelegramPush = async () => {
 setIsTestingTg(true);
 try {
 const res = await fetch('/api/haptics/test', { method: 'POST' });
 const data = await res.json();
 alert(data.message || 'Тестовое push-уведомление отправлено!');
 } catch (e) {
 alert('Ошибка при отправке тестового сообщения');
 } finally {
 setIsTestingTg(false);
 }
 };

 const handleUpgrade = (planName: string) => {
 setPurchasingPlan(planName);
 setTimeout(() => {
 setIsPremium(true);
 setPurchasingPlan(null);
 }, 1200);
 };

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
 <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
 {/* Header */}
 <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
 <div className="flex items-center gap-3">
 <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
 <Users className="w-6 h-6" />
 </div>
 <div>
 <h2 className="text-xl font-bold text-white flex items-center gap-2">
 Управление Семьей и Подпиской
 {isPremium && (
 <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1 font-semibold">
 <Crown className="w-3 h-3 text-amber-400" /> PREMIUM
 </span>
 )}
 </h2>
 <p className="text-xs text-slate-400">
 Настройки доступа, роли участников и тарифный план
 </p>
 </div>
 </div>
 <button
 onClick={onClose}
 className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition"
 >
 
 </button>
 </div>

 {/* Tabs */}
 <div className="flex border-b border-slate-800 bg-slate-900/80 px-5 pt-2 gap-2 overflow-x-auto scrollbar-none">
 <button
 onClick={() => setActiveTab('family')}
 className={`px-4 py-2.5 text-sm font-medium rounded-t-xl transition flex items-center gap-2 border-b-2 shrink-0 ${
 activeTab === 'family'
 ? 'border-amber-500 text-amber-400 bg-slate-800/60'
 : 'border-transparent text-slate-400 hover:text-slate-200'
 }`}
 >
 <Users className="w-4 h-4" />
 Состав Семьи ({users.length})
 </button>
 <button
 onClick={() => setActiveTab('add_member')}
 className={`px-4 py-2.5 text-sm font-medium rounded-t-xl transition flex items-center gap-2 border-b-2 shrink-0 ${
 activeTab === 'add_member'
 ? 'border-amber-500 text-amber-400 bg-slate-800/60'
 : 'border-transparent text-slate-400 hover:text-slate-200'
 }`}
 >
 <UserPlus className="w-4 h-4" />
 + Участник
 </button>
 <button
 onClick={() => setActiveTab('plans')}
 className={`px-4 py-2.5 text-sm font-medium rounded-t-xl transition flex items-center gap-2 border-b-2 shrink-0 ${
 activeTab === 'plans'
 ? 'border-amber-500 text-amber-400 bg-slate-800/60'
 : 'border-transparent text-slate-400 hover:text-slate-200'
 }`}
 >
 <Crown className="w-4 h-4 text-amber-400" />
 Тарифы
 </button>
 <button
 onClick={() => setActiveTab('mobile_ux')}
 className={`px-4 py-2.5 text-sm font-medium rounded-t-xl transition flex items-center gap-2 border-b-2 shrink-0 ${
 activeTab === 'mobile_ux'
 ? 'border-emerald-500 text-emerald-400 bg-slate-800/60'
 : 'border-transparent text-slate-400 hover:text-slate-200'
 }`}
 >
 <Smartphone className="w-4 h-4 text-emerald-400" />
 Mobile UX
 </button>
 <button
 onClick={() => setActiveTab('assets')}
 className={`px-4 py-2.5 text-sm font-medium rounded-t-xl transition flex items-center gap-2 border-b-2 shrink-0 ${
 activeTab === 'assets'
 ? 'border-blue-500 text-blue-400 bg-slate-800/60'
 : 'border-transparent text-slate-400 hover:text-slate-200'
 }`}
 >
 <UploadCloud className="w-4 h-4 text-blue-400" />
 ZIP Архивы
 </button>
 </div>

 {/* Modal Content */}
 <div className="p-6 overflow-y-auto space-y-6 flex-1">
 {/* TAB 1: FAMILY MEMBERS */}
 {activeTab === 'family' && (
 <div className="space-y-6">
 {/* Family Invite Card */}
 <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-slate-800 to-indigo-500/10 border border-amber-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
 <div>
 <div className="text-xs text-amber-400 font-semibold tracking-wider uppercase flex items-center gap-1">
 <Shield className="w-3.5 h-3.5" /> Код Вашей Семьи
 </div>
 <div className="text-lg font-bold text-white mt-0.5">{familyName}</div>
 <p className="text-xs text-slate-400">
 Передайте этот код членам семьи при регистрации для присоединения к вашему клану.
 </p>
 </div>
 <div className="flex items-center gap-2 w-full sm:w-auto">
 <div className="bg-slate-950 border border-slate-700 px-4 py-2 rounded-xl text-lg font-mono font-bold text-amber-400 tracking-widest">
 {familyCode}
 </div>
 <button
 onClick={handleCopyCode}
 className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-3 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition whitespace-nowrap"
 >
 {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
 {isCopied ? 'Скопировано!' : 'Копировать'}
 </button>
 </div>
 </div>

 {/* Members List */}
 <div className="space-y-3">
 <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider text-xs">
 Участники Семьи ({users.length})
 </h3>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 {users.map((u) => {
 const isParent = u.family_role === 'parent' || u.is_admin === true;
 return (
 <div
 key={u.id}
 className={`p-4 rounded-xl border flex items-center justify-between ${
 u.id === activeUser.id
 ? 'bg-amber-500/10 border-amber-500/40'
 : 'bg-slate-800/50 border-slate-700/60'
 }`}
 >
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xl">
 {u.class === 'warrior' ? '' : u.class === 'mage' ? '' : ''}
 </div>
 <div>
 <div className="font-bold text-white flex items-center gap-1.5 text-sm">
 {u.display_name}
 {u.id === activeUser.id && (
 <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-normal">
 Вы
 </span>
 )}
 </div>
 <div className="text-xs text-slate-400 flex items-center gap-2">
 <span>Уровень {Math.floor(u.xp / 100) + 1}</span>
 <span>•</span>
 <span className="text-amber-400">{u.gold} </span>
 </div>
 </div>
 </div>
 <div className="text-right">
 <span
 className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
 isParent
 ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
 : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
 }`}
 >
 {isParent ? 'Родитель (Админ)' : 'Ребенок (Игрок)'}
 </span>
 </div>
 </div>
 );
 })}
 </div>
 </div>
 </div>
 )}

 {/* TAB 2: ADD MEMBER */}
 {activeTab === 'add_member' && (
 <form onSubmit={handleAddMember} className="space-y-4">
 <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 space-y-4">
 <h3 className="font-semibold text-white text-sm">Регистрация нового члена семьи</h3>
 
 <div>
 <label className="block text-xs font-medium text-slate-300 mb-1">
 Имя пользователя / Никнейм
 </label>
 <input
 type="text"
 required
 value={newMemberName}
 onChange={(e) => setNewMemberName(e.target.value)}
 placeholder="Например, Артём или Мама"
 className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
 />
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="block text-xs font-medium text-slate-300 mb-1">
 Роль в семье
 </label>
 <select
 value={newMemberRole}
 onChange={(e) => setNewMemberRole(e.target.value as 'parent' | 'child')}
 className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
 >
 <option value="child">Ребенок (Игрок)</option>
 <option value="parent">Родитель (Администратор)</option>
 </select>
 </div>

 <div>
 <label className="block text-xs font-medium text-slate-300 mb-1">
 Игровой Класс
 </label>
 <select
 value={newMemberClass}
 onChange={(e) => setNewMemberClass(e.target.value as 'warrior' | 'mage')}
 className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
 >
 <option value="warrior"> Воин</option>
 <option value="mage"> Маг</option>
 </select>
 </div>
 </div>

 <div className="text-xs text-slate-400 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
 Новый пользователь автоматически подключается к вашей семье по коду <span className="text-amber-400 font-mono">{familyCode}</span> и получает стартовый набор золота и квестов.
 </div>
 </div>

 <button
 type="submit"
 className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm"
 >
 <UserPlus className="w-4 h-4" /> Добавить в Семью
 </button>
 </form>
 )}

 {/* TAB 3: MONETIZATION & PLANS */}
 {activeTab === 'plans' && (
 <div className="space-y-6">
 <div className="text-center space-y-1">
 <h3 className="text-lg font-bold text-white">Тарифные Планы и Монетизация</h3>
 <p className="text-xs text-slate-400">
 Выберите оптимальный тариф для вашей семьи или докупите монеты
 </p>
 </div>

 {/* Plans Comparison */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 {/* Free Plan */}
 <div className="p-5 rounded-2xl bg-slate-800/40 border border-slate-700/60 space-y-4 flex flex-col justify-between">
 <div className="space-y-3">
 <div className="flex items-center justify-between">
 <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
 Бесплатный Тариф
 </span>
 {!isPremium && (
 <span className="text-[11px] bg-slate-700 text-slate-300 px-2.5 py-0.5 rounded-full font-medium">
 Текущий
 </span>
 )}
 </div>
 <div className="text-2xl font-black text-white">0 ₽ <span className="text-xs font-normal text-slate-400">/ навсегда</span></div>
 
 <ul className="space-y-2 text-xs text-slate-300">
 <li className="flex items-center gap-2">
 <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> До 3 членов семьи
 </li>
 <li className="flex items-center gap-2">
 <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> Базовый список квестов
 </li>
 <li className="flex items-center gap-2">
 <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> 1 Босс в месяц
 </li>
 <li className="flex items-center gap-2 text-slate-500 line-through">
 Telegram-уведомления родителям
 </li>
 <li className="flex items-center gap-2 text-slate-500 line-through">
 Неограниченная лавка наград
 </li>
 </ul>
 </div>

 <button
 disabled
 className="w-full py-2.5 rounded-xl border border-slate-700 text-slate-400 text-xs font-semibold bg-slate-900/50"
 >
 {!isPremium ? 'Активный Тариф' : 'Базовый'}
 </button>
 </div>

 {/* Premium Plan */}
 <div className="p-5 rounded-2xl bg-gradient-to-b from-amber-500/10 to-indigo-500/10 border-2 border-amber-500/40 space-y-4 flex flex-col justify-between relative overflow-hidden">
 <div className="absolute top-3 right-3">
 <span className="text-[10px] bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
 Хит
 </span>
 </div>

 <div className="space-y-3">
 <div className="flex items-center gap-1.5">
 <Crown className="w-4 h-4 text-amber-400" />
 <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
 Family Premium
 </span>
 </div>
 <div className="text-2xl font-black text-white">
 390 ₽ <span className="text-xs font-normal text-slate-400">/ месяц</span>
 </div>

 <ul className="space-y-2 text-xs text-slate-200">
 <li className="flex items-center gap-2">
 <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
 <strong>Безлимит</strong> участников семьи
 </li>
 <li className="flex items-center gap-2">
 <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
 Все еженедельные боссы и испытания
 </li>
 <li className="flex items-center gap-2">
 <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
 Мгновенные <strong>Telegram-уведомления</strong> родителям
 </li>
 <li className="flex items-center gap-2">
 <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
 Кастомная лавка наград и аналитика
 </li>
 </ul>
 </div>

 <button
 onClick={() => handleUpgrade('Family Premium')}
 disabled={isPremium || !!purchasingPlan}
 className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-1.5"
 >
 {purchasingPlan === 'Family Premium' ? (
 'Оформление...'
 ) : isPremium ? (
 <span className="flex items-center gap-1"><Check className="w-4 h-4" /> Подписка Активна</span>
 ) : (
 <>
 <Zap className="w-4 h-4 fill-current" /> Оформить Премиум за 390 ₽
 </>
 )}
 </button>
 </div>
 </div>

 {/* Coin Packs Microtransactions */}
 <div className="pt-2 space-y-3">
 <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
 <CreditCard className="w-4 h-4 text-amber-400" /> Докупка Виртуального Золота (Микротранзакции)
 </h4>
 <div className="grid grid-cols-3 gap-2">
 <div className="p-3 bg-slate-800/60 border border-slate-700 rounded-xl text-center space-y-1">
 <div className="text-sm font-bold text-amber-400">+100 </div>
 <div className="text-[11px] text-slate-400">99 ₽</div>
 <button
 onClick={() => alert('Симуляция: Куплен пакет 100 золота за 99 ₽!')}
 className="w-full mt-1 bg-slate-700 hover:bg-slate-600 text-white text-[11px] py-1 rounded-lg font-medium"
 >
 Купить
 </button>
 </div>
 <div className="p-3 bg-slate-800/60 border border-amber-500/30 rounded-xl text-center space-y-1 bg-amber-500/5">
 <div className="text-sm font-bold text-amber-400">+500 </div>
 <div className="text-[11px] text-slate-400">390 ₽</div>
 <button
 onClick={() => alert('Симуляция: Куплен пакет 500 золота за 390 ₽!')}
 className="w-full mt-1 bg-amber-500 hover:bg-amber-600 text-slate-950 text-[11px] py-1 rounded-lg font-bold"
 >
 Купить
 </button>
 </div>
 <div className="p-3 bg-slate-800/60 border border-slate-700 rounded-xl text-center space-y-1">
 <div className="text-sm font-bold text-amber-400">+1500 </div>
 <div className="text-[11px] text-slate-400">990 ₽</div>
 <button
 onClick={() => alert('Симуляция: Куплен пакет 1500 золота за 990 ₽!')}
 className="w-full mt-1 bg-slate-700 hover:bg-slate-600 text-white text-[11px] py-1 rounded-lg font-medium"
 >
 Купить
 </button>
 </div>
 </div>
 </div>
 </div>
 )}

 {/* TAB 5: MOBILE UX STANDARDS (Checklist.design) */}
 {activeTab === 'mobile_ux' && (
 <div className="space-y-4">
 <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700 space-y-2">
 <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
 <Smartphone className="w-5 h-5" />
 <span>Стандарты Checklist.design Mobile UX</span>
 </div>
 <p className="text-xs text-slate-300 leading-relaxed">
 Приложение спроектировано по стандарту Checklist.design для мобильных устройств и Telegram Mini App:
 </p>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
 <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
 <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
 <CheckCircle className="w-4 h-4" /> Touch Target Size (&ge;44px)
 </div>
 <div className="text-slate-400 text-[11px]">
 Все кнопки и интерактивные элементы управления адаптированы под комфортное нажатие пальцем без промахов.
 </div>
 </div>

 <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
 <div className="font-semibold text-blue-400 flex items-center gap-1.5">
 <CheckCircle className="w-4 h-4" /> Visual Feedback
 </div>
 <div className="text-slate-400 text-[11px]">
 Мгновенный визуальный отклик при нажатии на задачу, покупке наград или переключении персонажей.
 </div>
 </div>

 <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
 <div className="font-semibold text-purple-400 flex items-center gap-1.5">
 <CheckCircle className="w-4 h-4" /> Telegram Mini App Safe Padding
 </div>
 <div className="text-slate-400 text-[11px]">
 Нижняя панель навигации автоматически учитывает отступы системных жестов iOS и Android.
 </div>
 </div>

 <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
 <div className="font-semibold text-amber-400 flex items-center gap-1.5">
 <CheckCircle className="w-4 h-4" /> High Contrast Typography
 </div>
 <div className="text-slate-400 text-[11px]">
 Шрифты и иконки оптимизированы для быстрой читаемости на ярком солнце и при ночном освещении.
 </div>
 </div>
 </div>
 </div>
 )}
 {/* TAB 6: UPLOAD ASSETS */}
 {activeTab === 'assets' && (
 <div className="space-y-6">
 <UploadAssets />
 </div>
 )}
 </div>
 </div>
 </div>
 );
};
