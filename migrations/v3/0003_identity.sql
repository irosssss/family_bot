ALTER TABLE rpg_v3.access_bindings DROP CONSTRAINT access_bindings_mode_check;
ALTER TABLE rpg_v3.access_bindings ADD CHECK (mode IN ('adult','own_child','managed_child'));
CREATE TABLE rpg_v3.identities (
  subject_hash text PRIMARY KEY CHECK (subject_hash ~ '^[a-f0-9]{64}$'),
  account_id rpg_v3.uuid_v7 NOT NULL UNIQUE REFERENCES rpg_v3.accounts(id),
  home_binding_id rpg_v3.uuid_v7 NOT NULL REFERENCES rpg_v3.access_bindings(id),
  pin_hash text NOT NULL,
  recovery_hash text NOT NULL,
  failures integer NOT NULL DEFAULT 0 CHECK (failures BETWEEN 0 AND 5),
  locked_until timestamptz
);
CREATE TABLE rpg_v3.device_tokens (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  session_id rpg_v3.uuid_v7 NOT NULL REFERENCES rpg_v3.sessions(id),
  home_binding_id rpg_v3.uuid_v7 NOT NULL REFERENCES rpg_v3.access_bindings(id)
);
CREATE TABLE rpg_v3.member_invites (
  id rpg_v3.uuid_v7 PRIMARY KEY,
  family_id rpg_v3.uuid_v7 NOT NULL REFERENCES rpg_v3.families(id),
  member_id rpg_v3.uuid_v7 NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('open','used','revoked')),
  expires_at timestamptz NOT NULL,
  used_by rpg_v3.uuid_v7 REFERENCES rpg_v3.accounts(id),
  FOREIGN KEY (member_id,family_id) REFERENCES rpg_v3.member_profiles(id,family_id)
);
CREATE UNIQUE INDEX member_open_invite ON rpg_v3.member_invites(family_id,member_id) WHERE status='open';
CREATE UNIQUE INDEX member_own_identity ON rpg_v3.access_bindings(family_id,member_id)
  WHERE status='active' AND mode IN ('adult','own_child');
