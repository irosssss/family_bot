export const GAME_ERRORS = {
  NOT_FOUND: 'Объект недоступен.',
  CONFLICT: 'Данные изменились. Обновите экран и повторите действие.',
  CLOSED: 'Эта работа уже закрыта.',
  WRONG_OWNER: 'Это действие доступно только владельцу.',
  PENDING_REVIEW_EXISTS: 'Сначала проверьте или верните отправленные результаты.',
  SUBMISSION_CONTENT_CONFLICT: 'Эта попытка уже отправлена с другими данными.',
  RETURNED_ATTEMPT_NOT_CURRENT: 'Откройте последнюю возвращённую попытку.',
  ATTEMPT_ALREADY_DECIDED: 'По этому результату уже принято другое решение.',
  INVALID_PERFORMED_ON: 'Выберите день выполнения в пределах срока отправки.',
  IDEMPOTENCY_KEY_REUSED: 'Запрос с этим номером уже содержит другое действие.',
  INSUFFICIENT_GOLD: 'Недостаточно доступных монет.',
  ALREADY_OWNED: 'Этот предмет уже получен.',
  QUOTE_EXPIRED: 'Цена устарела. Откройте предложение заново.',
  OFFER_CHANGED: 'Условия предложения изменились. Откройте его заново.',
  INELIGIBLE: 'Сейчас это предложение недоступно.',
  STARTER_NOT_READY: 'Бесплатный выбор появится после первого принятого дела.',
  STARTER_ALREADY_CHOSEN: 'Стартовый питомец уже выбран.',
  PET_NOT_READY: 'Яйцу пока не хватает опыта для вылупления.',
  ORDER_STATE_CONFLICT: 'Состояние заявки изменилось. Обновите экран.',
  ACTIVE_ORDER_EXISTS: 'По этому предложению уже есть незавершённая заявка.',
  CANCELLATION_PENDING: 'Сначала нужно решить запрос отмены.',
  CANCELLATION_CONTENT_CONFLICT: 'У этой просьбы уже сохранена другая причина.',
  DECLINED_CANCELLATION_NOT_CURRENT: 'Откройте последнее решение по отмене.',
  REWARD_ALREADY_DELIVERED: 'Выдача уже подтверждена.',
  CORRECTION_CHANGED: 'Данные для исправления изменились. Посмотрите новый расчёт.',
  ALREADY_CORRECTED: 'Это начисление уже исправлено.',
  ALREADY_RESTORED: 'Исправление уже восстановлено.',
  ACTIVE_ADVENTURE_EXISTS: 'Сначала завершите текущее приключение.',
  VALIDATION: 'Проверьте заполненные поля.',
} as const;
export type GameErrorCode = keyof typeof GAME_ERRORS;
export class GameError extends Error {
  readonly code: GameErrorCode;
  constructor(code: GameErrorCode) { super(GAME_ERRORS[code]); this.name = 'GameError'; this.code = code; }
}
export function requireGame(condition: unknown, code: GameErrorCode): asserts condition {
  if (!condition) throw new GameError(code);
}
