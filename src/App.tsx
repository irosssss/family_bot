import React, { useState, useEffect } from 'react';
import {
  AppState,
  Boss,
  Challenge,
  ClassKey,
  GenderKey,
  Completion,
  FeedEntry,
  Pet,
  Reward,
  ShopItem,
  Task,
  User,
} from './types';
import { Navbar } from './components/Navbar';
import { PlayerCard } from './components/PlayerCard';
import { TodayTasks } from './components/TodayTasks';
import { BossBattle } from './components/BossBattle';
import { ChallengeCard } from './components/ChallengeCard';
import { FeedJournal } from './components/FeedJournal';
import { ShopAndRewardsModal } from './components/ShopAndRewardsModal';
import { AddTaskModal } from './components/AddTaskModal';
import { AddRewardModal } from './components/AddRewardModal';
import { ResetConfirmModal } from './components/ResetConfirmModal';
import { FamilyManagementModal } from './components/FamilyManagementModal';
import { RegistrationModal } from './components/RegistrationModal';
import { ReferralModal } from './components/ReferralModal';
import { MobileChecklistModal } from './components/MobileChecklistModal';
import { CharacterEditorModal } from './components/CharacterEditorModal';
import { UpgradeGuideModal } from './components/UpgradeGuideModal';
import { FamilyHubScene } from './components/scenes/FamilyHubScene';
import { BossRaidScene } from './components/scenes/BossRaidScene';
import { WardrobeCustomizationScene } from './components/scenes/WardrobeCustomizationScene';
import {
  Sparkles,
  LayoutDashboard,
  CheckSquare,
  Gift,
  Bot,
  RefreshCw,
  Trophy,
  Wand2,
  Smartphone,
  Settings,
  Home,
  Swords,
  Shirt,
  Layers,
} from 'lucide-react';
import { DAYS_OF_WEEK } from './data/initialData';

import { initTelegramWebApp, triggerHaptic } from './utils/haptics';
import { io } from 'socket.io-client';

// Simple Web Audio Sound Synth
class SoundFX {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  }

  playCoin() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, this.ctx.currentTime); // B5
    osc.frequency.setValueAtTime(1318.51, this.ctx.currentTime + 0.08); // E6
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.35);
  }

  playLevelUp() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.1);
      gain.gain.setValueAtTime(0.15, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.3);
    });
  }

  playBossHit() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.25);
  }
}

const sounds = new SoundFX();

export function App() {
  const [appState, setAppState] = useState<AppState | null>(null);
  useEffect(() => {
    const socket = io('/'); // connects to current host
    socket.on('taskApproved', (data) => {
      console.log('Task approved via Telegram:', data);
      alert('Родитель подтвердил квест! Золото начислено.');
      loadState(); // reload state
      triggerHaptic('notification', 'success');
      sounds.playLevelUp();
    });
    socket.on('stateUpdate', () => {
      console.log('Real-time update received');
      loadState();
    });
    socket.on('taskRejected', (data) => {
      console.log('Task rejected via Telegram:', data);
      alert('Родитель отклонил квест. Придется переделать!');
      loadState();
      triggerHaptic('notification', 'error');
    });
    return () => { socket.disconnect(); };
  }, []);
  const [activeUserId, setActiveUserId] = useState<number>(1);
  const [activeNavTab, setActiveNavTab] = useState<'dashboard' | 'tasks' | 'shop'>('dashboard');
  const [activeScene, setActiveScene] = useState<'hub' | 'boss' | 'wardrobe' | 'overview'>('hub');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals
  const [isShopModalOpen, setIsShopModalOpen] = useState(false);
  const [shopModalTab, setShopModalTab] = useState<'rewards' | 'shop' | 'pets' | 'achievements' | 'class' | 'wardrobe'>('rewards');
  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
  const [isAddRewardModalOpen, setIsAddRewardModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isFamilyModalOpen, setIsFamilyModalOpen] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isReferralModalOpen, setIsReferralModalOpen] = useState(false);
  const [isChecklistModalOpen, setIsChecklistModalOpen] = useState(false);
  const [isCharacterEditorOpen, setIsCharacterEditorOpen] = useState(false);
  const [isUpgradeGuideOpen, setIsUpgradeGuideOpen] = useState(false);

  const handleSaveCharacter = async (updates: {
    gender?: GenderKey;
    character_color?: string;
    skin_tone?: string;
    hair_style?: string;
    hair_color?: string;
    eye_color?: string;
  }) => {
    if (!activeUser) return;
    try {
      await fetch('/api/users/update-character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id, ...updates }),
      });
      triggerHaptic('notification', 'success');
      showToast('✨ Внешность персонажа успешно сохранена!');
      loadState();
    } catch (e) {
      showToast('Внешность персонажа сохранена!');
    }
  };

  const handleUpdateUserBackground = async (bgUrl: string) => {
    if (!activeUser) return;
    try {
      const res = await fetch('/api/users/custom-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id, bgUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`⛔ ${data.error}`);
        return;
      }
      triggerHaptic('notification', 'success');
      showToast('🎨 Новый AI фон от PixelLab установлен!');
      loadState();
    } catch (e) {
      showToast('Ошибка смены фона');
    }
  };

  const handleUpdateUserAvatar = async (avatarUrl: string) => {
    if (!activeUser) return;
    try {
      const res = await fetch('/api/users/custom-avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id, avatarUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`⛔ ${data.error}`);
        return;
      }
      triggerHaptic('notification', 'success');
      showToast('👤 Новый AI аватар от PixelLab установлен!');
      loadState();
    } catch (e) {
      showToast('Ошибка смены аватара');
    }
  };

  const handleRegisterUser = async (userData: {
    name: string;
    classKey: ClassKey;
    gender: GenderKey;
    familyCode?: string;
    customAvatarUrl?: string;
    characterColor?: string;
    color?: string;
    refCode?: string;
  }) => {
    try {
      const res = await fetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...userData,
          character_color: userData.characterColor || userData.color,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`⚠️ ${data.error || 'Ошибка регистрации'}`);
        return;
      }
      if (data.user) {
        setActiveUserId(data.user.id);
        if (data.referralMessage) {
          showToast(`🎉 ${data.referralMessage}`);
        } else {
          showToast(`🎉 Герой ${data.user.display_name} успешно зарегистрирован!`);
        }
        loadState();
      }
    } catch (e) {
      showToast('Ошибка при регистрации');
    }
  };

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  const loadState = async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch(`/api/state?userId=${activeUserId}`);
      const data = await res.json();
      setAppState(data);
    } catch (e) {
      console.error('Failed to load state', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    initTelegramWebApp();
    loadState();
  }, [activeUserId]);

  const activeUser = appState?.users.find((u) => u.id === activeUserId) || appState?.users[0];
  const partnerUser = appState?.users.find((u) => u.id !== activeUserId) || appState?.users[1];

  // Complete Task Handler
  const handleCompleteTask = async (taskId: number) => {
    if (!activeUser) return;
    try {
      const res = await fetch('/api/tasks/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id, taskId }),
      });
      const result = await res.json();
      if (!res.ok) {
        showToast(`⚠️ ${result.error || 'Ошибка'}`);
        return;
      }

      sounds.playCoin();
      triggerHaptic('notification', 'success');
      let alertText = `✅ Выполнено! +${result.gold_gain}💰 золота и +${result.xp_gain}⭐ опыта`;

      if (result.level_up) {
        sounds.playLevelUp();
        alertText += ` 🎉 НОВЫЙ УРОВЕНЬ: ${result.new_level}!`;
      }
      if (result.perfect) {
        alertText += ` 🌟 Идеальный день закрыт (+5💰)!`;
      }
      if (result.pet) {
        alertText += ` 🐾 НАЙДЕН ПИТОМЕЦ: ${result.pet.emoji} ${result.pet.title}!`;
      }
      if (result.bossDefeated) {
        sounds.playBossHit();
        alertText += ` 👹 БОСС ПОВЕРЖЕН (+20💰 обоим)!`;
      }
      if (result.challengeCompleted) {
        alertText += ` 🎯 Челлендж недели выполнен (+${result.challengeCompleted.bonus}💰)!`;
      }

      showToast(alertText);
      loadState();
    } catch (e) {
      showToast('❌ Ошибка сети');
    }
  };

  // Toggle/Undo Task
  const handleToggleUndo = async (taskId: number) => {
    if (!activeUser) return;
    try {
      await fetch('/api/tasks/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id, taskId }),
      });
      showToast('Отметка выполнения отменена');
      loadState();
    } catch (e) {
      showToast('Ошибка');
    }
  };

  // Use Class Skill
  const handleUseSkill = async () => {
    if (!activeUser) return;
    try {
      const res = await fetch('/api/skills/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id }),
      });
      const result = await res.json();
      if (!res.ok) {
        showToast(result.error);
        return;
      }
      sounds.playBossHit();
      triggerHaptic('impact', 'medium');
      showToast(result.message);
      loadState();
    } catch (e) {
      showToast('Ошибка применения скилла');
    }
  };

  // Switch Class
  const handleSelectClass = async (className: ClassKey) => {
    if (!activeUser) return;
    try {
      await fetch('/api/users/class', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id, className }),
      });
      const names: Record<string, string> = {
        warrior: 'Воина ⚔️',
        mage: 'Мага 🔮',
        rogue: 'Разбойника 🗡️',
        healer: 'Целителя 💚',
      };
      showToast(`Класс изменён на ${names[className] || className}!`);
      loadState();
    } catch (e) {
      showToast('Ошибка смены класса');
    }
  };

  // Switch Gender
  const handleToggleGender = async (gender: 'male' | 'female') => {
    if (!activeUser) return;
    try {
      await fetch('/api/users/gender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id, gender }),
      });
      showToast(`Пол изменён на ${gender === 'female' ? 'Женский 👩' : 'Мужской 👨'}!`);
      loadState();
    } catch (e) {
      showToast('Ошибка смены пола');
    }
  };

  // Buy Reward
  const handleBuyReward = async (rewardId: number) => {
    if (!activeUser) return;
    try {
      const res = await fetch('/api/rewards/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id, rewardId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`⛔ ${data.error}`);
        return;
      }
      sounds.playCoin();
      triggerHaptic('notification', 'success');
      showToast(`🎁 Награда куплена! ${partnerUser?.display_name} уведомлён(а)!`);
      loadState();
    } catch (e) {
      showToast('Ошибка покупки');
    }
  };

  // Buy Shop Equipment
  const handleBuyShopItem = async (itemId: number) => {
    if (!activeUser) return;
    try {
      const res = await fetch('/api/shop/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id, itemId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`⛔ ${data.error}`);
        return;
      }
      sounds.playCoin();
      triggerHaptic('notification', 'success');
      showToast(`🛍️ Предмет куплен и добавлен в гардероб!`);
      loadState();
    } catch (e) {
      showToast('Ошибка');
    }
  };

  // Equip Item
  const handleEquipItem = async (itemId: number) => {
    if (!activeUser) return;
    try {
      const res = await fetch('/api/shop/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id, itemId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`⛔ ${data.error}`);
        return;
      }
      triggerHaptic('impact', 'medium');
      if (data.message) {
        showToast(`✨ ${data.message}`);
      }
      loadState();
    } catch (e) {
      showToast('Ошибка экипировки');
    }
  };

  // Add Task
  const handleAddTask = async (taskData: any) => {
    try {
      await fetch('/api/tasks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData),
      });
      triggerHaptic('notification', 'success');
      showToast('✅ Новая задача создана!');
      loadState();
    } catch (e) {
      showToast('Ошибка создания задачи');
    }
  };

  // Add Reward
  const handleAddReward = async (rewardData: any) => {
    try {
      await fetch('/api/rewards/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rewardData),
      });
      showToast('🎁 Новая награда добавлена в магазин!');
      loadState();
    } catch (e) {
      showToast('Ошибка');
    }
  };

  // Reset Progress
  const handleResetProgress = async () => {
    if (!activeUser) return;
    try {
      await fetch('/api/user/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id }),
      });
      showToast('Прогресс сброшен для тестирования');
      loadState();
    } catch (e) {
      showToast('Ошибка сброса');
    }
  };

  // Add Family Member
  const handleAddUserToFamily = async (name: string, role: 'parent' | 'child', classKey: string = 'warrior') => {
    if (!appState) return;
    try {
      await fetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          classKey,
          gender: 'male',
          familyCode: 'FAM-1234',
        }),
      });
      await loadState();
      showToast(`🎉 ${name} успешно добавлен(а) в вашу семью!`);
    } catch (e) {
      console.error(e);
      showToast('⚠️ Ошибка при добавлении пользователя');
    }
  };

  // Telegram Simulator Bot execution

  if (!appState || !activeUser) {
    return (
      <div className="min-h-screen bg-[#0b0e14] text-slate-200 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
          <span className="text-sm font-semibold">Загрузка Family Chores...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-200 pb-24 sm:pb-16">
      {/* Top Navbar */}
      <Navbar
        activeUser={activeUser}
        users={appState.users}
        onSelectUser={(u) => setActiveUserId(u.id)}
        boss={appState.boss}
        onUseSkill={handleUseSkill}
        soundEnabled={soundEnabled}
        onToggleSound={() => {
          sounds.enabled = !soundEnabled;
          setSoundEnabled(!soundEnabled);
        }}
        onRefresh={loadState}
        isRefreshing={isRefreshing}
        onOpenAddModal={() => setIsAddTaskModalOpen(true)}
        onOpenFamilyModal={() => setIsFamilyModalOpen(true)}
        onOpenRegisterModal={() => setIsRegisterModalOpen(true)}
        onOpenReferralModal={() => setIsReferralModalOpen(true)}
        onOpenChecklistModal={() => setIsChecklistModalOpen(true)}
        onOpenUpgradeGuide={() => setIsUpgradeGuideOpen(true)}
      />

      {/* Floating Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-white/20 text-xs font-semibold animate-bounce flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-amber-300 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 pt-3 sm:pt-6 pb-28 sm:pb-20 space-y-4 sm:space-y-6">
        {/* TAB 1: Main Dashboard */}
        {activeNavTab === 'dashboard' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Scene Selector Router Tabs (32-bit RPG 3 Scenes) */}
            <div className="flex items-center justify-between bg-slate-900/90 p-1.5 sm:p-2 rounded-2xl border border-amber-500/30 overflow-x-auto gap-1.5 sm:gap-2 shadow-xl scrollbar-none">
              <button
                onClick={() => {
                  triggerHaptic('impact', 'light');
                  setActiveScene('hub');
                }}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold font-pixel-sub transition shrink-0 ${
                  activeScene === 'hub'
                    ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Home className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>
                  <span className="hidden sm:inline">1. Семейный дом</span>
                  <span className="sm:hidden">1. Дом</span>
                </span>
              </button>

              <button
                onClick={() => {
                  triggerHaptic('impact', 'light');
                  setActiveScene('boss');
                }}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold font-pixel-sub transition shrink-0 ${
                  activeScene === 'boss'
                    ? 'bg-red-600 text-white shadow-lg shadow-red-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Swords className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>
                  <span className="hidden sm:inline">2. Битва с боссом</span>
                  <span className="sm:hidden">2. Арена</span>
                </span>
              </button>

              <button
                onClick={() => {
                  triggerHaptic('impact', 'light');
                  setActiveScene('wardrobe');
                }}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold font-pixel-sub transition shrink-0 ${
                  activeScene === 'wardrobe'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Shirt className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>
                  <span className="hidden sm:inline">3. Гардероб</span>
                  <span className="sm:hidden">3. Гардероб</span>
                </span>
              </button>

              <button
                onClick={() => {
                  triggerHaptic('impact', 'light');
                  setActiveScene('overview');
                }}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold font-pixel-sub transition shrink-0 ${
                  activeScene === 'overview'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>
                  <span className="hidden sm:inline">Обзор карточек</span>
                  <span className="sm:hidden">Обзор</span>
                </span>
              </button>
            </div>

            {/* Render 32-bit RPG Scene based on activeScene */}
            {activeScene === 'hub' && (
              <FamilyHubScene
                appState={appState}
                activeUser={activeUser}
                onSelectUser={(u) => setActiveUserId(u.id)}
                onCompleteTask={handleCompleteTask}
                onOpenAddTask={() => setIsAddTaskModalOpen(true)}
              />
            )}

            {activeScene === 'boss' && (
              <BossRaidScene
                appState={appState}
                activeUser={activeUser}
                onUseSkill={handleUseSkill}
              />
            )}

            {activeScene === 'wardrobe' && (
              <WardrobeCustomizationScene
                appState={appState}
                activeUser={activeUser}
                onEquipItem={handleEquipItem}
                onBuyItem={handleBuyShopItem}
              />
            )}

            {activeScene === 'overview' && (
              <div className="space-y-6">
                {/* Dual Player RPG Character Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <PlayerCard
                    shopItems={appState.shopItems}
                    pets={appState.pets}
                    user={activeUser}
                    onOpenWardrobe={() => {
                      setShopModalTab('wardrobe');
                      setIsShopModalOpen(true);
                    }}
                    onOpenCharacterEditor={() => setIsCharacterEditorOpen(true)}
                    onOpenClassModal={() => {
                      setShopModalTab('class');
                      setIsShopModalOpen(true);
                    }}
                    onUseSkill={handleUseSkill}
                    onToggleGender={handleToggleGender}
                  />
                  {partnerUser && (
                    <PlayerCard
                      shopItems={appState.shopItems}
                      pets={appState.pets}
                      user={partnerUser}
                      isPartner={true}
                      onOpenWardrobe={() => {
                        setActiveUserId(partnerUser.id);
                        setShopModalTab('wardrobe');
                        setIsShopModalOpen(true);
                      }}
                      onOpenCharacterEditor={() => {
                        setActiveUserId(partnerUser.id);
                        setIsCharacterEditorOpen(true);
                      }}
                      onOpenClassModal={() => {
                        setActiveUserId(partnerUser.id);
                        setShopModalTab('class');
                        setIsShopModalOpen(true);
                      }}
                      onUseSkill={handleUseSkill}
                      onToggleGender={handleToggleGender}
                    />
                  )}
                </div>

                {/* Boss Monster & Challenge Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <BossBattle boss={appState.boss} onUseSkill={handleUseSkill} />
                  <ChallengeCard challenge={appState.challenge} />
                </div>
              </div>
            )}

            {/* Today's Tasks & Feed Journal Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <TodayTasks
                  tasks={appState.tasks}
                  activeUser={activeUser}
                  onCompleteTask={handleCompleteTask}
                  onOpenAddModal={() => setIsAddTaskModalOpen(true)}
                  onToggleUndoTask={handleToggleUndo}
                />
              </div>
              <div>
                <FeedJournal feed={appState.feed || []} />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Full Task Board */}
        {activeNavTab === 'tasks' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Полное расписание недели</h2>
                <p className="text-xs text-slate-400">
                  Все ежедневные и еженедельные дела Миши и Регины
                </p>
              </div>
              <button
                onClick={() => setIsAddTaskModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md shadow-blue-500/20"
              >
                + Создать задачу
              </button>
            </div>

            {/* Daily Routine section */}
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-white mb-3">☀️ Ежедневные дела</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {appState.tasks
                  .filter((t) => t.task_type === 'daily')
                  .map((t) => (
                    <div
                      key={t.id}
                      className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">{t.title}</p>
                        <span className="text-[11px] text-slate-400">
                          {t.assignee === 'misha' ? 'Миша ⚔️' : t.assignee === 'regina' ? 'Регина 🔮' : 'Вместе 🤝'}
                        </span>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-amber-400/10 text-amber-300 text-xs font-bold border border-amber-400/20">
                        +{t.points} 💰
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Weekly Days Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {DAYS_OF_WEEK.map((dayName, dayIdx) => {
                const dayTasks = appState.tasks.filter(
                  (t) => t.task_type === 'weekly' && t.day_of_week === dayIdx
                );
                return (
                  <div
                    key={dayIdx}
                    className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 flex flex-col justify-between"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-blue-300 mb-2.5 pb-2 border-b border-white/5">
                        {dayName}
                      </h4>
                      <div className="space-y-2">
                        {dayTasks.length === 0 ? (
                          <p className="text-xs text-slate-500 italic py-2">Свободный день</p>
                        ) : (
                          dayTasks.map((t) => (
                            <div
                              key={t.id}
                              className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-xs flex items-center justify-between"
                            >
                              <span className="text-slate-200 truncate mr-2">{t.title}</span>
                              <span className="text-amber-400 font-semibold whitespace-nowrap">
                                +{t.points}💰
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <ShopAndRewardsModal
        isOpen={isShopModalOpen}
        onClose={() => setIsShopModalOpen(false)}
        initialTab={shopModalTab}
        activeUser={activeUser}
        rewards={appState.rewards}
        shopItems={appState.shopItems}
        pets={appState.pets}
        achievements={appState.achievements}
        userItems={appState.userItems}
        userPets={appState.userPets}
        onBuyReward={handleBuyReward}
        onBuyShopItem={handleBuyShopItem}
        onEquipItem={handleEquipItem}
        onSelectClass={handleSelectClass}
        onToggleGender={handleToggleGender}
        onOpenAddRewardModal={() => setIsAddRewardModalOpen(true)}
      />

      {activeUser && (
        <CharacterEditorModal
          isOpen={isCharacterEditorOpen}
          onClose={() => setIsCharacterEditorOpen(false)}
          activeUser={activeUser}
          onSaveCharacter={async () => {
            setIsCharacterEditorOpen(false);
            loadState();
          }}
        />
      )}

      <AddTaskModal
        isOpen={isAddTaskModalOpen}
        onClose={() => setIsAddTaskModalOpen(false)}
        onAddTask={handleAddTask}
      />

      <AddRewardModal
        isOpen={isAddRewardModalOpen}
        onClose={() => setIsAddRewardModalOpen(false)}
        onAddReward={handleAddReward}
      />

      <ResetConfirmModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleResetProgress}
        user={activeUser}
      />

      <FamilyManagementModal
        isOpen={isFamilyModalOpen}
        onClose={() => setIsFamilyModalOpen(false)}
        users={appState.users}
        activeUser={activeUser}
        onAddUser={handleAddUserToFamily}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((prev) => !prev)}
        onRefresh={loadState}
        isRefreshing={isRefreshing}
      />

      <RegistrationModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        users={appState.users}
        onRegisterUser={handleRegisterUser}
        onSelectActiveUser={(userId) => setActiveUserId(userId)}
        activeUserId={activeUser?.id}
      />

      {activeUser && (
        <ReferralModal
          isOpen={isReferralModalOpen}
          onClose={() => setIsReferralModalOpen(false)}
          activeUser={activeUser}
          onUserUpdate={(updatedUser) => {
            loadState();
          }}
        />
      )}

      <MobileChecklistModal
        isOpen={isChecklistModalOpen}
        onClose={() => setIsChecklistModalOpen(false)}
      />

      {activeUser && (
        <CharacterEditorModal
          isOpen={isCharacterEditorOpen}
          onClose={() => setIsCharacterEditorOpen(false)}
          activeUser={activeUser}
          onSaveCharacter={handleSaveCharacter}
        />
      )}

      <UpgradeGuideModal
        isOpen={isUpgradeGuideOpen}
        onClose={() => setIsUpgradeGuideOpen(false)}
      />

      {/* Sticky Mobile Bottom Navigation Bar for Telegram Mini App */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0c1017]/95 backdrop-blur-lg border-t border-white/10 px-2 py-1 flex items-center justify-around tg-safe-padding shadow-2xl">
        <button
          onClick={() => {
            triggerHaptic('impact', 'light');
            setActiveNavTab('dashboard');
          }}
          className={`flex flex-col items-center justify-center gap-0.5 min-w-[52px] min-h-[44px] py-1 px-2 rounded-xl transition ${
            activeNavTab === 'dashboard'
              ? 'text-blue-400 font-bold bg-blue-500/15 shadow-sm shadow-blue-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px]">RPG</span>
        </button>

        <button
          onClick={() => {
            triggerHaptic('impact', 'light');
            setActiveNavTab('tasks');
          }}
          className={`flex flex-col items-center justify-center gap-0.5 min-w-[52px] min-h-[44px] py-1 px-2 rounded-xl transition ${
            activeNavTab === 'tasks'
              ? 'text-emerald-400 font-bold bg-emerald-500/15 shadow-sm shadow-emerald-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <CheckSquare className="w-5 h-5" />
          <span className="text-[10px]">Задачи</span>
        </button>

        <button
          onClick={() => {
            triggerHaptic('impact', 'light');
            setShopModalTab('rewards');
            setIsShopModalOpen(true);
          }}
          className="flex flex-col items-center justify-center gap-0.5 min-w-[52px] min-h-[44px] py-1 px-2 rounded-xl text-amber-400 hover:text-amber-300 transition active:scale-95"
        >
          <Gift className="w-5 h-5" />
          <span className="text-[10px]">Лавка</span>
        </button>

        <button
          onClick={() => {
            triggerHaptic('impact', 'light');
            setShopModalTab('wardrobe');
            setIsShopModalOpen(true);
          }}
          className="flex flex-col items-center justify-center gap-0.5 min-w-[52px] min-h-[44px] py-1 px-2 rounded-xl text-indigo-300 hover:text-white transition active:scale-95"
        >
          <Wand2 className="w-5 h-5 text-indigo-400" />
          <span className="text-[10px]">Студия</span>
        </button>

        <button
          onClick={() => {
            triggerHaptic('impact', 'light');
            setIsFamilyModalOpen(true);
          }}
          className="flex flex-col items-center justify-center gap-0.5 min-w-[52px] min-h-[44px] py-1 px-2 rounded-xl text-slate-300 hover:text-white transition active:scale-95"
        >
          <Settings className="w-5 h-5 text-amber-400" />
          <span className="text-[10px]">Настройки</span>
        </button>
      </nav>
    </div>
  );
}
