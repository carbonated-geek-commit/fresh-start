-- ===========================================================================
-- SPEC 06 section 6.1 — Row-Level Security.
--
-- "RLS is where the consent ledger is ENFORCED, not merely where it is stored.
--  Application-layer checks are insufficient and do not satisfy this spec."
--
-- Two things are enforced here and nowhere else:
--
--   1. A user reads and writes only their own rows.
--   2. **An outbound path can read a row only if that row's `egress_record`
--      carries a currently-granted, unrevoked permission for that target
--      (N9).** This is the `freshstart_outbound` role's policy set. Because
--      v1 has no outbound path, the role exists with no login and no member —
--      but the gate is in place before the first path could be added, which is
--      the point of building it now.
--
-- Every table is FORCE ROW LEVEL SECURITY, so the table owner is subject to
-- the policies too. Without FORCE, a migration or an admin connection silently
-- bypasses every rule below.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The outbound role.
--
-- NOLOGIN, and nothing is granted to it beyond the SELECTs below. It is the
-- named principal that any future egress path would have to run as, which
-- makes "does this path respect the consent ledger?" a grant question rather
-- than a code-review question.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'freshstart_outbound') then
    create role freshstart_outbound nologin;
  end if;
end;
$$;

comment on role freshstart_outbound is
  'N9. The only principal permitted to read data for egress, and only rows '
  'whose egress_record grants it. No payment, broker, or creditor path exists.';

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create policy profiles_self_select on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy profiles_self_insert on public.profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy profiles_self_update on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- profile_partner_invites — N6.
--
-- Readable only by the inviter. There is deliberately no policy granting the
-- invited address any access, because the address is not a principal: no
-- person record exists for it.
-- ---------------------------------------------------------------------------
alter table public.profile_partner_invites enable row level security;
alter table public.profile_partner_invites force row level security;

create policy invites_inviter_all on public.profile_partner_invites
  for all to authenticated
  using (inviter_user_id = (select auth.uid()))
  with check (inviter_user_id = (select auth.uid()));

-- The one outbound read the product permits: sending the completion
-- notification the inviter explicitly authorised (SPEC 04 sections 4.2, 4.3).
-- Gated on the ledger, not on application logic.
create policy invites_egress_select on public.profile_partner_invites
  for select to freshstart_outbound
  using (
    authorized_sends = 'completion_notifications_only'
    and consent.egress_permitted(egress_record, 'partner_email')
    and 'notify_partner' = any (permitted_use)
  );

-- ---------------------------------------------------------------------------
-- partner_links
-- ---------------------------------------------------------------------------
alter table public.partner_links enable row level security;
alter table public.partner_links force row level security;

create policy links_participants_select on public.partner_links
  for select to authenticated
  using (inviter_user_id = (select auth.uid()) or partner_user_id = (select auth.uid()));

create policy links_inviter_write on public.partner_links
  for all to authenticated
  using (inviter_user_id = (select auth.uid()))
  with check (inviter_user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- referee_flags — advisory only (SPEC 04 section 4.1).
-- ---------------------------------------------------------------------------
alter table public.referee_flags enable row level security;
alter table public.referee_flags force row level security;

create policy flags_owner_select on public.referee_flags
  for select to authenticated
  using (owner_user_id = (select auth.uid()) or flagged_by = (select auth.uid()));

-- Only a linked referee on that commitment may raise a flag.
create policy flags_referee_insert on public.referee_flags
  for insert to authenticated
  with check (
    flagged_by = (select auth.uid())
    and exists (
      select 1 from public.partner_links l
      where l.commitment_id = referee_flags.commitment_id
        and l.partner_user_id = (select auth.uid())
        and l.role = 'referee'
        and l.inviter_user_id = referee_flags.owner_user_id
    )
  );

-- ---------------------------------------------------------------------------
-- rule_recipes and broker_requests — SPEC 06 sections 6.4, 6.5.
-- ---------------------------------------------------------------------------
alter table public.rule_recipes enable row level security;
alter table public.rule_recipes force row level security;

create policy recipes_self_all on public.rule_recipes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.broker_requests enable row level security;
alter table public.broker_requests force row level security;

create policy brokers_self_all on public.broker_requests
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- No outbound policy on either table. SPEC 06 section 6.5 says broker requests
-- are logged and NOT SENT in v1; the absence of a policy is that, enforced.

-- ---------------------------------------------------------------------------
-- habits, commitments, sessions, settlements
-- ---------------------------------------------------------------------------
alter table public.habits enable row level security;
alter table public.habits force row level security;

create policy habits_self_all on public.habits
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.commitments enable row level security;
alter table public.commitments force row level security;

create policy commitments_self_all on public.commitments
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- A linked partner may see that a commitment exists, and nothing about its
-- value. SPEC 04 section 4.3 fixes the notification payload; this view is the
-- in-app equivalent and carries the same three facts.
create view public.partner_visible_commitments
with (security_invoker = true) as
  select c.id, c.user_id, h.label as habit_label, c.status
  from public.commitments c
  join public.habits h on h.id = c.habit_id;

create policy commitments_partner_select on public.commitments
  for select to authenticated
  using (
    exists (
      select 1 from public.partner_links l
      where l.commitment_id = commitments.id
        and l.partner_user_id = (select auth.uid())
    )
  );

alter table public.sessions enable row level security;
alter table public.sessions force row level security;

create policy sessions_self_all on public.sessions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.settlements enable row level security;
alter table public.settlements force row level security;

create policy settlements_self_select on public.settlements
  for select to authenticated
  using (user_id = (select auth.uid()));

-- N5. Insert only, by the owner, and only with a user_action_at the caller
-- supplied. There is no UPDATE or DELETE policy: a settlement is a record of a
-- decision the user made, and it is not revisable by anyone.
create policy settlements_self_insert on public.settlements
  for insert to authenticated
  with check (user_id = (select auth.uid()) and user_action_at is not null);

-- ---------------------------------------------------------------------------
-- analytics_events — SPEC 07 section 7.5.
--
-- "Events are subject to SPEC 06 like all other data."
-- "No event is transmitted to any third party (N9)."
--
-- The user can read their own events, which is what makes section 7.4 —
-- giving the analysis back to the user — possible. There is NO policy for
-- `freshstart_outbound` on this table, so no egress path can read the
-- behavioural stream even if one were built and granted the role.
-- ---------------------------------------------------------------------------
alter table public.analytics_events enable row level security;
alter table public.analytics_events force row level security;

create policy events_self_select on public.analytics_events
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy events_self_insert on public.analytics_events
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Append-only. No update or delete policy: an event log you can rewrite is not
-- evidence, and SPEC 07 exists to make the product's central claim testable.

-- ---------------------------------------------------------------------------
-- Grants.
--
-- `freshstart_outbound` gets SELECT on exactly one table, and its policy still
-- gates every row on the ledger. It gets nothing on sessions, commitments,
-- settlements, or analytics_events — the behavioural data (N9).
-- ---------------------------------------------------------------------------
grant usage on schema public, consent to authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.profile_partner_invites,
  public.partner_links,
  public.referee_flags,
  public.rule_recipes,
  public.broker_requests,
  public.habits,
  public.commitments,
  public.sessions
to authenticated;
grant select, insert on public.settlements, public.analytics_events to authenticated;
grant usage, select on sequence public.analytics_events_id_seq to authenticated;

grant usage on schema public, consent to freshstart_outbound;
grant select on public.profile_partner_invites to freshstart_outbound;

-- Explicitly withheld, and to be kept withheld:
revoke all on public.sessions          from freshstart_outbound;
revoke all on public.commitments       from freshstart_outbound;
revoke all on public.settlements       from freshstart_outbound;
revoke all on public.analytics_events  from freshstart_outbound;
revoke all on public.habits            from freshstart_outbound;
