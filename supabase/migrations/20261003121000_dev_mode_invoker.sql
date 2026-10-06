-- set_dev_mode: keep the exposed function SECURITY INVOKER (advisor 0029) and
-- move the privileged update into the private schema, like the config functions.

create function private.set_own_dev_mode(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;

  update public.profiles
  set dev_mode = coalesce(p_enabled, false)
  where id = (select auth.uid());
end;
$$;

revoke all on function private.set_own_dev_mode(boolean) from public, anon, authenticated;
grant execute on function private.set_own_dev_mode(boolean) to authenticated, service_role;

create or replace function public.set_dev_mode(p_enabled boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.set_own_dev_mode(p_enabled);
end;
$$;
