-- ===========================================================================
-- Q15 — push subscriptions for the two daily nudges (SPEC 05 section 5.3).
--
-- CLAUDE.md section 4 approves a push notification service. This is the only
-- table it needs.
--
-- **The push payload carries nothing.** The tickle wakes the service worker,
-- which fetches the cue from this server using the user's own session and
-- builds the notification locally. So the dispatcher never needs to know which
-- habit is due, or whether anything was logged — it needs only *when* to
-- tickle and *where* to send it.
--
-- That is what makes the `freshstart_nudger` role in db/policies/0002 safe:
-- the scheduling metadata below is all it can see, and behavioural data never
-- crosses the RLS boundary for it (N9).
-- ===========================================================================

create table public.push_subscriptions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(user_id) on delete cascade,
  -- The push service URL. A third-party endpoint, and the reason this table
  -- carries an egress grant at all.
  endpoint       text not null unique,
  -- RFC 8291 client keys. The push service cannot decrypt with these; only the
  -- subscribing browser can. Not a credential of ours.
  p256dh         text not null,
  auth           text not null,
  user_agent     text,
  created_at     timestamptz not null default now(),
  -- Set when the push service reports the subscription is gone (404/410), so a
  -- dead endpoint stops being retried.
  expired_at     timestamptz
);

select consent.attach_ledger('public.push_subscriptions');

comment on table public.push_subscriptions is
  'Q15. Contentless push only. The tickle carries no payload; the service '
  'worker fetches the cue with the user session. Never add a column that '
  'would let a habit label or session state reach the dispatcher.';

create index idx_push_live on public.push_subscriptions (user_id) where expired_at is null;

-- ---------------------------------------------------------------------------
-- The egress target for a push endpoint.
--
-- Added to the enum rather than reused, so `consent.egress_permitted` can
-- distinguish "may notify a partner by email" from "may wake this browser".
-- ---------------------------------------------------------------------------
alter type consent.egress_target add value if not exists 'push_endpoint';
