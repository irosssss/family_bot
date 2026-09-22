import { closedObject, reject } from '../contracts/errors';
import { entityId } from '../contracts/ids';

/** Accepted prototype prices only; not an active catalog, grant or purchase handler. */
export function prototypeOutfitPolicy(input: unknown) {
  const row = closedObject(input, ['collection', 'number']);
  if (row.collection !== 'basic' && row.collection !== 'seasonal') reject('v3.outfit_collection_invalid');
  const number = row.number;
  const limit = row.collection === 'basic' ? 3 : 4;
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 1 || number > limit) {
    reject('v3.outfit_number_invalid');
  }
  const price = row.collection === 'seasonal' ? 120 : [0, 48, 72][number - 1];
  return Object.freeze({ currency: 'game_coins' as const, price, automatic_grant: row.collection === 'basic' && number === 1,
    pricing_stage: 'prototype' as const });
}

/**
 * Pure rule, NOT authorization or task completion. The future task service must supply
 * the current complete active-adult roster of the task's family from trusted storage,
 * authenticate the reviewer and check task state atomically before applying any reward.
 * Never accept this roster or reviewer identity directly from a client.
 */
export function adultOwnTaskReviewPolicy(input: unknown) {
  const row = closedObject(input, ['performer_id', 'reviewer_id', 'active_adult_ids', 'action']);
  const performer = entityId(row.performer_id, '/performer_id');
  const reviewer = entityId(row.reviewer_id, '/reviewer_id');
  if (!Array.isArray(row.active_adult_ids) || row.active_adult_ids.length === 0) reject('v3.adult_roster_invalid');
  const adults = row.active_adult_ids.map((id, i) => entityId(id, `/active_adult_ids/${i}`));
  if (new Set(adults).size !== adults.length) reject('v3.adult_roster_invalid');
  if (!adults.includes(performer) || !adults.includes(reviewer)) reject('v3.active_adult_required');
  if (row.action !== 'review_other' && row.action !== 'confirm_own') reject('v3.review_action_invalid');
  if (performer === reviewer) {
    if (adults.length !== 1 || row.action !== 'confirm_own') reject('v3.self_review_denied');
  } else if (row.action !== 'review_other') reject('v3.review_action_invalid');
  return Object.freeze({ mode: performer === reviewer ? 'sole_adult_confirmation' as const : 'other_adult_review' as const,
    // This is the review action's reward, not the performer's task completion reward.
    review_reward: Object.freeze({ coins: 0, xp: 0 }) });
}
