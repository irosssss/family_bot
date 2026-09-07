-- G03-D: generated target family access schema; reviewed before disposable execution.
CREATE TABLE "rpg"."access_bindings" (
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
	"profile_role" text COLLATE "C" NOT NULL,
	"kind" text COLLATE "C" NOT NULL,
	"manager_binding_id" uuid,
	"manager_kind" text COLLATE "C",
	"status" text COLLATE "C" NOT NULL,
	"revoked_at" timestamp(3) with time zone,
	"origin_invitation_id" uuid,
	CONSTRAINT "access_bindings_scope_uq" UNIQUE("family_id","account_id","profile_id","id","kind"),
	CONSTRAINT "access_bindings_manager_uq" UNIQUE("family_id","account_id","id","kind"),
	CONSTRAINT "access_bindings_lineage_uq" UNIQUE("id","family_id","account_id","manager_binding_id","manager_kind"),
	CONSTRAINT "access_bindings_id_v7" CHECK ("rpg"."access_bindings"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "access_bindings_schema_supported" CHECK ("rpg"."access_bindings"."schema_version" = 1),
	CONSTRAINT "access_bindings_created_finite" CHECK (isfinite("rpg"."access_bindings"."created_at")),
	CONSTRAINT "access_bindings_state_revision_positive" CHECK ("rpg"."access_bindings"."state_revision" > 0),
	CONSTRAINT "access_bindings_updated_valid" CHECK (isfinite("rpg"."access_bindings"."updated_at") AND "rpg"."access_bindings"."updated_at" >= "rpg"."access_bindings"."created_at"),
	CONSTRAINT "access_bindings_role" CHECK (("rpg"."access_bindings"."kind" = 'adult_membership' AND "rpg"."access_bindings"."profile_role" = 'parent')
    OR ("rpg"."access_bindings"."kind" IN ('own_child','managed_child') AND "rpg"."access_bindings"."profile_role" = 'child')),
	CONSTRAINT "access_bindings_manager" CHECK ((("rpg"."access_bindings"."kind" = 'managed_child' AND "rpg"."access_bindings"."manager_binding_id" IS NOT NULL
    AND "rpg"."access_bindings"."manager_kind" = 'adult_membership' AND "rpg"."access_bindings"."manager_binding_id" <> "rpg"."access_bindings"."id")
    OR ("rpg"."access_bindings"."kind" <> 'managed_child' AND "rpg"."access_bindings"."manager_binding_id" IS NULL AND "rpg"."access_bindings"."manager_kind" IS NULL)) IS TRUE),
	CONSTRAINT "access_bindings_status" CHECK (("rpg"."access_bindings"."status" = 'active' AND "rpg"."access_bindings"."revoked_at" IS NULL) OR ("rpg"."access_bindings"."status" = 'revoked' AND "rpg"."access_bindings"."revoked_at" IS NOT NULL)),
	CONSTRAINT "access_bindings_revoked" CHECK ("rpg"."access_bindings"."revoked_at" IS NULL OR (isfinite("rpg"."access_bindings"."revoked_at") AND "rpg"."access_bindings"."revoked_at" >= "rpg"."access_bindings"."created_at" AND "rpg"."access_bindings"."revoked_at" <= "rpg"."access_bindings"."updated_at")),
	CONSTRAINT "access_bindings_invitation_pending" CHECK ("rpg"."access_bindings"."origin_invitation_id" IS NULL)
);


CREATE TABLE "rpg"."session_contexts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"state_revision" integer NOT NULL,
	"updated_at" timestamp(3) with time zone NOT NULL,
	"family_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"external_identity_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"binding_id" uuid NOT NULL,
	"binding_kind" text COLLATE "C" NOT NULL,
	"binding_revision" integer NOT NULL,
	"mode" text COLLATE "C" NOT NULL,
	"parent_session_id" uuid,
	"parent_mode" text COLLATE "C",
	"parent_binding_id" uuid,
	"parent_binding_kind" text COLLATE "C",
	"origin_launch_id" uuid,
	"expires_at" timestamp(3) with time zone NOT NULL,
	"revoked_at" timestamp(3) with time zone,
	"adult_verified_at" timestamp(3) with time zone,
	"adult_grant_expires_at" timestamp(3) with time zone,
	"adult_idle_expires_at" timestamp(3) with time zone,
	"protection_revision" integer,
	"policy_id" text COLLATE "C" NOT NULL,
	"policy_revision" integer NOT NULL,
	"policy_digest" text COLLATE "C" NOT NULL,
	CONSTRAINT "session_contexts_launch_uq" UNIQUE("origin_launch_id"),
	CONSTRAINT "session_contexts_family_uq" UNIQUE("family_id","id"),
	CONSTRAINT "session_contexts_parent_uq" UNIQUE("family_id","account_id","id","mode","binding_id","binding_kind"),
	CONSTRAINT "session_contexts_id_v7" CHECK ("rpg"."session_contexts"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "session_contexts_schema_supported" CHECK ("rpg"."session_contexts"."schema_version" = 1),
	CONSTRAINT "session_contexts_created_finite" CHECK (isfinite("rpg"."session_contexts"."created_at")),
	CONSTRAINT "session_contexts_state_revision_positive" CHECK ("rpg"."session_contexts"."state_revision" > 0),
	CONSTRAINT "session_contexts_updated_valid" CHECK (isfinite("rpg"."session_contexts"."updated_at") AND "rpg"."session_contexts"."updated_at" >= "rpg"."session_contexts"."created_at"),
	CONSTRAINT "session_contexts_mode" CHECK (("rpg"."session_contexts"."mode" = 'adult' AND "rpg"."session_contexts"."binding_kind" = 'adult_membership')
    OR ("rpg"."session_contexts"."mode" = 'own_child' AND "rpg"."session_contexts"."binding_kind" = 'own_child' AND "rpg"."session_contexts"."origin_launch_id" IS NOT NULL)
    OR ("rpg"."session_contexts"."mode" = 'managed_child' AND "rpg"."session_contexts"."binding_kind" = 'managed_child' AND "rpg"."session_contexts"."origin_launch_id" IS NULL)),
	CONSTRAINT "session_contexts_parent" CHECK ((("rpg"."session_contexts"."mode" = 'managed_child' AND "rpg"."session_contexts"."parent_session_id" IS NOT NULL AND "rpg"."session_contexts"."parent_session_id" <> "rpg"."session_contexts"."id"
    AND "rpg"."session_contexts"."parent_mode" = 'adult' AND "rpg"."session_contexts"."parent_binding_id" IS NOT NULL AND "rpg"."session_contexts"."parent_binding_kind" = 'adult_membership')
    OR ("rpg"."session_contexts"."mode" <> 'managed_child' AND "rpg"."session_contexts"."parent_session_id" IS NULL AND "rpg"."session_contexts"."parent_mode" IS NULL
    AND "rpg"."session_contexts"."parent_binding_id" IS NULL AND "rpg"."session_contexts"."parent_binding_kind" IS NULL)) IS TRUE),
	CONSTRAINT "session_contexts_adult" CHECK ((("rpg"."session_contexts"."mode" = 'adult' AND "rpg"."session_contexts"."protection_revision" > 0
    AND isfinite("rpg"."session_contexts"."adult_verified_at") AND "rpg"."session_contexts"."adult_verified_at" >= "rpg"."session_contexts"."created_at" AND "rpg"."session_contexts"."adult_verified_at" <= "rpg"."session_contexts"."updated_at"
    AND isfinite("rpg"."session_contexts"."adult_grant_expires_at") AND isfinite("rpg"."session_contexts"."adult_idle_expires_at")
    AND "rpg"."session_contexts"."adult_grant_expires_at" > "rpg"."session_contexts"."adult_verified_at" AND "rpg"."session_contexts"."adult_grant_expires_at" <= "rpg"."session_contexts"."expires_at"
    AND "rpg"."session_contexts"."adult_idle_expires_at" > "rpg"."session_contexts"."adult_verified_at" AND "rpg"."session_contexts"."adult_idle_expires_at" <= "rpg"."session_contexts"."adult_grant_expires_at")
    OR ("rpg"."session_contexts"."mode" <> 'adult' AND "rpg"."session_contexts"."protection_revision" IS NULL AND "rpg"."session_contexts"."adult_verified_at" IS NULL
    AND "rpg"."session_contexts"."adult_grant_expires_at" IS NULL AND "rpg"."session_contexts"."adult_idle_expires_at" IS NULL)) IS TRUE),
	CONSTRAINT "session_contexts_expiry" CHECK (isfinite("rpg"."session_contexts"."expires_at") AND "rpg"."session_contexts"."expires_at" > "rpg"."session_contexts"."created_at"),
	CONSTRAINT "session_contexts_revoked" CHECK ("rpg"."session_contexts"."revoked_at" IS NULL OR (isfinite("rpg"."session_contexts"."revoked_at") AND "rpg"."session_contexts"."revoked_at" >= "rpg"."session_contexts"."created_at" AND "rpg"."session_contexts"."revoked_at" <= "rpg"."session_contexts"."updated_at")),
	CONSTRAINT "session_contexts_policy" CHECK ("rpg"."session_contexts"."binding_revision" > 0 AND "rpg"."session_contexts"."policy_revision" > 0 AND "rpg"."session_contexts"."policy_id" ~ '^[a-z][a-z0-9_]*$' AND "rpg"."session_contexts"."policy_digest" ~ '^[a-f0-9]{64}$')
);


CREATE TABLE "rpg"."session_token_verifiers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"state_revision" integer NOT NULL,
	"updated_at" timestamp(3) with time zone NOT NULL,
	"family_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"token_verifier" text COLLATE "C" NOT NULL,
	"verifier_version" integer NOT NULL,
	"retired_at" timestamp(3) with time zone,
	CONSTRAINT "session_token_verifiers_digest_uq" UNIQUE("token_verifier"),
	CONSTRAINT "session_token_verifiers_id_v7" CHECK ("rpg"."session_token_verifiers"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "session_token_verifiers_schema_supported" CHECK ("rpg"."session_token_verifiers"."schema_version" = 1),
	CONSTRAINT "session_token_verifiers_created_finite" CHECK (isfinite("rpg"."session_token_verifiers"."created_at")),
	CONSTRAINT "session_token_verifiers_state_revision_positive" CHECK ("rpg"."session_token_verifiers"."state_revision" > 0),
	CONSTRAINT "session_token_verifiers_updated_valid" CHECK (isfinite("rpg"."session_token_verifiers"."updated_at") AND "rpg"."session_token_verifiers"."updated_at" >= "rpg"."session_token_verifiers"."created_at"),
	CONSTRAINT "session_token_verifiers_digest" CHECK ("rpg"."session_token_verifiers"."token_verifier" ~ '^[a-f0-9]{64}$' AND "rpg"."session_token_verifiers"."verifier_version" = 1),
	CONSTRAINT "session_token_verifiers_retired" CHECK ("rpg"."session_token_verifiers"."retired_at" IS NULL OR (isfinite("rpg"."session_token_verifiers"."retired_at") AND "rpg"."session_token_verifiers"."retired_at" >= "rpg"."session_token_verifiers"."created_at" AND "rpg"."session_token_verifiers"."retired_at" <= "rpg"."session_token_verifiers"."updated_at"))
);


ALTER TABLE "rpg"."access_bindings" ADD CONSTRAINT "access_bindings_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."access_bindings" ADD CONSTRAINT "access_bindings_account_fk" FOREIGN KEY ("account_id") REFERENCES "rpg"."accounts"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."access_bindings" ADD CONSTRAINT "access_bindings_profile_fk" FOREIGN KEY ("family_id","profile_id","profile_role") REFERENCES "rpg"."member_profiles"("family_id","id","family_role") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."access_bindings" ADD CONSTRAINT "access_bindings_manager_fk" FOREIGN KEY ("family_id","account_id","manager_binding_id","manager_kind") REFERENCES "rpg"."access_bindings"("family_id","account_id","id","kind") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."session_contexts" ADD CONSTRAINT "session_contexts_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."session_contexts" ADD CONSTRAINT "session_contexts_binding_fk" FOREIGN KEY ("family_id","account_id","profile_id","binding_id","binding_kind") REFERENCES "rpg"."access_bindings"("family_id","account_id","profile_id","id","kind") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."session_contexts" ADD CONSTRAINT "session_contexts_identity_fk" FOREIGN KEY ("external_identity_id","account_id") REFERENCES "rpg"."external_identities"("id","account_id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."session_contexts" ADD CONSTRAINT "session_contexts_launch_fk" FOREIGN KEY ("origin_launch_id") REFERENCES "rpg"."access_launches"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."session_contexts" ADD CONSTRAINT "session_contexts_parent_fk" FOREIGN KEY ("family_id","account_id","parent_session_id","parent_mode","parent_binding_id","parent_binding_kind") REFERENCES "rpg"."session_contexts"("family_id","account_id","id","mode","binding_id","binding_kind") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."session_contexts" ADD CONSTRAINT "session_contexts_manager_fk" FOREIGN KEY ("binding_id","family_id","account_id","parent_binding_id","parent_binding_kind") REFERENCES "rpg"."access_bindings"("id","family_id","account_id","manager_binding_id","manager_kind") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."session_token_verifiers" ADD CONSTRAINT "session_token_verifiers_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."session_token_verifiers" ADD CONSTRAINT "session_token_verifiers_session_fk" FOREIGN KEY ("family_id","session_id") REFERENCES "rpg"."session_contexts"("family_id","id") ON DELETE no action ON UPDATE no action;

CREATE UNIQUE INDEX "access_bindings_own_child_uq" ON "rpg"."access_bindings" USING btree ("family_id","profile_id") WHERE "rpg"."access_bindings"."kind" = 'own_child' AND "rpg"."access_bindings"."status" = 'active';

CREATE UNIQUE INDEX "access_bindings_adult_profile_uq" ON "rpg"."access_bindings" USING btree ("family_id","profile_id") WHERE "rpg"."access_bindings"."kind" = 'adult_membership' AND "rpg"."access_bindings"."status" = 'active';

CREATE UNIQUE INDEX "access_bindings_principal_uq" ON "rpg"."access_bindings" USING btree ("family_id","account_id") WHERE "rpg"."access_bindings"."kind" <> 'managed_child' AND "rpg"."access_bindings"."status" = 'active';

CREATE UNIQUE INDEX "access_bindings_managed_uq" ON "rpg"."access_bindings" USING btree ("family_id","account_id","profile_id") WHERE "rpg"."access_bindings"."kind" = 'managed_child' AND "rpg"."access_bindings"."status" = 'active';

CREATE UNIQUE INDEX "session_token_verifiers_active_uq" ON "rpg"."session_token_verifiers" USING btree ("session_id") WHERE "rpg"."session_token_verifiers"."retired_at" IS NULL;
