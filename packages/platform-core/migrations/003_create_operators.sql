-- design §3/§4, tenant-administration slice 8a: the operator credential
-- tables. `operator_permissions` is deliberately a flat (operator, permission)
-- row set with a COMPOSITE PRIMARY KEY, NOT a role table — settled by the
-- maintainer (decisions #3684 item 9, spec assumption 3: "permisos
-- asignables y revocables" names permissions, not roles). A double grant
-- becomes a no-op insert-conflict rather than a duplicate row, and
-- revocation is a DELETE of exactly one row. A role layer, if ever wanted,
-- sits ABOVE this table without replacing it — there is no roles/
-- role_permissions/operator_roles triple here, and there is not meant to be
-- one added later as a "fix": three tables and a join would express what one
-- table already expresses, for seven permissions and single-digit operators.
--
-- `audit_entries` is NOT created here — that is migration 004, task 10.6,
-- six PRs later (tasks §0.5's own back-edge). This migration only lands the
-- credential/session tables slice 8a and 8b need.
--
-- Grants: `convite_admin` ONLY (design §4's own table) — `convite_readonly`
-- (mint-server/server) has no reason to ever read an operator's credentials
-- and gets nothing on any of these three tables, mirroring migration 001's
-- own "SELECT on tenants only" restriction in the opposite direction.

CREATE TABLE operators (
  id text PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  password_changed_at timestamptz NOT NULL DEFAULT now()
);

-- Composite PK (operator_id, permission): see this file's own header comment
-- for why this is not a role table. `granted_by` is nullable and
-- self-referencing on purpose — the bootstrap CLI (design §12, PR11) grants
-- every permission to the FIRST operator it creates, with that same account
-- as its own `granted_by`, since no other account exists yet to grant them.
CREATE TABLE operator_permissions (
  operator_id text NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  permission  text NOT NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  granted_by  text REFERENCES operators(id),
  PRIMARY KEY (operator_id, permission)
);

-- `token_hash` is the PRIMARY KEY (design §11.2): SHA-256 hex of the session
-- cookie value, never the raw token — a database dump is then not a set of
-- live sessions. Session lookup/authorization (design §7, slice 9) is a
-- single indexed point lookup by this exact key.
CREATE TABLE operator_sessions (
  token_hash text PRIMARY KEY,
  operator_id text NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX operator_sessions_operator_id_idx ON operator_sessions(operator_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON operators, operator_permissions, operator_sessions TO convite_admin;
