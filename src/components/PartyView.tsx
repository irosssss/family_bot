import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Home, Palette, Settings, Sparkles, Users } from 'lucide-react';
import { AppState, User } from '../types';
import HabiticaAnimatedAvatar from './HabiticaAnimatedAvatar';
import { getUnifiedLook } from '../utils/unifiedLook';
import { habiticaPetSprite } from '../utils/shopLookMap';
import { triggerHaptic } from '../utils/haptics';

interface PartyViewProps {
  appState: AppState;
  activeUser: User;
  onOpenWardrobe: () => void;
  onOpenCharacterEditor: () => void;
}

function isParent(user: User): boolean {
  return user.family_role === 'parent' || user.is_admin === true;
}

function roleLabel(user: User): string {
  return isParent(user) ? 'Родитель' : 'Хранитель дома';
}

function childWord(count: number): string {
  if (count % 10 === 1 && count % 100 !== 11) return 'ребёнок';
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)) return 'ребёнка';
  return 'детей';
}

type FamilyMember = {
  user: User;
  petTitle?: string;
  petSprite?: string;
};

function FamilyMemberCard({
  member,
  isActive,
  expanded,
  onToggle,
}: {
  member: FamilyMember;
  isActive: boolean;
  expanded: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const { user, petTitle, petSprite } = member;
  const parent = isParent(user);
  const level = Math.max(1, Math.floor(user.xp / 100) + 1);
  const xpProgress = user.xp % 100;
  const canExpand = isActive && !parent;

  return (
    <article className={`overflow-hidden rounded-[18px] border-2 shadow-[2px_2px_0_#b9834d] ${isActive ? 'border-[#2f241c] bg-[#fff7e5]' : 'border-[#c69b68] bg-[#f8ecd1]'}`}>
      <button
        type="button"
        onClick={() => {
          if (!canExpand) return;
          triggerHaptic('selection', 'light');
          onToggle();
        }}
        disabled={!canExpand}
        className={`flex min-h-[72px] w-full items-center gap-3 px-3 py-2.5 text-left ${canExpand ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#42614f]' : 'cursor-default'}`}
        aria-expanded={canExpand ? expanded : undefined}
        aria-label={canExpand ? `Открыть сведения ${user.display_name}` : user.display_name}
      >
        <div className="relative flex h-14 w-12 shrink-0 items-end justify-center rounded-[13px] border-2 border-[#2f241c]/25 bg-[#e8d4ad]">
          <HabiticaAnimatedAvatar
            look={getUnifiedLook(user)}
            cls={user.class || 'warrior'}
            size={46}
            state="idle"
            gender={user.gender}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate text-sm font-black text-[#2f241c]">{user.display_name}</h3>
            {isActive && <span className="rounded-md bg-[#42614f] px-1.5 py-0.5 text-[9px] font-black text-[#fff8e8]">ты</span>}
          </div>
          <p className="mt-0.5 text-[11px] font-semibold text-[#735941]">{roleLabel(user)}</p>
          {petTitle && petSprite && (
            <span className="mt-1 inline-flex max-w-full items-center gap-1 text-[10px] font-semibold text-[#61401e]">
              <img src={petSprite} alt="" className="h-4 w-4 shrink-0 object-contain pixel-art" draggable={false} />
              <span className="truncate">рядом {petTitle}</span>
            </span>
          )}
        </div>
        {!parent && (
          <div className="shrink-0 text-right">
            <span className="block font-pixel-sub text-[9px] font-bold text-[#855529]">УР. {level}</span>
            <span className="mt-1 block text-[10px] font-bold text-[#5b8d68]">{user.current_streak || 0} дней</span>
          </div>
        )}
        {canExpand && <span className="shrink-0 text-[#735941]">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>}
      </button>

      {canExpand && expanded && (
        <div className="border-t border-[#c69b68] bg-[#f5e7c8] px-3 pb-3 pt-2.5">
          <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-[#61401e]">
            <span className="inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Опыт до ур. {level + 1}</span>
            <span>{xpProgress} / 100</span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full border border-[#2f241c] bg-[#e1c99e]">
            <div className="h-full rounded-full bg-[#5b8d68] transition-[width] duration-500" style={{ width: `${xpProgress}%` }} />
          </div>
          <p className="mt-2 text-[11px] leading-4 text-[#735941]">Нажми на строку ещё раз, чтобы свернуть карточку.</p>
        </div>
      )}
    </article>
  );
}

/** A family roster, not an RPG party: roles and contribution are more useful here than combat stats. */
export const PartyView: React.FC<PartyViewProps> = ({ appState, activeUser, onOpenWardrobe, onOpenCharacterEditor }) => {
  const [expandedId, setExpandedId] = useState<number | null>(isParent(activeUser) ? null : activeUser.id);
  const activeIsParent = isParent(activeUser);

  useEffect(() => {
    setExpandedId(isParent(activeUser) ? null : activeUser.id);
  }, [activeUser.id, activeUser.family_role, activeUser.is_admin]);

  const members = useMemo<FamilyMember[]>(() => appState.users.map((user) => {
    const petRecord = appState.userPets.find((record) => record.user_id === user.id && record.is_active)
      ?? appState.userPets.find((record) => record.user_id === user.id);
    const pet = petRecord ? appState.pets.find((candidate) => candidate.id === petRecord.pet_id) : undefined;
    return {
      user,
      petTitle: pet?.title,
      petSprite: pet ? habiticaPetSprite(pet.code) : undefined,
    };
  }), [appState.pets, appState.userPets, appState.users]);

  const childCount = appState.users.filter((user) => !isParent(user)).length;

  return (
    <section className="overflow-hidden rounded-[28px] border-[3px] border-[#2f241c] bg-[#f5e7c8] text-[#2f241c] shadow-[0_8px_0_#2f241c]" aria-label="Наша семья">
      <header className="relative overflow-hidden border-b-[3px] border-[#2f241c] bg-[#7d9db5] px-4 py-4 text-[#1f3443] sm:px-6">
        <div className="pointer-events-none absolute -right-10 -top-9 h-36 w-36 rounded-full border-[17px] border-[#f7ecd0]/45" aria-hidden="true" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="font-pixel-sub text-[10px] font-bold tracking-[0.14em] text-[#34506a]">НАША СЕМЬЯ</p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.035em]">Кто заботится о доме</h2>
            <p className="mt-1 text-xs font-semibold text-[#34506a]">{childCount} {childWord(childCount)} в семейном журнале</p>
          </div>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[15px] border-2 border-[#1f3443] bg-[#c9d9e4] shadow-[2px_2px_0_#1f3443]" aria-hidden="true">
            <Users className="h-6 w-6" />
          </span>
        </div>
      </header>

      <div className="p-3 sm:p-5">
        <div className="mb-3 rounded-[16px] border-2 border-[#c69b68] bg-[#fff7e5] px-3 py-2.5 text-xs leading-5 text-[#61401e]">
          {activeIsParent
            ? 'Родитель видит состав семьи и управляет задачами без игровых показателей.'
            : 'У каждого свой журнал, а общий дом становится уютнее от вклада всех.'}
        </div>

        <div className="space-y-2">
          {members.map((member) => (
            <FamilyMemberCard
              key={member.user.id}
              member={member}
              isActive={member.user.id === activeUser.id}
              expanded={expandedId === member.user.id}
              onToggle={() => setExpandedId((current) => current === member.user.id ? null : member.user.id)}
            />
          ))}
        </div>

        {!activeIsParent ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('impact', 'light');
                onOpenWardrobe();
              }}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] border-2 border-[#2f241c] bg-[#7e698b] px-3 text-xs font-black text-[#fff8e8] shadow-[2px_2px_0_#2f241c] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f241c] focus-visible:ring-offset-2"
            >
              <Palette className="h-4 w-4" aria-hidden="true" />
              Мастерская
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('impact', 'light');
                onOpenCharacterEditor();
              }}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] border-2 border-[#2f241c] bg-[#fff7e5] px-3 text-xs font-black text-[#61401e] shadow-[2px_2px_0_#b9834d] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f241c] focus-visible:ring-offset-2"
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              Внешность
            </button>
          </div>
        ) : (
          <div className="mt-4 flex min-h-12 items-center gap-2 rounded-[14px] border-2 border-[#c69b68] bg-[#e8d4ad] px-3 text-xs font-bold text-[#61401e]">
            <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
            Управление делами находится в разделе «Семья».
          </div>
        )}
      </div>
    </section>
  );
};
