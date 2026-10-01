-- M1 / 2: funds and user profiles.
--
-- One fund in practice (decision 2); the schema stays multi-fund so RLS can be
-- tested across funds.

-- ---------------------------------------------------------------------------
-- funds
-- ---------------------------------------------------------------------------

create table public.funds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  llm_model text not null default 'gpt-6-luna',
  created_at timestamptz not null default now()
);

alter table public.funds enable row level security;

create policy "members read their fund"
  on public.funds for select
  to authenticated
  using (id = (select private.current_fund_id()));

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  fund_id uuid not null references public.funds (id) on delete restrict,
  display_name text,
  role public.user_role not null default 'analyst',
  created_at timestamptz not null default now()
);

create index profiles_fund_id_idx on public.profiles (fund_id);

alter table public.profiles enable row level security;

-- Members see everyone in their fund (evaluator names on deals).
-- No insert/update/delete policies: profiles are created by the trigger below
-- and roles are changed with the service role only.
create policy "members read profiles of their fund"
  on public.profiles for select
  to authenticated
  using (fund_id = (select private.current_fund_id()));

-- ---------------------------------------------------------------------------
-- New auth user -> profile (role analyst)
--
-- Fund: raw_app_meta_data.fund_id if set (only the service role can set app
-- metadata), otherwise the oldest fund, i.e. the single seeded fund.
-- ---------------------------------------------------------------------------

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fund_id uuid;
begin
  v_fund_id := nullif(new.raw_app_meta_data ->> 'fund_id', '')::uuid;

  if v_fund_id is null then
    select f.id into v_fund_id
    from public.funds f
    order by f.created_at, f.id
    limit 1;
  end if;

  if v_fund_id is null then
    raise exception 'cannot create profile for user %: no fund exists', new.id;
  end if;

  insert into public.profiles (id, fund_id, display_name, role)
  values (
    new.id,
    v_fund_id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), new.email),
    'analyst'
  );

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
