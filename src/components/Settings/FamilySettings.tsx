import React, { useState, useEffect, useCallback } from 'react';
import { User, GenderKey, FamilyRole } from '../../types';
import { PixelAvatar } from '../PixelAvatar';
import { X, Shield, UserMinus, UserPlus, Save, Edit3, Users } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface ApiUser {
  id: number;
  telegram_id: number;
  display_name: string;
  family_role: FamilyRole;
  is_admin: boolean;
  gender: GenderKey | null;
  age: number | null;
  class: string;
  gold: number;
  xp: number;
  current_streak: number;
  avatar_url: string | null;
}

const ROLE_ICONS: Record<string, string> = {
  parent: '/assets/game/backgrounds/Previews/character-human.png',
  child: '/assets/game/entities/pets/Previews/animal-chick.png',
  male: '/assets/game/characters/bases/lpc_body_male.png',
  female: '/assets/game/characters/bases/lpc_body_female_lidia.png',
};

interface FamilySettingsProps {
  isOpen: boolean;
  activeUser: User;
  onClose: () => void;
  onUserUpdated: () => void;
}

export const FamilySettings: React.FC<FamilySettingsProps> = ({
  isOpen,
  activeUser,
  onClose,
  onUserUpdated,
}) => {
  const [members, setMembers] = useState<ApiUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAge, setNewAge] = useState(8);
  const [newGender, setNewGender] = useState<GenderKey>('male');

  const [editUser, setEditUser] = useState<ApiUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editAge, setEditAge] = useState(8);
  const [editGender, setEditGender] = useState<GenderKey>('male');

  const [deleteConfirm, setDeleteConfirm] = useState<ApiUser | null>(null);

  const isAdmin = activeUser.is_admin === true || activeUser.family_role === 'parent';

  const fetchMembers = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/users');
      const json = await res.json();
      if (json.success) {
        setMembers(json.users || json.data || []);
        setError(null);
      } else {
        setError(json.error || 'Не удалось загрузить состав семьи');
      }
    } catch (e) {
      setError('Ошибка сети при загрузке');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchMembers();
    }
  }, [isOpen, fetchMembers]);

  if (!isOpen) return null;

  const handleAddChild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setError('Введите имя');
      return;
    }
    try {
      setIsSaving(true);
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: activeUser.id, display_name: newName.trim(), age: newAge, gender: newGender }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchMembers();
        onUserUpdated();
        setNewName('');
        setNewAge(8);
        setNewGender('male');
        setShowAddForm(false);
        setError(null);
        setSuccess('Ребёнок добавлен в семью');
        setTimeout(() => setSuccess(null), 3000);
        triggerHaptic('notification', 'success');
      } else {
        setError(json.error || 'Ошибка при добавлении');
      }
    } catch (e) {
      setError('Ошибка сети при сохранении');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    try {
      setIsSaving(true);
      const res = await fetch(`/api/users/${editUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: activeUser.id, display_name: editName.trim(), age: editAge, gender: editGender }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchMembers();
        onUserUpdated();
        setEditUser(null);
        setError(null);
        setSuccess('Профиль обновлён');
        setTimeout(() => setSuccess(null), 3000);
        triggerHaptic('notification', 'success');
      } else {
        setError(json.error || 'Ошибка сохранения');
      }
    } catch (e) {
      setError('Ошибка сети при сохранении');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (userId: number) => {
    if (!isAdmin) return;
    try {
      setIsDeleting(true);
      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: activeUser.id }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchMembers();
        onUserUpdated();
        setDeleteConfirm(null);
        setError(null);
        triggerHaptic('notification', 'success');
      } else {
        setError(json.error || 'Ошибка удаления');
      }
    } catch (e) {
      setError('Ошибка сети при удалении');
    } finally {
      setIsDeleting(false);
    }
  };

  const openEdit = (user: ApiUser) => {
    setEditUser(user);
    setEditName(user.display_name);
    setEditAge(user.age || 8);
    setEditGender(user.gender || 'male');
  };

  const roleLabel = (u: ApiUser): string => {
    if (u.family_role === 'parent') return u.gender === 'female' ? 'Мама' : 'Папа';
    return u.gender === 'female' ? 'Дочка' : 'Сын';
  };

  const roleIcon = (u: ApiUser): string => {
    if (u.family_role === 'parent') return ROLE_ICONS.parent;
    return u.gender === 'female' ? ROLE_ICONS.female : ROLE_ICONS.male;
  };

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md" onClick={onClose}>
        <div className="bg-[#171c28] border border-white/15 rounded-2xl p-8 max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
          <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-white mb-2">Доступ запрещён</h2>
          <p className="text-sm text-slate-400 mb-4">Только родители могут управлять составом семьи.</p>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md" onClick={onClose}>
      <div
        className="bg-[#171c28] border border-white/15 rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-white font-pixel-sub">Настройки семьи</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-xl">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs px-3 py-2 rounded-xl">
              {success}
            </div>
          )}

          {/* Members list */}
          {isLoading ? (
            <div className="text-center py-8 text-slate-400 text-sm">Загрузка...</div>
          ) : (
            <div className="space-y-2">
              {members.map((u) => (
                <div key={u.id} className="flex items-center gap-3 bg-black/30 rounded-xl p-3 border border-white/10">
                  <img
                    src={roleIcon(u)}
                    alt={roleLabel(u)}
                    className="w-10 h-10 rounded-lg object-contain bg-black/40 pixel-art"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {u.display_name}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {roleLabel(u)}
                      {u.age ? ` · ${u.age} лет` : ''}
                      {u.is_admin ? ' · Родитель' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {u.family_role === 'child' && (
                      <>
                        <button
                          onClick={() => openEdit(u)}
                          className="p-2 rounded-lg text-slate-400 hover:text-blue-300 hover:bg-blue-500/10 transition"
                          title="Редактировать"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(u)}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-300 hover:bg-red-500/10 transition"
                          title="Удалить"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add child form */}
          {showAddForm ? (
            <form onSubmit={handleAddChild} className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-white">Добавить ребёнка</h3>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Имя</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Например: Аня"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 outline-none transition"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Возраст</label>
                  <input
                    type="number"
                    min={1}
                    max={18}
                    value={newAge}
                    onChange={(e) => setNewAge(parseInt(e.target.value) || 8)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Пол</label>
                  <select
                    value={newGender}
                    onChange={(e) => setNewGender(e.target.value as GenderKey)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition"
                  >
                    <option value="male" className="bg-slate-900">Мальчик</option>
                    <option value="female" className="bg-slate-900">Девочка</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 min-h-[44px] rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  {isSaving ? 'Сохранение...' : 'Добавить'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="min-h-[44px] px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full min-h-[44px] rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold transition inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              Добавить ребёнка
            </button>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setEditUser(null)}>
          <form
            onSubmit={handleUpdate}
            className="bg-[#171c28] border border-white/15 rounded-2xl p-6 w-full max-w-sm space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-white">Редактировать: {editUser.display_name}</h3>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Имя</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Возраст</label>
                <input
                  type="number"
                  min={1}
                  max={18}
                  value={editAge}
                  onChange={(e) => setEditAge(parseInt(e.target.value) || 8)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Пол</label>
                <select
                  value={editGender}
                  onChange={(e) => setEditGender(e.target.value as GenderKey)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition"
                >
                  <option value="male" className="bg-slate-900">Мальчик</option>
                  <option value="female" className="bg-slate-900">Девочка</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 min-h-[44px] rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button
                type="button"
                onClick={() => setEditUser(null)}
                className="min-h-[44px] px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)}>
          <div
            className="bg-[#171c28] border border-white/15 rounded-2xl p-6 w-full max-w-sm text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-white mb-2">Удалить {deleteConfirm.display_name}?</h3>
            <p className="text-xs text-slate-400 mb-4">Прогресс, награды и питомцы будут удалены безвозвратно.</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleDelete(deleteConfirm.id)}
                disabled={isDeleting}
                className="flex-1 min-h-[44px] rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold transition cursor-pointer"
              >
                {isDeleting ? 'Удаление...' : 'Удалить'}
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FamilySettings;