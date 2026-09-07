-- G03-E: generated target adult access schema; reviewed before disposable execution.
CREATE UNIQUE INDEX "access_bindings_family_id_uq" ON "rpg"."access_bindings" ("family_id", "id");

CREATE UNIQUE INDEX "session_token_verifiers_scope_uq" ON "rpg"."session_token_verifiers" ("family_id", "session_id", "id");

CREATE UNIQUE INDEX "access_launches_source_uq" ON "rpg"."access_launches" ("account_id", "external_identity_id", "id");

CREATE UNIQUE INDEX "access_launches_account_uq" ON "rpg"."access_launches" ("account_id", "id");

CREATE TABLE "rpg"."family_security_policy" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"state_revision" integer NOT NULL,
	"updated_at" timestamp(3) with time zone NOT NULL,
	"scope" text COLLATE "C" NOT NULL,
	"policy_id" text COLLATE "C" NOT NULL,
	"policy_revision" integer NOT NULL,
	"family_policy_digest" text COLLATE "C" NOT NULL,
	"security_digest" text COLLATE "C" NOT NULL,
	"pepper_key_id" text COLLATE "C" NOT NULL,
	"activated_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "family_security_policy_scope_uq" UNIQUE("scope"),
	CONSTRAINT "family_security_policy_id_v7" CHECK ("rpg"."family_security_policy"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "family_security_policy_schema_supported" CHECK ("rpg"."family_security_policy"."schema_version" = 1),
	CONSTRAINT "family_security_policy_created_finite" CHECK (isfinite("rpg"."family_security_policy"."created_at")),
	CONSTRAINT "family_security_policy_state_revision_positive" CHECK ("rpg"."family_security_policy"."state_revision" > 0),
	CONSTRAINT "family_security_policy_updated_valid" CHECK (isfinite("rpg"."family_security_policy"."updated_at") AND "rpg"."family_security_policy"."updated_at" >= "rpg"."family_security_policy"."created_at"),
	CONSTRAINT "family_security_policy_scope" CHECK ("rpg"."family_security_policy"."scope" = 'family_access'),
	CONSTRAINT "family_security_policy_values" CHECK ("rpg"."family_security_policy"."policy_id" ~ '^[a-z][a-z0-9_]*$' AND "rpg"."family_security_policy"."policy_revision" > 0
    AND "rpg"."family_security_policy"."pepper_key_id" ~ '^[a-z][a-z0-9_]*$' AND "rpg"."family_security_policy"."family_policy_digest" ~ '^[a-f0-9]{64}$' AND "rpg"."family_security_policy"."security_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "family_security_policy_time" CHECK (isfinite("rpg"."family_security_policy"."activated_at") AND "rpg"."family_security_policy"."activated_at" >= "rpg"."family_security_policy"."created_at" AND "rpg"."family_security_policy"."activated_at" <= "rpg"."family_security_policy"."updated_at")
);


CREATE TABLE "rpg"."launch_consumptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"launch_id" uuid NOT NULL,
	"purpose" text COLLATE "C" NOT NULL,
	CONSTRAINT "launch_consumptions_launch_uq" UNIQUE("launch_id"),
	CONSTRAINT "launch_consumptions_id_v7" CHECK ("rpg"."launch_consumptions"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "launch_consumptions_schema_supported" CHECK ("rpg"."launch_consumptions"."schema_version" = 1),
	CONSTRAINT "launch_consumptions_created_finite" CHECK (isfinite("rpg"."launch_consumptions"."created_at")),
	CONSTRAINT "launch_consumptions_purpose" CHECK ("rpg"."launch_consumptions"."purpose" IN ('own_child','adult_login','adult_setup'))
);


CREATE TABLE "rpg"."adult_protections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"state_revision" integer NOT NULL,
	"updated_at" timestamp(3) with time zone NOT NULL,
	"family_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"binding_id" uuid NOT NULL,
	"binding_kind" text COLLATE "C" NOT NULL,
	"credential_revision" integer NOT NULL,
	"status" text COLLATE "C" NOT NULL,
	"kdf_id" text COLLATE "C" NOT NULL,
	"pin_salt" text COLLATE "C" NOT NULL,
	"pin_verifier" text COLLATE "C" NOT NULL,
	"pepper_key_id" text COLLATE "C" NOT NULL,
	"recovery_ack_at" timestamp(3) with time zone,
	"revoked_at" timestamp(3) with time zone,
	CONSTRAINT "adult_protections_binding_uq" UNIQUE("binding_id"),
	CONSTRAINT "adult_protections_scope_uq" UNIQUE("family_id","binding_id","id"),
	CONSTRAINT "adult_protections_id_v7" CHECK ("rpg"."adult_protections"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "adult_protections_schema_supported" CHECK ("rpg"."adult_protections"."schema_version" = 1),
	CONSTRAINT "adult_protections_created_finite" CHECK (isfinite("rpg"."adult_protections"."created_at")),
	CONSTRAINT "adult_protections_state_revision_positive" CHECK ("rpg"."adult_protections"."state_revision" > 0),
	CONSTRAINT "adult_protections_updated_valid" CHECK (isfinite("rpg"."adult_protections"."updated_at") AND "rpg"."adult_protections"."updated_at" >= "rpg"."adult_protections"."created_at"),
	CONSTRAINT "adult_protections_adult_kind" CHECK ("rpg"."adult_protections"."binding_kind" = 'adult_membership'),
	CONSTRAINT "adult_protections_verifier" CHECK ("rpg"."adult_protections"."credential_revision" > 0 AND "rpg"."adult_protections"."kdf_id" = 'argon2id_v19_19m_t2_p1'
    AND "rpg"."adult_protections"."pin_salt" ~ '^[a-f0-9]{32}$' AND "rpg"."adult_protections"."pin_verifier" ~ '^[a-f0-9]{64}$' AND "rpg"."adult_protections"."pepper_key_id" ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "adult_protections_state" CHECK (("rpg"."adult_protections"."status" = 'pending' AND "rpg"."adult_protections"."recovery_ack_at" IS NULL AND "rpg"."adult_protections"."revoked_at" IS NULL)
    OR ("rpg"."adult_protections"."status" = 'active' AND "rpg"."adult_protections"."recovery_ack_at" IS NOT NULL AND "rpg"."adult_protections"."revoked_at" IS NULL)
    OR ("rpg"."adult_protections"."status" = 'revoked' AND "rpg"."adult_protections"."revoked_at" IS NOT NULL)),
	CONSTRAINT "adult_protections_ack_time" CHECK ("rpg"."adult_protections"."recovery_ack_at" IS NULL OR (isfinite("rpg"."adult_protections"."recovery_ack_at") AND "rpg"."adult_protections"."recovery_ack_at" >= "rpg"."adult_protections"."created_at" AND "rpg"."adult_protections"."recovery_ack_at" <= "rpg"."adult_protections"."updated_at")),
	CONSTRAINT "adult_protections_revoke_time" CHECK ("rpg"."adult_protections"."revoked_at" IS NULL OR (isfinite("rpg"."adult_protections"."revoked_at") AND "rpg"."adult_protections"."revoked_at" >= "rpg"."adult_protections"."created_at" AND "rpg"."adult_protections"."revoked_at" <= "rpg"."adult_protections"."updated_at"))
);


CREATE TABLE "rpg"."adult_recovery_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"state_revision" integer NOT NULL,
	"updated_at" timestamp(3) with time zone NOT NULL,
	"family_id" uuid NOT NULL,
	"binding_id" uuid NOT NULL,
	"protection_id" uuid NOT NULL,
	"credential_revision" integer NOT NULL,
	"verifier" text COLLATE "C" NOT NULL,
	"verifier_version" integer NOT NULL,
	"acknowledged_at" timestamp(3) with time zone,
	"revoked_at" timestamp(3) with time zone,
	CONSTRAINT "adult_recovery_credentials_verifier_uq" UNIQUE("verifier"),
	CONSTRAINT "adult_recovery_credentials_id_v7" CHECK ("rpg"."adult_recovery_credentials"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "adult_recovery_credentials_schema_supported" CHECK ("rpg"."adult_recovery_credentials"."schema_version" = 1),
	CONSTRAINT "adult_recovery_credentials_created_finite" CHECK (isfinite("rpg"."adult_recovery_credentials"."created_at")),
	CONSTRAINT "adult_recovery_credentials_state_revision_positive" CHECK ("rpg"."adult_recovery_credentials"."state_revision" > 0),
	CONSTRAINT "adult_recovery_credentials_updated_valid" CHECK (isfinite("rpg"."adult_recovery_credentials"."updated_at") AND "rpg"."adult_recovery_credentials"."updated_at" >= "rpg"."adult_recovery_credentials"."created_at"),
	CONSTRAINT "adult_recovery_credentials_version" CHECK ("rpg"."adult_recovery_credentials"."credential_revision" > 0 AND "rpg"."adult_recovery_credentials"."verifier_version" = 1 AND "rpg"."adult_recovery_credentials"."verifier" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "adult_recovery_credentials_ack_time" CHECK ("rpg"."adult_recovery_credentials"."acknowledged_at" IS NULL OR (isfinite("rpg"."adult_recovery_credentials"."acknowledged_at") AND "rpg"."adult_recovery_credentials"."acknowledged_at" >= "rpg"."adult_recovery_credentials"."created_at" AND "rpg"."adult_recovery_credentials"."acknowledged_at" <= "rpg"."adult_recovery_credentials"."updated_at")),
	CONSTRAINT "adult_recovery_credentials_revoke_time" CHECK ("rpg"."adult_recovery_credentials"."revoked_at" IS NULL OR (isfinite("rpg"."adult_recovery_credentials"."revoked_at") AND "rpg"."adult_recovery_credentials"."revoked_at" >= "rpg"."adult_recovery_credentials"."created_at" AND "rpg"."adult_recovery_credentials"."revoked_at" <= "rpg"."adult_recovery_credentials"."updated_at"))
);


CREATE TABLE "rpg"."adult_setups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"state_revision" integer NOT NULL,
	"updated_at" timestamp(3) with time zone NOT NULL,
	"family_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"binding_id" uuid NOT NULL,
	"binding_kind" text COLLATE "C" NOT NULL,
	"binding_revision" integer NOT NULL,
	"external_identity_id" uuid NOT NULL,
	"launch_id" uuid NOT NULL,
	"token_verifier" text COLLATE "C" NOT NULL,
	"verifier_version" integer NOT NULL,
	"policy_revision" integer NOT NULL,
	"state" text COLLATE "C" NOT NULL,
	"protection_id" uuid,
	"expires_at" timestamp(3) with time zone NOT NULL,
	"revoked_at" timestamp(3) with time zone,
	CONSTRAINT "adult_setups_launch_uq" UNIQUE("launch_id"),
	CONSTRAINT "adult_setups_token_uq" UNIQUE("token_verifier"),
	CONSTRAINT "adult_setups_family_uq" UNIQUE("family_id","id"),
	CONSTRAINT "adult_setups_id_v7" CHECK ("rpg"."adult_setups"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "adult_setups_schema_supported" CHECK ("rpg"."adult_setups"."schema_version" = 1),
	CONSTRAINT "adult_setups_created_finite" CHECK (isfinite("rpg"."adult_setups"."created_at")),
	CONSTRAINT "adult_setups_state_revision_positive" CHECK ("rpg"."adult_setups"."state_revision" > 0),
	CONSTRAINT "adult_setups_updated_valid" CHECK (isfinite("rpg"."adult_setups"."updated_at") AND "rpg"."adult_setups"."updated_at" >= "rpg"."adult_setups"."created_at"),
	CONSTRAINT "adult_setups_adult_kind" CHECK ("rpg"."adult_setups"."binding_kind" = 'adult_membership'),
	CONSTRAINT "adult_setups_values" CHECK ("rpg"."adult_setups"."binding_revision" > 0 AND "rpg"."adult_setups"."policy_revision" > 0 AND "rpg"."adult_setups"."verifier_version" = 1
    AND "rpg"."adult_setups"."token_verifier" ~ '^[a-f0-9]{64}$' AND isfinite("rpg"."adult_setups"."expires_at") AND "rpg"."adult_setups"."expires_at" > "rpg"."adult_setups"."created_at"),
	CONSTRAINT "adult_setups_state" CHECK (("rpg"."adult_setups"."state" = 'awaiting_pin' AND "rpg"."adult_setups"."protection_id" IS NULL AND "rpg"."adult_setups"."revoked_at" IS NULL)
    OR ("rpg"."adult_setups"."state" = 'awaiting_recovery' AND "rpg"."adult_setups"."protection_id" IS NOT NULL AND "rpg"."adult_setups"."revoked_at" IS NULL)
    OR ("rpg"."adult_setups"."state" = 'completed' AND "rpg"."adult_setups"."protection_id" IS NOT NULL AND "rpg"."adult_setups"."revoked_at" IS NOT NULL)
    OR ("rpg"."adult_setups"."state" = 'revoked' AND "rpg"."adult_setups"."revoked_at" IS NOT NULL)),
	CONSTRAINT "adult_setups_revoke_time" CHECK ("rpg"."adult_setups"."revoked_at" IS NULL OR (isfinite("rpg"."adult_setups"."revoked_at") AND "rpg"."adult_setups"."revoked_at" >= "rpg"."adult_setups"."created_at" AND "rpg"."adult_setups"."revoked_at" <= "rpg"."adult_setups"."updated_at"))
);


CREATE TABLE "rpg"."adult_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"state_revision" integer NOT NULL,
	"updated_at" timestamp(3) with time zone NOT NULL,
	"family_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"binding_id" uuid NOT NULL,
	"binding_kind" text COLLATE "C" NOT NULL,
	"protection_id" uuid,
	"credential_revision" integer,
	"policy_revision" integer NOT NULL,
	"launch_id" uuid,
	"setup_id" uuid,
	"session_id" uuid,
	"purpose" text COLLATE "C" NOT NULL,
	"intent_digest" text COLLATE "C" NOT NULL,
	"outcome" text COLLATE "C" NOT NULL,
	"finished_at" timestamp(3) with time zone,
	CONSTRAINT "adult_attempts_family_uq" UNIQUE("family_id","id"),
	CONSTRAINT "adult_attempts_id_v7" CHECK ("rpg"."adult_attempts"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "adult_attempts_schema_supported" CHECK ("rpg"."adult_attempts"."schema_version" = 1),
	CONSTRAINT "adult_attempts_created_finite" CHECK (isfinite("rpg"."adult_attempts"."created_at")),
	CONSTRAINT "adult_attempts_state_revision_positive" CHECK ("rpg"."adult_attempts"."state_revision" > 0),
	CONSTRAINT "adult_attempts_updated_valid" CHECK (isfinite("rpg"."adult_attempts"."updated_at") AND "rpg"."adult_attempts"."updated_at" >= "rpg"."adult_attempts"."created_at"),
	CONSTRAINT "adult_attempts_adult_kind" CHECK ("rpg"."adult_attempts"."binding_kind" = 'adult_membership'),
	CONSTRAINT "adult_attempts_source" CHECK (num_nonnulls("rpg"."adult_attempts"."launch_id","rpg"."adult_attempts"."setup_id","rpg"."adult_attempts"."session_id") = 1
    AND (("rpg"."adult_attempts"."purpose" IN ('prepare_setup','recovery_ack') AND "rpg"."adult_attempts"."setup_id" IS NOT NULL)
    OR ("rpg"."adult_attempts"."purpose" = 'login' AND "rpg"."adult_attempts"."launch_id" IS NOT NULL)
    OR ("rpg"."adult_attempts"."purpose" IN ('switch','fresh') AND "rpg"."adult_attempts"."session_id" IS NOT NULL))),
	CONSTRAINT "adult_attempts_values" CHECK ("rpg"."adult_attempts"."policy_revision" > 0 AND "rpg"."adult_attempts"."intent_digest" ~ '^[a-f0-9]{64}$'
    AND (("rpg"."adult_attempts"."protection_id" IS NULL AND "rpg"."adult_attempts"."credential_revision" IS NULL) OR ("rpg"."adult_attempts"."protection_id" IS NOT NULL AND "rpg"."adult_attempts"."credential_revision" > 0)) IS TRUE),
	CONSTRAINT "adult_attempts_outcome" CHECK (("rpg"."adult_attempts"."outcome" = 'pending' AND "rpg"."adult_attempts"."finished_at" IS NULL)
    OR ("rpg"."adult_attempts"."outcome" IN ('accepted','denied','stale','unavailable') AND "rpg"."adult_attempts"."finished_at" IS NOT NULL)),
	CONSTRAINT "adult_attempts_finished_time" CHECK ("rpg"."adult_attempts"."finished_at" IS NULL OR (isfinite("rpg"."adult_attempts"."finished_at") AND "rpg"."adult_attempts"."finished_at" >= "rpg"."adult_attempts"."created_at" AND "rpg"."adult_attempts"."finished_at" <= "rpg"."adult_attempts"."updated_at"))
);


CREATE TABLE "rpg"."adult_action_proofs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"state_revision" integer NOT NULL,
	"updated_at" timestamp(3) with time zone NOT NULL,
	"family_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"binding_id" uuid NOT NULL,
	"binding_kind" text COLLATE "C" NOT NULL,
	"protection_id" uuid NOT NULL,
	"credential_revision" integer NOT NULL,
	"policy_revision" integer NOT NULL,
	"session_id" uuid NOT NULL,
	"session_revision" integer NOT NULL,
	"source_verifier_id" uuid NOT NULL,
	"source_verifier_revision" integer NOT NULL,
	"attempt_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"action" text COLLATE "C" NOT NULL,
	"target_session_id" uuid,
	"target_binding_id" uuid,
	"expected_revision" integer NOT NULL,
	"token_verifier" text COLLATE "C" NOT NULL,
	"verifier_version" integer NOT NULL,
	"expires_at" timestamp(3) with time zone NOT NULL,
	"consumed_at" timestamp(3) with time zone,
	CONSTRAINT "adult_action_proofs_token_uq" UNIQUE("token_verifier"),
	CONSTRAINT "adult_action_proofs_attempt_uq" UNIQUE("attempt_id"),
	CONSTRAINT "adult_action_proofs_id_v7" CHECK ("rpg"."adult_action_proofs"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "adult_action_proofs_schema_supported" CHECK ("rpg"."adult_action_proofs"."schema_version" = 1),
	CONSTRAINT "adult_action_proofs_created_finite" CHECK (isfinite("rpg"."adult_action_proofs"."created_at")),
	CONSTRAINT "adult_action_proofs_state_revision_positive" CHECK ("rpg"."adult_action_proofs"."state_revision" > 0),
	CONSTRAINT "adult_action_proofs_updated_valid" CHECK (isfinite("rpg"."adult_action_proofs"."updated_at") AND "rpg"."adult_action_proofs"."updated_at" >= "rpg"."adult_action_proofs"."created_at"),
	CONSTRAINT "adult_action_proofs_adult_kind" CHECK ("rpg"."adult_action_proofs"."binding_kind" = 'adult_membership'),
	CONSTRAINT "adult_action_proofs_action" CHECK (("rpg"."adult_action_proofs"."action" = 'revoke_session' AND "rpg"."adult_action_proofs"."target_session_id" IS NOT NULL AND "rpg"."adult_action_proofs"."target_binding_id" IS NULL)
    OR ("rpg"."adult_action_proofs"."action" = 'revoke_binding' AND "rpg"."adult_action_proofs"."target_binding_id" IS NOT NULL AND "rpg"."adult_action_proofs"."target_session_id" IS NULL)),
	CONSTRAINT "adult_action_proofs_values" CHECK ("rpg"."adult_action_proofs"."credential_revision" > 0 AND "rpg"."adult_action_proofs"."policy_revision" > 0 AND "rpg"."adult_action_proofs"."session_revision" > 0
    AND "rpg"."adult_action_proofs"."source_verifier_revision" > 0 AND "rpg"."adult_action_proofs"."expected_revision" > 0 AND "rpg"."adult_action_proofs"."verifier_version" = 1
    AND "rpg"."adult_action_proofs"."token_verifier" ~ '^[a-f0-9]{64}$' AND isfinite("rpg"."adult_action_proofs"."expires_at") AND "rpg"."adult_action_proofs"."expires_at" > "rpg"."adult_action_proofs"."created_at"),
	CONSTRAINT "adult_action_proofs_consumed_time" CHECK ("rpg"."adult_action_proofs"."consumed_at" IS NULL OR (isfinite("rpg"."adult_action_proofs"."consumed_at") AND "rpg"."adult_action_proofs"."consumed_at" >= "rpg"."adult_action_proofs"."created_at" AND "rpg"."adult_action_proofs"."consumed_at" <= "rpg"."adult_action_proofs"."updated_at"))
);


CREATE TABLE "rpg"."access_operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"family_id" uuid NOT NULL,
	"actor_binding_id" uuid NOT NULL,
	"target_binding_id" uuid NOT NULL,
	"action" text COLLATE "C" NOT NULL,
	"request_digest" text COLLATE "C" NOT NULL,
	CONSTRAINT "access_operations_family_uq" UNIQUE("family_id","id"),
	CONSTRAINT "access_operations_id_v7" CHECK ("rpg"."access_operations"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "access_operations_schema_supported" CHECK ("rpg"."access_operations"."schema_version" = 1),
	CONSTRAINT "access_operations_created_finite" CHECK (isfinite("rpg"."access_operations"."created_at")),
	CONSTRAINT "access_operations_values" CHECK ("rpg"."access_operations"."action" IN ('revoke_session','revoke_binding') AND "rpg"."access_operations"."request_digest" ~ '^[a-f0-9]{64}$')
);


CREATE TABLE "rpg"."access_audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"family_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"binding_id" uuid NOT NULL,
	"binding_kind" text COLLATE "C" NOT NULL,
	"action" text COLLATE "C" NOT NULL,
	"outcome" text COLLATE "C" NOT NULL,
	"policy_revision" integer NOT NULL,
	"attempt_id" uuid,
	"operation_id" uuid,
	CONSTRAINT "access_audit_events_id_v7" CHECK ("rpg"."access_audit_events"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "access_audit_events_schema_supported" CHECK ("rpg"."access_audit_events"."schema_version" = 1),
	CONSTRAINT "access_audit_events_created_finite" CHECK (isfinite("rpg"."access_audit_events"."created_at")),
	CONSTRAINT "access_audit_events_adult_kind" CHECK ("rpg"."access_audit_events"."binding_kind" = 'adult_membership'),
	CONSTRAINT "access_audit_events_values" CHECK ("rpg"."access_audit_events"."policy_revision" > 0 AND "rpg"."access_audit_events"."action" IN ('begin_setup','prepare_setup','rotate_recovery','recovery_ack','login','switch','fresh','revoke_session','revoke_binding')
    AND "rpg"."access_audit_events"."outcome" IN ('accepted','denied','stale','unavailable'))
);


ALTER TABLE "rpg"."family_security_policy" ADD CONSTRAINT "family_security_policy_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."launch_consumptions" ADD CONSTRAINT "launch_consumptions_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."launch_consumptions" ADD CONSTRAINT "launch_consumptions_launch_fk" FOREIGN KEY ("launch_id") REFERENCES "rpg"."access_launches"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_protections" ADD CONSTRAINT "adult_protections_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_protections" ADD CONSTRAINT "adult_protections_binding_fk" FOREIGN KEY ("family_id","account_id","profile_id","binding_id","binding_kind") REFERENCES "rpg"."access_bindings"("family_id","account_id","profile_id","id","kind") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_recovery_credentials" ADD CONSTRAINT "adult_recovery_credentials_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_recovery_credentials" ADD CONSTRAINT "adult_recovery_credentials_scope_fk" FOREIGN KEY ("family_id","binding_id","protection_id") REFERENCES "rpg"."adult_protections"("family_id","binding_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_setups" ADD CONSTRAINT "adult_setups_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_setups" ADD CONSTRAINT "adult_setups_binding_fk" FOREIGN KEY ("family_id","account_id","profile_id","binding_id","binding_kind") REFERENCES "rpg"."access_bindings"("family_id","account_id","profile_id","id","kind") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_setups" ADD CONSTRAINT "adult_setups_identity_fk" FOREIGN KEY ("external_identity_id","account_id") REFERENCES "rpg"."external_identities"("id","account_id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_setups" ADD CONSTRAINT "adult_setups_launch_fk" FOREIGN KEY ("account_id","external_identity_id","launch_id") REFERENCES "rpg"."access_launches"("account_id","external_identity_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_setups" ADD CONSTRAINT "adult_setups_protection_fk" FOREIGN KEY ("family_id","binding_id","protection_id") REFERENCES "rpg"."adult_protections"("family_id","binding_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_attempts" ADD CONSTRAINT "adult_attempts_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_attempts" ADD CONSTRAINT "adult_attempts_binding_fk" FOREIGN KEY ("family_id","account_id","profile_id","binding_id","binding_kind") REFERENCES "rpg"."access_bindings"("family_id","account_id","profile_id","id","kind") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_attempts" ADD CONSTRAINT "adult_attempts_protection_fk" FOREIGN KEY ("family_id","binding_id","protection_id") REFERENCES "rpg"."adult_protections"("family_id","binding_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_attempts" ADD CONSTRAINT "adult_attempts_launch_fk" FOREIGN KEY ("account_id","launch_id") REFERENCES "rpg"."access_launches"("account_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_attempts" ADD CONSTRAINT "adult_attempts_setup_fk" FOREIGN KEY ("family_id","setup_id") REFERENCES "rpg"."adult_setups"("family_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_attempts" ADD CONSTRAINT "adult_attempts_session_fk" FOREIGN KEY ("family_id","session_id") REFERENCES "rpg"."session_contexts"("family_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_action_proofs" ADD CONSTRAINT "adult_action_proofs_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_action_proofs" ADD CONSTRAINT "adult_action_proofs_binding_fk" FOREIGN KEY ("family_id","account_id","profile_id","binding_id","binding_kind") REFERENCES "rpg"."access_bindings"("family_id","account_id","profile_id","id","kind") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_action_proofs" ADD CONSTRAINT "adult_action_proofs_protection_fk" FOREIGN KEY ("family_id","binding_id","protection_id") REFERENCES "rpg"."adult_protections"("family_id","binding_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_action_proofs" ADD CONSTRAINT "adult_action_proofs_session_fk" FOREIGN KEY ("family_id","session_id") REFERENCES "rpg"."session_contexts"("family_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_action_proofs" ADD CONSTRAINT "adult_action_proofs_verifier_fk" FOREIGN KEY ("family_id","session_id","source_verifier_id") REFERENCES "rpg"."session_token_verifiers"("family_id","session_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_action_proofs" ADD CONSTRAINT "adult_action_proofs_attempt_fk" FOREIGN KEY ("family_id","attempt_id") REFERENCES "rpg"."adult_attempts"("family_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_action_proofs" ADD CONSTRAINT "adult_action_proofs_target_session_fk" FOREIGN KEY ("family_id","target_session_id") REFERENCES "rpg"."session_contexts"("family_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."adult_action_proofs" ADD CONSTRAINT "adult_action_proofs_target_binding_fk" FOREIGN KEY ("family_id","target_binding_id") REFERENCES "rpg"."access_bindings"("family_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."access_operations" ADD CONSTRAINT "access_operations_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."access_operations" ADD CONSTRAINT "access_operations_actor_fk" FOREIGN KEY ("family_id","actor_binding_id") REFERENCES "rpg"."access_bindings"("family_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."access_operations" ADD CONSTRAINT "access_operations_target_fk" FOREIGN KEY ("family_id","target_binding_id") REFERENCES "rpg"."access_bindings"("family_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."access_audit_events" ADD CONSTRAINT "access_audit_events_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."access_audit_events" ADD CONSTRAINT "access_audit_events_binding_fk" FOREIGN KEY ("family_id","account_id","profile_id","binding_id","binding_kind") REFERENCES "rpg"."access_bindings"("family_id","account_id","profile_id","id","kind") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."access_audit_events" ADD CONSTRAINT "access_audit_events_attempt_fk" FOREIGN KEY ("family_id","attempt_id") REFERENCES "rpg"."adult_attempts"("family_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."access_audit_events" ADD CONSTRAINT "access_audit_events_operation_fk" FOREIGN KEY ("family_id","operation_id") REFERENCES "rpg"."access_operations"("family_id","id") ON DELETE no action ON UPDATE no action;

CREATE UNIQUE INDEX "adult_recovery_credentials_current_uq" ON "rpg"."adult_recovery_credentials" USING btree ("protection_id") WHERE "rpg"."adult_recovery_credentials"."revoked_at" IS NULL;

CREATE UNIQUE INDEX "adult_setups_pending_uq" ON "rpg"."adult_setups" USING btree ("binding_id") WHERE "rpg"."adult_setups"."state" IN ('awaiting_pin','awaiting_recovery') AND "rpg"."adult_setups"."revoked_at" IS NULL;

CREATE INDEX "adult_attempts_binding_time_idx" ON "rpg"."adult_attempts" USING btree ("binding_id","created_at");

CREATE INDEX "adult_attempts_launch_idx" ON "rpg"."adult_attempts" USING btree ("launch_id");

CREATE INDEX "adult_attempts_setup_idx" ON "rpg"."adult_attempts" USING btree ("setup_id");

CREATE INDEX "adult_attempts_session_idx" ON "rpg"."adult_attempts" USING btree ("session_id");

CREATE INDEX "access_operations_pair_time_idx" ON "rpg"."access_operations" USING btree ("family_id","actor_binding_id","target_binding_id","created_at");
