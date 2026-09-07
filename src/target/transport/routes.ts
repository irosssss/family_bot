import type { createIdentityExchangeService } from '../access/identityExchange';
import type { createAccessLifecycleService } from '../access/accessLifecycle';
import { choice, id, nullable, parseShape, pin, rev, text, token, type Projection, type Shape } from './contracts';

export interface AccessServices {
  readonly exchange: ReturnType<typeof createIdentityExchangeService>;
  readonly lifecycle: ReturnType<typeof createAccessLifecycleService>;
}
export type Credential = 'none' | 'launch' | 'setup' | 'session' | 'candidate';
export interface Route {
  readonly credential: Credential;
  readonly input: Shape;
  readonly output: Projection;
  readonly run: (bearer: string, input: Record<string, unknown>) => Promise<unknown>;
}
const setup = { id:true, revision:true, state:true, expires_at:true } as const;
const session = { id:true, family_id:true, profile_id:true, 'mode?':true, expires_at:true } as const;
const request = { id:true, revision:true, kind:true, state:true, family_id:true, target_profile_id:true,
  candidate_account_id:true, result_binding_id:true, completed_operation_id:true, expires_at:true } as const;
const ok = { ok:true } as const;
const requestOutput = { ...ok, request } as const;
const familyBinding = { family_id:id, binding_id:id };
const prepare = { expected_revision:rev, pin, pin_confirmation:pin };
const approval = { request_id:id, expected_revision:rev, candidate_account_id:id, pin, operation_id:id };
const confirmation = nullable(value => parseShape(value, { proof_bearer:token, operation_id:id }));

/** Explicit command wiring; internal composition, policy activation and cleanup are never routes. */
export function accessRoutes({ exchange:e, lifecycle:l }: AccessServices): ReadonlyMap<string, Route> {
  const a = l.adult, s = a.sessions;
  const routes = new Map<string, Route>();
  const add = (path: string, credential: Credential, input: Shape, output: Projection, run: Route['run']) => {
    routes.set(`/access/v1/${path}`, Object.freeze({ credential, input, output, run }));
  };
  add('identity/exchange','none',{ init_data:text(16384) },{ ...ok, launch:{ id:true, account_id:true, expires_at:true }, bearer:true },
    (_b,r) => e.exchangeTelegramIdentity(r.init_data));
  add('setup/begin','launch',familyBinding,{ ...ok, setup, bearer:true },(b,r) => a.beginSetup(b,r));
  add('setup/read','setup',{}, { ...ok, setup:{...setup,family_id:true,binding_id:true} },b => a.getSetup(b));
  add('setup/prepare','setup',prepare,{ ...ok, setup_revision:true, recovery_locator:true, recovery_code:true },(b,r) => a.prepareSetup(b,r));
  add('setup/rotate-recovery','setup',{ expected_revision:rev },{ ...ok, setup_revision:true, recovery_locator:true, recovery_code:true },(b,r) => a.rotatePendingRecovery(b,r));
  add('setup/acknowledge','setup',{ expected_revision:rev, recovery_code:text(128) },ok,(b,r) => a.acknowledgeRecovery(b,r));
  add('session/own-child','launch',familyBinding,{ ...ok, session, bearer:true },(b,r) => s.issueOwnChild(b,r));
  add('session/login','launch',{ ...familyBinding, pin },{ ...ok, session, bearer:true },(b,r) => a.login(b,r));
  add('session/read','session',{}, { ...ok, actor:{ family_id:true, profile_id:true, player_id:true, session_id:true, session_revision:true, token_revision:true, binding_id:true, mode:true } },async b => {
    const result = await s.resolveSession(b);
    return result.ok ? { ok:true, actor:{ ...result.actor, token_revision:result.actor.verifier_revision } } : result;
  });
  add('session/switch','session',{ pin, target_mode:choice('adult','managed_child'), target_binding_id:id, expected_session_revision:rev },
    { ...ok, session, bearer:true },(b,r) => a.switchMode(b,r));
  add('session/confirm','session',{ pin, action:choice('revoke_session','revoke_binding'), target_id:id, expected_revision:rev, operation_id:id },
    { ...ok, expires_at:true, operation_id:true, proof_bearer:true },(b,r) => a.confirmAction(b,r));
  add('session/revoke','session',{ session_id:id, expected_revision:rev, confirmation },{ ...ok, 'replayed?':true },
    (b,r) => s.revokeSession(b,{ session_id:r.session_id, expected_revision:r.expected_revision },r.confirmation ?? undefined));
  add('binding/revoke','session',{ binding_id:id, expected_revision:rev, confirmation },{ ...ok, 'replayed?':true },
    (b,r) => s.revokeBinding(b,{ binding_id:r.binding_id, expected_revision:r.expected_revision },r.confirmation ?? undefined));
  add('session/retire','session',{ expected_revision:rev },ok,(b,r) => s.retireOwnBearer(b,r.expected_revision as number));
  // An actual authorized projection proves the command/read boundary without adding game commands.
  add('profile/read','session',{ family_id:id, profile_id:id },{ ...ok, value:{ family_id:true, profile_id:true, player_id:true } },
    (b,r) => s.withFamilyAccess(b,{ action:'profile.read', family_id:r.family_id, profile_id:r.profile_id },async (_tx,actor) =>
      ({ family_id:actor.family_id, profile_id:r.profile_id, player_id:actor.profile_id === r.profile_id ? actor.player_id : null })));
  add('recovery/begin','launch',familyBinding,{ ...requestOutput, bearer:true },(b,r) => l.beginRecovery(b,r));
  add('recovery/code','candidate',{ expected_revision:rev, recovery_code:text(128) },requestOutput,(b,r) => l.authorizeRecoveryCode(b,r));
  add('recovery/approve','session',approval,ok,(b,r) => l.approveRecovery(b,r));
  add('recovery/complete','candidate',prepare,{ ...ok, binding_id:true, setup_revision:true, recovery_locator:true, recovery_code:true },(b,r) => l.completeRecovery(b,r));
  add('invitation/issue','session',{ kind:choice('invite_child','invite_adult'), profile_id:nullable(id), pin, operation_id:id },
    { ...ok, 'request?':request, 'invite_secret?':true },(b,r) => l.issueInvitation(b,r));
  add('invitation/claim','launch',{ invite_secret:token },{ ...requestOutput, bearer:true },(b,r) => l.claimInvitation(b,r));
  add('invitation/approve','session',approval,ok,(b,r) => l.approveInvitation(b,r));
  add('invitation/consume','candidate',{ expected_revision:rev, display_name:text(100) },{ ...ok, binding_id:true },(b,r) => l.consumeInvitation(b,r));
  add('lifecycle/read','candidate',{},requestOutput,b => l.getRequest(b));
  add('lifecycle/inspect','session',{ request_id:id },{ ...requestOutput, candidate:{ account_id:true, provider:true, subject:true } },(b,r) => l.inspectRequest(b,r));
  add('lifecycle/cancel','session',{ request_id:id, expected_revision:rev, pin, operation_id:id },ok,(b,r) => l.cancelRequest(b,r));
  add('lifecycle/operation','launch',{ operation_id:id },{ ...ok, operation_id:true, request_id:true, action:true, outcome:true },(b,r) => l.getOperation(b,r));
  add('lifecycle/leave','session',{ pin, expected_binding_revision:rev, operation_id:id },ok,(b,r) => l.leaveFamily(b,r));
  add('lifecycle/exclusion','session',{ pin, target_binding_id:id, expected_revision:rev, operation_id:id },{ ...ok, 'request?':request },(b,r) => l.requestExclusion(b,r));
  add('lifecycle/consent-exclusion','session',{ pin, request_id:id, expected_revision:rev, operation_id:id },ok,(b,r) => l.consentExclusion(b,r));
  add('lifecycle/revoke-adult-sessions','session',{ pin, target_binding_id:id, expected_revision:rev, operation_id:id },ok,(b,r) => l.revokeAdultSessions(b,r));
  return routes;
}
