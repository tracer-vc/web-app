-- M3: config versioning (draft -> publish) and the analyst_actions audit log.
--
-- An admin edits a draft copy of the active config; publishing marks the draft
-- published + active and the previous version inactive. Published versions are
-- never edited (lock triggers from M1), so evaluations pinned to them keep the
-- exact settings they ran with.
--
-- All functions run as the caller (security invoker): RLS and the M1 triggers
-- apply, and each function also checks that the caller is a fund admin.

-- ---------------------------------------------------------------------------
-- analyst_actions: append-only audit log
-- ---------------------------------------------------------------------------

create table public.analyst_actions (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null default private.current_fund_id() references public.funds (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (length(trim(action)) > 0),
  target_table text not null,
  target_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index analyst_actions_fund_id_created_at_idx on public.analyst_actions (fund_id, created_at desc);
create index analyst_actions_actor_id_idx on public.analyst_actions (actor_id);

alter table public.analyst_actions enable row level security;

create policy "members read actions of their fund"
  on public.analyst_actions for select
  to authenticated
  using (fund_id = (select private.current_fund_id()));

-- Members log their own actions in their own fund. No update/delete: append-only.
create policy "members log their own actions"
  on public.analyst_actions for insert
  to authenticated
  with check (
    fund_id = (select private.current_fund_id())
    and actor_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function private.require_fund_admin()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_fund_id uuid := private.current_fund_id();
begin
  if v_fund_id is null or not private.is_fund_admin() then
    raise exception 'only fund admins can change the configuration'
      using errcode = 'insufficient_privilege';
  end if;
  return v_fund_id;
end;
$$;

create function private.log_action(
  p_fund_id uuid, p_action text, p_target_table text, p_target_id uuid, p_before jsonb, p_after jsonb
)
returns void
language sql
set search_path = ''
as $$
  insert into public.analyst_actions (fund_id, actor_id, action, target_table, target_id, before, after)
  values (p_fund_id, auth.uid(), p_action, p_target_table, p_target_id, p_before, p_after);
$$;

-- ---------------------------------------------------------------------------
-- create_config_draft(): copy the active version (all child rows) into a new
-- draft, or return the existing draft.
-- ---------------------------------------------------------------------------

create function public.create_config_draft()
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_fund_id uuid := private.require_fund_admin();
  v_src public.framework_configs;
  v_draft_id uuid;
  v_version int;
  v_dim record;
  v_new_dim_id uuid;
begin
  select c.id into v_draft_id
  from public.framework_configs c
  where c.fund_id = v_fund_id and c.status = 'draft';
  if found then
    return v_draft_id;
  end if;

  select * into v_src
  from public.framework_configs c
  where c.fund_id = v_fund_id and c.is_active;
  if not found then
    raise exception 'the fund has no active configuration to copy';
  end if;

  select max(c.version) + 1 into v_version
  from public.framework_configs c
  where c.fund_id = v_fund_id;

  insert into public.framework_configs (
    fund_id, version, status, is_active, created_by,
    tier_definitions, confidence_rules, sufficiency_rule, score_anchors, classification_criteria
  ) values (
    v_fund_id, v_version, 'draft', false, auth.uid(),
    v_src.tier_definitions, v_src.confidence_rules, v_src.sufficiency_rule,
    v_src.score_anchors, v_src.classification_criteria
  )
  returning id into v_draft_id;

  insert into public.quick_screen_questions (config_id, position, label, question)
  select v_draft_id, q.position, q.label, q.question
  from public.quick_screen_questions q where q.config_id = v_src.id;

  insert into public.collection_prompts (config_id, position, question, required)
  select v_draft_id, p.position, p.question, p.required
  from public.collection_prompts p where p.config_id = v_src.id;

  insert into public.counter_case_prompts (config_id, position, prompt)
  select v_draft_id, p.position, p.prompt
  from public.counter_case_prompts p where p.config_id = v_src.id;

  for v_dim in
    select * from public.dimensions d where d.config_id = v_src.id order by d.position
  loop
    insert into public.dimensions (
      config_id, position, title, question, claim_coverage,
      high_score_signals, low_score_signals, disqualifying_below
    ) values (
      v_draft_id, v_dim.position, v_dim.title, v_dim.question, v_dim.claim_coverage,
      v_dim.high_score_signals, v_dim.low_score_signals, v_dim.disqualifying_below
    )
    returning id into v_new_dim_id;

    insert into public.dimension_prompts (dimension_id, position, prompt)
    select v_new_dim_id, dp.position, dp.prompt
    from public.dimension_prompts dp where dp.dimension_id = v_dim.id;

    -- Required prompts map across versions by Collection Prompt position.
    insert into public.dimension_required_prompts (dimension_id, prompt_id)
    select v_new_dim_id, np.id
    from public.dimension_required_prompts r
    join public.collection_prompts op on op.id = r.prompt_id
    join public.collection_prompts np on np.config_id = v_draft_id and np.position = op.position
    where r.dimension_id = v_dim.id;
  end loop;

  perform private.log_action(
    v_fund_id, 'config.draft_created', 'framework_configs', v_draft_id,
    jsonb_build_object('copied_from_version', v_src.version),
    jsonb_build_object('version', v_version)
  );

  return v_draft_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_config_draft(): apply the editor's state to the draft in one
-- transaction. Lists are synced by id (existing rows updated, new rows
-- inserted, missing rows deleted) and positions follow array order, so row
-- ids stay stable across saves. Keys absent from p_config are left untouched.
--
-- p_config: { id, tier_definitions?, quick_screen_questions?: [{id?, label, question}],
--             collection_prompts?: [{id?, question, required}],
--             counter_case_prompts?: [{id?, prompt}] }
-- ---------------------------------------------------------------------------

create function public.save_config_draft(p_config jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_fund_id uuid := private.require_fund_admin();
  v_draft_id uuid;
  v_item jsonb;
  v_pos int;
  v_id uuid;
begin
  select c.id into v_draft_id
  from public.framework_configs c
  where c.fund_id = v_fund_id and c.status = 'draft'
  for update;

  if not found or v_draft_id is distinct from (p_config ->> 'id')::uuid then
    raise exception 'this draft no longer exists; reload the settings page'
      using errcode = 'no_data_found';
  end if;

  if p_config ? 'tier_definitions' then
    update public.framework_configs
    set tier_definitions = p_config -> 'tier_definitions'
    where id = v_draft_id;
  end if;

  -- Quick Screen questions
  if p_config ? 'quick_screen_questions' then
    delete from public.quick_screen_questions q
    where q.config_id = v_draft_id
      and q.id not in (
        select (e ->> 'id')::uuid
        from jsonb_array_elements(p_config -> 'quick_screen_questions') e
        where e ->> 'id' is not null
      );

    for v_item, v_pos in
      select e, o::int from jsonb_array_elements(p_config -> 'quick_screen_questions') with ordinality as t(e, o)
    loop
      update public.quick_screen_questions
      set position = v_pos, label = v_item ->> 'label', question = v_item ->> 'question'
      where id = (v_item ->> 'id')::uuid and config_id = v_draft_id
      returning id into v_id;
      if v_id is null then
        insert into public.quick_screen_questions (config_id, position, label, question)
        values (v_draft_id, v_pos, v_item ->> 'label', v_item ->> 'question');
      end if;
      v_id := null;
    end loop;
  end if;

  -- Collection Prompts
  if p_config ? 'collection_prompts' then
    delete from public.collection_prompts p
    where p.config_id = v_draft_id
      and p.id not in (
        select (e ->> 'id')::uuid
        from jsonb_array_elements(p_config -> 'collection_prompts') e
        where e ->> 'id' is not null
      );

    for v_item, v_pos in
      select e, o::int from jsonb_array_elements(p_config -> 'collection_prompts') with ordinality as t(e, o)
    loop
      update public.collection_prompts
      set position = v_pos, question = v_item ->> 'question',
          required = coalesce((v_item ->> 'required')::boolean, true)
      where id = (v_item ->> 'id')::uuid and config_id = v_draft_id
      returning id into v_id;
      if v_id is null then
        insert into public.collection_prompts (config_id, position, question, required)
        values (v_draft_id, v_pos, v_item ->> 'question', coalesce((v_item ->> 'required')::boolean, true));
      end if;
      v_id := null;
    end loop;
  end if;

  -- Counter-Case Prompts
  if p_config ? 'counter_case_prompts' then
    delete from public.counter_case_prompts p
    where p.config_id = v_draft_id
      and p.id not in (
        select (e ->> 'id')::uuid
        from jsonb_array_elements(p_config -> 'counter_case_prompts') e
        where e ->> 'id' is not null
      );

    for v_item, v_pos in
      select e, o::int from jsonb_array_elements(p_config -> 'counter_case_prompts') with ordinality as t(e, o)
    loop
      update public.counter_case_prompts
      set position = v_pos, prompt = v_item ->> 'prompt'
      where id = (v_item ->> 'id')::uuid and config_id = v_draft_id
      returning id into v_id;
      if v_id is null then
        insert into public.counter_case_prompts (config_id, position, prompt)
        values (v_draft_id, v_pos, v_item ->> 'prompt');
      end if;
      v_id := null;
    end loop;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- publish_config(): the draft becomes the active published version.
-- ---------------------------------------------------------------------------

create function public.publish_config()
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_fund_id uuid := private.require_fund_admin();
  v_draft public.framework_configs;
  v_prev public.framework_configs;
  v_n int;
begin
  select * into v_draft
  from public.framework_configs c
  where c.fund_id = v_fund_id and c.status = 'draft'
  for update;
  if not found then
    raise exception 'there is no draft to publish' using errcode = 'no_data_found';
  end if;

  select count(*) into v_n from public.quick_screen_questions q where q.config_id = v_draft.id;
  if v_n not between 1 and 7 then
    raise exception 'a configuration needs 1 to 7 Quick Screen questions (has %)', v_n
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.collection_prompts p where p.config_id = v_draft.id) then
    raise exception 'a configuration needs at least one Collection Prompt' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.counter_case_prompts p where p.config_id = v_draft.id) then
    raise exception 'a configuration needs at least one Counter-Case Prompt' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.dimensions d where d.config_id = v_draft.id) then
    raise exception 'a configuration needs at least one dimension' using errcode = 'check_violation';
  end if;

  select * into v_prev
  from public.framework_configs c
  where c.fund_id = v_fund_id and c.is_active
  for update;

  if found then
    update public.framework_configs set is_active = false where id = v_prev.id;
  end if;

  update public.framework_configs
  set status = 'published', is_active = true, published_at = now()
  where id = v_draft.id;

  perform private.log_action(
    v_fund_id, 'config.published', 'framework_configs', v_draft.id,
    case when v_prev.id is null then null else jsonb_build_object('active_version', v_prev.version) end,
    jsonb_build_object('active_version', v_draft.version)
  );

  return v_draft.version;
end;
$$;

-- ---------------------------------------------------------------------------
-- discard_config_draft(): delete the draft and all its child rows.
-- ---------------------------------------------------------------------------

create function public.discard_config_draft()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_fund_id uuid := private.require_fund_admin();
  v_draft public.framework_configs;
begin
  select * into v_draft
  from public.framework_configs c
  where c.fund_id = v_fund_id and c.status = 'draft';
  if not found then
    return;
  end if;

  delete from public.framework_configs where id = v_draft.id;

  perform private.log_action(
    v_fund_id, 'config.draft_discarded', 'framework_configs', v_draft.id,
    jsonb_build_object('version', v_draft.version), null
  );
end;
$$;

revoke all on function private.require_fund_admin() from public, anon, authenticated;
revoke all on function private.log_action(uuid, text, text, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function private.require_fund_admin() to authenticated, service_role;
grant execute on function private.log_action(uuid, text, text, uuid, jsonb, jsonb) to authenticated, service_role;

revoke all on function public.create_config_draft() from public, anon;
revoke all on function public.save_config_draft(jsonb) from public, anon;
revoke all on function public.publish_config() from public, anon;
revoke all on function public.discard_config_draft() from public, anon;
grant execute on function public.create_config_draft() to authenticated;
grant execute on function public.save_config_draft(jsonb) to authenticated;
grant execute on function public.publish_config() to authenticated;
grant execute on function public.discard_config_draft() to authenticated;
