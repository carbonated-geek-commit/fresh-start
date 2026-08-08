-- ===========================================================================
-- Q15 — RLS for push subscriptions, and the dispatcher's role.
--
-- The dispatcher has to run across all users: it wakes at a fixed cadence and
-- asks "whose cue time is now?". That is precisely the kind of cross-user read
-- the rest of this schema forbids, so it gets its own role with the narrowest
-- possible view.
--
-- **`freshstart_nudger` can see scheduling metadata and nothing else.** Not a
-- habit, not a session, not a commitment, not an event. It learns *when* to
-- tickle a browser and *where* to send it. Because the tickle is contentless
-- and the service worker fetches the actual cue with the user's own session,
-- that is genuinely all it needs — which is the property that keeps N9 true
-- with a cross-user job in the system.
-- ===========================================================================

alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;

-- The owner manages their own subscriptions.
create policy push_self_all on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'freshstart_nudger') then
    create role freshstart_nudger nologin;
  end if;
end;
$$;

comment on role freshstart_nudger is
  'Q15. Sends contentless push tickles. Can read cue times and push endpoints '
  'and nothing else. Never grant it habits, sessions, commitments, or events.';

-- ---------------------------------------------------------------------------
-- The dispatcher's entire world.
--
-- `security_invoker = false` so the view runs with its owner's rights and the
-- nudger needs no grant on the underlying tables — it cannot go around the
-- view to reach the columns the view leaves out.
-- ---------------------------------------------------------------------------
create view public.nudge_targets
with (security_invoker = false) as
  select
    s.id            as subscription_id,
    s.user_id,
    s.endpoint,
    s.p256dh,
    s.auth,
    p.time_zone,
    p.morning_cue,
    p.evening_check
  from public.push_subscriptions s
  join public.profiles p on p.user_id = s.user_id
  where s.expired_at is null
    and consent.egress_permitted(s.egress_record, 'push_endpoint');

comment on view public.nudge_targets is
  'Scheduling metadata only. Deliberately carries no habit, session, or '
  'commitment column — the tickle is contentless, so the dispatcher does not '
  'need to know what the cue says.';

grant usage on schema public, consent to freshstart_nudger;
grant select on public.nudge_targets to freshstart_nudger;
-- The dispatcher marks dead endpoints so they stop being retried. That is the
-- only write it can make, and it can only reach the one column.
grant update (expired_at) on public.push_subscriptions to freshstart_nudger;

create policy push_nudger_expire on public.push_subscriptions
  for update to freshstart_nudger
  using (true)
  with check (true);

-- Explicitly withheld, and to be kept withheld. The behavioural tables.
revoke all on public.sessions          from freshstart_nudger;
revoke all on public.commitments       from freshstart_nudger;
revoke all on public.habits            from freshstart_nudger;
revoke all on public.settlements       from freshstart_nudger;
revoke all on public.analytics_events  from freshstart_nudger;

grant select, insert, update, delete on public.push_subscriptions to authenticated;
