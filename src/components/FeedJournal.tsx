import React from 'react';
import { FeedEntry } from '../types';
import { History, CheckCircle2, Bell, Clock } from 'lucide-react';

interface FeedJournalProps {
  feed: FeedEntry[];
}

export const FeedJournal: React.FC<FeedJournalProps> = ({ feed = [] }) => {
  const safeFeed = Array.isArray(feed) ? feed : [];

  return (
    <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 backdrop-blur-md">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-blue-400" />
          <h3 className="text-base font-bold text-white tracking-tight">Семейный журнал</h3>
        </div>
        <span className="text-xs text-slate-400">Лента активности</span>
      </div>

      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
        {safeFeed.length === 0 ? (
          <div className="text-center py-8 px-4 bg-white/5 rounded-2xl border border-dashed border-white/10 flex flex-col items-center justify-center">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-2.5 text-blue-400">
              <History className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-slate-200">Журнал пока пуст</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
              Здесь появится история выполненных семейных квестов и полученного золота
            </p>
          </div>
        ) : (
          safeFeed.map((entry) => {
            const userName = entry?.userName || 'Игрок';
            const isMisha = userName.includes('Миша');
            const rawTime = entry?.timestamp || entry?.date || '';
            const tsString = typeof rawTime === 'string' ? rawTime : String(rawTime);
            const timeDisplay = tsString.length >= 16 ? tsString.slice(11, 16) : tsString;

            return (
              <div
                key={entry.id || Math.random()}
                className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5 text-xs hover:bg-white/10 transition"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      isMisha ? 'bg-blue-400' : 'bg-pink-400'
                    }`}
                  />
                  <div className="min-w-0">
                    <span className="font-bold text-white mr-1.5">{userName}:</span>
                    <span className="text-slate-300 truncate">{entry.taskTitle || 'Задание'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span className="text-amber-300 font-semibold">+{entry.points || 0}💰</span>
                  {timeDisplay && (
                    <span className="text-[10px] text-slate-500 hidden sm:inline">
                      {timeDisplay}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
