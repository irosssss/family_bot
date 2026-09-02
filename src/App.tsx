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
import { TodayTasks } from './components/TodayTasks';
import { PartyView } from './components/PartyView';
import { FeedJournal } from './components/FeedJournal';
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
  X,
  LayoutGrid,
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
  const [streakData, setStreakData] = useState<{ streak: number; bonusPercent: number } | null>(null);
  
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

    // === Этап 10: присоединяемся к комнате семьи для party-событий ===
    // family_id берём из localStorage (если есть) или дефолт 1.
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
      await fetch('/api/users/update-character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id, ...updates }),
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
      const res = await fetch('/api/users/custom-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id, bgUrl }),
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
      const res = await fetch('/api/users/custom-avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id, avatarUrl }),
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
        showToast(`Внимание: ${data.error || 'Ошибка регистрации'}`);
        return;
      }
      if (data.user) {
        setActiveUserId(data.user.id);
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
        fetch(`/api/state?userId=${activeUserId}`),
        fetch(`/api/family/${myFamilyId}`).catch(() => null),
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
    if (!activeUser) return;
    try {
      const res = await fetch('/api/tasks/complete', {
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
        sounds.playBossHit();
        alertText += ` БОСС ПОВЕРЖЕН (+20 обоим)!`;
      }
      if (result.challengeCompleted) {
        alertText += ` Челлендж недели выполнен (+${result.challengeCompleted.bonus})!`;
      }

      showToast(alertText);
      loadState();
    } catch (e) {
      showToast('Ошибка сети');
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
      await fetch('/api/users/gender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id, gender }),
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
      const res = await fetch('/api/rewards/buy', {
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
      const res = await fetch('/api/shop/buy', {
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
      const res = await fetch('/api/shop/equip', {
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
      const res = await fetch('/api/zoo/active', {
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
      await fetch('/api/tasks/add', {
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
      await fetch('/api/rewards/add', {
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
    <div className="min-h-screen bg-[#0b0e14] text-slate-200 pb-24 sm:pb-16">
      {/* Top Navbar */}
      <Navbar
        activeUser={activeUser}
        users={appState.users}
        onSelectUser={(u) => setActiveUserId(u.id)}
        boss={appState.boss}
        soundEnabled={soundEnabled}
        onToggleSound={() => {
          sounds.enabled = !soundEnabled;
          setSoundEnabled(!soundEnabled);
        }}
        onRefresh={loadState}
        isRefreshing={isRefreshing}
        onOpenAddModal={() => setIsAddTaskModalOpen(true)}
        onOpenFamilyModal={() => setIsFamilyModalOpen(true)}
        onOpenFamilySettings={() => setIsFamilySettingsOpen(true)}
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
            <div className="relative">
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
                  <span className="sm:hidden">Гардероб</span>
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
              {/* Скролл-хинт: обрезанный таб — сигнал, что есть прокрутка (WIG navigation) */}
              <div className="sm:hidden pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-2xl bg-gradient-to-l from-slate-900/95 to-transparent" aria-hidden="true" />
            </div>
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
                familyHp={appState?.family ?? null}
              />
            )}

            {activeScene === 'wardrobe' && (
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

            {/* Today's Tasks: только на вкладке ДОМ (hub) — на Арена/Гардероб/Обзор дубли не нужны */}
            {activeScene === 'hub' && (
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
            )}
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
              <h3 className="text-sm font-bold text-white mb-3">Ежедневные дела</h3>
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
                          {t.assignee === 'misha' ? 'Миша' : t.assignee === 'regina' ? 'Регина' : 'Вместе'}
                        </span>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-amber-400/10 text-amber-300 text-xs font-bold border border-amber-400/20">
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

      {/* Sticky Mobile Bottom Navigation Bar for Telegram Mini App.
          UX-аудит: 4 таба (Дом | Арена | Гардероб | Ещё) — один экран = одно действие.
          Сцены переключаются прямо отсюда, второстепенное — в шторке «Ещё». */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0c1017]/95 backdrop-blur-lg border-t border-white/10 px-2 py-1 flex items-center justify-around tg-safe-padding shadow-2xl">
        <button
          onClick={() => {
            triggerHaptic('impact', 'light');
            setActiveNavTab('dashboard');
            setActiveScene('hub');
          }}
          className={`flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[48px] py-1 px-2 rounded-xl transition ${
            activeNavTab === 'dashboard' && activeScene === 'hub'
              ? 'text-amber-400 font-bold bg-amber-500/15 shadow-sm shadow-amber-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px]">Дом</span>
        </button>

        <button
          onClick={() => {
            triggerHaptic('impact', 'light');
            setActiveNavTab('dashboard');
            setActiveScene('boss');
          }}
          className={`flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[48px] py-1 px-2 rounded-xl transition ${
            activeNavTab === 'dashboard' && activeScene === 'boss'
              ? 'text-red-400 font-bold bg-red-500/15 shadow-sm shadow-red-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Swords className="w-5 h-5" />
          <span className="text-[10px]">Арена</span>
        </button>

        <button
          onClick={() => {
            triggerHaptic('impact', 'light');
            setActiveNavTab('dashboard');
            setActiveScene('wardrobe');
          }}
          className={`flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[48px] py-1 px-2 rounded-xl transition ${
            activeNavTab === 'dashboard' && activeScene === 'wardrobe'
              ? 'text-indigo-400 font-bold bg-indigo-500/15 shadow-sm shadow-indigo-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shirt className="w-5 h-5" />
          <span className="text-[10px]">Гардероб</span>
        </button>

        <button
          onClick={() => {
            triggerHaptic('impact', 'light');
            setIsMoreSheetOpen(true);
          }}
          className={`flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[48px] py-1 px-2 rounded-xl transition ${
            isMoreSheetOpen
              ? 'text-blue-400 font-bold bg-blue-500/15'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutGrid className="w-5 h-5" />
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
            className="absolute bottom-0 left-0 right-0 bg-[#0c1017] border-t border-white/10 rounded-t-3xl p-4 pb-8 tg-safe-padding animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grab handle */}
            <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white font-pixel-sub">Ещё</h3>
              <button
                onClick={() => setIsMoreSheetOpen(false)}
                className="p-2 rounded-xl bg-white/5 text-slate-400 hover:text-white transition min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {([
                {
                  icon: <CheckSquare className="w-5 h-5 text-emerald-400" />,
                  label: 'Задачи',
                  desc: 'Расписание недели',
                  action: () => {
                    setActiveNavTab('tasks');
                    setIsMoreSheetOpen(false);
                  },
                },
                {
                  icon: <Gift className="w-5 h-5 text-amber-400" />,
                  label: 'Лавка',
                  desc: 'Награды и магазин',
                  action: () => {
                    setShopModalTab('rewards');
                    setIsShopModalOpen(true);
                    setIsMoreSheetOpen(false);
                  },
                },
                {
                  icon: <LayoutDashboard className="w-5 h-5 text-blue-400" />,
                  label: 'Обзор',
                  desc: 'Отряд семьи',
                  action: () => {
                    setActiveNavTab('dashboard');
                    setActiveScene('overview');
                    setIsMoreSheetOpen(false);
                  },
                },
                {
                  icon: <Settings className="w-5 h-5 text-slate-300" />,
                  label: 'Настройки',
                  desc: 'Семья и игроки',
                  action: () => {
                    setIsFamilyModalOpen(true);
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
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 active:scale-95 transition text-left min-h-[64px]"
                >
                  <div className="shrink-0">{item.icon}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">{item.label}</p>
                    <p className="text-[10px] text-slate-400 truncate">{item.desc}</p>
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
