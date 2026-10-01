-- M1 / 3: versioned framework configuration and its child lists.
--
-- A config is a draft until published. Published configs (and all their child
-- rows) are read-only; evaluations pin a config version (M5) so old evaluations
-- keep the exact settings they ran with. Per fund: at most one draft and at most
-- one active config, and only a published config can be active.
--
-- RLS: fund members read; admins write. The lock triggers below protect
-- published versions regardless of who writes (service role included).

-- ---------------------------------------------------------------------------
-- framework_configs
-- ---------------------------------------------------------------------------

create table public.framework_configs (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null default private.current_fund_id() references public.funds (id) on delete cascade,
  version int not null check (version >= 1),
  status public.config_status not null default 'draft',
  is_active boolean not null default false,
  tier_definitions jsonb not null,
  confidence_rules jsonb not null,
  sufficiency_rule jsonb not null,
  score_anchors jsonb not null,
  classification_criteria jsonb not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (fund_id, version),
  constraint active_only_if_published check (not is_active or status = 'published'),
  constraint published_at_matches_status check ((status = 'published') = (published_at is not null))
);

create unique index framework_configs_one_active_per_fund
  on public.framework_configs (fund_id) where is_active;
create unique index framework_configs_one_draft_per_fund
  on public.framework_configs (fund_id) where status = 'draft';
create index framework_configs_created_by_idx on public.framework_configs (created_by);

-- A published config may only have is_active toggled (by publish_config() in M3)
-- and may not be deleted.
create function private.protect_published_config()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'published' then
    if tg_op = 'DELETE' then
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

create trigger protect_published_config
  before update or delete on public.framework_configs
  for each row execute function private.protect_published_config();

alter table public.framework_configs enable row level security;

create policy "members read configs of their fund"
  on public.framework_configs for select
  to authenticated
  using (fund_id = (select private.current_fund_id()));

create policy "admins create draft configs"
  on public.framework_configs for insert
  to authenticated
  with check (
    fund_id = (select private.current_fund_id())
    and (select private.is_fund_admin())
    and status = 'draft'
    and not is_active
  );

create policy "admins update configs"
  on public.framework_configs for update
  to authenticated
  using (fund_id = (select private.current_fund_id()) and (select private.is_fund_admin()))
  with check (fund_id = (select private.current_fund_id()) and (select private.is_fund_admin()));

create policy "admins delete configs"
  on public.framework_configs for delete
  to authenticated
  using (fund_id = (select private.current_fund_id()) and (select private.is_fund_admin()));

-- ---------------------------------------------------------------------------
-- Lock helpers for child rows
-- ---------------------------------------------------------------------------

create function private.assert_config_editable(p_config_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_version int;
begin
  select c.version into v_version
  from public.framework_configs c
  where c.id = p_config_id and c.status = 'published';

  if found then
    raise exception 'config v% is published and read-only', v_version
      using errcode = 'check_violation';
  end if;
end;
$$;

-- For tables with a config_id column.
create function private.lock_published_config_rows()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.assert_config_editable(old.config_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.assert_config_editable(new.config_id);
  end if;
  return coalesce(new, old);
end;
$$;

-- For tables with a dimension_id column (config reached through dimensions).
create function private.lock_published_dimension_rows()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
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

-- ---------------------------------------------------------------------------
-- quick_screen_questions (1-7 per config)
-- ---------------------------------------------------------------------------

create table public.quick_screen_questions (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  config_id uuid not null references public.framework_configs (id) on delete cascade,
  position int not null check (position >= 1),
  label text not null check (length(trim(label)) > 0),
  question text not null check (length(trim(question)) > 0),
  created_at timestamptz not null default now(),
  unique (config_id, position) deferrable initially deferred
);

create index quick_screen_questions_fund_id_idx on public.quick_screen_questions (fund_id);

create function private.limit_quick_screen_questions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Serialise concurrent inserts into the same config.
  perform 1 from public.framework_configs c where c.id = new.config_id for update;

  if (select count(*) from public.quick_screen_questions q
      where q.config_id = new.config_id and q.id <> new.id) >= 7 then
    raise exception 'a config can have at most 7 Quick Screen questions'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger set_fund_id
  before insert or update on public.quick_screen_questions
  for each row execute function private.set_fund_id('framework_configs', 'config_id');
create trigger lock_published
  before insert or update or delete on public.quick_screen_questions
  for each row execute function private.lock_published_config_rows();
create trigger max_seven
  before insert or update of config_id on public.quick_screen_questions
  for each row execute function private.limit_quick_screen_questions();

-- ---------------------------------------------------------------------------
-- collection_prompts
-- ---------------------------------------------------------------------------

create table public.collection_prompts (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  config_id uuid not null references public.framework_configs (id) on delete cascade,
  position int not null check (position >= 1),
  question text not null check (length(trim(question)) > 0),
  required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (config_id, position) deferrable initially deferred
);

create index collection_prompts_fund_id_idx on public.collection_prompts (fund_id);

create trigger set_fund_id
  before insert or update on public.collection_prompts
  for each row execute function private.set_fund_id('framework_configs', 'config_id');
create trigger lock_published
  before insert or update or delete on public.collection_prompts
  for each row execute function private.lock_published_config_rows();

-- ---------------------------------------------------------------------------
-- counter_case_prompts
-- ---------------------------------------------------------------------------

create table public.counter_case_prompts (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  config_id uuid not null references public.framework_configs (id) on delete cascade,
  position int not null check (position >= 1),
  prompt text not null check (length(trim(prompt)) > 0),
  created_at timestamptz not null default now(),
  unique (config_id, position) deferrable initially deferred
);

create index counter_case_prompts_fund_id_idx on public.counter_case_prompts (fund_id);

create trigger set_fund_id
  before insert or update on public.counter_case_prompts
  for each row execute function private.set_fund_id('framework_configs', 'config_id');
create trigger lock_published
  before insert or update or delete on public.counter_case_prompts
  for each row execute function private.lock_published_config_rows();

-- ---------------------------------------------------------------------------
-- dimensions (D#). Concrete prompts are rows in dimension_prompts (decision 30).
-- disqualifying_below: a score below this value counts as disqualifying for R3.
-- ---------------------------------------------------------------------------

create table public.dimensions (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  config_id uuid not null references public.framework_configs (id) on delete cascade,
  position int not null check (position >= 1),
  title text not null check (length(trim(title)) > 0),
  question text not null check (length(trim(question)) > 0),
  claim_coverage text not null default '',
  high_score_signals text not null default '',
  low_score_signals text not null default '',
  disqualifying_below int check (disqualifying_below between 1 and 5),
  created_at timestamptz not null default now(),
  unique (config_id, position) deferrable initially deferred
);

create index dimensions_fund_id_idx on public.dimensions (fund_id);

create trigger set_fund_id
  before insert or update on public.dimensions
  for each row execute function private.set_fund_id('framework_configs', 'config_id');
create trigger lock_published
  before insert or update or delete on public.dimensions
  for each row execute function private.lock_published_config_rows();

-- ---------------------------------------------------------------------------
-- dimension_prompts (concrete prompts of a dimension)
-- ---------------------------------------------------------------------------

create table public.dimension_prompts (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  dimension_id uuid not null references public.dimensions (id) on delete cascade,
  position int not null check (position >= 1),
  prompt text not null check (length(trim(prompt)) > 0),
  created_at timestamptz not null default now(),
  unique (dimension_id, position) deferrable initially deferred
);

create index dimension_prompts_fund_id_idx on public.dimension_prompts (fund_id);

create trigger set_fund_id
  before insert or update on public.dimension_prompts
  for each row execute function private.set_fund_id('dimensions', 'dimension_id');
create trigger lock_published
  before insert or update or delete on public.dimension_prompts
  for each row execute function private.lock_published_dimension_rows();

-- ---------------------------------------------------------------------------
-- dimension_required_prompts: Collection Prompts a dimension depends on.
-- If any is uncovered (open U# from R2), the dimension score is capped
-- (decision 15). Both sides must belong to the same config.
-- ---------------------------------------------------------------------------

create table public.dimension_required_prompts (
  dimension_id uuid not null references public.dimensions (id) on delete cascade,
  prompt_id uuid not null references public.collection_prompts (id) on delete cascade,
  fund_id uuid not null references public.funds (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (dimension_id, prompt_id)
);

create index dimension_required_prompts_prompt_id_idx on public.dimension_required_prompts (prompt_id);
create index dimension_required_prompts_fund_id_idx on public.dimension_required_prompts (fund_id);

create function private.check_required_prompt_same_config()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select d.config_id from public.dimensions d where d.id = new.dimension_id)
     is distinct from
     (select p.config_id from public.collection_prompts p where p.id = new.prompt_id) then
    raise exception 'dimension and required Collection Prompt must belong to the same config'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger set_fund_id
  before insert or update on public.dimension_required_prompts
  for each row execute function private.set_fund_id('dimensions', 'dimension_id');
create trigger lock_published
  before insert or update or delete on public.dimension_required_prompts
  for each row execute function private.lock_published_dimension_rows();
create trigger same_config
  before insert or update on public.dimension_required_prompts
  for each row execute function private.check_required_prompt_same_config();

-- ---------------------------------------------------------------------------
-- RLS for the child tables: members read, admins write (published rows are
-- additionally locked by the triggers above).
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'quick_screen_questions',
    'collection_prompts',
    'counter_case_prompts',
    'dimensions',
    'dimension_prompts',
    'dimension_required_prompts'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    execute format($p$
      create policy "members read" on public.%I for select
        to authenticated
        using (fund_id = (select private.current_fund_id()))
    $p$, t);

    execute format($p$
      create policy "admins insert" on public.%I for insert
        to authenticated
        with check (fund_id = (select private.current_fund_id()) and (select private.is_fund_admin()))
    $p$, t);

    execute format($p$
      create policy "admins update" on public.%I for update
        to authenticated
        using (fund_id = (select private.current_fund_id()) and (select private.is_fund_admin()))
        with check (fund_id = (select private.current_fund_id()) and (select private.is_fund_admin()))
    $p$, t);

    execute format($p$
      create policy "admins delete" on public.%I for delete
        to authenticated
        using (fund_id = (select private.current_fund_id()) and (select private.is_fund_admin()))
    $p$, t);
  end loop;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.current_fund_id() to authenticated, service_role;
grant execute on function private.is_fund_admin() to authenticated, service_role;
-- Called from the lock triggers, which run as the invoking user.
grant execute on function private.assert_config_editable(uuid) to authenticated, service_role;
