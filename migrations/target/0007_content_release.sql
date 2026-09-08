-- G04-C: generated local fixture release schema; explicit immutable-history guards.
CREATE TABLE "content"."publication_operations" (
	"operation_id" uuid PRIMARY KEY NOT NULL,
	"request_digest" text COLLATE "C" NOT NULL,
	"build_fingerprint" text COLLATE "C" NOT NULL,
	"actor_ref" text COLLATE "C" NOT NULL,
	"approval" jsonb NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "publication_operation_v7" CHECK ("content"."publication_operations"."operation_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "publication_values" CHECK ("content"."publication_operations"."request_digest" ~ '^[a-f0-9]{64}$' AND "content"."publication_operations"."build_fingerprint" ~ '^[a-f0-9]{64}$'
    AND "content"."publication_operations"."actor_ref" ~ '^fixture:operator/[a-z][a-z0-9_]{0,63}$' AND jsonb_typeof("content"."publication_operations"."approval")='object' AND isfinite("content"."publication_operations"."created_at"))
);


CREATE TABLE "content"."package_releases" (
	"package_id" text COLLATE "C" NOT NULL,
	"package_version" text COLLATE "C" NOT NULL,
	"manifest_digest" text COLLATE "C" NOT NULL,
	"schema_version" integer NOT NULL,
	"manifest" jsonb NOT NULL,
	"operation_id" uuid NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "package_releases_package_id_package_version_pk" PRIMARY KEY("package_id","package_version"),
	CONSTRAINT "package_releases_exact_uq" UNIQUE("package_id","package_version","manifest_digest"),
	CONSTRAINT "package_release_values" CHECK ("content"."package_releases"."package_id" ~ '^fixture:package/[a-z][a-z0-9_]*$'
    AND length("content"."package_releases"."package_version")<=64 AND "content"."package_releases"."package_version" ~ '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$'
    AND "content"."package_releases"."manifest_digest" ~ '^[a-f0-9]{64}$' AND "content"."package_releases"."schema_version"=1 AND jsonb_typeof("content"."package_releases"."manifest")='object' AND isfinite("content"."package_releases"."created_at"))
);


CREATE TABLE "content"."release_dependencies" (
	"package_id" text COLLATE "C" NOT NULL,
	"package_version" text COLLATE "C" NOT NULL,
	"manifest_digest" text COLLATE "C" NOT NULL,
	"dependency_id" text COLLATE "C" NOT NULL,
	"dependency_version" text COLLATE "C" NOT NULL,
	"dependency_digest" text COLLATE "C" NOT NULL,
	CONSTRAINT "release_dependencies_package_id_package_version_dependency_id_pk" PRIMARY KEY("package_id","package_version","dependency_id")
);


CREATE TABLE "content"."release_artifacts" (
	"package_id" text COLLATE "C" NOT NULL,
	"package_version" text COLLATE "C" NOT NULL,
	"manifest_digest" text COLLATE "C" NOT NULL,
	"storage_key" text COLLATE "C" NOT NULL,
	"digest" text COLLATE "C" NOT NULL,
	"byte_size" integer NOT NULL,
	CONSTRAINT "release_artifacts_package_id_package_version_storage_key_pk" PRIMARY KEY("package_id","package_version","storage_key"),
	CONSTRAINT "release_artifacts_values" CHECK ("content"."release_artifacts"."digest" ~ '^[a-f0-9]{64}$' AND "content"."release_artifacts"."byte_size" BETWEEN 1 AND 16777216
    AND "content"."release_artifacts"."storage_key" IN ('manifests/' || "content"."release_artifacts"."digest" || '.json','localizations/' || "content"."release_artifacts"."digest" || '.json'))
);


CREATE TABLE "content"."activation_snapshots" (
	"snapshot_id" uuid PRIMARY KEY NOT NULL,
	"scope_key" text COLLATE "C" NOT NULL,
	"schema_version" integer NOT NULL,
	"snapshot_digest" text COLLATE "C" NOT NULL,
	"descriptor" jsonb NOT NULL,
	"operation_id" uuid NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "activation_snapshot_operation_uq" UNIQUE("operation_id"),
	CONSTRAINT "activation_snapshot_scope_uq" UNIQUE("scope_key","snapshot_id"),
	CONSTRAINT "activation_snapshot_v7" CHECK ("content"."activation_snapshots"."snapshot_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "activation_snapshot_operation_v7" CHECK ("content"."activation_snapshots"."operation_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "activation_snapshot_values" CHECK ("content"."activation_snapshots"."scope_key"='global' AND "content"."activation_snapshots"."schema_version"=1 AND "content"."activation_snapshots"."snapshot_digest" ~ '^[a-f0-9]{64}$'
    AND jsonb_typeof("content"."activation_snapshots"."descriptor")='object' AND isfinite("content"."activation_snapshots"."created_at"))
);


CREATE TABLE "content"."snapshot_packages" (
	"snapshot_id" uuid NOT NULL,
	"package_id" text COLLATE "C" NOT NULL,
	"package_version" text COLLATE "C" NOT NULL,
	"manifest_digest" text COLLATE "C" NOT NULL,
	CONSTRAINT "snapshot_packages_snapshot_id_package_id_pk" PRIMARY KEY("snapshot_id","package_id"),
	CONSTRAINT "snapshot_packages_exact_uq" UNIQUE("snapshot_id","package_id","package_version","manifest_digest")
);


CREATE TABLE "content"."activation_heads" (
	"scope_key" text COLLATE "C" PRIMARY KEY NOT NULL,
	"snapshot_id" uuid,
	"state_revision" integer NOT NULL,
	CONSTRAINT "activation_head_values" CHECK ("content"."activation_heads"."scope_key"='global' AND (("content"."activation_heads"."snapshot_id" IS NULL AND "content"."activation_heads"."state_revision"=0) OR ("content"."activation_heads"."snapshot_id" IS NOT NULL AND "content"."activation_heads"."state_revision">0)))
);


CREATE TABLE "content"."activation_changes" (
	"operation_id" uuid PRIMARY KEY NOT NULL,
	"request_digest" text COLLATE "C" NOT NULL,
	"previous_snapshot_id" uuid,
	"next_snapshot_id" uuid NOT NULL,
	"state_revision" integer NOT NULL,
	"reason" text COLLATE "C" NOT NULL,
	"actor_ref" text COLLATE "C" NOT NULL,
	"activated_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "activation_change_next_uq" UNIQUE("next_snapshot_id"),
	CONSTRAINT "activation_change_operation_v7" CHECK ("content"."activation_changes"."operation_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "activation_change_values" CHECK ("content"."activation_changes"."request_digest" ~ '^[a-f0-9]{64}$' AND "content"."activation_changes"."state_revision">0
    AND "content"."activation_changes"."reason" IN ('initial','update','restore') AND "content"."activation_changes"."actor_ref" ~ '^fixture:operator/[a-z][a-z0-9_]{0,63}$' AND isfinite("content"."activation_changes"."activated_at"))
);


CREATE TABLE "content"."release_activations" (
	"scope_key" text COLLATE "C" NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"package_id" text COLLATE "C" NOT NULL,
	"package_version" text COLLATE "C" NOT NULL,
	"manifest_digest" text COLLATE "C" NOT NULL,
	CONSTRAINT "release_activations_scope_key_package_id_pk" PRIMARY KEY("scope_key","package_id")
);


CREATE TABLE "content"."localization_revisions" (
	"bundle_id" text COLLATE "C" NOT NULL,
	"revision" integer NOT NULL,
	"locale" text COLLATE "C" NOT NULL,
	"semantic_digest" text COLLATE "C" NOT NULL,
	"public_digest" text COLLATE "C" NOT NULL,
	CONSTRAINT "localization_revisions_bundle_id_revision_locale_pk" PRIMARY KEY("bundle_id","revision","locale"),
	CONSTRAINT "localization_revision_values" CHECK ("content"."localization_revisions"."bundle_id" ~ '^fixture:localization/[a-z][a-z0-9_]*$' AND "content"."localization_revisions"."revision">0
    AND length("content"."localization_revisions"."locale") BETWEEN 2 AND 64 AND "content"."localization_revisions"."semantic_digest" ~ '^[a-f0-9]{64}$' AND "content"."localization_revisions"."public_digest" ~ '^[a-f0-9]{64}$')
);


CREATE TABLE "content"."release_localizations" (
	"package_id" text COLLATE "C" NOT NULL,
	"package_version" text COLLATE "C" NOT NULL,
	"manifest_digest" text COLLATE "C" NOT NULL,
	"bundle_id" text COLLATE "C" NOT NULL,
	"revision" integer NOT NULL,
	"locale" text COLLATE "C" NOT NULL,
	CONSTRAINT "release_localizations_package_id_package_version_bundle_id_revision_locale_pk" PRIMARY KEY("package_id","package_version","bundle_id","revision","locale")
);


ALTER TABLE "content"."package_releases" ADD CONSTRAINT "package_releases_operation_id_publication_operations_operation_id_fk" FOREIGN KEY ("operation_id") REFERENCES "content"."publication_operations"("operation_id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "content"."release_dependencies" ADD CONSTRAINT "release_dependencies_source_fk" FOREIGN KEY ("package_id","package_version","manifest_digest") REFERENCES "content"."package_releases"("package_id","package_version","manifest_digest") ON DELETE no action ON UPDATE no action;

ALTER TABLE "content"."release_dependencies" ADD CONSTRAINT "release_dependencies_target_fk" FOREIGN KEY ("dependency_id","dependency_version","dependency_digest") REFERENCES "content"."package_releases"("package_id","package_version","manifest_digest") ON DELETE no action ON UPDATE no action;

ALTER TABLE "content"."release_artifacts" ADD CONSTRAINT "release_artifacts_release_fk" FOREIGN KEY ("package_id","package_version","manifest_digest") REFERENCES "content"."package_releases"("package_id","package_version","manifest_digest") ON DELETE no action ON UPDATE no action;

ALTER TABLE "content"."snapshot_packages" ADD CONSTRAINT "snapshot_packages_snapshot_id_activation_snapshots_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "content"."activation_snapshots"("snapshot_id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "content"."snapshot_packages" ADD CONSTRAINT "snapshot_packages_release_fk" FOREIGN KEY ("package_id","package_version","manifest_digest") REFERENCES "content"."package_releases"("package_id","package_version","manifest_digest") ON DELETE no action ON UPDATE no action;

ALTER TABLE "content"."activation_heads" ADD CONSTRAINT "activation_head_scope_fk" FOREIGN KEY ("scope_key","snapshot_id") REFERENCES "content"."activation_snapshots"("scope_key","snapshot_id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "content"."activation_changes" ADD CONSTRAINT "activation_changes_previous_snapshot_id_activation_snapshots_snapshot_id_fk" FOREIGN KEY ("previous_snapshot_id") REFERENCES "content"."activation_snapshots"("snapshot_id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "content"."activation_changes" ADD CONSTRAINT "activation_changes_next_snapshot_id_activation_snapshots_snapshot_id_fk" FOREIGN KEY ("next_snapshot_id") REFERENCES "content"."activation_snapshots"("snapshot_id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "content"."release_activations" ADD CONSTRAINT "release_activations_scope_fk" FOREIGN KEY ("scope_key","snapshot_id") REFERENCES "content"."activation_snapshots"("scope_key","snapshot_id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "content"."release_activations" ADD CONSTRAINT "release_activations_package_fk" FOREIGN KEY ("snapshot_id","package_id","package_version","manifest_digest") REFERENCES "content"."snapshot_packages"("snapshot_id","package_id","package_version","manifest_digest") ON DELETE no action ON UPDATE no action;

ALTER TABLE "content"."release_localizations" ADD CONSTRAINT "release_localizations_release_fk" FOREIGN KEY ("package_id","package_version","manifest_digest") REFERENCES "content"."package_releases"("package_id","package_version","manifest_digest") ON DELETE no action ON UPDATE no action;

ALTER TABLE "content"."release_localizations" ADD CONSTRAINT "release_localizations_record_fk" FOREIGN KEY ("bundle_id","revision","locale") REFERENCES "content"."localization_revisions"("bundle_id","revision","locale") ON DELETE no action ON UPDATE no action;

CREATE FUNCTION content.reject_release_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'content history is immutable' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER publication_operations_immutable BEFORE UPDATE OR DELETE ON content.publication_operations FOR EACH ROW EXECUTE FUNCTION content.reject_release_mutation();
CREATE TRIGGER package_releases_immutable BEFORE UPDATE OR DELETE ON content.package_releases FOR EACH ROW EXECUTE FUNCTION content.reject_release_mutation();
CREATE TRIGGER release_dependencies_immutable BEFORE UPDATE OR DELETE ON content.release_dependencies FOR EACH ROW EXECUTE FUNCTION content.reject_release_mutation();
CREATE TRIGGER release_artifacts_immutable BEFORE UPDATE OR DELETE ON content.release_artifacts FOR EACH ROW EXECUTE FUNCTION content.reject_release_mutation();
CREATE TRIGGER activation_snapshots_immutable BEFORE UPDATE OR DELETE ON content.activation_snapshots FOR EACH ROW EXECUTE FUNCTION content.reject_release_mutation();
CREATE TRIGGER snapshot_packages_immutable BEFORE UPDATE OR DELETE ON content.snapshot_packages FOR EACH ROW EXECUTE FUNCTION content.reject_release_mutation();
CREATE TRIGGER activation_changes_immutable BEFORE UPDATE OR DELETE ON content.activation_changes FOR EACH ROW EXECUTE FUNCTION content.reject_release_mutation();
CREATE TRIGGER localization_revisions_immutable BEFORE UPDATE OR DELETE ON content.localization_revisions FOR EACH ROW EXECUTE FUNCTION content.reject_release_mutation();
CREATE TRIGGER release_localizations_immutable BEFORE UPDATE OR DELETE ON content.release_localizations FOR EACH ROW EXECUTE FUNCTION content.reject_release_mutation();
INSERT INTO content.activation_heads (scope_key,snapshot_id,state_revision) VALUES ('global',NULL,0);
