/**
 * ArmoireTab (Этап 8.2) — отдельный компонент сундука «Enchanted Armoire».
 *
 * За 100 золота — 1 спин:
 *   45% — XP (50–150)  → зелёный
 *   25% — Еда (15 золота обратно)
 *   20% — Gear (эксклюзивная броня)
 *   10% — Редкое яйцо
 *
 * Анимация: 2 секунды «открываем сундук...» с вращающейся иконкой,
 * затем крупный результат с цветной иконкой по типу дропа.
 */
import React, { useState } from 'react';
import { User } from '../types';
import { Gift, Sparkles, Apple, Shirt, Egg as EggIcon, Loader2, Coins } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';
import { sfxChest, sfxCoin, sfxError } from '../utils/sfx';
import { apiFetch } from '../utils/apiFetch';

interface ArmoireTabProps {
  activeUser: User;
  onOpen?: () => void; // коллбэк после успешного открытия (для refresh appState)
}

interface DropResult {
  type: 'xp' | 'food' | 'gear' | 'egg';
  label: string;
  xp?: number;
  goldBack?: number;
  eggId?: string;
  gearUrl?: string;
}

const COST = 100;

const TYPE_META: Record<DropResult['type'], { icon: any; color: string; bg: string; border: string; title: string }> = {
  xp: { icon: Sparkles, color: 'text-emerald-300', bg: 'bg-emerald-950/40', border: 'border-emerald-500/50', title: 'Буст опыта!' },
  food: { icon: Apple, color: 'text-orange-300', bg: 'bg-orange-950/40', border: 'border-orange-500/50', title: 'Еда для питомца!' },
  gear: { icon: Shirt, color: 'text-blue-300', bg: 'bg-blue-950/40', border: 'border-blue-500/50', title: 'Эксклюзивный предмет!' },
  egg: { icon: EggIcon, color: 'text-yellow-300', bg: 'bg-yellow-950/40', border: 'border-yellow-500/50', title: 'Редкое яйцо!' },
};

// Web Audio: звук открытия сундука (короткий мажорный аккорд) — используем общий модуль sfx
const playChestSound = sfxChest;

export const ArmoireTab: React.FC<ArmoireTabProps> = ({ activeUser, onOpen }) => {
  const isParent = activeUser.family_role === 'parent';
  const gold = activeUser.gold ?? 0;
  const canAfford = !isParent && gold >= COST;

  const [rolling, setRolling] = useState(false);
  const [lastDrop, setLastDrop] = useState<DropResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<{ type: DropResult['type']; label: string; at: number }[]>([]);

  const openChest = async () => {
    if (!canAfford || rolling) return;
    setRolling(true);
    setErr(null);
    setLastDrop(null);
    triggerHaptic('impact', 'medium');

    try {
      const res = await apiFetch('/api/armoire/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id }),
      });
      const json = await res.json();
      if (json.success) {
        // Имитируем задержку «вращения»
        await new Promise((r) => setTimeout(r, 1500));
        setLastDrop(json.drop);
        setHistory((prev) => [{ type: json.drop.type, label: json.drop.label, at: Date.now() }, ...prev].slice(0, 5));
        playChestSound();
        triggerHaptic('notification', 'success');
        onOpen?.();
      } else {
        setErr(json.error || 'Ошибка открытия сундука');
        triggerHaptic('notification', 'error');
      }
    } catch (e: any) {
      setErr(`Ошибка соединения: ${e.message}`);
    } finally {
      setRolling(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Заголовок */}
      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-950/30 via-slate-950 to-purple-950/30 p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="shrink-0 w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-amber-500/20 border-2 border-amber-400/60 flex items-center justify-center shadow-lg shadow-amber-500/30">
            {rolling ? (
              <Loader2 className="w-7 h-7 sm:w-9 sm:h-9 text-amber-300 animate-spin" />
            ) : (
              <Gift className="w-7 h-7 sm:w-9 sm:h-9 text-amber-300" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-white font-pixel-sub uppercase tracking-wider">
              Волшебный сундук
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-300 mt-1">
              Стоимость открытия: <b className="text-amber-300">{COST} золота</b>. Шанс дропа:{' '}
              <span className="text-emerald-300">XP 45%</span>,{' '}
              <span className="text-orange-300">Еда 25%</span>,{' '}
              <span className="text-blue-300">Броня 20%</span>,{' '}
              <span className="text-yellow-300">Яйцо 10%</span>.
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              У тебя: <Coins className="w-3 h-3 inline -mt-0.5 text-amber-400" /> {gold} золота
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openChest}
          disabled={!canAfford || rolling}
          className={`mt-4 w-full min-h-[52px] rounded-xl font-bold text-sm font-pixel-sub transition flex items-center justify-center gap-2 ${
            rolling
              ? 'bg-slate-800 text-slate-400 cursor-wait'
              : canAfford
              ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-pink-500 hover:from-amber-400 hover:to-pink-400 text-white shadow-lg shadow-amber-500/40 active:scale-[0.98]'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
        >
          {rolling ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Открываем сундук…
            </>
          ) : (
            <>
              <Gift className="w-4 h-4" />
              Открыть за {COST} золота
            </>
          )}
        </button>

        {isParent && (
          <p className="mt-3 text-xs text-amber-300 bg-amber-950/30 border border-amber-700/40 rounded-lg px-3 py-2">
            Родители не играют — войди как ребёнок
          </p>
        )}
        {!isParent && !canAfford && (
          <p className="mt-3 text-xs text-rose-300 bg-rose-950/30 border border-rose-700/40 rounded-lg px-3 py-2">
            Недостаточно золота (нужно {COST}, у тебя {gold})
          </p>
        )}
        {err && (
          <p className="mt-3 text-xs text-rose-300 bg-rose-950/40 border border-rose-700/50 rounded-lg px-3 py-2">
            {err}
          </p>
        )}
      </div>

      {/* Результат последнего дропа */}
      {lastDrop && !rolling && (() => {
        const meta = TYPE_META[lastDrop.type];
        const Icon = meta.icon;
        return (
          <div className={`animate-bounce-in rounded-2xl border-2 ${meta.border} ${meta.bg} p-5 shadow-2xl`}>
            <div className="flex items-center gap-4">
              <div className={`shrink-0 w-16 h-16 rounded-2xl ${meta.bg} border-2 ${meta.border} flex items-center justify-center`}>
                <Icon className={`w-10 h-10 ${meta.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs uppercase font-bold font-pixel-sub tracking-wider ${meta.color}`}>
                  {meta.title}
                </p>
                <p className="text-lg font-bold text-white font-pixel-sub mt-1">
                  {lastDrop.label}
                </p>
                {lastDrop.xp && (
                  <p className="text-xs text-emerald-300 mt-1">+{lastDrop.xp} XP начислено</p>
                )}
                {lastDrop.goldBack && (
                  <p className="text-xs text-orange-300 mt-1">+{lastDrop.goldBack} золота возвращено</p>
                )}
                {lastDrop.eggId && (
                  <p className="text-xs text-yellow-300 mt-1">
                    Яйцо <b>{lastDrop.eggId}</b> добавлено в инвентарь
                  </p>
                )}
                {lastDrop.gearUrl && (
                  <p className="text-[10px] text-slate-400 mt-1 truncate">{lastDrop.gearUrl}</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* История последних 5 дропов */}
      {history.length > 1 && (
        <div className="rounded-2xl border border-slate-700/50 bg-slate-900/40 p-3 space-y-1.5">
          <p className="text-[10px] uppercase font-bold text-slate-400 font-pixel-sub tracking-wider mb-1.5">
            Последние открытия
          </p>
          {history.map((h, i) => {
            const meta = TYPE_META[h.type];
            const Icon = meta.icon;
            return (
              <div key={h.at} className="flex items-center gap-2 text-xs">
                <Icon className={`w-3.5 h-3.5 ${meta.color} shrink-0`} />
                <span className="text-slate-300 truncate flex-1">{h.label}</span>
                <span className="text-slate-600 text-[10px]">#{i + 1}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ArmoireTab;
