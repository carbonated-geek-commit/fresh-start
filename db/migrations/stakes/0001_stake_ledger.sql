-- ===========================================================================
-- SPEC 01 section 1.2 and SPEC 04 section 4.4 — the stake ledger.
--
-- Every value column is `bigint`, in integer minor units (SPEC 02 section 2.1
-- / CLAUDE.md section 10). There is no numeric, decimal, real, or double
-- column anywhere in this file, and consent.prohibited_columns() fails the
-- build if one appears.
--
-- Dollar-shaped, points-displayed: `stake_kind` exists so SPEC 07 section 7.2
-- can record it and the points-versus-currency comparison is computable later.
-- v1 only ever writes 'points'. No payment rail, no credential (N2).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- N1, structurally.
--
-- Two members. There is no company destination and none may be added: a
-- company member here is the only way company revenue could depend on a user
-- failing, so its absence is the invariant.
-- ---------------------------------------------------------------------------
create type public.settlement_destination as enum ('user', 'charity');

comment on type public.settlement_destination is
  'N1. user and charity only. Adding a company member would make company '
  'revenue depend on a user failing. Do not add one, including for testing.';

create type public.commitment_mode as enum ('streak', 'consistency');

create type public.commitment_status as enum (
  'draft', 'active', 'awaiting_settlement', 'settled', 'abandoned'
);

create type public.size_class as enum ('small', 'medium', 'large', 'x_large');

create type public.stake_kind as enum ('points', 'currency');

-- ---------------------------------------------------------------------------
-- Habits. A repeatable behaviour (SPEC 01 section 1.1).
-- ---------------------------------------------------------------------------
create table public.habits (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(user_id) on delete cascade,
  label               text not null check (length(trim(label)) between 1 and 120),
  size_class          public.size_class not null,
  -- SPEC 03 section 3.2: the outcome stays visible as the "why". Free text,
  -- never staked, never scored — and nothing joins to it.
  motivating_outcome  text check (motivating_outcome is null or length(motivating_outcome) <= 400),
  domain              text not null default 'health',
  created_at          timestamptz not null default now(),
  archived_at         timestamptz
);

select consent.attach_ledger('public.habits');

-- ---------------------------------------------------------------------------
-- Commitments. SPEC 01 section 1.2, every field with its stated default.
-- ---------------------------------------------------------------------------
create table public.commitments (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references public.profiles(user_id) on delete cascade,
  habit_id                uuid not null references public.habits(id) on delete cascade,

  mode                    public.commitment_mode not null default 'streak',
  -- User-configurable, default 12, minimum 3 (SPEC 01 section 1.2).
  streak_target           int not null default 12 check (streak_target between 3 and 60),
  -- Default 30. Immutable after creation — enforced by trigger below.
  window_days             int not null default 30 check (window_days between 1 and 366),
  -- Integer minor units. v1 = points.
  stake_target_minor      bigint not null default 10000 check (stake_target_minor > 0),
  stake_kind              public.stake_kind not null default 'points',
  -- streak mode only; 0 or 1 (SPEC 01 section 1.2).
  grace_days              int not null default 0 check (grace_days in (0, 1)),
  -- The ramp's base ratio, held exactly as a rational. Never a float.
  base_ratio_num          int not null default 1 check (base_ratio_num > 0),
  base_ratio_den          int not null default 20 check (base_ratio_den > 0),

  success_destination     public.settlement_destination not null default 'user',
  -- Chosen at creation, changeable until settlement (SPEC 01 section 1.2).
  shortfall_destination   public.settlement_destination not null default 'user',

  status                  public.commitment_status not null default 'draft',
  window_start            date not null,
  created_at              timestamptz not null default now(),

  -- SPEC 01 section 1.2: grace days are streak mode only.
  constraint ck_grace_streak_only
    check (mode = 'streak' or grace_days = 0)
);

select consent.attach_ledger('public.commitments');

create index idx_commitments_user_active
  on public.commitments (user_id, status)
  where status in ('draft', 'active', 'awaiting_settlement');

-- ---------------------------------------------------------------------------
-- SPEC 01 section 1.2: "window_days is immutable after creation."
--
-- A constraint cannot express "may not change", so this is a trigger. It also
-- freezes the fields the ramp is derived from once a commitment is active —
-- changing the target mid-window would silently rewrite value already earned,
-- which is an N3 hazard.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_commitment_immutability()
returns trigger
language plpgsql
as $$
begin
  if new.window_days is distinct from old.window_days then
    raise exception 'window_days is immutable after creation (SPEC 01 section 1.2)';
  end if;
  if new.window_start is distinct from old.window_start then
    raise exception 'window_start is immutable after creation (SPEC 01 section 1.2)';
  end if;

  if old.status <> 'draft' then
    if new.stake_target_minor is distinct from old.stake_target_minor
       or new.streak_target is distinct from old.streak_target
       or new.mode is distinct from old.mode
       or new.grace_days is distinct from old.grace_days
       or new.base_ratio_num is distinct from old.base_ratio_num
       or new.base_ratio_den is distinct from old.base_ratio_den then
      raise exception 'ramp parameters are frozen once a commitment leaves draft (N3, N4)';
    end if;
  end if;

  -- SPEC 01 section 1.5: the shortfall destination stays changeable right up
  -- to settlement. This is the one field that must remain editable.
  if old.status = 'settled'
     and new.shortfall_destination is distinct from old.shortfall_destination then
    raise exception 'settlement is already resolved';
  end if;

  return new;
end;
$$;

create trigger trg_commitment_immutability
  before update on public.commitments
  for each row execute function public.enforce_commitment_immutability();

-- ---------------------------------------------------------------------------
-- SPEC 01 section 1.7 — up to 5 concurrent commitments.
--
-- The ceiling is also enforced in `assertStakeable`, but a limit that lives
-- only in application code is a limit one forgotten call site removes.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_habit_ceiling()
returns trigger
language plpgsql
as $$
declare
  live_count int;
begin
  select count(*) into live_count
  from public.commitments
  where user_id = new.user_id
    and status in ('draft', 'active', 'awaiting_settlement')
    and id <> new.id;

  if live_count >= 5 then
    raise exception 'a user may hold at most 5 concurrent commitments (SPEC 01 section 1.7)';
  end if;
  return new;
end;
$$;

create trigger trg_habit_ceiling
  before insert on public.commitments
  for each row execute function public.enforce_habit_ceiling();

-- ---------------------------------------------------------------------------
-- Sessions. SPEC 05 section 5.1.
--
-- `for_date` and `logged_at` are separate columns of different types, so they
-- cannot be conflated by accident.
-- ---------------------------------------------------------------------------
create table public.sessions (
  id             uuid primary key default gen_random_uuid(),
  commitment_id  uuid not null references public.commitments(id) on delete cascade,
  user_id        uuid not null references public.profiles(user_id) on delete cascade,
  -- The calendar day the behaviour was performed, in the user's own zone.
  for_date       date not null,
  -- The server instant of the log action.
  logged_at      timestamptz not null default now(),
  completed      boolean not null,
  -- SPEC 05 section 5.1: optional, one line. Never enters an analytics event.
  note           text check (note is null or length(note) <= 280),
  unique (commitment_id, for_date)
);

select consent.attach_ledger('public.sessions');

create index idx_sessions_commitment_date on public.sessions (commitment_id, for_date);

-- ---------------------------------------------------------------------------
-- Settlements. SPEC 01 section 1.5 and SPEC 04 section 4.4.
--
-- `user_action_at` is NOT NULL with no default. That is N5 in the schema: a
-- row cannot exist without an instant the user acted, so there is no way for a
-- scheduled job to create one.
-- ---------------------------------------------------------------------------
create table public.settlements (
  id               uuid primary key default gen_random_uuid(),
  commitment_id    uuid not null unique references public.commitments(id) on delete cascade,
  user_id          uuid not null references public.profiles(user_id) on delete cascade,
  accrued_minor    bigint not null check (accrued_minor >= 0),
  target_minor     bigint not null check (target_minor > 0),
  destination      public.settlement_destination not null,
  -- N5. No default, not nullable: there is no settlement without a user action.
  user_action_at   timestamptz not null,
  rail             text not null default 'points_stub' check (rail = 'points_stub'),
  created_at       timestamptz not null default now(),
  -- N3. Accrual is capped at target (SPEC 01 section 1.4); a row that breaks
  -- this would owe a value the ramp cannot produce.
  constraint ck_accrued_within_target check (accrued_minor <= target_minor)
);

select consent.attach_ledger('public.settlements');

-- ---------------------------------------------------------------------------
-- SPEC 07 section 7.2 — the event stream.
--
-- Governed by SPEC 06 like all other data (section 7.5), hence the ledger.
-- `payload` is jsonb because the shape varies by event; the enumerated-fields
-- rule (section 7.5) is enforced by the zod schemas at the write boundary and
-- asserted by the test suite, since a check constraint cannot express it.
-- ---------------------------------------------------------------------------
create type public.event_name as enum (
  'commitment_created',
  'session_logged',
  'session_missed',
  'recovery',
  'settlement',
  'double_offered',
  'double_accepted',
  'partner_added',
  'translator_run',
  'load_indicator_shown'
);

create table public.analytics_events (
  id             bigserial primary key,
  user_id        uuid not null references public.profiles(user_id) on delete cascade,
  commitment_id  uuid references public.commitments(id) on delete cascade,
  name           public.event_name not null,
  occurred_at    timestamptz not null,
  payload        jsonb not null,
  -- SPEC 07 section 7.5: no free-text user content. A note or label reaching
  -- an event is the failure this guards.
  constraint ck_event_no_free_text check (
    not (payload ? 'note') and
    not (payload ? 'label') and
    not (payload ? 'goal_text') and
    not (payload ? 'habit_label') and
    not (payload ? 'email')
  )
);

select consent.attach_ledger('public.analytics_events');

create index idx_events_user_time on public.analytics_events (user_id, occurred_at);
create index idx_events_name_time on public.analytics_events (name, occurred_at);
