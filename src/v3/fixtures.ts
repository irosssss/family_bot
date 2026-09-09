/** Visual examples only. No economy calculation, persistence, server authority or real family data. */
export type Member = { id: string; name: string; familyRole: 'adult' | 'child'; permissions: { manageFamily: boolean; reviewChildTasks: boolean; purchase: boolean }; hero: { level: number; xp: number; gold: number; title: string } };
export type TaskStatus = 'ready' | 'review' | 'rework' | 'done';
export type TaskShare = { memberId: string; contribution: string; status: TaskStatus };
export type Task = { id: string; title: string; description: string; assignee: string; category: 'home' | 'learning' | 'care' | 'together'; difficulty: 'easy' | 'normal' | 'hard'; status: TaskStatus; requiresReview: boolean; rewardLabel: string; reworkReason?: string; shares?: TaskShare[] };
const member = (id: string, name: string, familyRole: Member['familyRole'], title: string): Member => ({ id, name, familyRole, permissions: { manageFamily: familyRole === 'adult', reviewChildTasks: familyRole === 'adult', purchase: familyRole === 'adult' }, hero: { level: 1, xp: 35, gold: 24, title } });
export const demoMembers: Member[] = [member('alex', 'Алексей', 'adult', 'Хранитель тропы'), member('irina', 'Ирина', 'adult', 'Искательница историй'), member('sasha', 'Саша', 'child', 'Юный исследователь'), member('nika', 'Ника', 'child', 'Подруга леса'), member('lev', 'Лев', 'child', 'Любитель открытий'), member('mira', 'Мира', 'child', 'Собирательница сказок'), member('olya', 'Оля', 'child', 'Следопыт'), member('vanya', 'Ваня', 'child', 'Помощник команды')];
export const demoTasks: Task[] = [
  { id: 'read', title: 'Почитать любимую книгу', description: 'Выбери историю и почитай 15 минут. После можно рассказать семье, что понравилось.', assignee: 'sasha', category: 'learning', difficulty: 'normal', status: 'ready', requiresReview: true, rewardLabel: 'Опыт героя, золото и вклад в приключение' },
  { id: 'plants', title: 'Полить комнатные растения', description: 'Проверь землю и полей те цветы, которым нужна вода.', assignee: 'irina', category: 'home', difficulty: 'easy', status: 'ready', requiresReview: false, rewardLabel: 'Опыт героя, золото и вклад в приключение' },
  { id: 'walk', title: 'Выйти на прогулку', description: 'Небольшая прогулка в удобном темпе. Задание можно перенести без штрафа.', assignee: 'alex', category: 'care', difficulty: 'normal', status: 'done', requiresReview: false, rewardLabel: 'Опыт героя, золото и вклад в приключение' },
  { id: 'toys', title: 'Убрать игрушки на места', description: 'Освободи место для следующей игры. Если нужна помощь — позови взрослого.', assignee: 'nika', category: 'home', difficulty: 'normal', status: 'review', requiresReview: true, rewardLabel: 'Награда после подтверждения взрослым' },
  { id: 'desk', title: 'Подготовить стол для занятий', description: 'Убери лишнее и оставь место для книги и тетради.', assignee: 'sasha', category: 'home', difficulty: 'easy', status: 'rework', requiresReview: true, rewardLabel: 'Награда после принятия результата', reworkReason: 'Книги уже на полке. Осталось убрать обрезки бумаги со стола.' },
  { id: 'dinner', title: 'Подготовить стол к ужину', description: 'Каждый берёт посильную часть: салфетки, тарелки или воду. Вклады участников принимаются отдельно.', assignee: 'family', category: 'together', difficulty: 'hard', status: 'ready', requiresReview: true, rewardLabel: 'Общий результат, отдельный вклад каждого', shares: [
    { memberId: 'alex', contribution: 'Расставить тарелки', status: 'ready' },
    { memberId: 'irina', contribution: 'Подготовить воду', status: 'done' },
    { memberId: 'sasha', contribution: 'Разложить салфетки', status: 'ready' },
    { memberId: 'nika', contribution: 'Положить ложки', status: 'ready' },
    { memberId: 'lev', contribution: 'Принести подставки', status: 'ready' },
    { memberId: 'mira', contribution: 'Поставить хлебную корзину', status: 'ready' },
    { memberId: 'olya', contribution: 'Освободить место на столе', status: 'ready' },
    { memberId: 'vanya', contribution: 'Придвинуть свой стул', status: 'ready' },
  ] },
];
export const categoryNames = { home: 'Дом', learning: 'Учёба', care: 'Забота', together: 'Вместе' };
export const statusNames: Record<TaskStatus, string> = { ready: 'Впереди', review: 'На проверке', rework: 'На доработке', done: 'Готово' };
