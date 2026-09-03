/**
 * Тесты assigneeService (ARC-02): единый резолв назначенности задач.
 * userId-списки (новая модель) приоритетны, legacy 'misha'|'regina'|'both' — fallback.
 */
import { describe, it, expect } from 'vitest';
import { isTaskAssignedToUser, assigneeLabel } from '../src/services/assigneeService';
import type { Task, User } from '../src/types';

function mkUser(over: Partial<User> & { id: number }): User {
  return {
    telegram_id: 100000 + over.id,
    display_name: `User${over.id}`,
    assignee: 'both',
    family_role: 'child',
    gender: 'male',
    age: 10,
    ...over,
  } as User;
}

function mkTask(over: Partial<Task> & { id: number }): Task {
  return {
    id: over.id,
    code: `t${over.id}`,
    title: 'Task',
    points: 1,
    assignee: 'both',
    task_type: 'todo',
    day_of_week: null,
    ...over,
  } as Task;
}

const misha = mkUser({ id: 1, display_name: 'Misha', assignee: 'misha' });
const regina = mkUser({ id: 2, display_name: 'Regina', assignee: 'regina' });
const parent = mkUser({ id: 3, display_name: 'Папа', assignee: 'both', family_role: 'parent' });
const users = [parent, misha, regina];

describe('isTaskAssignedToUser', () => {
  it('assignee_type any — доступна любому ребёнку', () => {
    const t = mkTask({ id: 10, assignee_type: 'any' });
    expect(isTaskAssignedToUser(t, misha)).toBe(true);
    expect(isTaskAssignedToUser(t, regina)).toBe(true);
  });

  it('assignee_type both — доступна обоим', () => {
    const t = mkTask({ id: 11, assignee_type: 'both' });
    expect(isTaskAssignedToUser(t, misha)).toBe(true);
    expect(isTaskAssignedToUser(t, regina)).toBe(true);
  });

  it('assignee_type parent — недоступна детям', () => {
    const t = mkTask({ id: 12, assignee_type: 'parent' });
    expect(isTaskAssignedToUser(t, misha)).toBe(false);
  });

  it('ARC-02: assignee_list с userId-строками', () => {
    const t = mkTask({ id: 13, assignee_type: 'individual', assignee_list: ['2'] });
    expect(isTaskAssignedToUser(t, regina)).toBe(true);
    expect(isTaskAssignedToUser(t, misha)).toBe(false);
  });

  it('ARC-02: assignee_list с несколькими userId', () => {
    const t = mkTask({ id: 14, assignee_type: 'individual', assignee_list: ['1', '2'] });
    expect(isTaskAssignedToUser(t, misha)).toBe(true);
    expect(isTaskAssignedToUser(t, regina)).toBe(true);
  });

  it('ARC-02: display_name в списке — legacy-совместимость', () => {
    const t = mkTask({ id: 15, assignee_type: 'individual', assignee_list: ['Misha'] });
    expect(isTaskAssignedToUser(t, misha)).toBe(true);
    expect(isTaskAssignedToUser(t, regina)).toBe(false);
  });

  it('legacy: пустой assignee_list → старое поле assignee', () => {
    const t = mkTask({ id: 16, assignee_type: 'individual', assignee: 'regina' });
    expect(isTaskAssignedToUser(t, regina)).toBe(true);
    expect(isTaskAssignedToUser(t, misha)).toBe(false);
  });

  it('legacy: both в старом поле — доступна всем', () => {
    const t = mkTask({ id: 17, assignee_type: 'individual', assignee: 'both' });
    expect(isTaskAssignedToUser(t, misha)).toBe(true);
    expect(isTaskAssignedToUser(t, regina)).toBe(true);
  });

  it('родителю детская задача не назначается даже при совпадении', () => {
    const t = mkTask({ id: 18, assignee_type: 'individual', assignee_list: ['3'] });
    expect(isTaskAssignedToUser(t, parent)).toBe(false);
  });
});

describe('assigneeLabel', () => {
  it('userId-список → имена', () => {
    const t = mkTask({ id: 20, assignee_type: 'individual', assignee_list: ['1', '2'] });
    expect(assigneeLabel(t, users)).toBe('Misha, Regina');
  });

  it('any/both → «Вся семья»', () => {
    expect(assigneeLabel(mkTask({ id: 21, assignee_type: 'any' }), users)).toBe('Вся семья');
  });

  it('legacy assignee → имя по user.assignee', () => {
    const t = mkTask({ id: 22, assignee_type: 'individual', assignee: 'regina' });
    expect(assigneeLabel(t, users)).toBe('Regina');
  });
});
