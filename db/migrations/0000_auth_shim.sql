-- ===========================================================================
-- Local-Postgres shim for the Supabase auth surface.
--
-- On Supabase, `auth.users`, `auth.uid()` and the `authenticated` role already
-- exist and this file is a no-op. On a plain Postgres used to run the RLS test
-- suite, it creates the minimum needed for the policies to compile and be
-- exercised.
--
-- This is test scaffolding for the data spine, not an auth implementation.
-- Authentication itself is Supabase Auth (CLAUDE.md section 4).
-- ===========================================================================

create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Supabase derives this from the request JWT. Locally it reads a GUC the test
-- suite sets, which is what lets the suite impersonate two different users on
-- one connection.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end;
$$;
