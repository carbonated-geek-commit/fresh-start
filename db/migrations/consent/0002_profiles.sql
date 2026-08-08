-- ===========================================================================
-- SPEC 04 section 4.2 / N6 — profiles, and the invitee data model.
--
-- "Before the invitee opts in: the email is stored as an ATTRIBUTE ON THE
--  INVITING USER'S PROFILE. No person record, no user row, no identity is
--  created for the invitee."
--
-- The shape below is that sentence in DDL. `profile_partner_invites` is keyed
-- on the inviter and cascades from the inviter's profile: it is owned by the
-- inviter's row, not by the person invited. It has no id for the invitee, no
-- name, no marketing flag, and no last-contacted timestamp — nothing that
-- would make it a profile of anyone. Unlinking is a DELETE, so the address is
-- gone from our side rather than soft-hidden.
-- ===========================================================================

create table public.profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null check (length(trim(display_name)) between 1 and 80),
  time_zone     text not null default 'UTC',
  -- SPEC 05 section 5.3: nudge times are user-configurable; the nudges are not
  -- a preference, so there is no boolean here to switch them off.
  morning_cue   time not null default '07:00',
  evening_check time not null default '20:00',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

select consent.attach_ledger('public.profiles');

-- ---------------------------------------------------------------------------
-- N6. An attribute of the inviter's profile.
--
-- Deliberately absent, and to be kept absent:
--   * any invitee user id or person id
--   * any name, avatar, or demographic field
--   * any marketing-consent column
--   * any "last emailed" or engagement column
-- ---------------------------------------------------------------------------
create type public.partner_role as enum ('witness', 'referee');

create table public.profile_partner_invites (
  id                 uuid primary key default gen_random_uuid(),
  -- The owner of this row. It belongs to the inviter's profile.
  inviter_user_id    uuid not null references public.profiles(user_id) on delete cascade,
  commitment_id      uuid not null,
  invitee_email      text not null check (invitee_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$'),
  role               public.partner_role not null,
  invited_at         timestamptz not null default now(),
  -- SPEC 04 section 4.2: sends are limited to what the inviter authorised.
  -- One value, and no enum member that would permit anything else.
  authorized_sends   text not null default 'completion_notifications_only'
                     check (authorized_sends = 'completion_notifications_only'),
  unique (inviter_user_id, commitment_id, invitee_email)
);

select consent.attach_ledger('public.profile_partner_invites');

comment on table public.profile_partner_invites is
  'N6. An attribute of the inviter''s profile, not a person record. Never add '
  'an invitee identifier, a name, or a marketing column to this table.';

-- ---------------------------------------------------------------------------
-- After opt-in, a normal user record and a link (SPEC 04 section 4.2).
-- ---------------------------------------------------------------------------
create table public.partner_links (
  id                uuid primary key default gen_random_uuid(),
  inviter_user_id   uuid not null references public.profiles(user_id) on delete cascade,
  partner_user_id   uuid not null references public.profiles(user_id) on delete cascade,
  commitment_id     uuid not null,
  role              public.partner_role not null,
  linked_at         timestamptz not null default now(),
  check (inviter_user_id <> partner_user_id),
  unique (inviter_user_id, partner_user_id, commitment_id)
);

select consent.attach_ledger('public.partner_links');

-- ---------------------------------------------------------------------------
-- SPEC 04 section 4.1 — referee flags. Advisory only in v1.
--
-- No column here feeds accrual or settlement, and no trigger reads this table.
-- That is what "advisory" means structurally.
-- ---------------------------------------------------------------------------
create table public.referee_flags (
  id             uuid primary key default gen_random_uuid(),
  commitment_id  uuid not null,
  owner_user_id  uuid not null references public.profiles(user_id) on delete cascade,
  flagged_by     uuid not null references public.profiles(user_id) on delete cascade,
  for_date       date not null,
  flagged_at     timestamptz not null default now(),
  unique (commitment_id, flagged_by, for_date)
);

select consent.attach_ledger('public.referee_flags');

-- ---------------------------------------------------------------------------
-- SPEC 06 sections 6.4 and 6.5 — the cleanup ritual's storage.
--
-- "Stored: the recommended rule recipe, and whether the user applied it.
--  Nothing else."
--
-- There is no column for a mailbox, a sender list, a message, or an OAuth
-- token. The application never connects to a mailbox (N8), and this table is
-- where that would have to show up if it did.
-- ---------------------------------------------------------------------------
create table public.rule_recipes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(user_id) on delete cascade,
  recipe_key     text not null,
  provider       text not null,
  applied        boolean not null default false,
  noted_at       timestamptz not null default now(),
  unique (user_id, recipe_key)
);

select consent.attach_ledger('public.rule_recipes');

-- SPEC 06 section 6.5. Logged as intended, never sent. No broker credential
-- exists, and there is no column here that could hold one.
create table public.broker_requests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(user_id) on delete cascade,
  broker_name    text not null,
  status         text not null default 'intended' check (status in ('intended', 'user_sent')),
  noted_at       timestamptz not null default now(),
  unique (user_id, broker_name)
);

select consent.attach_ledger('public.broker_requests');
