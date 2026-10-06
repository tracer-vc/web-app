-- Personal "dev mode" preference: shows developer views (model calls per run,
-- the Study tab for admins). A display preference only; it changes no access.
--
-- profiles keeps no update policy (roles change via the service role only), so
-- users switch their own flag through this function, which touches nothing else.

alter table public.profiles
  add column dev_mode boolean not null default false;

create function public.set_dev_mode(p_enabled boolean)
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

revoke all on function public.set_dev_mode(boolean) from public, anon;
grant execute on function public.set_dev_mode(boolean) to authenticated;
