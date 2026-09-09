CREATE DOMAIN rpg_v3.uuid_v7 AS uuid
  CHECK (VALUE::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
CREATE DOMAIN rpg_v3.revision AS bigint
  CHECK (VALUE >= 1 AND VALUE <= 9007199254740991);

CREATE TABLE rpg_v3.accounts (
  id rpg_v3.uuid_v7 PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('active', 'revoked', 'archived')),
  revision rpg_v3.revision NOT NULL DEFAULT 1
);
CREATE TABLE rpg_v3.families (
  id rpg_v3.uuid_v7 PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('active', 'archived')),
  revision rpg_v3.revision NOT NULL DEFAULT 1
);
CREATE TABLE rpg_v3.member_profiles (
  id rpg_v3.uuid_v7 PRIMARY KEY,
  family_id rpg_v3.uuid_v7 NOT NULL REFERENCES rpg_v3.families(id),
  family_role text NOT NULL CHECK (family_role IN ('adult', 'child')),
  display_name text NOT NULL CHECK (display_name = btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 80),
  status text NOT NULL CHECK (status IN ('active', 'left', 'archived')),
  revision rpg_v3.revision NOT NULL DEFAULT 1,
  capability_revision rpg_v3.revision NOT NULL DEFAULT 1,
  UNIQUE (id, family_id)
);
CREATE TABLE rpg_v3.players (
  id rpg_v3.uuid_v7 PRIMARY KEY,
  family_id rpg_v3.uuid_v7 NOT NULL REFERENCES rpg_v3.families(id),
  member_id rpg_v3.uuid_v7 NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'paused', 'left', 'archived')),
  revision rpg_v3.revision NOT NULL DEFAULT 1,
  UNIQUE (family_id, member_id),
  UNIQUE (id, family_id, member_id),
  FOREIGN KEY (member_id, family_id) REFERENCES rpg_v3.member_profiles(id, family_id)
);
CREATE TABLE rpg_v3.capability_grants (
  id rpg_v3.uuid_v7 PRIMARY KEY,
  family_id rpg_v3.uuid_v7 NOT NULL REFERENCES rpg_v3.families(id),
  member_id rpg_v3.uuid_v7 NOT NULL,
  capability text NOT NULL,
  scope text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'revoked')),
  revision rpg_v3.revision NOT NULL DEFAULT 1,
  UNIQUE (family_id, member_id, capability),
  FOREIGN KEY (member_id, family_id) REFERENCES rpg_v3.member_profiles(id, family_id),
  CHECK (
    (capability IN ('family.read', 'family.manage', 'tasks.manage', 'shop.purchase_family_item') AND scope = 'family') OR
    (capability IN ('completion.submit_self', 'shop.purchase_self', 'appearance.select_self', 'real_reward.request_self') AND scope = 'self') OR
    (capability IN ('completion.review_child', 'real_reward.review_child', 'real_reward.cancel_child', 'real_reward.deliver_child') AND scope = 'children_of_family')
  )
);
CREATE TABLE rpg_v3.access_bindings (
  id rpg_v3.uuid_v7 PRIMARY KEY,
  account_id rpg_v3.uuid_v7 NOT NULL REFERENCES rpg_v3.accounts(id),
  family_id rpg_v3.uuid_v7 NOT NULL REFERENCES rpg_v3.families(id),
  member_id rpg_v3.uuid_v7 NOT NULL,
  player_id rpg_v3.uuid_v7,
  mode text NOT NULL CHECK (mode IN ('adult', 'own_child')),
  status text NOT NULL CHECK (status IN ('active', 'revoked')),
  revision rpg_v3.revision NOT NULL DEFAULT 1,
  UNIQUE (id, family_id),
  FOREIGN KEY (member_id, family_id) REFERENCES rpg_v3.member_profiles(id, family_id),
  FOREIGN KEY (player_id, family_id, member_id) REFERENCES rpg_v3.players(id, family_id, member_id)
);
CREATE TABLE rpg_v3.sessions (
  id rpg_v3.uuid_v7 PRIMARY KEY,
  family_id rpg_v3.uuid_v7 NOT NULL REFERENCES rpg_v3.families(id),
  binding_id rpg_v3.uuid_v7 NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'revoked')),
  revision rpg_v3.revision NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  FOREIGN KEY (binding_id, family_id) REFERENCES rpg_v3.access_bindings(id, family_id)
);
