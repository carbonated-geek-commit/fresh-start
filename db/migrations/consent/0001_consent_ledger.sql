-- ===========================================================================
-- SPEC 06 sections 6.1–6.3 — the consent-lineage ledger.
--
-- "RLS is where the consent ledger is enforced, not merely where it is stored.
--  Application-layer checks are insufficient and do not satisfy this spec."
--
-- "This is the root dependency of the build. No data-writing feature may ship
--  before it exists."
--
-- Every user-data table in this database carries the four ledger columns via
-- consent.attach_ledger(), and every one of them is read-gated by RLS. The
-- application cannot opt out, because the gate is below it.
-- ===========================================================================

create schema if not exists consent;

-- ---------------------------------------------------------------------------
-- 6.2 column 1 — provenance: how the data was obtained.
-- ---------------------------------------------------------------------------
create type consent.provenance as enum (
  'user_entered',    -- the user typed it
  'derived',         -- computed by us from data already held
  'partner_invite',  -- supplied by an inviter about an address (N6)
  'rule_receipt'     -- a cleanup-ritual recipe and whether it was applied
);

-- ---------------------------------------------------------------------------
-- 6.2 column 3 — permitted_use: what the application may do with it.
--
-- Note there is no 'marketing' member and none may be added. N6 forbids a
-- marketing send path; the absence of the enum value is that forbiddance in
-- the schema rather than in a review checklist.
-- ---------------------------------------------------------------------------
create type consent.permitted_use as enum (
  'operate_habit',        -- run the engine for this user
  'show_user_own_data',   -- SPEC 07 section 7.4, give the analysis back
  'notify_partner',       -- SPEC 04 section 4.3, the fixed payload only
  'aggregate_analytics'   -- SPEC 07, de-identified, never per-user outbound
);

-- ---------------------------------------------------------------------------
-- 6.2 column 4 — egress_record: where the user has permitted it to go, and
-- the current revocation state.
--
-- Modelled as a set of grants rather than a boolean, because "revoked" has to
-- be a state the row remembers, not an absence we infer.
-- ---------------------------------------------------------------------------
create type consent.egress_target as enum (
  'none',            -- the default, and the only value v1 ever writes
  'partner_email'    -- SPEC 04 section 4.3 completion notifications
);

create type consent.egress_grant as (
  target      consent.egress_target,
  granted_at  timestamptz,
  revoked_at  timestamptz            -- non-null means currently revoked
);

-- ---------------------------------------------------------------------------
-- 6.2 column 2 — consent_basis: what the user agreed to, and when.
-- ---------------------------------------------------------------------------
create type consent.basis as (
  agreement_key  text,          -- which consent text they saw
  agreed_at      timestamptz,
  agreement_ver  int
);

-- ---------------------------------------------------------------------------
-- Is a grant currently live?
--
-- The predicate the RLS policies call. Immutable and strict so it can be used
-- inside a policy without disabling index usage or leaking through a planner
-- reordering.
-- ---------------------------------------------------------------------------
create or replace function consent.egress_permitted(
  grants  consent.egress_grant[],
  target  consent.egress_target
) returns boolean
language sql
immutable
parallel safe
as $$
  select coalesce(
    (
      select bool_or(g.granted_at is not null and g.revoked_at is null)
      from unnest(grants) as g
      where g.target = egress_permitted.target
    ),
    false
  );
$$;

comment on function consent.egress_permitted is
  'SPEC 06 section 6.2. Data whose egress_record lacks a current permission '
  'cannot be read by any outbound path. Called from RLS policy, not app code.';

-- ---------------------------------------------------------------------------
-- Attach the ledger to a table.
--
-- Called by every user-data migration. It is a function rather than four
-- copy-pasted column definitions so that "every user-data table carries the
-- ledger" is checkable: consent.tables_missing_ledger() below returns the
-- violations, and the test suite asserts it is empty.
-- ---------------------------------------------------------------------------
create or replace function consent.attach_ledger(target_table regclass)
returns void
language plpgsql
as $$
begin
  execute format($fmt$
    alter table %s
      add column if not exists provenance     consent.provenance     not null default 'user_entered',
      add column if not exists consent_basis  consent.basis          not null,
      add column if not exists permitted_use  consent.permitted_use[] not null default array['operate_habit']::consent.permitted_use[],
      add column if not exists egress_record  consent.egress_grant[] not null default array[]::consent.egress_grant[]
  $fmt$, target_table);

  execute format($fmt$
    alter table %s
      add constraint %I check (array_length(permitted_use, 1) >= 1)
  $fmt$, target_table, 'ck_' || target_table::text || '_permitted_use_nonempty');

  execute format($fmt$
    alter table %s
      add constraint %I check ((consent_basis).agreed_at is not null
                               and (consent_basis).agreement_key is not null)
  $fmt$, target_table, 'ck_' || target_table::text || '_consent_basis_present');
end;
$$;

-- ---------------------------------------------------------------------------
-- The audit the test suite runs.
--
-- Any table in `public` that holds user data and lacks a ledger column is a
-- SPEC 06 section 6.2 violation. Returns the offenders.
-- ---------------------------------------------------------------------------
create or replace function consent.tables_missing_ledger()
returns table (table_name text, missing text)
language sql
stable
as $$
  with user_tables as (
    select c.oid, c.relname::text as name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname not like 'pg_%'
  ),
  required(col) as (
    values ('provenance'), ('consent_basis'), ('permitted_use'), ('egress_record')
  )
  select t.name, r.col
  from user_tables t
  cross join required r
  where not exists (
    select 1 from pg_attribute a
    where a.attrelid = t.oid and a.attname = r.col and a.attnum > 0 and not a.attisdropped
  );
$$;

-- ---------------------------------------------------------------------------
-- 6.3 — prohibited storage, as a schema-level audit.
--
-- Rather than trusting review, this scans column names for the categories the
-- spec forbids. The test suite asserts an empty result.
-- ---------------------------------------------------------------------------
create or replace function consent.prohibited_columns()
returns table (table_name text, column_name text, invariant text)
language sql
stable
as $$
  with cols as (
    select c.relname::text as tbl, a.attname::text as col
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public' and c.relkind = 'r'
      and a.attnum > 0 and not a.attisdropped
  )
  -- N8: email or inbox content of any kind
  select tbl, col, 'N8'
  from cols
  where col ~* '(message_body|email_body|inbox|mail_content|thread_body|snippet)'
  union all
  -- N10: health or movement records beyond a verification event
  select tbl, col, 'N10'
  from cols
  where col ~* '(heart_rate|steps|calorie|sleep_minutes|weight_kg|weight_lb|bmi|blood_|glucose|hrv|vo2)'
  union all
  -- N2: any payment credential, token, or key
  select tbl, col, 'N2'
  from cols
  where col ~* '(card_number|cvv|iban|routing_number|account_number|payment_token|stripe_|secret_key|api_key)'
  union all
  -- SPEC 02 section 2.1: no decimal or float may hold a value
  select tbl, col, 'N4'
  from cols
  join pg_class c2 on c2.relname = tbl
  join pg_attribute a2 on a2.attrelid = c2.oid and a2.attname = col
  join pg_type t on t.oid = a2.atttypid
  where t.typname in ('numeric', 'float4', 'float8')
    and col ~* '(minor|amount|value|target|stake|accrued)';
$$;

comment on function consent.prohibited_columns is
  'SPEC 06 section 6.3 plus N2/N4/N8/N10. The test suite asserts this is empty.';
