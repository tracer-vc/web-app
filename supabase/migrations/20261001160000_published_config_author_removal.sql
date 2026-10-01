-- Deleting a profile sets framework_configs.created_by to null (on delete set
-- null). The published-config lock treated that as an edit and blocked it, so
-- an admin who had published a version could never be removed. Allow exactly
-- that change; every other edit of a published version stays blocked.

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
    if (to_jsonb(new) - 'is_active' - 'created_by') is distinct from (to_jsonb(old) - 'is_active' - 'created_by')
       or (new.created_by is distinct from old.created_by and new.created_by is not null) then
      raise exception 'config v% is published and read-only', old.version
        using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
