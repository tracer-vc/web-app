-- M1 / 1: shared enums and helper functions used by every later migration.
--
-- Helpers live in the `private` schema, which is not exposed through the Data API,
-- so the security-definer functions cannot be called as RPCs.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('analyst', 'admin');
create type public.config_status as enum ('draft', 'published');
create type public.source_tier as enum ('primary', 'secondary', 'tertiary');

-- ---------------------------------------------------------------------------
-- Private schema
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fund membership helpers (used in RLS policies)
--
-- plpgsql so the bodies may reference public.profiles, which is created in the
-- next migration. Security definer so policies on profiles can call them
-- without recursing into profiles' own RLS.
-- ---------------------------------------------------------------------------

create function private.current_fund_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return (select p.fund_id from public.profiles p where p.id = auth.uid());
end;
$$;

create function private.is_fund_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- set_fund_id(): copies fund_id from the parent row so that every table can be
-- scoped by fund_id in RLS. Usage:
--
--   create trigger set_fund_id before insert or update on public.child
--     for each row execute function private.set_fund_id('parent_table', 'parent_fk_column');
--
-- The client-supplied fund_id is always overwritten. Runs as the invoker, so a
-- user who cannot see the parent row (RLS) gets an error rather than a row in
-- someone else's fund.
-- ---------------------------------------------------------------------------

create function private.set_fund_id()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent_id uuid;
  v_fund_id uuid;
begin
  v_parent_id := (to_jsonb(new) ->> tg_argv[1])::uuid;

  execute format('select fund_id from public.%I where id = $1', tg_argv[0])
    into v_fund_id
    using v_parent_id;

  if v_fund_id is null then
    raise exception '%.%: parent row % in % not found', tg_table_name, tg_argv[1], v_parent_id, tg_argv[0]
      using errcode = 'foreign_key_violation';
  end if;

  new.fund_id := v_fund_id;
  return new;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.current_fund_id() to authenticated, service_role;
grant execute on function private.is_fund_admin() to authenticated, service_role;
