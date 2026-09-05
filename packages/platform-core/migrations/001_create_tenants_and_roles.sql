-- design §3/§4: the tenants table (validity-window columns land in migration
-- 002, per the design's own slice split — slice 5, not this one) plus the
-- two application roles least-privilege depends on. `convite_readonly` is
-- held by mint-server/server; `convite_admin` is held by apps/admin and the
-- bootstrap CLI. Neither role is the owner running THIS migration.

CREATE TABLE tenants (
  id text PRIMARY KEY,
  embed_key text NOT NULL UNIQUE,
  allowed_origins text[] NOT NULL DEFAULT '{}',
  entitled_games text[] NOT NULL DEFAULT '{}',
  theme jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE ROLE convite_readonly LOGIN;
CREATE ROLE convite_admin LOGIN;

GRANT SELECT ON tenants TO convite_readonly;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenants TO convite_admin;
