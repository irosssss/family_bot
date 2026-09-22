-- V3 consent event storage; no production policy seeded.
CREATE TABLE "rpg"."consent_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"retention_policy_id" text COLLATE "C" NOT NULL,
	"retention_policy_revision" integer NOT NULL,
	"family_id" uuid NOT NULL,
	"subject_profile_id" uuid NOT NULL,
	"actor_account_id" uuid NOT NULL,
	"purpose" text COLLATE "C" NOT NULL,
	"document_digest" text COLLATE "C" NOT NULL,
	"decision" text COLLATE "C" NOT NULL,
	"scope_revision" integer NOT NULL,
	"authority_reference" text COLLATE "C" NOT NULL,
	CONSTRAINT "consent_events_scope_revision_uq" UNIQUE("family_id","subject_profile_id","purpose","scope_revision"),
	CONSTRAINT "consent_events_id_v7" CHECK ("rpg"."consent_events"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "consent_events_schema_supported" CHECK ("rpg"."consent_events"."schema_version" = 1),
	CONSTRAINT "consent_events_created_finite" CHECK (isfinite("rpg"."consent_events"."created_at")),
	CONSTRAINT "consent_events_values" CHECK ("rpg"."consent_events"."purpose" IN ('service','analytics') AND "rpg"."consent_events"."decision" IN ('grant','withdraw') AND "rpg"."consent_events"."scope_revision">0 AND "rpg"."consent_events"."document_digest" ~ '^[a-f0-9]{64}$' AND length("rpg"."consent_events"."authority_reference") BETWEEN 1 AND 200)
);


ALTER TABLE "rpg"."consent_events" ADD CONSTRAINT "consent_events_retention_fk" FOREIGN KEY ("retention_policy_id","retention_policy_revision") REFERENCES "rpg"."retention_policy_revisions"("policy_id","revision") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."consent_events" ADD CONSTRAINT "consent_events_subject_fk" FOREIGN KEY ("family_id","subject_profile_id") REFERENCES "rpg"."member_profiles"("family_id","id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpg"."consent_events" ADD CONSTRAINT "consent_events_actor_fk" FOREIGN KEY ("actor_account_id") REFERENCES "rpg"."accounts"("id") ON DELETE no action ON UPDATE no action;
CREATE FUNCTION rpg.reject_consent_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'consent history is immutable' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER consent_events_immutable BEFORE UPDATE OR DELETE ON rpg.consent_events FOR EACH ROW EXECUTE FUNCTION rpg.reject_consent_mutation();
