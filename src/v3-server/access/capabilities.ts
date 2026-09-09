import { ValidationError } from '../contracts/errors.js';

export const CAPABILITY_SCOPES = Object.freeze({
  'family.read': 'family',
  'family.manage': 'family',
  'tasks.manage': 'family',
  'completion.submit_self': 'self',
  'completion.review_child': 'children_of_family',
  'shop.purchase_self': 'self',
  'shop.purchase_family_item': 'family',
  'appearance.select_self': 'self',
  'real_reward.request_self': 'self',
  'real_reward.review_child': 'children_of_family',
  'real_reward.cancel_child': 'children_of_family',
  'real_reward.deliver_child': 'children_of_family',
} as const);
export type Capability = keyof typeof CAPABILITY_SCOPES;
export type CapabilityScope = typeof CAPABILITY_SCOPES[Capability];
export function parseCapability(value: unknown): Capability {
  if (typeof value !== 'string' || !Object.hasOwn(CAPABILITY_SCOPES, value)) throw new ValidationError();
  return value as Capability;
}
export function parseFamilyRole(value: unknown): 'adult' | 'child' {
  if (value !== 'adult' && value !== 'child') throw new ValidationError();
  return value;
}
