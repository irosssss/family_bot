import React, { useState, useEffect } from 'react';
import {
  X,
  Gift,
  Users,
  Copy,
  Check,
  Share2,
  Sparkles,
  Coins,
  Gem,
  ArrowRight,
  ShieldCheck,
  Award,
  Flame,
  AlertCircle,
  QrCode,
  UserCheck,
} from 'lucide-react';
import { User } from '../types';
import { PixelAvatar } from './PixelAvatar';
import { shareMiniApp } from '../utils/haptics';

interface ReferralModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeUser: User;
  onUserUpdate: (updatedUser: User) => void;
}

interface ReferralInfoData {
  referralCode: string;
  referralLink: string;
  referralsCount: number;
  referralEarningsGold: number;
  referralEarningsCrystals: number;
  referredBy: string | null;
  referralsList: {
    id: number;
    refereeName: string;
    date: string;
    bonusGold: number;
    bonusCrystals: number;
    userColor: string;
    userClass: string;
  }[];
  inviteRewards: {
    referrerGold: number;
    referrerCrystals: number;
    refereeGold: number;
    refereeCrystals: number;
  };
}

export const ReferralModal: React.FC<ReferralModalProps> = ({
  isOpen,
  onClose,
  activeUser,
  onUserUpdate,
}) => {
  const [info, setInfo] = useState<ReferralInfoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [inputRefCode, setInputRefCode] = useState('');
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchReferralInfo = async () => {
    if (!activeUser) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/referrals/info?userId=${activeUser.id}`);
      if (res.ok) {
        const data = await res.json();
        setInfo(data);
      }
    } catch (e) {
      console.error('Error fetching referral info:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeUser) {
      fetchReferralInfo();
      setApplyError(null);
      setApplySuccess(null);
    }
  }, [isOpen, activeUser?.id]);

  if (!isOpen || !activeUser) return null;

  const referralCode = info?.referralCode || activeUser.referral_code || `ref_${activeUser.id}`;
  const referralLink =
    info?.referralLink || `https://t.me/FamilyChoresBot?start=${referralCode}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShareTelegram = () => {
    const text = `🎮 Присоединяйся к Family Chores RPG! Выполняй задачи, качай героя и получай золотые монеты вместе со мной!
🎁 По моей ссылке ты сразу получишь +50💰 Золота и +15💎 Кристаллов!`;
    shareMiniApp(text, referralLink);
  };

  const handleApplyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputRefCode.trim()) return;

    setIsApplying(true);
    setApplyError(null);
    setApplySuccess(null);

    try {
      const res = await fetch('/api/referrals/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: activeUser.id,
          refCode: inputRefCode.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setApplyError(data.error || 'Не удалось применить код');
      } else {
        setApplySuccess(data.message);
        if (data.user) {
          onUserUpdate(data.user);
        }
        fetchReferralInfo();
        setInputRefCode('');
      }
    } catch (e) {
      setApplyError('Ошибка соединения с сервером');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-xl text-amber-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide font-pixel-sub flex items-center gap-2">
                Реферальная Программа
                <span className="text-[10px] bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono px-2 py-0.5 rounded-full">
                  Бонусы
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Приглашайте друзей и получайте вместе золотые монеты и кристаллы
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* RPG Reward Banner */}
          <div className="relative p-5 rounded-2xl bg-gradient-to-r from-amber-900/40 via-purple-900/30 to-slate-900 border border-amber-500/30 overflow-hidden shadow-lg">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-2xl pointer-events-none" />
            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider">
                  <Sparkles className="w-4 h-4" />
                  <span>Приглашай друзей — растите вместе</span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-white">
                  +100 💰 Золота и +25 💎 Кристаллов за каждого!
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Ваш друг получит <span className="text-amber-300 font-bold">+50💰 Золота</span> и{' '}
                  <span className="text-cyan-300 font-bold">+15💎 Кристаллов</span> при
                  регистрации по вашей ссылке!
                </p>
              </div>

              <div className="flex items-center gap-2 bg-slate-950/80 border border-amber-500/30 p-3 rounded-xl shrink-0">
                <div className="text-center px-2">
                  <div className="text-xs text-slate-400">Вам</div>
                  <div className="text-sm font-bold text-amber-400 flex items-center gap-1 justify-center">
                    <span>+100</span>
                    <Coins className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-xs font-bold text-cyan-400 flex items-center gap-1 justify-center">
                    <span>+25</span>
                    <Gem className="w-3 h-3" />
                  </div>
                </div>
                <div className="text-slate-600 font-bold text-sm">/</div>
                <div className="text-center px-2">
                  <div className="text-xs text-slate-400">Другу</div>
                  <div className="text-sm font-bold text-amber-300 flex items-center gap-1 justify-center">
                    <span>+50</span>
                    <Coins className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-xs font-bold text-cyan-300 flex items-center gap-1 justify-center">
                    <span>+15</span>
                    <Gem className="w-3 h-3" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* User Referral Link Box */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Gift className="w-4 h-4 text-amber-400" />
              <span>Ваша уникальная реферальная ссылка:</span>
            </label>

            <div className="flex flex-col sm:flex-row items-center gap-2">
              <div className="relative w-full flex-1">
                <input
                  type="text"
                  readOnly
                  value={referralLink}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-xs sm:text-sm font-mono text-amber-300 select-all focus:outline-none focus:border-amber-400 transition"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex-1 sm:flex-none py-3 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded-xl font-semibold text-xs transition flex items-center justify-center gap-2 active:scale-95"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">Скопировано!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-slate-300" />
                      <span>Скопировать</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleShareTelegram}
                  className="flex-1 sm:flex-none py-3 px-4 bg-gradient-to-r from-blue-500 to-indigo-600 hover:opacity-95 text-white rounded-xl font-semibold text-xs shadow-lg shadow-blue-500/20 transition flex items-center justify-center gap-2 active:scale-95"
                >
                  <Share2 className="w-4 h-4" />
                  <span>В Telegram</span>
                </button>
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-center">
              <div className="text-[11px] text-slate-400 font-medium">Приглашено друзей</div>
              <div className="text-lg font-bold text-white mt-1 flex items-center justify-center gap-1.5">
                <Users className="w-4 h-4 text-amber-400" />
                <span>{info?.referralsCount || activeUser.referrals_count || 0}</span>
              </div>
            </div>

            <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-center">
              <div className="text-[11px] text-slate-400 font-medium">Заработано Золота</div>
              <div className="text-lg font-bold text-amber-400 mt-1 flex items-center justify-center gap-1.5">
                <Coins className="w-4 h-4" />
                <span>
                  +{info?.referralEarningsGold || activeUser.referral_earnings_gold || 0}💰
                </span>
              </div>
            </div>

            <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-center">
              <div className="text-[11px] text-slate-400 font-medium">Заработано Кристаллов</div>
              <div className="text-lg font-bold text-cyan-400 mt-1 flex items-center justify-center gap-1.5">
                <Gem className="w-4 h-4" />
                <span>
                  +{info?.referralEarningsCrystals || activeUser.referral_earnings_crystals || 0}💎
                </span>
              </div>
            </div>
          </div>

          {/* Apply Friend Code Section */}
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Ввести код друга:</span>
              </h4>
              {info?.referredBy ? (
                <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Вас пригласил(а): {info.referredBy}</span>
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">Получите +50💰 и +15💎</span>
              )}
            </div>

            {info?.referredBy ? (
              <p className="text-xs text-slate-400 bg-slate-900 p-3 rounded-lg border border-slate-800">
                ✅ Вы уже активировали реферальный бонус от героя{' '}
                <strong className="text-white">{info.referredBy}</strong>!
              </p>
            ) : (
              <form onSubmit={handleApplyCode} className="flex gap-2">
                <input
                  type="text"
                  value={inputRefCode}
                  onChange={(e) => setInputRefCode(e.target.value)}
                  placeholder="Например: ref_1 или ref_2..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition"
                />
                <button
                  type="submit"
                  disabled={isApplying || !inputRefCode.trim()}
                  className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shrink-0"
                >
                  <span>Активировать</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>
            )}

            {applyError && (
              <p className="text-xs text-red-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{applyError}</span>
              </p>
            )}

            {applySuccess && (
              <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>{applySuccess}</span>
              </p>
            )}
          </div>

          {/* Referral Levels / Milestones */}
          <div>
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-400" />
              <span>Награды за достижение целей:</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-xs shrink-0">
                  1 👤
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Первый друг</div>
                  <div className="text-[11px] text-amber-300">+100💰 +25💎</div>
                </div>
              </div>

              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 font-bold text-xs shrink-0">
                  3 👥
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Гильдия (3)</div>
                  <div className="text-[11px] text-purple-300">+300💰 +75💎 +Титул</div>
                </div>
              </div>

              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-xs shrink-0">
                  5 🛡
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Легенда (5)</div>
                  <div className="text-[11px] text-cyan-300">+500💰 +150💎 +Питомец</div>
                </div>
              </div>
            </div>
          </div>

          {/* List of Invited Friends */}
          <div>
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-slate-400" />
              <span>Приглашённые герои ({info?.referralsList.length || 0}):</span>
            </h4>

            {info?.referralsList && info.referralsList.length > 0 ? (
              <div className="space-y-2">
                {info.referralsList.map((ref) => (
                  <div
                    key={ref.id}
                    className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/20 shadow-sm shrink-0"
                        style={{ backgroundColor: `${ref.userColor}33` }}
                      >
                        <PixelAvatar
                          type="character"
                          classKey={ref.userClass}
                          characterColor={ref.userColor}
                          size="sm"
                          animated={false}
                        />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: ref.userColor }}
                          />
                          <span>{ref.refereeName}</span>
                        </div>
                        <div className="text-[10px] text-slate-400">{ref.date}</div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold text-amber-400">
                        +{ref.bonusGold}💰
                      </span>{' '}
                      <span className="text-xs font-bold text-cyan-400">
                        +{ref.bonusCrystals}💎
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 bg-slate-950/40 border border-slate-800 rounded-xl text-center space-y-1">
                <p className="text-xs text-slate-400">
                  Вы пока еще не пригласили друзей по своей ссылке.
                </p>
                <p className="text-[11px] text-amber-400/80">
                  Поделитесь ссылкой в социальных сетях или мессенджерах!
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="text-xs text-slate-400 flex items-center gap-1">
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span>Баланс: {activeUser.gold}💰</span>
            <span className="ml-2 text-cyan-400 font-medium">
              {activeUser.crystals || 0}💎
            </span>
          </div>
          <button
            onClick={onClose}
            className="py-2 px-5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
