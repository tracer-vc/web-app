-- Allow deleting a whole fund (service role only; users have no delete policy
-- on funds). Published configs stay read-only otherwise: the lock triggers
-- only step aside when the fund row is already gone, i.e. inside the cascade
-- of a fund delete.

-- Security definer so the answer never depends on the caller's RLS view of funds.
create function private.fund_is_deleted(p_fund_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.funds f where f.id = p_fund_id);
$$;

create or replace function private.protect_published_config()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'published' then
    if tg_op = 'DELETE' then
      if private.fund_is_deleted(old.fund_id) then
        return old;
      end if;
      raise exception 'config v% is published and cannot be deleted', old.version
        using errcode = 'check_violation';
    end if;
    if (to_jsonb(new) - 'is_active') is distinct from (to_jsonb(old) - 'is_active') then
      raise exception 'config v% is published and read-only', old.version
        using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function private.lock_published_config_rows()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and private.fund_is_deleted(old.fund_id) then
    return old;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.assert_config_editable(old.config_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.assert_config_editable(new.config_id);
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function private.lock_published_dimension_rows()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and private.fund_is_deleted(old.fund_id) then
    return old;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.assert_config_editable(
      (select d.config_id from public.dimensions d where d.id = old.dimension_id));
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.assert_config_editable(
      (select d.config_id from public.dimensions d where d.id = new.dimension_id));
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function private.fund_is_deleted(uuid) from public, anon, authenticated;
-- Called from the lock triggers, which run as the invoking user.
grant execute on function private.fund_is_deleted(uuid) to authenticated, service_role;
