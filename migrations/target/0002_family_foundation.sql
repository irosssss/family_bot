-- G02-B: generated from the target Drizzle schema; reviewed before disposable execution.
CREATE TABLE "rpg"."accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"state_revision" integer NOT NULL,
	"updated_at" timestamp(3) with time zone NOT NULL,
	"status" text NOT NULL,
	"disabled_at" timestamp(3) with time zone,
	CONSTRAINT "accounts_id_v7" CHECK ("rpg"."accounts"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "accounts_schema_supported" CHECK ("rpg"."accounts"."schema_version" = 1),
	CONSTRAINT "accounts_created_finite" CHECK (isfinite("rpg"."accounts"."created_at")),
	CONSTRAINT "accounts_state_revision_positive" CHECK ("rpg"."accounts"."state_revision" > 0),
	CONSTRAINT "accounts_updated_valid" CHECK (isfinite("rpg"."accounts"."updated_at") AND "rpg"."accounts"."updated_at" >= "rpg"."accounts"."created_at"),
	CONSTRAINT "accounts_status_valid" CHECK ("rpg"."accounts"."status" IN ('active','disabled','erasure_pending')),
	CONSTRAINT "accounts_disabled_state" CHECK (("rpg"."accounts"."status" <> 'active' OR "rpg"."accounts"."disabled_at" IS NULL)
    AND ("rpg"."accounts"."status" <> 'disabled' OR "rpg"."accounts"."disabled_at" IS NOT NULL)),
	CONSTRAINT "accounts_disabled_time" CHECK ("rpg"."accounts"."disabled_at" IS NULL OR (isfinite("rpg"."accounts"."disabled_at") AND "rpg"."accounts"."disabled_at" >= "rpg"."accounts"."created_at" AND "rpg"."accounts"."disabled_at" <= "rpg"."accounts"."updated_at"))
);


CREATE TABLE "rpg"."families" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"state_revision" integer NOT NULL,
	"updated_at" timestamp(3) with time zone NOT NULL,
	"display_name" text NOT NULL,
	"status" text NOT NULL,
	"zone_id" text NOT NULL,
	"calendar_revision" integer NOT NULL,
	"membership_revision" integer NOT NULL,
	"recurrence_paused" boolean NOT NULL,
	"recurrence_paused_at" timestamp(3) with time zone,
	"archived_at" timestamp(3) with time zone,
	"last_resumed_at" timestamp(3) with time zone,
	CONSTRAINT "families_id_v7" CHECK ("rpg"."families"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "families_schema_supported" CHECK ("rpg"."families"."schema_version" = 1),
	CONSTRAINT "families_created_finite" CHECK (isfinite("rpg"."families"."created_at")),
	CONSTRAINT "families_state_revision_positive" CHECK ("rpg"."families"."state_revision" > 0),
	CONSTRAINT "families_updated_valid" CHECK (isfinite("rpg"."families"."updated_at") AND "rpg"."families"."updated_at" >= "rpg"."families"."created_at"),
	CONSTRAINT "families_status_valid" CHECK ("rpg"."families"."status" IN ('active','archived')),
	CONSTRAINT "families_revisions_positive" CHECK ("rpg"."families"."calendar_revision" > 0 AND "rpg"."families"."membership_revision" > 0),
	CONSTRAINT "families_paused_state" CHECK ("rpg"."families"."recurrence_paused" = ("rpg"."families"."recurrence_paused_at" IS NOT NULL)),
	CONSTRAINT "families_archived_state" CHECK ("rpg"."families"."status" <> 'archived' OR "rpg"."families"."archived_at" IS NOT NULL),
	CONSTRAINT "families_paused_time" CHECK ("rpg"."families"."recurrence_paused_at" IS NULL OR (isfinite("rpg"."families"."recurrence_paused_at") AND "rpg"."families"."recurrence_paused_at" >= "rpg"."families"."created_at" AND "rpg"."families"."recurrence_paused_at" <= "rpg"."families"."updated_at")),
	CONSTRAINT "families_archived_time" CHECK ("rpg"."families"."archived_at" IS NULL OR (isfinite("rpg"."families"."archived_at") AND "rpg"."families"."archived_at" >= "rpg"."families"."created_at" AND "rpg"."families"."archived_at" <= "rpg"."families"."updated_at")),
	CONSTRAINT "families_resumed_time" CHECK ("rpg"."families"."last_resumed_at" IS NULL OR (isfinite("rpg"."families"."last_resumed_at") AND "rpg"."families"."last_resumed_at" >= "rpg"."families"."created_at" AND "rpg"."families"."last_resumed_at" <= "rpg"."families"."updated_at"))
);


CREATE TABLE "rpg"."member_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"state_revision" integer NOT NULL,
	"updated_at" timestamp(3) with time zone NOT NULL,
	"family_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"family_role" text NOT NULL,
	"status" text NOT NULL,
	"archived_at" timestamp(3) with time zone,
	"left_at" timestamp(3) with time zone,
	CONSTRAINT "member_profiles_family_id_uq" UNIQUE("family_id","id"),
	CONSTRAINT "member_profiles_family_id_role_uq" UNIQUE("family_id","id","family_role"),
	CONSTRAINT "member_profiles_id_v7" CHECK ("rpg"."member_profiles"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "member_profiles_schema_supported" CHECK ("rpg"."member_profiles"."schema_version" = 1),
	CONSTRAINT "member_profiles_created_finite" CHECK (isfinite("rpg"."member_profiles"."created_at")),
	CONSTRAINT "member_profiles_state_revision_positive" CHECK ("rpg"."member_profiles"."state_revision" > 0),
	CONSTRAINT "member_profiles_updated_valid" CHECK (isfinite("rpg"."member_profiles"."updated_at") AND "rpg"."member_profiles"."updated_at" >= "rpg"."member_profiles"."created_at"),
	CONSTRAINT "member_profiles_role_valid" CHECK ("rpg"."member_profiles"."family_role" IN ('parent','child')),
	CONSTRAINT "member_profiles_status_valid" CHECK ("rpg"."member_profiles"."status" IN ('active','archived','left')),
	CONSTRAINT "member_profiles_status_times" CHECK (("rpg"."member_profiles"."status" = 'archived') = ("rpg"."member_profiles"."archived_at" IS NOT NULL)
    AND ("rpg"."member_profiles"."status" = 'left') = ("rpg"."member_profiles"."left_at" IS NOT NULL)),
	CONSTRAINT "member_profiles_archived_time" CHECK ("rpg"."member_profiles"."archived_at" IS NULL OR (isfinite("rpg"."member_profiles"."archived_at") AND "rpg"."member_profiles"."archived_at" >= "rpg"."member_profiles"."created_at" AND "rpg"."member_profiles"."archived_at" <= "rpg"."member_profiles"."updated_at")),
	CONSTRAINT "member_profiles_left_time" CHECK ("rpg"."member_profiles"."left_at" IS NULL OR (isfinite("rpg"."member_profiles"."left_at") AND "rpg"."member_profiles"."left_at" >= "rpg"."member_profiles"."created_at" AND "rpg"."member_profiles"."left_at" <= "rpg"."member_profiles"."updated_at"))
);


CREATE TABLE "rpg"."players" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"family_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "players_family_id_uq" UNIQUE("family_id","id"),
	CONSTRAINT "players_family_profile_uq" UNIQUE("family_id","profile_id"),
	CONSTRAINT "players_id_v7" CHECK ("rpg"."players"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "players_schema_supported" CHECK ("rpg"."players"."schema_version" = 1),
	CONSTRAINT "players_created_finite" CHECK (isfinite("rpg"."players"."created_at")),
	CONSTRAINT "players_child_only" CHECK ("rpg"."players"."role" = 'child')
);


CREATE TABLE "rpg"."retention_policy_revisions" (
	"policy_id" text COLLATE "C" NOT NULL,
	"revision" integer NOT NULL,
	"purpose" text COLLATE "C" NOT NULL,
	"category" text COLLATE "C" NOT NULL,
	"trigger" text COLLATE "C" NOT NULL,
	"schema_version" integer NOT NULL,
	"policy_payload" jsonb NOT NULL,
	CONSTRAINT "retention_policy_revisions_pk" PRIMARY KEY("policy_id","revision"),
	CONSTRAINT "retention_policy_id_key" CHECK ("rpg"."retention_policy_revisions"."policy_id" ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "retention_purpose_key" CHECK ("rpg"."retention_policy_revisions"."purpose" ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "retention_category_key" CHECK ("rpg"."retention_policy_revisions"."category" ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "retention_trigger_key" CHECK ("rpg"."retention_policy_revisions"."trigger" ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "retention_revision_positive" CHECK ("rpg"."retention_policy_revisions"."revision" > 0),
	CONSTRAINT "retention_schema_supported" CHECK ("rpg"."retention_policy_revisions"."schema_version" = 1),
	CONSTRAINT "retention_payload_envelope" CHECK ((jsonb_typeof("rpg"."retention_policy_revisions"."policy_payload") = 'object'
    AND "rpg"."retention_policy_revisions"."policy_payload" ?& ARRAY['contract_id','schema_version','value']
    AND "rpg"."retention_policy_revisions"."policy_payload" - ARRAY['contract_id','schema_version','value'] = '{}'::jsonb
    AND jsonb_typeof("rpg"."retention_policy_revisions"."policy_payload"->'contract_id') = 'string'
    AND "rpg"."retention_policy_revisions"."policy_payload"->>'contract_id' ~ '^[a-z][a-z0-9_]*$'
    AND jsonb_typeof("rpg"."retention_policy_revisions"."policy_payload"->'schema_version') = 'number'
    AND "rpg"."retention_policy_revisions"."policy_payload"->>'schema_version' ~ '^[1-9][0-9]{0,9}$'
    AND ("rpg"."retention_policy_revisions"."policy_payload"->>'schema_version')::numeric <= 2147483647
    AND jsonb_typeof("rpg"."retention_policy_revisions"."policy_payload"->'value') = 'object') IS TRUE)
);


ALTER TABLE "rpg"."accounts" ADD CONSTRAINT "accounts_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."families" ADD CONSTRAINT "families_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."member_profiles" ADD CONSTRAINT "member_profiles_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."member_profiles" ADD CONSTRAINT "member_profiles_family_fk" FOREIGN KEY ("family_id") REFERENCES "rpg"."families"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."players" ADD CONSTRAINT "players_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."players" ADD CONSTRAINT "players_child_profile_fk" FOREIGN KEY ("family_id","profile_id","role") REFERENCES "rpg"."member_profiles"("family_id","id","family_role") ON DELETE no action ON UPDATE no action;

CREATE INDEX "member_profiles_home_idx" ON "rpg"."member_profiles" USING btree ("family_id","status","id");
