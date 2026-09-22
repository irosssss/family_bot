import { describe, expect, it } from 'vitest';
import { adultOwnTaskReviewPolicy, prototypeOutfitPolicy } from '../../src/target/domain/v3Policy';
import { newEntityId } from '../../src/target/contracts/ids';

describe('accepted V3 policies (not runtime integration)', () => {
  it('grants only basic 1 automatically and prices the six purchased outfits in game coins', () => {
    const basics = [1, 2, 3].map(number => prototypeOutfitPolicy({ collection: 'basic', number }));
    const seasonal = [1, 2, 3, 4].map(number => prototypeOutfitPolicy({ collection: 'seasonal', number }));
    expect(basics.map(p => p.price)).toEqual([0, 48, 72]);
    expect(seasonal.map(p => p.price)).toEqual([120, 120, 120, 120]);
    expect([...basics, ...seasonal].map(p => p.automatic_grant)).toEqual([true, false, false, false, false, false, false]);
    for (const policy of [...basics, ...seasonal]) {
      expect(policy.currency).toBe('game_coins');
      expect(policy.pricing_stage).toBe('prototype');
      expect(Object.isFrozen(policy)).toBe(true);
    }
  });
  it.each([
    { collection: 'basic', number: 4 }, { collection: 'seasonal', number: 5 },
    { collection: 'basic', number: 0 }, { collection: 'basic', number: 1.5 },
    { collection: 'basic', number: '1' }, { collection: 'premium', number: 1 },
    { collection: 'basic', number: 1, price: 0 },
  ])('rejects nonexistent outfits and injected prices %j', input => {
    expect(() => prototypeOutfitPolicy(input)).toThrow();
  });
  const parent = newEntityId(), other = newEntityId(), outsider = newEntityId();
  const request = { performer_id: parent, reviewer_id: other, active_adult_ids: [parent, other], action: 'review_other' };
  it('allows another active adult to review, without a review reward', () => {
    expect(adultOwnTaskReviewPolicy(request)).toEqual({ mode: 'other_adult_review', review_reward: { coins: 0, xp: 0 } });
  });
  it('requires a separate own-confirmation action for the sole adult', () => {
    const solo = { ...request, reviewer_id: parent, active_adult_ids: [parent] };
    expect(() => adultOwnTaskReviewPolicy(solo)).toThrow('v3.self_review_denied');
    expect(adultOwnTaskReviewPolicy({ ...solo, action: 'confirm_own' }).mode).toBe('sole_adult_confirmation');
  });
  it.each([
    { reviewer_id: parent, action: 'confirm_own' }, { reviewer_id: outsider },
    { performer_id: outsider }, { action: 'confirm_own' }, { action: 'submit' },
    { active_adult_ids: [] }, { active_adult_ids: [parent, parent] },
    { active_adult_ids: [parent, 'invalid'] }, { review_reward: { coins: 8, xp: 8 } },
  ])('rejects invalid reviewer, roster or action %j', change => {
    expect(() => adultOwnTaskReviewPolicy({ ...request, ...change })).toThrow();
  });
});
