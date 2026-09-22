import {sql} from 'drizzle-orm';
import {check,foreignKey,integer,unique,uuid} from 'drizzle-orm/pg-core';
import {rpg,identityRetention,commonConstraints,keyText,memberProfiles,accounts} from './foundation';
import {targetSchema as previousSchema} from './contentRelease';

export const consentEvents=rpg.table('consent_events',{
 ...identityRetention(),family_id:uuid('family_id').notNull(),subject_profile_id:uuid('subject_profile_id').notNull(),
 actor_account_id:uuid('actor_account_id').notNull(),purpose:keyText('purpose').notNull(),document_digest:keyText('document_digest').notNull(),
 decision:keyText('decision').notNull(),scope_revision:integer('scope_revision').notNull(),authority_reference:keyText('authority_reference').notNull(),
},t=>[
 ...commonConstraints('consent_events',t),
 foreignKey({name:'consent_events_subject_fk',columns:[t.family_id,t.subject_profile_id],foreignColumns:[memberProfiles.family_id,memberProfiles.id]}),
 foreignKey({name:'consent_events_actor_fk',columns:[t.actor_account_id],foreignColumns:[accounts.id]}),
 unique('consent_events_scope_revision_uq').on(t.family_id,t.subject_profile_id,t.purpose,t.scope_revision),
 check('consent_events_values',sql`${t.purpose} IN ('service','analytics') AND ${t.decision} IN ('grant','withdraw') AND ${t.scope_revision}>0 AND ${t.document_digest} ~ '^[a-f0-9]{64}$' AND length(${t.authority_reference}) BETWEEN 1 AND 200`),
]);
export const targetSchema={...previousSchema,consentEvents};
export const consentGuards=`CREATE FUNCTION rpg.reject_consent_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'consent history is immutable' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER consent_events_immutable BEFORE UPDATE OR DELETE ON rpg.consent_events FOR EACH ROW EXECUTE FUNCTION rpg.reject_consent_mutation();`;
