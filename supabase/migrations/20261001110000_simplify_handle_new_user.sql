-- New auth users always join the single fund (decision 2).
--
-- Removes the raw_app_meta_data.fund_id branch from handle_new_user(): the Auth
-- admin API inserts the user first and writes app_metadata in a later update,
-- so the insert trigger never sees it. Fund or role changes are made with a
-- service-role update on public.profiles instead.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fund_id uuid;
begin
  select f.id into v_fund_id
  from public.funds f
  order by f.created_at, f.id
  limit 1;

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
