-- G03-C: generated target access schema; reviewed before disposable execution.
CREATE TABLE "rpg"."external_identities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"state_revision" integer NOT NULL,
	"updated_at" timestamp(3) with time zone NOT NULL,
	"account_id" uuid NOT NULL,
	"provider" text COLLATE "C" NOT NULL,
	"subject" text COLLATE "C" NOT NULL,
	"verified_at" timestamp(3) with time zone NOT NULL,
	"revoked_at" timestamp(3) with time zone,
	CONSTRAINT "external_identities_subject_uq" UNIQUE("provider","subject"),
	CONSTRAINT "external_identities_account_uq" UNIQUE("id","account_id"),
	CONSTRAINT "external_identities_id_v7" CHECK ("rpg"."external_identities"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "external_identities_schema_supported" CHECK ("rpg"."external_identities"."schema_version" = 1),
	CONSTRAINT "external_identities_created_finite" CHECK (isfinite("rpg"."external_identities"."created_at")),
	CONSTRAINT "external_identities_state_revision_positive" CHECK ("rpg"."external_identities"."state_revision" > 0),
	CONSTRAINT "external_identities_updated_valid" CHECK (isfinite("rpg"."external_identities"."updated_at") AND "rpg"."external_identities"."updated_at" >= "rpg"."external_identities"."created_at"),
	CONSTRAINT "external_identities_provider" CHECK ("rpg"."external_identities"."provider" = 'telegram'),
	CONSTRAINT "external_identities_subject" CHECK ("rpg"."external_identities"."subject" ~ '^[1-9][0-9]{0,15}$' AND "rpg"."external_identities"."subject"::numeric <= 9007199254740991),
	CONSTRAINT "external_identities_verified" CHECK (isfinite("rpg"."external_identities"."verified_at") AND "rpg"."external_identities"."verified_at" >= "rpg"."external_identities"."created_at" AND "rpg"."external_identities"."verified_at" <= "rpg"."external_identities"."updated_at"),
	CONSTRAINT "external_identities_revoked" CHECK ("rpg"."external_identities"."revoked_at" IS NULL OR (isfinite("rpg"."external_identities"."revoked_at") AND "rpg"."external_identities"."revoked_at" >= "rpg"."external_identities"."created_at" AND "rpg"."external_identities"."revoked_at" <= "rpg"."external_identities"."updated_at"))
);


CREATE TABLE "rpg"."identity_exchange_policy" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"state_revision" integer NOT NULL,
	"updated_at" timestamp(3) with time zone NOT NULL,
	"scope" text COLLATE "C" NOT NULL,
	"environment" text COLLATE "C" NOT NULL,
	"bot_id" text COLLATE "C" NOT NULL,
	"policy_digest" text COLLATE "C" NOT NULL,
	"verification_policy_id" text COLLATE "C" NOT NULL,
	"verification_policy_revision" integer NOT NULL,
	"activated_at" timestamp(3) with time zone NOT NULL,
	"auth_date_floor" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "identity_exchange_policy_scope_uq" UNIQUE("scope"),
	CONSTRAINT "identity_exchange_policy_id_v7" CHECK ("rpg"."identity_exchange_policy"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "identity_exchange_policy_schema_supported" CHECK ("rpg"."identity_exchange_policy"."schema_version" = 1),
	CONSTRAINT "identity_exchange_policy_created_finite" CHECK (isfinite("rpg"."identity_exchange_policy"."created_at")),
	CONSTRAINT "identity_exchange_policy_state_revision_positive" CHECK ("rpg"."identity_exchange_policy"."state_revision" > 0),
	CONSTRAINT "identity_exchange_policy_updated_valid" CHECK (isfinite("rpg"."identity_exchange_policy"."updated_at") AND "rpg"."identity_exchange_policy"."updated_at" >= "rpg"."identity_exchange_policy"."created_at"),
	CONSTRAINT "identity_exchange_policy_scope" CHECK ("rpg"."identity_exchange_policy"."scope" = 'telegram' AND "rpg"."identity_exchange_policy"."environment" IN ('test','production')),
	CONSTRAINT "identity_exchange_policy_bot" CHECK ("rpg"."identity_exchange_policy"."bot_id" ~ '^[1-9][0-9]{0,15}$' AND "rpg"."identity_exchange_policy"."bot_id"::numeric <= 9007199254740991),
	CONSTRAINT "identity_exchange_policy_digest" CHECK ("rpg"."identity_exchange_policy"."policy_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "identity_exchange_policy_revision" CHECK ("rpg"."identity_exchange_policy"."verification_policy_id" ~ '^[a-z][a-z0-9_]*$' AND "rpg"."identity_exchange_policy"."verification_policy_revision" > 0),
	CONSTRAINT "identity_exchange_policy_time" CHECK (isfinite("rpg"."identity_exchange_policy"."activated_at") AND isfinite("rpg"."identity_exchange_policy"."auth_date_floor")
    AND "rpg"."identity_exchange_policy"."activated_at" >= "rpg"."identity_exchange_policy"."created_at" AND "rpg"."identity_exchange_policy"."activated_at" <= "rpg"."identity_exchange_policy"."updated_at"
    AND "rpg"."identity_exchange_policy"."auth_date_floor" >= date_trunc('second', "rpg"."identity_exchange_policy"."activated_at")
    AND "rpg"."identity_exchange_policy"."auth_date_floor" <= "rpg"."identity_exchange_policy"."activated_at" + interval '1 second')
);


CREATE TABLE "rpg"."access_launches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"state_revision" integer NOT NULL,
	"updated_at" timestamp(3) with time zone NOT NULL,
	"account_id" uuid NOT NULL,
	"external_identity_id" uuid NOT NULL,
	"token_verifier" text COLLATE "C" NOT NULL,
	"verifier_version" integer NOT NULL,
	"expires_at" timestamp(3) with time zone NOT NULL,
	"revoked_at" timestamp(3) with time zone,
	CONSTRAINT "access_launches_verifier_uq" UNIQUE("token_verifier"),
	CONSTRAINT "access_launches_id_v7" CHECK ("rpg"."access_launches"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "access_launches_schema_supported" CHECK ("rpg"."access_launches"."schema_version" = 1),
	CONSTRAINT "access_launches_created_finite" CHECK (isfinite("rpg"."access_launches"."created_at")),
	CONSTRAINT "access_launches_state_revision_positive" CHECK ("rpg"."access_launches"."state_revision" > 0),
	CONSTRAINT "access_launches_updated_valid" CHECK (isfinite("rpg"."access_launches"."updated_at") AND "rpg"."access_launches"."updated_at" >= "rpg"."access_launches"."created_at"),
	CONSTRAINT "access_launches_verifier" CHECK ("rpg"."access_launches"."token_verifier" ~ '^[0-9a-f]{64}$' AND "rpg"."access_launches"."verifier_version" = 1),
	CONSTRAINT "access_launches_expiry" CHECK (isfinite("rpg"."access_launches"."expires_at") AND "rpg"."access_launches"."expires_at" > "rpg"."access_launches"."created_at"),
	CONSTRAINT "access_launches_revoked" CHECK ("rpg"."access_launches"."revoked_at" IS NULL OR (isfinite("rpg"."access_launches"."revoked_at") AND "rpg"."access_launches"."revoked_at" >= "rpg"."access_launches"."created_at" AND "rpg"."access_launches"."revoked_at" <= "rpg"."access_launches"."updated_at"))
);


CREATE TABLE "rpg"."identity_exchange_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"replay_fingerprint" text COLLATE "C" NOT NULL,
	"launch_id" uuid NOT NULL,
	"verification_policy_id" text COLLATE "C" NOT NULL,
	"verification_policy_revision" integer NOT NULL,
	"authenticated_at" timestamp(3) with time zone NOT NULL,
	"cleanup_after" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "identity_exchange_receipts_fingerprint_uq" UNIQUE("replay_fingerprint"),
	CONSTRAINT "identity_exchange_receipts_launch_uq" UNIQUE("launch_id"),
	CONSTRAINT "identity_exchange_receipts_id_v7" CHECK ("rpg"."identity_exchange_receipts"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "identity_exchange_receipts_schema_supported" CHECK ("rpg"."identity_exchange_receipts"."schema_version" = 1),
	CONSTRAINT "identity_exchange_receipts_created_finite" CHECK (isfinite("rpg"."identity_exchange_receipts"."created_at")),
	CONSTRAINT "identity_exchange_receipts_fingerprint" CHECK ("rpg"."identity_exchange_receipts"."replay_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "identity_exchange_receipts_policy" CHECK ("rpg"."identity_exchange_receipts"."verification_policy_id" ~ '^[a-z][a-z0-9_]*$' AND "rpg"."identity_exchange_receipts"."verification_policy_revision" > 0),
	CONSTRAINT "identity_exchange_receipts_time" CHECK (isfinite("rpg"."identity_exchange_receipts"."authenticated_at") AND isfinite("rpg"."identity_exchange_receipts"."cleanup_after")
    AND "rpg"."identity_exchange_receipts"."cleanup_after" > "rpg"."identity_exchange_receipts"."authenticated_at" AND "rpg"."identity_exchange_receipts"."cleanup_after" >= "rpg"."identity_exchange_receipts"."created_at")
);


ALTER TABLE "rpg"."external_identities" ADD CONSTRAINT "external_identities_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."external_identities" ADD CONSTRAINT "external_identities_account_fk" FOREIGN KEY ("account_id") REFERENCES "rpg"."accounts"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."identity_exchange_policy" ADD CONSTRAINT "identity_exchange_policy_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."access_launches" ADD CONSTRAINT "access_launches_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."access_launches" ADD CONSTRAINT "access_launches_identity_account_fk" FOREIGN KEY ("external_identity_id","account_id") REFERENCES "rpg"."external_identities"("id","account_id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."identity_exchange_receipts" ADD CONSTRAINT "identity_exchange_receipts_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."identity_exchange_receipts" ADD CONSTRAINT "identity_exchange_receipts_launch_fk" FOREIGN KEY ("launch_id") REFERENCES "rpg"."access_launches"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX "access_launches_expiry_idx" ON "rpg"."access_launches" USING btree ("expires_at");

CREATE INDEX "identity_exchange_receipts_cleanup_idx" ON "rpg"."identity_exchange_receipts" USING btree ("cleanup_after");
