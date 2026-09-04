import React from 'react';
import { Home, Settings, UserPlus, UsersRound } from 'lucide-react';
import { User } from '../types';
import { triggerHaptic } from '../utils/haptics';

interface NavbarProps {
  activeUser: User;
  users: User[];
  onSelectUser: (user: User) => void;
  onOpenFamilySettings?: () => void;
  onOpenRegisterModal?: () => void;
}

/**
 * A deliberately quiet Telegram header. Progress belongs to the Today screen,
 * so this bar only answers two persistent questions: whose journal is open,
 * and where a parent manages the family.
 */
export const Navbar: React.FC<NavbarProps> = ({
  activeUser,
  users,
  onSelectUser,
  onOpenFamilySettings,
  onOpenRegisterModal,
}) => {
  const canManageFamily = activeUser.is_admin || activeUser.family_role === 'parent';

  return (
    <header className="sticky top-0 z-40 border-b-2 border-[#2f241c] bg-[#f5e7c8]/95 text-[#2f241c] shadow-[0_2px_0_rgba(47,36,28,.16)] backdrop-blur-md tg-safe-top">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-3 pb-2 sm:px-5 sm:pb-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] border-2 border-[#2f241c] bg-[#5b8d68] text-[#fff8e8] shadow-[2px_2px_0_#2f241c]" aria-hidden="true">
            <Home className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <p className="font-pixel-sub text-[9px] font-bold tracking-[0.12em] text-[#855529]">ДОМОВОЙ ЖУРНАЛ</p>
            <h1 className="truncate text-[15px] font-black tracking-[-0.025em] sm:text-base">Семейные дела на сегодня</h1>
          </div>
        </div>

        <div className="order-3 flex w-full items-center gap-1 overflow-x-auto pb-0.5 sm:order-2 sm:w-auto sm:max-w-[min(46vw,560px)]">
          <div className="flex min-w-max items-center gap-1 rounded-[14px] border-2 border-[#2f241c]/25 bg-[#e8d4ad] p-1" role="list" aria-label="Открыть журнал участника">
            {users.map((user) => {
              const isActive = user.id === activeUser.id;
              const isParent = user.family_role === 'parent';

              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection', 'light');
                    onSelectUser(user);
                  }}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2.5 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f241c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#e8d4ad] ${
                    isActive
                      ? 'bg-[#42614f] text-[#fff8e8] shadow-[1px_1px_0_#2f241c]'
                      : 'text-[#61401e] hover:bg-[#f7deb0]'
                  }`}
                  aria-pressed={isActive}
                >
                  <span className={`grid h-5 w-5 place-items-center rounded-md border ${isActive ? 'border-[#f3cf82] bg-[#274737]' : 'border-[#b9834d] bg-[#f5e7c8]'}`} aria-hidden="true">
                    {isParent ? <UsersRound className="h-3 w-3" /> : <Home className="h-3 w-3" />}
                  </span>
                  <span>{user.display_name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="order-2 flex items-center gap-1 sm:order-3">
          {canManageFamily && onOpenFamilySettings && (
            <button
              type="button"
              onClick={onOpenFamilySettings}
              className="grid min-h-11 min-w-11 place-items-center rounded-[13px] border-2 border-[#2f241c] bg-[#fff7e5] text-[#42614f] shadow-[2px_2px_0_#b9834d] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f241c] focus-visible:ring-offset-2"
              aria-label="Управление семьёй"
              title="Управление семьёй"
            >
              <Settings className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
            </button>
          )}
          {canManageFamily && onOpenRegisterModal && (
            <button
              type="button"
              onClick={onOpenRegisterModal}
              className="grid min-h-11 min-w-11 place-items-center rounded-[13px] border-2 border-[#2f241c] bg-[#f3cf82] text-[#61401e] shadow-[2px_2px_0_#b9834d] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f241c] focus-visible:ring-offset-2"
              aria-label="Добавить участника"
              title="Добавить участника"
            >
              <UserPlus className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
