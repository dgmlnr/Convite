-- design §2.2/§3, tenant-administration slice 5: the paid validity window.
-- `timestamptz`, not `date` — an INSTANT, compared through the injected
-- `Clock` port (never `now()` inside application logic), not a naive local
-- day that would throw away the Buenos Aires interpretation the whole
-- half-open-window design exists to make exact (see
-- `packages/platform-core/src/tenant-validity.ts`).
--
-- `tenants_window_ordered` is DEFENSE IN DEPTH, not the primary enforcer:
-- `TenantAdminRepository.setValidityWindow` (both adapters) rejects an
-- inverted window with `{ ok: false, reason: "invalid-window" }` before ever
-- reaching this statement, the same "validate first, let the constraint
-- backstop it" shape migration 001's `embed_key UNIQUE` uses for the
-- uniqueness invariant. Unlike that invariant, window ordering has no
-- concurrency dimension (it compares only the two values in ONE call), so
-- there is no TOCTOU race here to close — this constraint exists purely to
-- catch a write that reaches the table through any OTHER path (a future
-- direct-SQL script, a bug in a later migration), the same role
-- `no-admin-internals-outside-admin` plays for the audit boundary elsewhere
-- in this design.
ALTER TABLE tenants
  ADD COLUMN valid_from timestamptz,
  ADD COLUMN valid_until timestamptz,
  ADD CONSTRAINT tenants_window_ordered
    CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_from < valid_until);
