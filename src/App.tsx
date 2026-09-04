import React, { useState, useEffect } from 'react';
import {
  AppState,
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
import { PartyView } from './components/PartyView';
import { ShopAndRewardsModal } from './components/ShopAndRewardsModal';
import { AddTaskModal } from './components/AddTaskModal';
import { AddRewardModal } from './components/AddRewardModal';
import { ResetConfirmModal } from './components/ResetConfirmModal';
import { FamilyManagementModal } from './components/FamilyManagementModal';
import { FamilySettings } from './components/Settings/FamilySettings';
import { RegistrationModal } from './components/RegistrationModal';
import { ReferralModal } from './components/ReferralModal';
import { MobileChecklistModal } from './components/MobileChecklistModal';
import { CharacterEditorModal } from './components/CharacterEditorModal';
import { UpgradeGuideModal } from './components/UpgradeGuideModal';
import { DomovoyHouseProjectScene } from './components/scenes/DomovoyHouseProjectScene';
import { WardrobeCustomizationScene } from './components/scenes/WardrobeCustomizationScene';
import { DomovoyJournalScene } from './components/scenes/DomovoyJournalScene';
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
  Shirt,
  Layers,
  X,
  LayoutGrid,
  MoreHorizontal,
} from 'lucide-react';
import { DAYS_OF_WEEK } from './data/initialData';

import { initTelegramWebApp, triggerHaptic } from './utils/haptics';
import { apiFetch, getTelegramInitData } from './utils/apiFetch';
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
  const [streakData, setStreakData] = useState<{ streak: number; bonusPercent: number } | null>(null);
  
  useEffect(() => {
    const tmaInitData = getTelegramInitData();
    const socket = io('/', {
      auth: tmaInitData ? { tma: tmaInitData } : undefined,
    }); // connects to current host
    socket.on('stateUpdate', () => {
      console.log('Real-time update received');
      loadState();
    });

    // === Этап 10 + SEC-06: присоединяемся к комнате семьи ===
    // familyId берём из localStorage (dev-песочница); в проде сервер резолвит
    // семью из проверенного initData (tma) и игнорирует client value.
    const myFamilyId = Number(localStorage.getItem('family_id') || 1);
    socket.emit('join:family', { familyId: myFamilyId });
    console.log(`[Socket] requested join:family ${myFamilyId}`);

    // === Этап 10: party:boss_damaged — удар одного ребёнка виден всем в realtime ===
    socket.on('party:boss_damaged', (data: {
      attackerId: number;
      attackerName: string;
      damage: number;
      newBossDamage: number;
      bossHp: number;
      bossDefeated: boolean;
      timestamp: number;
    }) => {
      console.log('[Party] boss damaged:', data);
      showToast(`${data.attackerName} ударил босса на ${data.damage}!`);
      triggerHaptic('impact', 'medium');
      loadState(); // обновить appState.boss.damage
    });

    // === Этап 9: family:hp_changed — общая полоска HP семьи ===
    socket.on('family:hp_changed', (data: {
      familyId: number;
      hp: number;
      maxHp: number;
      exhaustedUntil: string | null;
      justExhausted: boolean;
    }) => {
      console.log('[Family] HP changed:', data);
      loadState();
      if (data.justExhausted) {
        showToast('Семья ИСТОЩЕНА! -15% золота 24 часа');
        triggerHaptic('notification', 'error');
      }
    });

    // Socket.IO: Streak Update Listener
    socket.on('streak_updated', (data: { 
      userId: number; 
      current_streak: number; 
      bonus_multiplier: number;
    }) => {
      console.log('Streak updated:', data);
      
      // Обновляем streak в состоянии
      const bonusPercent = Math.floor((data.bonus_multiplier - 1) * 100);
      setStreakData({
        streak: data.current_streak,
        bonusPercent: bonusPercent,
      });
      
      // Перезагружаем состояние для синхронизации
      loadState();
      
      // Haptic feedback
      triggerHaptic('notification', 'success');
      
      // Звук при milestone
      if (data.current_streak === 3 || data.current_streak === 7 || data.current_streak === 10) {
        sounds.playLevelUp();
      } else {
        sounds.playCoin();
      }
    });

    // Socket.IO: Streak Milestone Reached
    socket.on('streak:milestone', (data: {
      milestone: number;
      reward: { gold?: number; crystals?: number; badge?: string };
    }) => {
      console.log('Streak milestone reached:', data);
      
      // Перезагружаем состояние для получения наград
      loadState();
      
      // Haptic feedback зависит от milestone
      if (data.milestone === 10) {
        // Strong haptic для дня 10
        if (navigator.vibrate) {
          navigator.vibrate([400, 200, 400, 200, 800]);
        }
        triggerHaptic('notification', 'success');
      } else if (data.milestone === 7) {
        // Medium haptic для дня 7
        if (navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }
        triggerHaptic('notification', 'success');
      } else {
        // Light haptic для дня 3
        triggerHaptic('notification', 'success');
      }
    });

    // Socket.IO: Streak Saved (freeze использована)
    socket.on('streak:saved', (data: { userId: number; freezeUsed: boolean }) => {
      console.log('Streak saved with freeze:', data);
      
      // Toast уведомление
      showToast('Streak сохранён! (freeze использована)');
      
      // Перезагрузка состояния
      loadState();
      
      // Haptic
      triggerHaptic('notification', 'success');
      sounds.playCoin();
    });

    // Socket.IO: Streak Broken
    socket.on('streak:broken', (data: { userId: number; lostStreak: number }) => {
      console.log('Streak broken:', data);
      
      // Toast уведомление
      showToast('Streak сброшен. Начни заново!');
      
      // Перезагрузка состояния
      loadState();
      
      // Haptic
      triggerHaptic('notification', 'error');
      
      // Звук сброса (если есть streak_broken.mp3, иначе используем стандартный)
      try {
        const audio = new Audio('/assets/sounds/streak_broken.mp3');
        audio.volume = 0.5;
        audio.play().catch(() => console.log('Streak broken sound not available'));
      } catch (e) {
        // Fallback - используем стандартный звук
        sounds.playBossHit();
      }
    });
    
    return () => { socket.disconnect(); };
  }, []);
  const [activeUserId, setActiveUserId] = useState<number>(1);
  const [activeNavTab, setActiveNavTab] = useState<'dashboard' | 'tasks' | 'shop'>('dashboard');
  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false);
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
  const [isFamilySettingsOpen, setIsFamilySettingsOpen] = useState(false);
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
      await apiFetch('/api/users/update-character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: activeUser.id, userId: activeUser.id, ...updates }),
      });
      triggerHaptic('notification', 'success');
      showToast('Внешность персонажа успешно сохранена!');
      loadState();
    } catch (e) {
      showToast('Внешность персонажа сохранена!');
    }
  };

  const handleUpdateUserBackground = async (bgUrl: string) => {
    if (!activeUser) return;
    try {
      const res = await apiFetch('/api/users/custom-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: activeUser.id, userId: activeUser.id, bgUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`Ошибка: ${data.error}`);
        return;
      }
      triggerHaptic('notification', 'success');
      showToast('Новый AI фон от PixelLab установлен!');
      loadState();
    } catch (e) {
      showToast('Ошибка смены фона');
    }
  };

  const handleUpdateUserAvatar = async (avatarUrl: string) => {
    if (!activeUser) return;
    try {
      const res = await apiFetch('/api/users/custom-avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: activeUser.id, userId: activeUser.id, avatarUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`Ошибка: ${data.error}`);
        return;
      }
      triggerHaptic('notification', 'success');
      showToast('Новый AI аватар от PixelLab установлен!');
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
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: userData.name,
          classKey: userData.classKey,
          gender: userData.gender,
          invite_code: userData.familyCode,
          customAvatarUrl: userData.customAvatarUrl,
          character_color: userData.characterColor || userData.color,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`Внимание: ${data.error || 'Ошибка регистрации'}`);
        return;
      }
      if (data.user) {
        setActiveUserId(data.user.id);
        if (data.family_id) localStorage.setItem('family_id', String(data.family_id));
        if (data.family_code) localStorage.setItem('family_code', data.family_code);
        if (data.referralMessage) {
          showToast(`${data.referralMessage}`);
        } else {
          showToast(`Герой ${data.user.display_name} успешно зарегистрирован!`);
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
      // === Этап 9: параллельно тянем state + family ===
      const myFamilyId = Number(localStorage.getItem('family_id') || 1);
      const [stateRes, familyRes] = await Promise.all([
        apiFetch(`/api/state?userId=${activeUserId}`),
        apiFetch(`/api/family/${myFamilyId}`).catch(() => null),
      ]);
      const data = await stateRes.json();
      if (familyRes && familyRes.ok) {
        try {
          const family = await familyRes.json();
          data.family = family;
        } catch {}
      } else if (!data.family) {
        // fallback: если state не вернул family — оставляем как есть
        data.family = null;
      }
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
    if (!activeUser || activeUser.family_role === 'parent' || activeUser.is_admin) return;
    try {
      const res = await apiFetch('/api/tasks/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id, taskId }),
      });
      const result = await res.json();
      if (!res.ok) {
        showToast(`Внимание: ${result.error || 'Ошибка'}`);
        return;
      }

      sounds.playCoin();
      triggerHaptic('notification', 'success');
      let alertText = `Выполнено! +${result.gold_gain} золота и +${result.xp_gain} опыта`;

      if (result.level_up) {
        sounds.playLevelUp();
        alertText += ` НОВЫЙ УРОВЕНЬ: ${result.new_level}!`;
      }
      if (result.perfect) {
        alertText += ` Идеальный день закрыт (+5)!`;
      }
      if (result.pet) {
        alertText += ` НАЙДЕН ПИТОМЕЦ: ${result.pet.title}!`;
      }
      if (result.bossDefeated) {
        sounds.playLevelUp();
        alertText += ' Семейный проект заметно продвинулся!';
      }
      if (result.challengeCompleted) {
        alertText += ` Челлендж недели выполнен (+${result.challengeCompleted.bonus})!`;
      }

      showToast(alertText);
      await loadState();
    } catch (e) {
      showToast('Ошибка сети');
    }
  };

  // Toggle/Undo Task
  const handleToggleUndo = async (taskId: number) => {
    if (!activeUser || activeUser.family_role === 'parent' || activeUser.is_admin) return;
    try {
      const res = await apiFetch('/api/tasks/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id, taskId }),
      });
      const result = await res.json();
      if (!res.ok) {
        showToast(`Внимание: ${result.error || 'Не удалось отменить отметку'}`);
        return;
      }
      showToast('Отметка выполнения отменена');
      await loadState();
    } catch (e) {
      showToast('Ошибка');
    }
  };

  // Switch Class
  const handleSelectClass = async (className: ClassKey) => {
    if (!activeUser) return;
    try {
      await apiFetch('/api/users/class', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: activeUser.id, userId: activeUser.id, className }),
      });
      const names: Record<string, string> = {
        warrior: 'Воина',
        mage: 'Мага',
        rogue: 'Разбойника',
        healer: 'Целителя',
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
      await apiFetch('/api/users/gender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: activeUser.id, userId: activeUser.id, gender }),
      });
      showToast(`Пол изменён на ${gender === 'female' ? 'Женский' : 'Мужской'}!`);
      loadState();
    } catch (e) {
      showToast('Ошибка смены пола');
    }
  };

  // Buy Reward
  const handleBuyReward = async (rewardId: number) => {
    if (!activeUser) return;
    try {
      const res = await apiFetch('/api/rewards/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id, rewardId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`Ошибка: ${data.error}`);
        return;
      }
      sounds.playCoin();
      triggerHaptic('notification', 'success');
      showToast(`Награда куплена! ${partnerUser?.display_name} уведомлён(а)!`);
      loadState();
    } catch (e) {
      showToast('Ошибка покупки');
    }
  };

  // Buy Shop Equipment
  const handleBuyShopItem = async (itemId: number) => {
    if (!activeUser) return;
    try {
      const res = await apiFetch('/api/shop/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id, itemId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`Ошибка: ${data.error}`);
        return;
      }
      sounds.playCoin();
      triggerHaptic('notification', 'success');
      showToast(`Предмет куплен и добавлен в гардероб!`);
      loadState();
    } catch (e) {
      showToast('Ошибка');
    }
  };

  // Equip Item
  const handleEquipItem = async (itemId: number) => {
    if (!activeUser) return;
    try {
      const res = await apiFetch('/api/shop/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id, itemId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`Ошибка: ${data.error}`);
        return;
      }
      triggerHaptic('impact', 'medium');
      if (data.message) {
        showToast(`${data.message}`);
      }
      loadState();
    } catch (e) {
      showToast('Ошибка экипировки');
    }
  };

  // Выбор активного питомца-компаньона (гардероб → вкладка «Питомцы»)
  const handleSetActivePet = async (petId: number) => {
    if (!activeUser) return;
    try {
      const res = await apiFetch('/api/zoo/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id, petId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`Ошибка: ${data.error}`);
        return;
      }
      triggerHaptic('notification', 'success');
      if (data.message) showToast(data.message);
      loadState();
    } catch (e) {
      showToast('Ошибка выбора питомца');
    }
  };

  // Add Task
  const handleAddTask = async (taskData: any) => {
    try {
      await apiFetch('/api/tasks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData),
      });
      triggerHaptic('notification', 'success');
      showToast('Новая задача создана!');
      loadState();
    } catch (e) {
      showToast('Ошибка создания задачи');
    }
  };

  // Add Reward
  const handleAddReward = async (rewardData: any) => {
    try {
      await apiFetch('/api/rewards/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rewardData),
      });
      showToast('Новая награда добавлена в магазин!');
      loadState();
    } catch (e) {
      showToast('Ошибка');
    }
  };

  // Reset Progress
  const handleResetProgress = async () => {
    if (!activeUser) return;
    try {
      await apiFetch('/api/users/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: activeUser.id, userId: activeUser.id }),
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
      await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorId: activeUserId,
          display_name: name,
          gender: 'male',
        }),
      });
      await loadState();
      showToast(`${name} успешно добавлен(а) в вашу семью!`);
    } catch (e) {
      console.error(e);
      showToast('Ошибка при добавлении пользователя');
    }
  };

  // Telegram Simulator Bot execution

  if (!appState || !activeUser) {
    return (
      <div className="min-h-screen bg-[#0b0e14] text-slate-200 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
          <span className="text-sm font-semibold">Загрузка Family Chores…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="tg-screen-height bg-[#ecdfc3] text-[#2f241c] pb-24 sm:pb-16">
      {/* Top Navbar */}
      <Navbar
        activeUser={activeUser}
        users={appState.users}
        onSelectUser={(u) => {
          setActiveUserId(u.id);
          setActiveNavTab('dashboard');
          setActiveScene('hub');
          setIsMoreSheetOpen(false);
        }}
        onOpenFamilySettings={() => setIsFamilySettingsOpen(true)}
        onOpenRegisterModal={() => setIsRegisterModalOpen(true)}
      />

      {/* Floating Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-24 right-3 z-50 flex max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-[16px] border-2 border-[#2f241c] bg-[#42614f] px-4 py-3 text-xs font-bold text-[#fff8e8] shadow-[3px_3px_0_#2f241c] animate-bounce sm:bottom-6 sm:right-6 sm:max-w-md">
          <Sparkles className="w-4 h-4 flex-shrink-0 text-[#f3cf82]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="mx-auto max-w-7xl space-y-4 px-2 pb-28 pt-3 sm:space-y-6 sm:px-4 sm:pb-20 sm:pt-6 lg:px-8">
        {/* TAB 1: Main Dashboard */}
        {activeNavTab === 'dashboard' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Desktop journal navigation. On phones the bottom bar is the only scene switcher. */}
            <div className="relative">
            <div className="hidden sm:flex items-center justify-between gap-2 overflow-x-auto rounded-[20px] border-2 border-[#2f241c] bg-[#f5e7c8] p-2 shadow-[3px_3px_0_#b9834d] scrollbar-none">
              <button
                onClick={() => {
                  triggerHaptic('impact', 'light');
                  setActiveScene('hub');
                }}
                className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-[12px] px-3 text-xs font-bold transition sm:px-4 ${
                  activeScene === 'hub'
                    ? 'bg-[#42614f] text-[#fff8e8] shadow-[2px_2px_0_#2f241c]'
                    : 'text-[#61401e] hover:bg-[#ead4ab]'
                }`}
              >
                <Home className="h-4 w-4 shrink-0" />
                <span>Сегодня</span>
              </button>

              <button
                onClick={() => {
                  triggerHaptic('impact', 'light');
                  setActiveScene('boss');
                }}
                className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-[12px] px-3 text-xs font-bold transition sm:px-4 ${
                  activeScene === 'boss'
                    ? 'bg-[#c4774d] text-[#fff8e8] shadow-[2px_2px_0_#2f241c]'
                    : 'text-[#61401e] hover:bg-[#ead4ab]'
                }`}
              >
                <Layers className="h-4 w-4 shrink-0" />
                <span>Дом</span>
              </button>

              {activeUser.family_role === 'parent' || activeUser.is_admin ? (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('impact', 'light');
                    setIsFamilySettingsOpen(true);
                  }}
                  className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-[12px] px-3 text-xs font-bold text-[#61401e] transition hover:bg-[#ead4ab] sm:px-4"
                >
                  <Settings className="h-4 w-4 shrink-0" />
                  <span>Семья</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('impact', 'light');
                    setActiveScene('wardrobe');
                  }}
                  className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-[12px] px-3 text-xs font-bold transition sm:px-4 ${
                    activeScene === 'wardrobe'
                      ? 'bg-[#7e698b] text-[#fff8e8] shadow-[2px_2px_0_#2f241c]'
                      : 'text-[#61401e] hover:bg-[#ead4ab]'
                  }`}
                >
                  <Shirt className="h-4 w-4 shrink-0" />
                  <span>Стиль</span>
                </button>
              )}

              <button
                onClick={() => {
                  triggerHaptic('impact', 'light');
                  setActiveScene('overview');
                }}
                className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-[12px] px-3 text-xs font-bold transition sm:px-4 ${
                  activeScene === 'overview'
                    ? 'bg-[#7d9db5] text-[#1f3443] shadow-[2px_2px_0_#2f241c]'
                    : 'text-[#61401e] hover:bg-[#ead4ab]'
                }`}
              >
                <LayoutDashboard className="h-4 w-4 shrink-0" />
                <span>Семья</span>
              </button>
            </div>
            </div>

            {/* The journal is the daily loop; the house visualises only positive family progress. */}
            {activeScene === 'hub' && (
              <DomovoyJournalScene
                appState={appState}
                activeUser={activeUser}
                onCompleteTask={handleCompleteTask}
                onUndoTask={handleToggleUndo}
                onOpenAddTask={() => setIsAddTaskModalOpen(true)}
                onOpenShop={() => {
                  setShopModalTab('rewards');
                  setIsShopModalOpen(true);
                }}
                onOpenFamilySettings={() => setIsFamilySettingsOpen(true)}
              />
            )}

            {activeScene === 'boss' && (
              <DomovoyHouseProjectScene
                appState={appState}
                activeUser={activeUser}
                onOpenAddTask={() => setIsAddTaskModalOpen(true)}
                onOpenFamilySettings={() => setIsFamilySettingsOpen(true)}
                onOpenFamilyOverview={() => setActiveScene('overview')}
                onOpenShop={() => {
                  setShopModalTab('rewards');
                  setIsShopModalOpen(true);
                }}
              />
            )}

            {activeScene === 'wardrobe' && activeUser.family_role !== 'parent' && !activeUser.is_admin && (
              <WardrobeCustomizationScene
                appState={appState}
                activeUser={activeUser}
                onEquipItem={handleEquipItem}
                onBuyItem={handleBuyShopItem}
                onSetActivePet={handleSetActivePet}
              />
            )}

            {activeScene === 'overview' && (
              /* Обзор = Party (как у Habitica): компактный список отряда,
                 развёрнутые статы только у своего профиля */
              <PartyView
                appState={appState}
                activeUser={activeUser}
                onOpenWardrobe={() => {
                  setShopModalTab('wardrobe');
                  setIsShopModalOpen(true);
                }}
                onOpenCharacterEditor={() => setIsCharacterEditorOpen(true)}
              />
            )}

          </div>
        )}

        {/* TAB 2: Full Task Board */}
        {activeNavTab === 'tasks' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black tracking-tight text-[#2f241c]">План на неделю</h2>
                <p className="text-xs text-[#735941]">
                  Все ежедневные и еженедельные дела семьи
                </p>
              </div>
              {(activeUser.family_role === 'parent' || activeUser.is_admin) && (
                <button
                  type="button"
                  onClick={() => setIsAddTaskModalOpen(true)}
                  className="min-h-11 rounded-[13px] border-2 border-[#2f241c] bg-[#5b8d68] px-4 text-xs font-black text-[#fff8e8] shadow-[2px_2px_0_#2f241c] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                >
                  Добавить дело
                </button>
              )}
            </div>

            {/* Daily Routine section */}
            <div className="rounded-[20px] border-2 border-[#2f241c] bg-[#f5e7c8] p-4 shadow-[3px_3px_0_#b9834d] sm:p-5">
              <h3 className="mb-3 text-sm font-black text-[#2f241c]">Ежедневные дела</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {appState.tasks
                  .filter((t) => t.task_type === 'daily')
                  .map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between rounded-[14px] border-2 border-[#c69b68] bg-[#fff7e5] p-3"
                    >
                      <div>
                        <p className="text-sm font-black text-[#2f241c]">{t.title}</p>
                        <span className="text-[11px] text-[#735941]">
                          {t.assignee === 'misha' ? 'Миша' : t.assignee === 'regina' ? 'Регина' : 'Вместе'}
                        </span>
                      </div>
                      <span className="rounded-lg border border-[#b9834d] bg-[#f7deb0] px-2.5 py-1 text-xs font-black text-[#855529]">
                        +{t.points}
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
                    className="flex flex-col justify-between rounded-[18px] border-2 border-[#c69b68] bg-[#f5e7c8] p-4 shadow-[2px_2px_0_#d7b47a]"
                  >
                    <div>
                      <h4 className="mb-2.5 border-b border-[#c69b68] pb-2 text-sm font-black text-[#42614f]">
                        {dayName}
                      </h4>
                      <div className="space-y-2">
                        {dayTasks.length === 0 ? (
                          <p className="py-2 text-xs italic text-[#735941]">Свободный день</p>
                        ) : (
                          dayTasks.map((t) => (
                            <div
                              key={t.id}
                              className="flex items-center justify-between rounded-xl border border-[#d7b47a] bg-[#fff7e5] p-2.5 text-xs"
                            >
                              <span className="mr-2 truncate text-[#2f241c]">{t.title}</span>
                              <span className="whitespace-nowrap font-bold text-[#855529]">
                                +{t.points}
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
        onPetsChanged={() => loadState()}
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

      {activeUser && (
        <FamilySettings
          isOpen={isFamilySettingsOpen}
          activeUser={activeUser}
          onClose={() => setIsFamilySettingsOpen(false)}
          onUserUpdated={loadState}
        />
      )}

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

      {/* Telegram-first primary navigation: four large, stable destinations. */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t-2 border-[#2f241c] bg-[#f5e7c8]/95 px-2 py-1 text-[#61401e] shadow-[0_-2px_0_rgba(47,36,28,.14)] backdrop-blur-lg tg-safe-padding sm:hidden">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('impact', 'light');
            setActiveNavTab('dashboard');
            setActiveScene('hub');
          }}
          className={`flex min-h-12 min-w-[64px] flex-col items-center justify-center gap-0.5 rounded-[12px] px-2 py-1 transition ${
            activeNavTab === 'dashboard' && activeScene === 'hub'
              ? 'bg-[#42614f] font-bold text-[#fff8e8] shadow-[1px_1px_0_#2f241c]'
              : 'text-[#735941] hover:bg-[#ead4ab]'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px]">Сегодня</span>
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('impact', 'light');
            setActiveNavTab('dashboard');
            setActiveScene('boss');
          }}
          className={`flex min-h-12 min-w-[64px] flex-col items-center justify-center gap-0.5 rounded-[12px] px-2 py-1 transition ${
            activeNavTab === 'dashboard' && activeScene === 'boss'
              ? 'bg-[#c4774d] font-bold text-[#fff8e8] shadow-[1px_1px_0_#2f241c]'
              : 'text-[#735941] hover:bg-[#ead4ab]'
          }`}
        >
          <Layers className="h-5 w-5" />
          <span className="text-[10px]">Дом</span>
        </button>

        {activeUser.family_role === 'parent' || activeUser.is_admin ? (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('impact', 'light');
              setIsFamilySettingsOpen(true);
            }}
            className="flex min-h-12 min-w-[64px] flex-col items-center justify-center gap-0.5 rounded-[12px] px-2 py-1 text-[#735941] transition hover:bg-[#ead4ab]"
          >
            <Settings className="h-5 w-5" />
            <span className="text-[10px]">Семья</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('impact', 'light');
              setActiveNavTab('dashboard');
              setActiveScene('wardrobe');
            }}
            className={`flex min-h-12 min-w-[64px] flex-col items-center justify-center gap-0.5 rounded-[12px] px-2 py-1 transition ${
              activeNavTab === 'dashboard' && activeScene === 'wardrobe'
                ? 'bg-[#7e698b] font-bold text-[#fff8e8] shadow-[1px_1px_0_#2f241c]'
                : 'text-[#735941] hover:bg-[#ead4ab]'
            }`}
          >
            <Shirt className="h-5 w-5" />
            <span className="text-[10px]">Стиль</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            triggerHaptic('impact', 'light');
            setIsMoreSheetOpen(true);
          }}
          className={`flex min-h-12 min-w-[64px] flex-col items-center justify-center gap-0.5 rounded-[12px] px-2 py-1 transition ${
            isMoreSheetOpen
              ? 'bg-[#7d9db5] font-bold text-[#1f3443] shadow-[1px_1px_0_#2f241c]'
              : 'text-[#735941] hover:bg-[#ead4ab]'
          }`}
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[10px]">Ещё</span>
        </button>
      </nav>

      {/* Bottom Sheet «Ещё»: второстепенные разделы (задачи, лавка, обзор, настройки...) */}
      {isMoreSheetOpen && (
        <div
          className="sm:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setIsMoreSheetOpen(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-[28px] border-t-2 border-[#2f241c] bg-[#f5e7c8] p-4 pb-8 text-[#2f241c] shadow-[0_-3px_0_#b9834d] tg-safe-padding animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grab handle */}
            <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-[#b9834d]" />
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-pixel-sub text-sm font-bold">Ещё</h3>
              <button
                type="button"
                onClick={() => setIsMoreSheetOpen(false)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-[13px] border-2 border-[#2f241c] bg-[#fff7e5] text-[#61401e] shadow-[1px_1px_0_#b9834d] transition hover:bg-[#ead4ab]"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {([
                {
                  icon: <CheckSquare className="h-5 w-5 text-[#42614f]" />,
                  label: 'Задачи',
                  desc: 'Расписание недели',
                  action: () => {
                    setActiveNavTab('tasks');
                    setIsMoreSheetOpen(false);
                  },
                },
                {
                  icon: <Gift className="h-5 w-5 text-[#a96632]" />,
                  label: 'Лавка',
                  desc: 'Награды и магазин',
                  action: () => {
                    setShopModalTab('rewards');
                    setIsShopModalOpen(true);
                    setIsMoreSheetOpen(false);
                  },
                },
                {
                  icon: <LayoutDashboard className="h-5 w-5 text-[#587f99]" />,
                  label: 'Обзор',
                  desc: 'Отряд семьи',
                  action: () => {
                    setActiveNavTab('dashboard');
                    setActiveScene('overview');
                    setIsMoreSheetOpen(false);
                  },
                },
                {
                  icon: <Settings className="h-5 w-5 text-[#7e698b]" />,
                  label: activeUser.family_role === 'parent' || activeUser.is_admin ? 'Управление' : 'Моя семья',
                  desc: activeUser.family_role === 'parent' || activeUser.is_admin ? 'Дела и участники' : 'Участники дома',
                  action: () => {
                    if (activeUser.family_role === 'parent' || activeUser.is_admin) {
                      setIsFamilySettingsOpen(true);
                    } else {
                      setActiveNavTab('dashboard');
                      setActiveScene('overview');
                    }
                    setIsMoreSheetOpen(false);
                  },
                },
              ] as const).map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    triggerHaptic('impact', 'light');
                    item.action();
                  }}
                  className="flex min-h-[64px] items-center gap-3 rounded-[16px] border-2 border-[#c69b68] bg-[#fff7e5] p-3.5 text-left shadow-[2px_2px_0_#d7b47a] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none hover:bg-[#f8ecd2]"
                >
                  <div className="shrink-0">{item.icon}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-[#2f241c]">{item.label}</p>
                    <p className="truncate text-[10px] text-[#735941]">{item.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
