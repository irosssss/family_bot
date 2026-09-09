import type { V3Database, V3Transaction } from '../db/client.js';
import { createAccessService, type VerifiedActor } from '../access/service.js';
import { CAPABILITY_SCOPES } from '../access/capabilities.js';
import { canonical } from '../game/canonical.js';
import { V3Error, ValidationError } from '../contracts/errors.js';
import { parseClosedRecord, parseEntityId, parseRevision, type EntityId } from '../contracts/primitives.js';
import { parseDisplayName } from '../foundation/records.js';
import { newEntityId } from '../foundation/ids.js';
import { digest, hashPin, parsePin, parseToken, token, verifyPin } from './crypto.js';

const forbidden = (): never => { throw new V3Error('FORBIDDEN'); };
const text = (v: unknown): string => { if (typeof v !== 'string' || v.length > 16384) throw new ValidationError(); return v; };
const optionalToken = (v: unknown) => v === null ? null : parseToken(v);
const parseRole = (v: unknown): 'adult' | 'child' => { if (v !== 'adult' && v !== 'child') throw new ValidationError(); return v; };
type Access = Pick<ReturnType<typeof createAccessService>, 'withOperation'>;
export type LoginVerifier = (credential: unknown) => Promise<string>;
export async function grantDefaultCapabilities(tx: V3Transaction, family: string, member: string, role: 'adult' | 'child') {
  for (const [capability, scope] of Object.entries(CAPABILITY_SCOPES)) {
    const child = ['family.read', 'completion.submit_self', 'shop.purchase_self', 'appearance.select_self', 'real_reward.request_self'];
    if (role === 'child' && !child.includes(capability)) continue;
    if (role === 'adult' && capability === 'real_reward.request_self') continue;
    await tx`insert into rpg_v3.capability_grants(id,family_id,member_id,capability,scope,status)
      values (${newEntityId()},${family},${member},${capability},${scope},'active')`;
  }
}
export function createIdentityService(db: V3Database, verifyIdentity: LoginVerifier) {
  const adapter = { async verify(credential: string) {
    const hashed = digest(parseToken(credential));
    const [row] = await db.sql`select session_id from rpg_v3.device_tokens where token_hash=${hashed}`;
    if (!row) return forbidden();
    return { sessionId: parseEntityId(row.session_id) };
  } };
  const access = createAccessService(db, adapter);
  async function issue(tx: V3Transaction, bindingId: string, homeId: string) {
    const [b] = await tx`select * from rpg_v3.access_bindings where id=${bindingId} and status='active'`;
    if (!b) return forbidden();
    const sessionId = newEntityId(), bearer = token();
    await tx`insert into rpg_v3.sessions(id,family_id,binding_id,status,expires_at)
      values (${sessionId},${b.family_id},${bindingId},'active',clock_timestamp()+interval '7 days')`;
    await tx`insert into rpg_v3.device_tokens(token_hash,session_id,home_binding_id)
      values (${digest(bearer)},${sessionId},${homeId})`;
    return { token: bearer, familyId: b.family_id as string, memberId: b.member_id as string };
  }
  // The family lock always precedes the identity row lock, matching game authorization.
  async function lockIdentity(tx: V3Transaction, subject: string) {
    const [locate] = await tx`select b.family_id from rpg_v3.identities i join rpg_v3.access_bindings b on b.id=i.home_binding_id
      where i.subject_hash=${subject}`;
    if (!locate) return null;
    await tx`select id from rpg_v3.families where id=${locate.family_id} for update`;
    const [row] = await tx`select i.*, b.status as binding_status,a.status as account_status,m.status as member_status,
      f.status as family_status from rpg_v3.identities i
      join rpg_v3.access_bindings b on b.id=i.home_binding_id join rpg_v3.accounts a on a.id=i.account_id
      join rpg_v3.member_profiles m on m.id=b.member_id join rpg_v3.families f on f.id=b.family_id
      where i.subject_hash=${subject} for update of i`;
    if (!row || [row.binding_status,row.account_status,row.member_status,row.family_status].some(s => s !== 'active')) return forbidden();
    return row;
  }
  async function checkPin(tx: V3Transaction, row: Record<string, any>, pin: string) {
    const [clock] = await tx`select clock_timestamp() as now`;
    if (row.locked_until && row.locked_until > clock.now) return false;
    if (!await verifyPin(pin, row.pin_hash)) {
      const failures = row.locked_until && row.locked_until <= clock.now ? 1 : Math.min(5, row.failures + 1);
      await tx`update rpg_v3.identities set failures=${failures},
        locked_until=case when ${failures}>=5 then clock_timestamp()+interval '15 minutes' else null end
        where subject_hash=${row.subject_hash}`;
      return false; // Commit the failed-attempt counter, then reject outside this transaction.
    }
    await tx`update rpg_v3.identities set failures=0,locked_until=null where subject_hash=${row.subject_hash}`;
    return true;
  }
  async function binding(tx: V3Transaction, account: string, family: string, member: string, player: string | null, mode: string) {
    const id = newEntityId();
    await tx`insert into rpg_v3.access_bindings(id,account_id,family_id,member_id,player_id,mode,status)
      values (${id},${account},${family},${member},${player},${mode},'active')`;
    return id;
  }
  async function login(input: unknown) {
    const p = parseClosedRecord(input, { credential: text, pin: parsePin, displayName: parseDisplayName, invite: optionalToken,
      intent: (v:unknown) => {if(v!=='login'&&v!=='enroll')throw new ValidationError();return v;} });
    const subject = parseToken(await verifyIdentity(p.credential));
    // Serializes first enrollment without trusting caller-supplied account/member IDs.
    const result = await db.sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${'v3:identity:' + subject},0))`;
      const existing = await lockIdentity(tx, subject);
      if (existing) {
        if (p.invite !== null) return forbidden();
        if (!await checkPin(tx, existing, p.pin)) return null;
        return { ...await issue(tx, existing.home_binding_id, existing.home_binding_id), recoveryCode: null };
      }
      if(p.intent!=='enroll')return forbidden();
      const account = newEntityId();
      let family: EntityId, member: EntityId, player: EntityId | null, role: 'adult' | 'child';
      if (p.invite) {
        const [locate] = await tx`select family_id from rpg_v3.member_invites where token_hash=${digest(p.invite)}`;
        if (!locate) return forbidden();
        const activeFamily=await tx`select id from rpg_v3.families where id=${locate.family_id} and status='active' for update`;
        if(activeFamily.length!==1)return forbidden();
        const [invite] = await tx`select i.*,m.family_role,m.status as member_status,p.id as player_id
          from rpg_v3.member_invites i join rpg_v3.member_profiles m on m.id=i.member_id and m.family_id=i.family_id
          left join rpg_v3.players p on p.member_id=m.id where i.token_hash=${digest(p.invite)}
          and i.status='open' and i.expires_at>clock_timestamp() for update of i,m`;
        if (!invite || invite.member_status !== 'active') return forbidden();
        family = parseEntityId(invite.family_id); member = parseEntityId(invite.member_id);
        player = invite.player_id ? parseEntityId(invite.player_id) : null; role = parseRole(invite.family_role);
        const own = await tx`select id from rpg_v3.access_bindings where family_id=${family} and member_id=${member}
          and mode in ('adult','own_child') and status='active'`;
        if (own.length) return forbidden();
        await tx`insert into rpg_v3.accounts(id,status) values (${account},'active')`;
        await tx`update rpg_v3.member_invites set status='used',used_by=${account} where id=${invite.id}`;
      } else {
        family = newEntityId(); member = newEntityId(); player = newEntityId(); role = 'adult';
        await tx`insert into rpg_v3.accounts(id,status) values (${account},'active')`;
        await tx`insert into rpg_v3.families(id,status) values (${family},'active')`;
        await tx`insert into rpg_v3.member_profiles(id,family_id,family_role,display_name,status)
          values (${member},${family},'adult',${p.displayName},'active')`;
        await tx`insert into rpg_v3.players(id,family_id,member_id,status) values (${player},${family},${member},'active')`;
        await grantDefaultCapabilities(tx,family,member,role);
      }
      const home = await binding(tx,account,family,member,player,role === 'adult' ? 'adult' : 'own_child');
      const recoveryCode = token();
      await tx`insert into rpg_v3.identities(subject_hash,account_id,home_binding_id,pin_hash,recovery_hash)
        values (${subject},${account},${home},${await hashPin(p.pin)},${digest(recoveryCode)})`;
      return { ...await issue(tx,home,home), recoveryCode };
    });
    if (!result) return forbidden();
    return result;
  }
  async function recover(input: unknown) {
    const p = parseClosedRecord(input, { credential: text, recoveryCode: parseToken, newPin: parsePin });
    const subject = parseToken(await verifyIdentity(p.credential));
    const result = await db.sql.begin(async tx => {
      const row = await lockIdentity(tx, subject);
      if (!row || digest(p.recoveryCode) !== row.recovery_hash) return null;
      const recoveryCode = token();
      await tx`update rpg_v3.identities set pin_hash=${await hashPin(p.newPin)},recovery_hash=${digest(recoveryCode)},
        failures=0,locked_until=null where subject_hash=${subject}`;
      await tx`update rpg_v3.sessions s set status='revoked',revision=s.revision+1 from rpg_v3.access_bindings b
        where s.binding_id=b.id and b.account_id=${row.account_id} and s.status='active'`;
      return { ...await issue(tx,row.home_binding_id,row.home_binding_id), recoveryCode };
    });
    if (!result) return forbidden();
    return result;
  }
  async function device(tx: V3Transaction, actor: VerifiedActor, bearer: string) {
    const [d] = await tx`select d.*,b.account_id,b.family_id,b.mode as home_mode,b.member_id as home_member
      from rpg_v3.device_tokens d join rpg_v3.access_bindings b on b.id=d.home_binding_id
      where d.token_hash=${digest(parseToken(bearer))} and d.session_id=${actor.sessionId} and b.status='active'`;
    if (!d || d.account_id !== actor.accountId || d.family_id !== actor.familyId) return forbidden();
    return d;
  }
  async function switchProfile(actor: VerifiedActor, bearer: string, input: unknown) {
    const p = parseClosedRecord(input, { memberId: parseEntityId, pin: (v: unknown) => v === null ? null : parsePin(v) });
    const result = await access.withOperation(actor,'ReadFamily',{ familyId: actor.familyId },async tx => {
      const d = await device(tx,actor,bearer);
      if (d.home_mode !== 'adult') return forbidden();
      const [target] = await tx`select m.*,p.id as player_id from rpg_v3.member_profiles m
        left join rpg_v3.players p on p.member_id=m.id where m.id=${p.memberId} and m.family_id=${actor.familyId} and m.status='active'`;
      if (!target) return forbidden();
      let next: string;
      if (target.id === d.home_member) {
        const [identity] = await tx`select * from rpg_v3.identities where account_id=${actor.accountId} for update`;
        if (!identity || !p.pin || !await checkPin(tx,identity,p.pin)) return null;
        next = d.home_binding_id;
      } else {
        if (actor.mode !== 'adult' || target.family_role !== 'child') return forbidden();
        const [previous] = await tx`select id from rpg_v3.access_bindings where account_id=${actor.accountId}
          and family_id=${actor.familyId} and member_id=${target.id} and mode='managed_child' and status='active'`;
        next = previous?.id ?? await binding(tx,actor.accountId,actor.familyId,target.id,target.player_id,'managed_child');
      }
      await tx`update rpg_v3.sessions set status='revoked',revision=revision+1 where id=${actor.sessionId}`;
      return issue(tx,next,d.home_binding_id);
    });
    if (!result) return forbidden();
    return result;
  }
  async function logout(actor: VerifiedActor, bearer: string) {
    return access.withOperation(actor,'ReadFamily',{ familyId: actor.familyId },async tx => {
      await device(tx,actor,bearer);
      await tx`update rpg_v3.sessions set status='revoked',revision=revision+1 where id=${actor.sessionId}`;
    });
  }
  async function describe(actor: VerifiedActor, bearer: string) {
    return access.withOperation(actor,'ReadFamily',{ familyId: actor.familyId },async tx => {
      const d = await device(tx,actor,bearer);
      return { mode: actor.mode, homeMemberId: d.home_member as string, hasAdultHome: d.home_mode === 'adult' };
    });
  }
  return { access, login, recover, switchProfile, logout, describe };
}

export function createFamilyAdminService(access: Access) {
  async function write<T>(actor: VerifiedActor, name: string, p: {idempotencyKey: EntityId}, effect: (tx: V3Transaction) => Promise<T>): Promise<T> {
    return access.withOperation(actor,'ManageFamily',{familyId:actor.familyId},async tx=>{
      const fingerprint = digest(canonical(p));
      const command = 'admin:' + name;
      const [receipt] = await tx`select * from rpg_v3.game_receipts where family_id=${actor.familyId}
        and account_id=${actor.accountId} and command=${command} and request_id=${p.idempotencyKey}`;
      if(receipt) {
        if(receipt.member_id!==actor.actingMemberId || receipt.digest!==fingerprint) throw new V3Error('CONFLICT');
        return receipt.result.data as T;
      }
      const data = await effect(tx);
      await tx`insert into rpg_v3.game_receipts(id,family_id,account_id,member_id,command,request_id,digest,result,projection_revision)
        values (${newEntityId()},${actor.familyId},${actor.accountId},${actor.actingMemberId},${command},${p.idempotencyKey},
          ${fingerprint},${tx.json({data:data??null} as never)},1)`;
      return data;
    });
  }
  async function addMember(actor: VerifiedActor, input: unknown) {
    const p = parseClosedRecord(input,{ idempotencyKey: parseEntityId, displayName: parseDisplayName, role: parseRole });
    return write(actor,'AddMember',p,async tx => {
      const memberId=newEntityId(),playerId=newEntityId();
      await tx`insert into rpg_v3.member_profiles(id,family_id,family_role,display_name,status)
        values (${memberId},${actor.familyId},${p.role},${p.displayName},'active')`;
      await tx`insert into rpg_v3.players(id,family_id,member_id,status) values (${playerId},${actor.familyId},${memberId},'active')`;
      await grantDefaultCapabilities(tx,actor.familyId,memberId,p.role);
      return {memberId,playerId};
    });
  }
  async function updateMember(actor: VerifiedActor,input: unknown) {
    const p=parseClosedRecord(input,{idempotencyKey:parseEntityId,memberId:parseEntityId,displayName:parseDisplayName,status:(v:unknown)=>{
      if(v!=='active'&&v!=='left')throw new ValidationError();return v;
    },playerStatus:(v:unknown)=>{if(v!=='active'&&v!=='paused'&&v!=='left')throw new ValidationError();return v;},expectedRevision:parseRevision});
    return write(actor,'UpdateMember',p,async tx=>{
      const [member]=await tx`select * from rpg_v3.member_profiles where id=${p.memberId} and family_id=${actor.familyId} for update`;
      if(!member)return forbidden();
      // A manager can edit another child's profile; other adult access remains their own.
      if(member.family_role==='adult' && member.id!==actor.actingMemberId)return forbidden();
      if(member.id===actor.actingMemberId && p.status!=='active')throw new V3Error('CONFLICT');
      const rows=await tx`update rpg_v3.member_profiles set display_name=${p.displayName},status=${p.status},revision=revision+1
        where id=${p.memberId} and revision=${p.expectedRevision} returning id`;
      if(rows.length!==1)throw new V3Error('CONFLICT');
      await tx`update rpg_v3.players set status=${p.status==='left'?'left':p.playerStatus},revision=revision+1 where member_id=${p.memberId} and family_id=${actor.familyId}`;
      if(p.status==='left') {
        await tx`update rpg_v3.sessions s set status='revoked',revision=s.revision+1 from rpg_v3.access_bindings b
          where b.member_id=${p.memberId} and s.binding_id=b.id and s.status='active'`;
        await tx`update rpg_v3.member_invites set status='revoked' where member_id=${p.memberId} and status='open'`;
      }
    });
  }
  async function invite(actor:VerifiedActor,input:unknown) {
    const p=parseClosedRecord(input,{idempotencyKey:parseEntityId,memberId:parseEntityId});
    return write(actor,'InviteMember',p,async tx=>{
      const [member]=await tx`select id from rpg_v3.member_profiles where id=${p.memberId} and family_id=${actor.familyId} and status='active'`;
      const own=await tx`select id from rpg_v3.access_bindings where family_id=${actor.familyId} and member_id=${p.memberId}
        and mode in ('adult','own_child') and status='active'`;
      if(!member||own.length)return forbidden();
      await tx`update rpg_v3.member_invites set status='revoked' where member_id=${p.memberId} and status='open'`;
      const code=token();
      await tx`insert into rpg_v3.member_invites(id,family_id,member_id,token_hash,status,expires_at)
        values (${newEntityId()},${actor.familyId},${p.memberId},${digest(code)},'open',clock_timestamp()+interval '7 days')`;
      return {code};
    });
  }
  async function roster(actor:VerifiedActor) {
    return access.withOperation(actor,'ManageFamily',{familyId:actor.familyId},async tx=>{
      const rows=await tx`select m.id,m.display_name,m.family_role,m.status,m.revision,p.status as player_status
        from rpg_v3.member_profiles m left join rpg_v3.players p on p.member_id=m.id where m.family_id=${actor.familyId} order by m.id`;
      return rows.map(r=>({id:r.id,name:r.display_name,role:r.family_role,status:r.status,revision:Number(r.revision),playerStatus:r.player_status}));
    });
  }
  return {addMember,updateMember,invite,roster};
}
