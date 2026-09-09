import { createCommandRegistry, parseCommandEnvelope } from '../contracts/envelope.js';
import { parseClosedRecord, parseEntityId, parseLocalDate, parseRevision, parseUInt, type Parser } from '../contracts/primitives.js';
import { ValidationError } from '../contracts/errors.js';
import { parseZone } from './calendar.js';

export const choice = <const T extends readonly string[]>(...values: T): Parser<T[number]> => value => {
  if (typeof value !== 'string' || !values.includes(value)) throw new ValidationError();
  return value as T[number];
};
export const textValue = (maximum: number, empty = false): Parser<string> => value => {
  if (typeof value !== 'string' || value !== value.trim() || value.length > maximum || (!empty && value.length === 0) ||
      /[\p{Cc}\p{Cf}\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u20e3]/u.test(value)) throw new ValidationError();
  return value;
};
export const integer = (min: number, max: number): Parser<number> => value => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || Object.is(value, -0) || value < min || value > max) throw new ValidationError();
  return value;
};
export const nullable = <T>(parser: Parser<T>): Parser<T | null> => value => value === null ? null : parser(value);
export const list = <T>(parser: Parser<T>, min = 0, max = 128): Parser<T[]> => value => {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new ValidationError();
  return Object.freeze(value.map(parser)) as unknown as T[];
};
const uniqueIds = (value: unknown) => {
  const ids = list(parseEntityId, 1)(value);
  if (new Set(ids).size !== ids.length) throw new ValidationError();
  return ids;
};
const schedule = (value: unknown) => parseClosedRecord(value, {
  kind: choice('once', 'daily', 'weekly'), startsOn: parseLocalDate, weekdays: list(integer(1, 7), 0, 7),
});
const part = (value: unknown) => parseClosedRecord(value, {
  playerId: parseEntityId, difficulty: choice('easy', 'normal', 'hard', 'epic'), label: textValue(100),
});
const task = {
  title: textValue(100), description: textValue(500, true), assignment: choice('individual', 'shared', 'rotation'),
  parts: list(part, 1), schedule,
};
const reason = nullable(textValue(500));
const continuation = (value: unknown) => {
  if (value && typeof value === 'object' && 'kind' in value && value.kind === 'first') return parseClosedRecord(value, { kind: choice('first') });
  return parseClosedRecord(value, { kind: choice('after_return'), returnedAttemptId: parseEntityId });
};
const cancellationContinuation = (value: unknown) => {
  if (value && typeof value === 'object' && 'kind' in value && value.kind === 'first') return parseClosedRecord(value, { kind: choice('first') });
  return parseClosedRecord(value, { kind: choice('after_decline'), declinedCancellationId: parseEntityId });
};
const offer = {
  title: textValue(100), promise: textValue(500), fulfillmentTerms: textValue(500),
  price: parseUInt, eligiblePlayerIds: uniqueIds,
};
export const gameRegistry = createCommandRegistry({
  OpenToday: {},
  UpdateCalendar: { zone: parseZone, lateDays: integer(1, 90), expectedRevision: parseRevision },
  CreateTask: task,
  UpdateTask: { taskId: parseEntityId, expectedRevision: parseRevision, ...task },
  RetireTask: { taskId: parseEntityId, expectedRevision: parseRevision },
  SubmitCompletion: { allocationId: parseEntityId, expectedRevision: parseRevision, performedOn: parseLocalDate, note: reason, continuation },
  ReviewCompletion: { attemptId: parseEntityId, expectedRevision: parseRevision, decision: choice('accept', 'return'), reason },
  CancelOccurrence: { occurrenceId: parseEntityId, expectedRevision: parseRevision, reason: textValue(500) },
  QuotePurchase: { itemId: textValue(100) },
  PurchaseItem: { quoteId: parseEntityId, expectedOfferRevision: parseRevision },
  SelectAppearance: { slot: choice('outfit', 'hand'), ownedItemId: nullable(parseEntityId), expectedRevision: parseRevision },
  SelectStarterEgg: { itemId: textValue(100) },
  SelectPetXpTarget: { petId: nullable(parseEntityId), expectedRevision: parseRevision },
  HatchPetEgg: { petId: parseEntityId, expectedRevision: parseRevision },
  SelectCompanion: { petId: nullable(parseEntityId), expectedRevision: parseRevision },
  SavePetCorner: { petId: parseEntityId, expectedRevision: parseRevision, theme: choice('meadow', 'sky', 'sand'), name: textValue(60) },
  CreateGoal: {
    title: textValue(100), plannedDays: integer(1, 365),
    roster: list(value => parseClosedRecord(value, { playerId: parseEntityId, dailyNorm: integer(1, 1000) }), 1),
  },
  SelectFamilyGoal: { goalId: nullable(parseEntityId), expectedSettingsRevision: parseRevision },
  CreateRealOffer: offer,
  UpdateRealOffer: { offerId: parseEntityId, expectedRevision: parseRevision, ...offer },
  RetireRealOffer: { offerId: parseEntityId, expectedRevision: parseRevision },
  QuoteRealReward: { offerId: parseEntityId },
  RequestRealReward: { quoteId: parseEntityId, expectedOfferRevision: parseRevision },
  ReviewRealReward: { orderId: parseEntityId, expectedRevision: parseRevision, decision: choice('approve', 'reject'), reason },
  CancelRealRewardRequest: { orderId: parseEntityId, expectedRevision: parseRevision },
  RequestRewardCancellation: { orderId: parseEntityId, expectedRevision: parseRevision, reason: textValue(500), continuation: cancellationContinuation },
  ResolveRewardCancellation: { cancellationId: parseEntityId, expectedRevision: parseRevision, decision: choice('approve', 'decline'), reason },
  CancelApprovedRealRewardByAdult: { orderId: parseEntityId, expectedRevision: parseRevision, reason: textValue(500) },
  ConfirmRealRewardFulfillment: { orderId: parseEntityId, expectedRevision: parseRevision, note: reason },
  PreviewCorrection: { settlementId: parseEntityId, reason: textValue(500) },
  CorrectSettlement: { previewId: parseEntityId, expectedRevision: parseRevision },
  RestoreCorrection: { correctionId: parseEntityId, expectedRevision: parseRevision, reason: textValue(500) },
  StartAdventure: { title: textValue(100), roster: uniqueIds, plannedDays: integer(1, 30) },
  SetAdventurePaused: { adventureId: parseEntityId, expectedRevision: parseRevision, paused: (value: unknown) => {
    if (typeof value !== 'boolean') throw new ValidationError(); return value;
  } },
});
export function parseGameCommand(raw: unknown) { return parseCommandEnvelope(raw, gameRegistry); }
export type GameCommand = ReturnType<typeof parseGameCommand>;
