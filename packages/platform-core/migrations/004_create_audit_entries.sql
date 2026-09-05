-- design §3/§9/§10, tenant-administration slice 10 (task 10.1) — the audit
-- log's own storage, closing the slice 4 -> 10 back-edge tasks §0.5 names:
-- `tenant-admin.ts`'s `WriteWitness` has been a non-optional parameter on
-- every mutating `TenantAdminRepository` method since migration/PR5, wired
-- against a NO-OP `exec`; this migration is what a REAL witness (task 10.6's
-- `appendAuditEntry`, wired transactionally in the very same PR) finally has
-- somewhere real to write.
--
-- APPEND-ONLY, enforced in the TWO layers this migration can actually
-- provide (design §9's own three-layer table — the third, "no route maps to
-- an audit mutation", is a convention enforced by `apps/admin`'s own route
-- table having no such route, not by anything SQL can express):
--
--   LAYER 1, PRIVILEGE: `convite_admin` gets SELECT and INSERT ONLY, no
--   UPDATE, no DELETE, no DDL. This is the layer that holds against a bug in
--   OUR OWN code, including a SQL injection reaching the admin connection —
--   the only layer that holds in that class, which is exactly why migration
--   003's own docstring and design §4 keep DDL rights (this migration
--   included) confined to the owner/migrator role running `pnpm db:migrate`,
--   never `apps/admin`'s own boot path. A writer holding DDL could `DROP
--   TABLE audit_entries` and defeat this grant entirely; `apps/admin` never
--   gets that chance because it never holds DDL to begin with.
--
--   LAYER 2, CONSTRAINT: a `BEFORE UPDATE OR DELETE` trigger that
--   unconditionally raises. This holds against OUR OWN SQL run as the
--   OWNER — a careless migration, a manual fix-up — which layer 1 alone
--   cannot stop, since table ownership bypasses every GRANT. Neither layer
--   holds against someone who first connects as the owner and drops the
--   trigger; design §9's own honest bottom line states that plainly rather
--   than overclaiming.
--
-- `actor_operator_id` is NOT NULL and REFERENCES `operators(id)` (no
-- ON DELETE behavior — the codebase never deletes an operator row, only
-- disables one) — design §6.3's own closing argument: the SAME
-- `AuthorizedOperator` value slice 9's checkpoint mints is the only thing
-- that can ever populate this column, so it is structurally impossible to
-- write an audit entry without having already passed authorization.
--
-- `occurred_at` has NO DEFAULT on purpose: every caller MUST pass an
-- already-resolved instant from the injected `Clock`
-- (`audit-log.ts`'s own `appendAuditEntry` never lets Postgres compute
-- `now()` for this column) — the same "compare/stamp through Clock, never a
-- bare wall-clock read" discipline `tenant-validity.ts`'s choke points
-- already established for a different column.
--
-- `actor_username` is denormalised beside the FK on purpose (design §3's own
-- table): the FK answers "who", the copy answers "what were they called at
-- the time" — a later username change must not rewrite history, the same
-- append-only property this migration's grants/trigger already enforce by
-- privilege.
CREATE TABLE audit_entries (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  actor_operator_id text NOT NULL REFERENCES operators(id),
  actor_username text NOT NULL,
  action text NOT NULL,
  target_tenant_id text,
  target_operator_id text REFERENCES operators(id),
  changes jsonb
);
CREATE INDEX audit_entries_tenant_idx ON audit_entries(target_tenant_id, occurred_at DESC);
CREATE INDEX audit_entries_actor_idx  ON audit_entries(actor_operator_id, occurred_at DESC);

-- LAYER 1: no UPDATE, no DELETE, ever, for the role `apps/admin` and the
-- bootstrap CLI both connect as. SELECT + INSERT is the full grant on the
-- TABLE — but `id bigserial` backs its default with a SEQUENCE, and a
-- sequence is a SEPARATE grantable object in Postgres: `GRANT INSERT ON
-- audit_entries` alone still leaves `nextval()` unusable to a non-owner
-- role. Caught for real, not assumed: `audit-entries.postgres.test.ts`'s own
-- "convite_admin CAN still insert" case failed with a REAL Postgres error
-- ("permission denied for sequence audit_entries_id_seq") before this GRANT
-- was added — the same "let the database prove it, don't just read the
-- migration" discipline every other adapter in this codebase already
-- follows. USAGE (not SELECT) is the minimum privilege `nextval()` needs.
GRANT SELECT, INSERT ON audit_entries TO convite_admin;
GRANT USAGE ON SEQUENCE audit_entries_id_seq TO convite_admin;

-- LAYER 2: fires regardless of who issues the UPDATE/DELETE, INCLUDING the
-- owner running this very migration file's own future sibling — table
-- ownership grants the PRIVILEGE to run the statement, but the trigger still
-- refuses to let it complete. `audit-entries.postgres.test.ts` (task 10.2)
-- proves both layers SEPARATELY: layer 1 against a `convite_admin`-role
-- connection (a privilege error, before the trigger is ever reached — a
-- privilege check happens before a trigger fires), layer 2 against the
-- OWNER connection (the trigger's own exception, since the owner's privilege
-- check trivially passes).
CREATE FUNCTION audit_entries_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_entries is append-only: % is not permitted on an existing row', TG_OP;
END;
$$;

CREATE TRIGGER audit_entries_no_update_or_delete
  BEFORE UPDATE OR DELETE ON audit_entries
  FOR EACH ROW EXECUTE FUNCTION audit_entries_forbid_mutation();
