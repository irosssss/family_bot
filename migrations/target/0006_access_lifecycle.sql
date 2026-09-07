-- G03-F: generated target recovery/invitation/lifecycle schema.
CREATE UNIQUE INDEX "access_bindings_family_profile_id_uq" ON "rpg"."access_bindings" ("family_id", "profile_id", "id");

CREATE UNIQUE INDEX "adult_recovery_credentials_scope_id_uq" ON "rpg"."adult_recovery_credentials" ("family_id", "binding_id", "id");

CREATE TABLE "rpg"."lifecycle_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"state_revision" integer NOT NULL,
	"updated_at" timestamp(3) with time zone NOT NULL,
	"family_id" uuid NOT NULL,
	"kind" text COLLATE "C" NOT NULL,
	"state" text COLLATE "C" NOT NULL,
	"policy_revision" integer NOT NULL,
	"request_digest" text COLLATE "C" NOT NULL,
	"expires_at" timestamp(3) with time zone NOT NULL,
	"closed_at" timestamp(3) with time zone,
	"target_binding_id" uuid,
	"target_revision" integer,
	"target_profile_id" uuid,
	"target_profile_revision" integer,
	"protection_id" uuid,
	"protection_revision" integer,
	"issuer_binding_id" uuid,
	"issuer_revision" integer,
	"issuer_protection_revision" integer,
	"invite_verifier" text COLLATE "C",
	"candidate_verifier" text COLLATE "C",
	"candidate_account_id" uuid,
	"candidate_identity_id" uuid,
	"candidate_launch_id" uuid,
	"basis" text COLLATE "C",
	"basis_credential_id" uuid,
	"approver_binding_id" uuid,
	"approver_revision" integer,
	"approver_protection_revision" integer,
	"approved_at" timestamp(3) with time zone,
	"result_binding_id" uuid,
	CONSTRAINT "lifecycle_requests_family_uq" UNIQUE("family_id","id"),
	CONSTRAINT "lifecycle_requests_invite_uq" UNIQUE("invite_verifier"),
	CONSTRAINT "lifecycle_requests_candidate_uq" UNIQUE("candidate_verifier"),
	CONSTRAINT "lifecycle_requests_launch_uq" UNIQUE("candidate_launch_id"),
	CONSTRAINT "lifecycle_requests_result_uq" UNIQUE("result_binding_id"),
	CONSTRAINT "lifecycle_requests_id_v7" CHECK ("rpg"."lifecycle_requests"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "lifecycle_requests_schema_supported" CHECK ("rpg"."lifecycle_requests"."schema_version" = 1),
	CONSTRAINT "lifecycle_requests_created_finite" CHECK (isfinite("rpg"."lifecycle_requests"."created_at")),
	CONSTRAINT "lifecycle_requests_state_revision_positive" CHECK ("rpg"."lifecycle_requests"."state_revision" > 0),
	CONSTRAINT "lifecycle_requests_updated_valid" CHECK (isfinite("rpg"."lifecycle_requests"."updated_at") AND "rpg"."lifecycle_requests"."updated_at" >= "rpg"."lifecycle_requests"."created_at"),
	CONSTRAINT "lifecycle_requests_values" CHECK ("rpg"."lifecycle_requests"."kind" IN ('recovery','invite_child','invite_adult','exclusion') AND "rpg"."lifecycle_requests"."policy_revision">0
    AND "rpg"."lifecycle_requests"."request_digest" ~ '^[a-f0-9]{64}$' AND isfinite("rpg"."lifecycle_requests"."expires_at") AND "rpg"."lifecycle_requests"."expires_at">"rpg"."lifecycle_requests"."created_at"),
	CONSTRAINT "lifecycle_requests_digests" CHECK (("rpg"."lifecycle_requests"."invite_verifier" IS NULL OR "rpg"."lifecycle_requests"."invite_verifier" ~ '^[a-f0-9]{64}$')
    AND ("rpg"."lifecycle_requests"."candidate_verifier" IS NULL OR "rpg"."lifecycle_requests"."candidate_verifier" ~ '^[a-f0-9]{64}$')),
	CONSTRAINT "lifecycle_requests_secret_kind" CHECK (("rpg"."lifecycle_requests"."kind" IN ('invite_child','invite_adult')) = ("rpg"."lifecycle_requests"."invite_verifier" IS NOT NULL)
    AND ("rpg"."lifecycle_requests"."kind"<>'recovery' OR "rpg"."lifecycle_requests"."candidate_account_id" IS NOT NULL)
    AND ("rpg"."lifecycle_requests"."kind"<>'exclusion' OR "rpg"."lifecycle_requests"."candidate_account_id" IS NULL)),
	CONSTRAINT "lifecycle_requests_result" CHECK (("rpg"."lifecycle_requests"."result_binding_id" IS NOT NULL) = ("rpg"."lifecycle_requests"."state"='consumed' AND "rpg"."lifecycle_requests"."kind"<>'exclusion')
    AND ("rpg"."lifecycle_requests"."state"<>'consumed' OR "rpg"."lifecycle_requests"."kind"='exclusion' OR "rpg"."lifecycle_requests"."basis" IS NOT NULL)),
	CONSTRAINT "lifecycle_requests_candidate" CHECK (num_nonnulls("rpg"."lifecycle_requests"."candidate_verifier","rpg"."lifecycle_requests"."candidate_account_id","rpg"."lifecycle_requests"."candidate_identity_id","rpg"."lifecycle_requests"."candidate_launch_id") IN (0,4)),
	CONSTRAINT "lifecycle_requests_target" CHECK ((("rpg"."lifecycle_requests"."kind" IN ('recovery','exclusion') AND "rpg"."lifecycle_requests"."target_binding_id" IS NOT NULL AND "rpg"."lifecycle_requests"."target_revision">0 AND "rpg"."lifecycle_requests"."target_profile_id" IS NOT NULL)
    OR ("rpg"."lifecycle_requests"."kind"='invite_child' AND "rpg"."lifecycle_requests"."target_binding_id" IS NULL AND "rpg"."lifecycle_requests"."target_revision" IS NULL AND "rpg"."lifecycle_requests"."target_profile_id" IS NOT NULL)
    OR ("rpg"."lifecycle_requests"."kind"='invite_adult' AND "rpg"."lifecycle_requests"."target_binding_id" IS NULL AND "rpg"."lifecycle_requests"."target_revision" IS NULL AND "rpg"."lifecycle_requests"."target_profile_id" IS NULL)) IS TRUE),
	CONSTRAINT "lifecycle_requests_profile_revision" CHECK ((("rpg"."lifecycle_requests"."target_profile_id" IS NULL AND "rpg"."lifecycle_requests"."target_profile_revision" IS NULL)
    OR ("rpg"."lifecycle_requests"."target_profile_id" IS NOT NULL AND "rpg"."lifecycle_requests"."target_profile_revision">0)) IS TRUE),
	CONSTRAINT "lifecycle_requests_protection" CHECK ((("rpg"."lifecycle_requests"."kind"='recovery' AND "rpg"."lifecycle_requests"."protection_id" IS NOT NULL AND "rpg"."lifecycle_requests"."protection_revision">0)
    OR ("rpg"."lifecycle_requests"."kind"<>'recovery' AND "rpg"."lifecycle_requests"."protection_id" IS NULL AND "rpg"."lifecycle_requests"."protection_revision" IS NULL)) IS TRUE),
	CONSTRAINT "lifecycle_requests_issuer" CHECK ((("rpg"."lifecycle_requests"."kind"='recovery' AND "rpg"."lifecycle_requests"."issuer_binding_id" IS NULL AND "rpg"."lifecycle_requests"."issuer_revision" IS NULL AND "rpg"."lifecycle_requests"."issuer_protection_revision" IS NULL)
    OR ("rpg"."lifecycle_requests"."kind"<>'recovery' AND "rpg"."lifecycle_requests"."issuer_binding_id" IS NOT NULL AND "rpg"."lifecycle_requests"."issuer_revision">0 AND "rpg"."lifecycle_requests"."issuer_protection_revision">0)) IS TRUE),
	CONSTRAINT "lifecycle_requests_basis" CHECK ((("rpg"."lifecycle_requests"."basis" IS NULL AND "rpg"."lifecycle_requests"."approver_binding_id" IS NULL AND "rpg"."lifecycle_requests"."approver_revision" IS NULL AND "rpg"."lifecycle_requests"."approver_protection_revision" IS NULL AND "rpg"."lifecycle_requests"."approved_at" IS NULL)
    OR ("rpg"."lifecycle_requests"."basis"='code' AND "rpg"."lifecycle_requests"."kind"='recovery' AND "rpg"."lifecycle_requests"."approver_binding_id" IS NULL AND "rpg"."lifecycle_requests"."approver_revision" IS NULL AND "rpg"."lifecycle_requests"."approver_protection_revision" IS NULL AND "rpg"."lifecycle_requests"."approved_at" IS NOT NULL)
    OR ("rpg"."lifecycle_requests"."basis"='adult' AND "rpg"."lifecycle_requests"."approver_binding_id" IS NOT NULL AND "rpg"."lifecycle_requests"."approver_revision">0 AND "rpg"."lifecycle_requests"."approver_protection_revision">0 AND "rpg"."lifecycle_requests"."approved_at" IS NOT NULL)) IS TRUE),
	CONSTRAINT "lifecycle_requests_code_basis" CHECK (("rpg"."lifecycle_requests"."basis_credential_id" IS NOT NULL) = ("rpg"."lifecycle_requests"."basis" IS NOT NULL AND "rpg"."lifecycle_requests"."basis"='code')),
	CONSTRAINT "lifecycle_requests_state" CHECK ((("rpg"."lifecycle_requests"."state"='issued' AND "rpg"."lifecycle_requests"."kind"<>'recovery' AND "rpg"."lifecycle_requests"."candidate_account_id" IS NULL AND "rpg"."lifecycle_requests"."basis" IS NULL AND "rpg"."lifecycle_requests"."closed_at" IS NULL)
    OR ("rpg"."lifecycle_requests"."state"='claimed' AND "rpg"."lifecycle_requests"."candidate_account_id" IS NOT NULL AND "rpg"."lifecycle_requests"."basis" IS NULL AND "rpg"."lifecycle_requests"."closed_at" IS NULL)
    OR ("rpg"."lifecycle_requests"."state"='approved' AND "rpg"."lifecycle_requests"."basis" IS NOT NULL AND "rpg"."lifecycle_requests"."closed_at" IS NULL)
    OR ("rpg"."lifecycle_requests"."state" IN ('consumed','revoked') AND "rpg"."lifecycle_requests"."closed_at" IS NOT NULL)) IS TRUE),
	CONSTRAINT "lifecycle_requests_closed" CHECK ("rpg"."lifecycle_requests"."closed_at" IS NULL OR (isfinite("rpg"."lifecycle_requests"."closed_at") AND "rpg"."lifecycle_requests"."closed_at" >= "rpg"."lifecycle_requests"."created_at" AND "rpg"."lifecycle_requests"."closed_at" <= "rpg"."lifecycle_requests"."updated_at")),
	CONSTRAINT "lifecycle_requests_approved" CHECK ("rpg"."lifecycle_requests"."approved_at" IS NULL OR (isfinite("rpg"."lifecycle_requests"."approved_at") AND "rpg"."lifecycle_requests"."approved_at" >= "rpg"."lifecycle_requests"."created_at" AND "rpg"."lifecycle_requests"."approved_at" <= "rpg"."lifecycle_requests"."updated_at"))
);


CREATE TABLE "rpg"."lifecycle_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"family_id" uuid NOT NULL,
	"request_id" uuid,
	"actor_binding_id" uuid,
	"candidate_account_id" uuid,
	"action" text COLLATE "C" NOT NULL,
	"outcome" text COLLATE "C" NOT NULL,
	"policy_revision" integer NOT NULL,
	"operation_id" uuid,
	"request_digest" text COLLATE "C" NOT NULL,
	CONSTRAINT "lifecycle_events_operation_uq" UNIQUE("operation_id"),
	CONSTRAINT "lifecycle_events_id_v7" CHECK ("rpg"."lifecycle_events"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "lifecycle_events_schema_supported" CHECK ("rpg"."lifecycle_events"."schema_version" = 1),
	CONSTRAINT "lifecycle_events_created_finite" CHECK (isfinite("rpg"."lifecycle_events"."created_at")),
	CONSTRAINT "lifecycle_events_values" CHECK ("rpg"."lifecycle_events"."action" IN ('request','code','prepare','approve','consume','claim','leave','exclude','cancel','sessions') AND "rpg"."lifecycle_events"."outcome" IN ('accepted','denied')
    AND "rpg"."lifecycle_events"."policy_revision">0 AND "rpg"."lifecycle_events"."request_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "lifecycle_events_operation_id" CHECK ("rpg"."lifecycle_events"."operation_id" IS NULL OR "rpg"."lifecycle_events"."operation_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
);


ALTER TABLE "rpg"."lifecycle_requests" ADD CONSTRAINT "lifecycle_requests_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."lifecycle_requests" ADD CONSTRAINT "lifecycle_requests_family_fk" FOREIGN KEY ("family_id") REFERENCES "rpg"."families"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."lifecycle_requests" ADD CONSTRAINT "lifecycle_requests_target_fk" FOREIGN KEY ("family_id","target_profile_id","target_binding_id") REFERENCES "rpg"."access_bindings"("family_id","profile_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."lifecycle_requests" ADD CONSTRAINT "lifecycle_requests_profile_fk" FOREIGN KEY ("family_id","target_profile_id") REFERENCES "rpg"."member_profiles"("family_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."lifecycle_requests" ADD CONSTRAINT "lifecycle_requests_protection_fk" FOREIGN KEY ("family_id","target_binding_id","protection_id") REFERENCES "rpg"."adult_protections"("family_id","binding_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."lifecycle_requests" ADD CONSTRAINT "lifecycle_requests_code_fk" FOREIGN KEY ("family_id","target_binding_id","basis_credential_id") REFERENCES "rpg"."adult_recovery_credentials"("family_id","binding_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."lifecycle_requests" ADD CONSTRAINT "lifecycle_requests_issuer_fk" FOREIGN KEY ("family_id","issuer_binding_id") REFERENCES "rpg"."access_bindings"("family_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."lifecycle_requests" ADD CONSTRAINT "lifecycle_requests_approver_fk" FOREIGN KEY ("family_id","approver_binding_id") REFERENCES "rpg"."access_bindings"("family_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."lifecycle_requests" ADD CONSTRAINT "lifecycle_requests_result_fk" FOREIGN KEY ("family_id","result_binding_id") REFERENCES "rpg"."access_bindings"("family_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."lifecycle_requests" ADD CONSTRAINT "lifecycle_requests_candidate_fk" FOREIGN KEY ("candidate_identity_id","candidate_account_id") REFERENCES "rpg"."external_identities"("id","account_id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."lifecycle_requests" ADD CONSTRAINT "lifecycle_requests_launch_fk" FOREIGN KEY ("candidate_account_id","candidate_identity_id","candidate_launch_id") REFERENCES "rpg"."access_launches"("account_id","external_identity_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."lifecycle_events" ADD CONSTRAINT "lifecycle_events_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."lifecycle_events" ADD CONSTRAINT "lifecycle_events_family_fk" FOREIGN KEY ("family_id") REFERENCES "rpg"."families"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."lifecycle_events" ADD CONSTRAINT "lifecycle_events_request_fk" FOREIGN KEY ("family_id","request_id") REFERENCES "rpg"."lifecycle_requests"("family_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."lifecycle_events" ADD CONSTRAINT "lifecycle_events_actor_fk" FOREIGN KEY ("family_id","actor_binding_id") REFERENCES "rpg"."access_bindings"("family_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."lifecycle_events" ADD CONSTRAINT "lifecycle_events_candidate_fk" FOREIGN KEY ("candidate_account_id") REFERENCES "rpg"."accounts"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX "lifecycle_requests_scope_idx" ON "rpg"."lifecycle_requests" USING btree ("family_id","target_binding_id","created_at");

CREATE INDEX "lifecycle_requests_issuer_time_idx" ON "rpg"."lifecycle_requests" USING btree ("issuer_binding_id","created_at");

CREATE INDEX "lifecycle_requests_candidate_time_idx" ON "rpg"."lifecycle_requests" USING btree ("family_id","candidate_account_id","created_at");

CREATE INDEX "lifecycle_events_rate_idx" ON "rpg"."lifecycle_events" USING btree ("family_id","candidate_account_id","created_at");

CREATE INDEX "lifecycle_events_request_action_idx" ON "rpg"."lifecycle_events" USING btree ("request_id","action","created_at");
