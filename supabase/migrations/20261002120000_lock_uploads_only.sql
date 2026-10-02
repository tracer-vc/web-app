-- M6: the "uploads only" switch (decision 28) can change only before the
-- Source Table is built; afterwards it is part of the evaluation's record.

create or replace function private.guard_evaluation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.framework_configs c
      where c.id = new.config_id and c.fund_id = new.fund_id
        and c.status = 'published' and c.is_active
    ) then
      raise exception 'an evaluation must use its fund''s active published configuration'
        using errcode = 'check_violation';
    end if;
  else
    if new.company_id is distinct from old.company_id
       or new.config_id is distinct from old.config_id
       or new.fund_id is distinct from old.fund_id
       or new.evaluator_id is distinct from old.evaluator_id and new.evaluator_id is not null then
      raise exception 'company, configuration, fund and evaluator of an evaluation cannot change'
        using errcode = 'check_violation';
    end if;
    if new.uploads_only is distinct from old.uploads_only
       and not private.is_quick_screen_status(old.status) then
      raise exception 'the uploads-only switch can only change before Evidence Collection starts'
        using errcode = 'check_violation';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
