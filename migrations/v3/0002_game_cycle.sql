ALTER TABLE rpg_v3.players ADD CONSTRAINT players_id_family_unique UNIQUE(id, family_id);

CREATE TABLE rpg_v3.game_documents (
  family_id rpg_v3.uuid_v7 PRIMARY KEY REFERENCES rpg_v3.families(id),
  revision rpg_v3.revision NOT NULL,
  body jsonb NOT NULL CHECK(jsonb_typeof(body) = 'object' AND body->>'version' = '1'),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((body->>'revision')::bigint = revision)
);
CREATE TABLE rpg_v3.game_receipts (
  id rpg_v3.uuid_v7 PRIMARY KEY,
  family_id rpg_v3.uuid_v7 NOT NULL REFERENCES rpg_v3.families(id),
  account_id rpg_v3.uuid_v7 NOT NULL REFERENCES rpg_v3.accounts(id),
  member_id rpg_v3.uuid_v7 NOT NULL,
  command text NOT NULL,
  request_id rpg_v3.uuid_v7 NOT NULL,
  digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL CHECK(jsonb_typeof(result) = 'object'),
  projection_revision rpg_v3.revision NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(family_id, account_id, command, request_id),
  FOREIGN KEY(member_id, family_id) REFERENCES rpg_v3.member_profiles(id, family_id)
);
-- Permanent business identities survive transport receipt retention.
CREATE TABLE rpg_v3.game_claims (
  family_id rpg_v3.uuid_v7 NOT NULL REFERENCES rpg_v3.families(id),
  kind text NOT NULL CHECK(kind IN ('occurrence','attempt','settlement','ownership','purchase','reward_order','starter','starter_choice','hatch','trophy','correction','restoration')),
  business_key text NOT NULL,
  entity_id rpg_v3.uuid_v7 NOT NULL,
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot) = 'object'),
  operation_id rpg_v3.uuid_v7 NOT NULL,
  PRIMARY KEY(family_id, kind, business_key)
);
CREATE TABLE rpg_v3.game_ledger (
  id rpg_v3.uuid_v7 PRIMARY KEY,
  family_id rpg_v3.uuid_v7 NOT NULL REFERENCES rpg_v3.families(id),
  player_id rpg_v3.uuid_v7 NOT NULL,
  kind text NOT NULL CHECK(kind IN ('gold','hero_xp','pet_xp','family_contribution','adventure_damage')),
  sequence bigint NOT NULL CHECK(sequence > 0),
  delta bigint NOT NULL CHECK(delta <> 0),
  cause_key text NOT NULL,
  settlement_id rpg_v3.uuid_v7,
  original_entry_id rpg_v3.uuid_v7,
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot) = 'object'),
  operation_id rpg_v3.uuid_v7 NOT NULL,
  UNIQUE(family_id, cause_key),
  UNIQUE(family_id, sequence),
  UNIQUE(id, family_id),
  FOREIGN KEY(player_id, family_id) REFERENCES rpg_v3.players(id, family_id),
  FOREIGN KEY(original_entry_id, family_id) REFERENCES rpg_v3.game_ledger(id, family_id)
);
CREATE FUNCTION rpg_v3.reject_history_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable_v3_history' USING ERRCODE = '23514';
END
$$;
CREATE TRIGGER immutable_ledger BEFORE UPDATE ON rpg_v3.game_ledger FOR EACH ROW EXECUTE FUNCTION rpg_v3.reject_history_update();
CREATE TRIGGER immutable_claim BEFORE UPDATE ON rpg_v3.game_claims FOR EACH ROW EXECUTE FUNCTION rpg_v3.reject_history_update();
CREATE TRIGGER immutable_receipt BEFORE UPDATE ON rpg_v3.game_receipts FOR EACH ROW EXECUTE FUNCTION rpg_v3.reject_history_update();
