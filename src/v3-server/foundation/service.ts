import { createAccessService, type VerifiedActor } from '../access/service.js';
import { parseFamilyRole } from '../access/capabilities.js';
import { parseClosedRecord, parseEntityId, parseRevision, type EntityId } from '../contracts/primitives.js';
import { V3Error, ValidationError } from '../contracts/errors.js';
import { memberFromRow, playerFromRow, parseDisplayName } from './records.js';
import { newEntityId } from './ids.js';

type AccessPort = Pick<ReturnType<typeof createAccessService>, 'withOperation'>;
const parseBoolean = (value: unknown): boolean => {
  if (typeof value !== 'boolean') throw new ValidationError();
  return value;
};
export function createFoundationService(access: AccessPort, idFactory: () => EntityId = newEntityId) {
  async function createMember(actor: VerifiedActor, familyId: EntityId, input: unknown) {
    parseEntityId(familyId);
    const payload = parseClosedRecord(input, { displayName: parseDisplayName, familyRole: parseFamilyRole, withPlayer: parseBoolean });
    const memberId = parseEntityId(idFactory());
    const playerId = payload.withPlayer ? parseEntityId(idFactory()) : null;
    return access.withOperation(actor, 'ManageFamily', { familyId }, async tx => {
      const [member] = await tx`insert into rpg_v3.member_profiles
        (id,family_id,family_role,display_name,status,revision,capability_revision)
        values (${memberId},${familyId},${payload.familyRole},${payload.displayName},'active',1,1) returning *`;
      const player = playerId === null ? null : (await tx`insert into rpg_v3.players
        (id,family_id,member_id,status,revision) values (${playerId},${familyId},${memberId},'active',1) returning *`)[0];
      return Object.freeze({ member: memberFromRow(member), player: player ? playerFromRow(player) : null });
    });
  }
  async function createPlayer(actor: VerifiedActor, familyId: EntityId, input: unknown) {
    parseEntityId(familyId);
    const payload = parseClosedRecord(input, { memberId: parseEntityId, expectedMemberRevision: parseRevision });
    const playerId = parseEntityId(idFactory());
    return access.withOperation(actor, 'ManageFamily', { familyId }, async tx => {
      const [member] = await tx`select * from rpg_v3.member_profiles
        where id=${payload.memberId} and family_id=${familyId} for update`;
      if (!member) throw new V3Error('FORBIDDEN');
      if (member.status !== 'active' || Number(member.revision) !== payload.expectedMemberRevision) throw new V3Error('CONFLICT');
      const rows = await tx`insert into rpg_v3.players (id,family_id,member_id,status,revision)
        values (${playerId},${familyId},${payload.memberId},'active',1)
        on conflict (family_id,member_id) do nothing returning *`;
      if (rows.length !== 1) throw new V3Error('CONFLICT');
      return playerFromRow(rows[0]);
    });
  }
  async function readRoster(actor: VerifiedActor, familyId: EntityId) {
    parseEntityId(familyId);
    return access.withOperation(actor, 'ReadFamily', { familyId }, async tx => {
      const members = await tx`select * from rpg_v3.member_profiles where family_id=${familyId} order by id`;
      const players = await tx`select * from rpg_v3.players where family_id=${familyId} order by id`;
      return Object.freeze({ members: Object.freeze(members.map(memberFromRow)), players: Object.freeze(players.map(playerFromRow)) });
    });
  }
  return Object.freeze({ createMember, createPlayer, readRoster });
}
