import type { V3Database, V3Transaction } from '../../../src/v3-server/db/client.js';
import { newEntityId } from '../../../src/v3-server/foundation/ids.js';
import { CAPABILITY_SCOPES, type Capability } from '../../../src/v3-server/access/capabilities.js';
import type { EntityId } from '../../../src/v3-server/contracts/primitives.js';
import type { IdentityAdapter } from '../../../src/v3-server/access/service.js';
import { V3Error } from '../../../src/v3-server/contracts/errors.js';

export type FixtureCredential = Readonly<{ syntheticOnly: true }>;
/** Synthetic identity proof only. Never exported from src or a transport route. */
export class FixtureIdentityAdapter implements IdentityAdapter<FixtureCredential> {
  readonly syntheticOnly = true;
  private readonly sessions = new WeakMap<FixtureCredential, EntityId>();
  credential(sessionId: EntityId): FixtureCredential {
    const credential = Object.freeze({ syntheticOnly: true as const });
    this.sessions.set(credential, sessionId);
    return credential;
  }
  async verify(credential: FixtureCredential) {
    const sessionId = credential && this.sessions.get(credential);
    if (!sessionId) throw new V3Error('FORBIDDEN');
    return Object.freeze({ sessionId });
  }
}
function person() {
  return { account: newEntityId(), member: newEntityId(), player: newEntityId(), binding: newEntityId(), session: newEntityId() };
}
export async function createFixture(db: V3Database) {
  const fixture = { family: newEntityId(), adult: person(), child: person() };
  await db.sql.begin(async tx => {
    await tx`insert into rpg_v3.families(id,status) values (${fixture.family},'active')`;
    for (const role of ['adult', 'child'] as const) {
      const p = fixture[role];
      await tx`insert into rpg_v3.accounts(id,status) values (${p.account},'active')`;
      await tx`insert into rpg_v3.member_profiles(id,family_id,family_role,display_name,status)
        values (${p.member},${fixture.family},${role},${role === 'adult' ? 'Взрослый фикстуры' : 'Ребёнок фикстуры'},'active')`;
      await tx`insert into rpg_v3.players(id,family_id,member_id,status)
        values (${p.player},${fixture.family},${p.member},'active')`;
      await tx`insert into rpg_v3.access_bindings(id,account_id,family_id,member_id,player_id,mode,status)
        values (${p.binding},${p.account},${fixture.family},${p.member},${p.player},${role === 'adult' ? 'adult' : 'own_child'},'active')`;
      await tx`insert into rpg_v3.sessions(id,family_id,binding_id,status,expires_at)
        values (${p.session},${fixture.family},${p.binding},'active',clock_timestamp()+interval '1 hour')`;
    }
  });
  return fixture;
}
export type Fixture = Awaited<ReturnType<typeof createFixture>>;
export async function grant(db: V3Database, fixture: Fixture, role: 'adult' | 'child', capability: Capability) {
  const id = newEntityId();
  await db.sql.begin(async tx => {
    await tx`select id from rpg_v3.families where id=${fixture.family} for update`;
    await tx`insert into rpg_v3.capability_grants(id,family_id,member_id,capability,scope,status)
      values (${id},${fixture.family},${fixture[role].member},${capability},${CAPABILITY_SCOPES[capability]},'active')`;
    await tx`update rpg_v3.member_profiles set capability_revision=capability_revision+1 where id=${fixture[role].member}`;
  });
  return id;
}
export async function cleanFixture(db: V3Database, fixture: Fixture) {
  await db.sql.begin(async tx => {
    await tx`delete from v3_fixture.probes where family_id=${fixture.family}`;
    await tx`delete from rpg_v3.game_receipts where family_id=${fixture.family}`;
    await tx`delete from rpg_v3.game_ledger where family_id=${fixture.family}`;
    await tx`delete from rpg_v3.game_claims where family_id=${fixture.family}`;
    await tx`delete from rpg_v3.game_documents where family_id=${fixture.family}`;
    await tx`delete from rpg_v3.sessions where family_id=${fixture.family}`;
    await tx`delete from rpg_v3.access_bindings where family_id=${fixture.family}`;
    await tx`delete from rpg_v3.capability_grants where family_id=${fixture.family}`;
    await tx`delete from rpg_v3.players where family_id=${fixture.family}`;
    await tx`delete from rpg_v3.member_profiles where family_id=${fixture.family}`;
    await tx`delete from rpg_v3.families where id=${fixture.family}`;
    await tx`delete from rpg_v3.accounts where id in (${fixture.adult.account},${fixture.child.account})`;
  });
}
export async function writeProbe(tx: V3Transaction, familyId: EntityId, playerId: EntityId) {
  const id = newEntityId();
  await tx`insert into v3_fixture.probes(id,family_id,player_id) values (${id},${familyId},${playerId})`;
  return id;
}
