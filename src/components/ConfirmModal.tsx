import React from 'react';
import { X, CheckCircle2, ShoppingBag, Gift, AlertTriangle, Sparkles } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  badgeText?: string;
  badgeType?: 'gold' | 'emerald' | 'blue';
  iconType?: 'task' | 'reward' | 'shop';
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Да, подтверждаю',
  cancelText = 'Отмена',
  badgeText,
  badgeType = 'emerald',
  iconType = 'task',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 overflow-hidden">
        {/* Top decoration glow */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Header Icon */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${
                iconType === 'task'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : iconType === 'reward'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              }`}
            >
              {iconType === 'task' && <CheckCircle2 className="w-6 h-6" />}
              {iconType === 'reward' && <Gift className="w-6 h-6" />}
              {iconType === 'shop' && <ShoppingBag className="w-6 h-6" />}
            </div>

            <div>
              <h3 className="text-lg font-bold text-white tracking-wide">{title}</h3>
              <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 inline" /> Действие не подлежит отмене
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800 mb-5">
          <p className="text-sm text-slate-200 leading-relaxed font-medium mb-2">{description}</p>

          {badgeText && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-amber-400/10 text-amber-300 border border-amber-400/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{badgeText}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition"
          >
            {cancelText}
          </button>

          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold shadow-lg transition flex items-center justify-center gap-1.5 ${
              iconType === 'task'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
