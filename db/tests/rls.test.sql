-- ===========================================================================
-- Data-spine test suite.
--
-- Covers the acceptance criteria that cannot be tested from TypeScript,
-- because the thing under test is the database's own enforcement:
--
--   T01 — "A test proves an application-layer bypass of the RLS policy fails."
--   T01 — every user-data table carries the four ledger columns.
--   T01 — data whose egress_record lacks a current permission cannot be read
--         by any outbound path.
--   T01 — no schema field for email content, health records, or payment creds.
--   T03 — the destination enum contains user and charity only; a migration
--         adding a company destination fails.
--   T03 — all value columns are integer minor units.
--   T03 — window_days is immutable after creation.
--
-- Run with:  psql -v ON_ERROR_STOP=1 -f db/tests/rls.test.sql
-- Every assertion raises on failure, so a clean run is the pass condition.
-- ===========================================================================

\set ON_ERROR_STOP on

begin;

create or replace function assert(condition boolean, description text)
returns void language plpgsql as $$
begin
  if not condition then
    raise exception 'FAIL: %', description;
  end if;
  raise notice 'ok  — %', description;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: two users who must not be able to see each other.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alex@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'sam@example.test');

set local role postgres;

insert into public.profiles (user_id, display_name, consent_basis)
values
  ('11111111-1111-1111-1111-111111111111', 'Alex', row('tos.v1', now(), 1)::consent.basis),
  ('22222222-2222-2222-2222-222222222222', 'Sam',  row('tos.v1', now(), 1)::consent.basis);

insert into public.habits (id, user_id, label, size_class, consent_basis)
values (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'At gym by 5:30', 'small', row('tos.v1', now(), 1)::consent.basis
);

insert into public.commitments (id, user_id, habit_id, window_start, status, consent_basis)
values (
  '44444444-4444-4444-4444-444444444444',
  '11111111-1111-1111-1111-111111111111',
  '33333333-3333-3333-3333-333333333333',
  current_date, 'active', row('tos.v1', now(), 1)::consent.basis
);

-- ===========================================================================
-- T01 — every user-data table carries the consent ledger (SPEC 06 §6.2)
-- ===========================================================================
select assert(
  (select count(*) from consent.tables_missing_ledger()) = 0,
  'SPEC 06 §6.2 — every public table carries provenance, consent_basis, permitted_use, egress_record'
);

-- ===========================================================================
-- T01 — no prohibited storage (SPEC 06 §6.3, N2/N4/N8/N10)
-- ===========================================================================
select assert(
  (select count(*) from consent.prohibited_columns()) = 0,
  'SPEC 06 §6.3 — no email content, health record, payment credential, or float value column'
);

-- ===========================================================================
-- T01 — an application-layer bypass of RLS fails
--
-- Sam authenticates and asks for everything. The application layer is not
-- consulted; the query is raw. RLS must return zero of Alex's rows.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select assert(
  (select count(*) from public.habits where user_id = '11111111-1111-1111-1111-111111111111') = 0,
  'T01 — a raw SELECT bypassing the app layer returns none of another user''s habits'
);

select assert(
  (select count(*) from public.commitments) = 0,
  'T01 — a raw SELECT returns none of another user''s commitments'
);

-- ... and cannot write into someone else's account either.
do $$
begin
  begin
    insert into public.sessions (commitment_id, user_id, for_date, completed, consent_basis)
    values ('44444444-4444-4444-4444-444444444444',
            '11111111-1111-1111-1111-111111111111',
            current_date, true, row('tos.v1', now(), 1)::consent.basis);
    raise exception 'FAIL: RLS allowed a cross-user INSERT';
  exception
    when insufficient_privilege then
      raise notice 'ok  — T01: a cross-user INSERT is refused by RLS';
    when others then
      if sqlstate = 'P0001' and sqlerrm like 'FAIL:%' then raise; end if;
      raise notice 'ok  — T01: a cross-user INSERT is refused (%)', sqlstate;
  end;
end;
$$;

-- The owner still sees their own row — the policy restricts, it does not break.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select assert(
  (select count(*) from public.commitments) = 1,
  'T01 — the owner reads their own commitment'
);

-- ===========================================================================
-- T01 — egress is gated on the ledger, not on application code (N9)
-- ===========================================================================
set local role postgres;

insert into public.profile_partner_invites
  (inviter_user_id, commitment_id, invitee_email, role, consent_basis, permitted_use, egress_record)
values
  -- Granted: the inviter authorised partner notifications.
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444',
   'granted@example.test', 'witness',
   row('partner.v1', now(), 1)::consent.basis,
   array['operate_habit', 'notify_partner']::consent.permitted_use[],
   array[row('partner_email', now(), null)::consent.egress_grant]),
  -- Revoked: the same grant, since withdrawn.
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444',
   'revoked@example.test', 'witness',
   row('partner.v1', now(), 1)::consent.basis,
   array['operate_habit', 'notify_partner']::consent.permitted_use[],
   array[row('partner_email', now() - interval '1 day', now())::consent.egress_grant]),
  -- Never granted.
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444',
   'ungranted@example.test', 'witness',
   row('partner.v1', now(), 1)::consent.basis,
   array['operate_habit']::consent.permitted_use[],
   array[]::consent.egress_grant[]);

set local role freshstart_outbound;

select assert(
  (select count(*) from public.profile_partner_invites) = 1,
  'N9 — the outbound role reads only the row with a live egress grant'
);

select assert(
  (select invitee_email from public.profile_partner_invites) = 'granted@example.test',
  'N9 — the revoked and never-granted rows are invisible to the outbound path'
);

-- The behavioural stream is not readable by the outbound role at all.
do $$
begin
  begin
    perform 1 from public.analytics_events;
    raise exception 'FAIL: the outbound role could read analytics_events';
  exception
    when insufficient_privilege then
      raise notice 'ok  — N9: the outbound role has no access to the event stream';
    when others then
      if sqlstate = 'P0001' and sqlerrm like 'FAIL:%' then raise; end if;
      raise notice 'ok  — N9: the outbound role has no access to the event stream (%)', sqlstate;
  end;
end;
$$;

set local role postgres;

-- ===========================================================================
-- T03 — the destination enum has no company value (N1)
-- ===========================================================================
select assert(
  (select array_agg(enumlabel::text order by enumsortorder)
   from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'settlement_destination') = array['user', 'charity'],
  'N1 — settlement_destination is exactly {user, charity}'
);

do $$
begin
  begin
    insert into public.settlements
      (commitment_id, user_id, accrued_minor, target_minor, destination, user_action_at, consent_basis)
    values ('44444444-4444-4444-4444-444444444444',
            '11111111-1111-1111-1111-111111111111',
            5000, 10000, 'company', now(), row('tos.v1', now(), 1)::consent.basis);
    raise exception 'FAIL: a company destination was accepted';
  exception
    when invalid_text_representation then
      raise notice 'ok  — N1: a company destination is rejected by the type system';
    when others then
      if sqlstate = 'P0001' and sqlerrm like 'FAIL:%' then raise; end if;
      raise notice 'ok  — N1: a company destination is rejected (%)', sqlstate;
  end;
end;
$$;

-- ===========================================================================
-- T03 — all value columns are integer minor units (SPEC 02 §2.1)
-- ===========================================================================
select assert(
  (select count(*)
   from information_schema.columns
   where table_schema = 'public'
     and data_type in ('numeric', 'real', 'double precision')) = 0,
  'SPEC 02 §2.1 — no numeric, real, or double column exists anywhere in public'
);

-- ===========================================================================
-- T03 — window_days is immutable after creation (SPEC 01 §1.2)
-- ===========================================================================
do $$
begin
  begin
    update public.commitments set window_days = 45
    where id = '44444444-4444-4444-4444-444444444444';
    raise exception 'FAIL: window_days was mutable';
  exception
    when others then
      if sqlstate = 'P0001' and sqlerrm like 'FAIL:%' then raise; end if;
      raise notice 'ok  — SPEC 01 §1.2: window_days is immutable after creation';
  end;
end;
$$;

-- Ramp parameters freeze once the commitment leaves draft (N3, N4).
do $$
begin
  begin
    update public.commitments set stake_target_minor = 999999
    where id = '44444444-4444-4444-4444-444444444444';
    raise exception 'FAIL: the stake target was mutable on an active commitment';
  exception
    when others then
      if sqlstate = 'P0001' and sqlerrm like 'FAIL:%' then raise; end if;
      raise notice 'ok  — N3/N4: ramp parameters are frozen once active';
  end;
end;
$$;

-- The shortfall destination stays changeable up to settlement (SPEC 01 §1.5).
update public.commitments set shortfall_destination = 'charity'
where id = '44444444-4444-4444-4444-444444444444';
select assert(
  (select shortfall_destination from public.commitments
   where id = '44444444-4444-4444-4444-444444444444') = 'charity',
  'SPEC 01 §1.5 — the shortfall destination is changeable until settlement'
);

-- ===========================================================================
-- N5 — a settlement cannot exist without a user action
-- ===========================================================================
select assert(
  (select is_nullable from information_schema.columns
   where table_schema = 'public' and table_name = 'settlements'
     and column_name = 'user_action_at') = 'NO',
  'N5 — settlements.user_action_at is NOT NULL'
);

select assert(
  (select column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'settlements'
     and column_name = 'user_action_at') is null,
  'N5 — settlements.user_action_at has no default, so no job can create one'
);

-- ===========================================================================
-- SPEC 01 §1.7 — the five-habit ceiling is enforced by the database
-- ===========================================================================
do $$
declare
  i int;
begin
  for i in 1..4 loop
    insert into public.habits (user_id, label, size_class, consent_basis)
    values ('11111111-1111-1111-1111-111111111111',
            'Filler ' || i, 'small', row('tos.v1', now(), 1)::consent.basis);
    insert into public.commitments (user_id, habit_id, window_start, status, consent_basis)
    values ('11111111-1111-1111-1111-111111111111',
            (select id from public.habits where label = 'Filler ' || i),
            current_date, 'active', row('tos.v1', now(), 1)::consent.basis);
  end loop;

  begin
    insert into public.habits (user_id, label, size_class, consent_basis)
    values ('11111111-1111-1111-1111-111111111111',
            'One too many', 'small', row('tos.v1', now(), 1)::consent.basis);
    insert into public.commitments (user_id, habit_id, window_start, status, consent_basis)
    values ('11111111-1111-1111-1111-111111111111',
            (select id from public.habits where label = 'One too many'),
            current_date, 'active', row('tos.v1', now(), 1)::consent.basis);
    raise exception 'FAIL: a sixth concurrent commitment was accepted';
  exception
    when others then
      if sqlstate = 'P0001' and sqlerrm like 'FAIL:%' then raise; end if;
      raise notice 'ok  — SPEC 01 §1.7: the sixth concurrent commitment is refused';
  end;
end;
$$;

-- ===========================================================================
-- SPEC 07 §7.5 — an event carrying free-text user content is refused
-- ===========================================================================
do $$
begin
  begin
    insert into public.analytics_events (user_id, commitment_id, name, occurred_at, payload, consent_basis)
    values ('11111111-1111-1111-1111-111111111111',
            '44444444-4444-4444-4444-444444444444',
            'session_logged', now(),
            '{"for_date":"2026-08-07","note":"felt rough today"}'::jsonb,
            row('tos.v1', now(), 1)::consent.basis);
    raise exception 'FAIL: an event carrying a free-text note was stored';
  exception
    when check_violation then
      raise notice 'ok  — SPEC 07 §7.5: an event carrying a note is refused';
    when others then
      if sqlstate = 'P0001' and sqlerrm like 'FAIL:%' then raise; end if;
      raise notice 'ok  — SPEC 07 §7.5: an event carrying a note is refused (%)', sqlstate;
  end;
end;
$$;

-- ===========================================================================
-- Q15 — the dispatcher role sees scheduling metadata and nothing else
-- ===========================================================================
set local role postgres;

insert into public.push_subscriptions
  (user_id, endpoint, p256dh, auth, consent_basis, egress_record)
values
  ('11111111-1111-1111-1111-111111111111',
   'https://push.example.test/live', 'p256dh-live', 'auth-live',
   row('push.v1', now(), 1)::consent.basis,
   array[row('push_endpoint', now(), null)::consent.egress_grant]),
  -- Revoked: the user turned notifications off. Must vanish from the view.
  ('11111111-1111-1111-1111-111111111111',
   'https://push.example.test/revoked', 'p256dh-rev', 'auth-rev',
   row('push.v1', now(), 1)::consent.basis,
   array[row('push_endpoint', now() - interval '1 day', now())::consent.egress_grant]);

set local role freshstart_nudger;

select assert(
  (select count(*) from public.nudge_targets) = 1,
  'Q15 — the dispatcher sees only the subscription with a live egress grant'
);

select assert(
  (select endpoint from public.nudge_targets) = 'https://push.example.test/live',
  'Q15 — a revoked push subscription is invisible to the dispatcher'
);

-- The view carries scheduling metadata only. A habit or session column here
-- would put behavioural data in the dispatcher's hands (N9).
select assert(
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'nudge_targets'
     and column_name ~* '(habit|session|commitment|accrued|streak|label|note)') = 0,
  'Q15 — nudge_targets exposes no habit, session, or commitment column'
);

do $$
begin
  begin
    perform 1 from public.sessions;
    raise exception 'FAIL: the nudger could read sessions';
  exception
    when insufficient_privilege then
      raise notice 'ok  — Q15/N9: the dispatcher has no access to sessions';
    when others then
      if sqlstate = 'P0001' and sqlerrm like 'FAIL:%' then raise; end if;
      raise notice 'ok  — Q15/N9: the dispatcher has no access to sessions (%)', sqlstate;
  end;
end;
$$;

do $$
begin
  begin
    perform 1 from public.analytics_events;
    raise exception 'FAIL: the nudger could read the event stream';
  exception
    when insufficient_privilege then
      raise notice 'ok  — Q15/N9: the dispatcher has no access to the event stream';
    when others then
      if sqlstate = 'P0001' and sqlerrm like 'FAIL:%' then raise; end if;
      raise notice 'ok  — Q15/N9: the dispatcher has no access to the event stream (%)', sqlstate;
  end;
end;
$$;

set local role postgres;

rollback;
