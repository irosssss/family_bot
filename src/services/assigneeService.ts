/**
 * ARC-02: универсальный резолв назначенности задачи пользователю.
 * Единая точка проверки «можно ли этому юзеру эту задачу» — заменяет
 * разбросанные legacy-сравнения task.assignee === user.assignee.
 *
 * Модель:
 *  - assignee_type 'any' | 'both' → доступна всем детям семьи
 *  - assignee_type 'individual' → assignee_list содержит user_id как строки
 *    (новая модель, мультитенантная) и/или display_name (legacy)
 *  - legacy fallback (пустой assignee_list): старые 'misha'|'regina'|'both'
 *    сравниваются с user.assignee — работает и в новой семье, где assignee
 *    детям проставляется уникально (user_1/user_2/... для новых)
 */
import type { Task, User } from '../types';

export function isTaskAssignedToUser(task: Task, user: User): boolean {
  if (user.family_role === 'parent') return false;

  const at = task.assignee_type ?? 'any';
  if (at === 'any' || at === 'both') return true;
  if (at === 'parent') return false;

  // individual: список конкретных получателей
  const list = task.assignee_list ?? [];
  if (list.length > 0) {
    return list.includes(String(user.id)) || list.includes(user.display_name);
  }
  // legacy: старое поле assignee
  return task.assignee === 'both' || task.assignee === user.assignee;
}

/** Человекочитаемое имя исполнителя для сообщений об ошибках. */
export function assigneeLabel(task: Task, familyUsers: User[]): string {
  const at = task.assignee_type ?? 'any';
  if (at === 'any' || at === 'both') return 'Вся семья';

  const list = task.assignee_list ?? [];
  if (list.length > 0) {
    const names = list
      .map((v) => familyUsers.find((u) => String(u.id) === v)?.display_name ?? v)
      .join(', ');
    return names || 'Другой участник';
  }
  // legacy
  const byLegacy = familyUsers.find((u) => u.assignee === task.assignee);
  return byLegacy?.display_name ?? 'Другой участник';
}
