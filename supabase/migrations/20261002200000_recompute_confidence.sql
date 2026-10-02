-- M10: Conflict Register resolution and analyst evidence actions.
--
-- * Analysts resolve conflicts (status + mandatory rationale). Who and when are
--   stamped by the database, never sent by the client; every change is logged.
-- * Analysts mark an evidence link as wrong (decision 14): the link stays,
--   it no longer counts for confidence, and the action is logged.
-- * private.recompute_confidence(claim_id) implements R1 (decision 9) in SQL
--   and runs after conflict resolution, tier/party edits and link marking.
--   It mirrors lib/rules/confidence.ts; both are tested against
--   lib/rules/confidence-cases.json.
-- No new tables.

-- ---------------------------------------------------------------------------
-- R1 in SQL
-- ---------------------------------------------------------------------------

create function private.recompute_confidence(p_claim_id uuid)
returns public.claim_confidence
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.claim_type;
  v_evaluation_id uuid;
  v_rules jsonb;
  v_parties jsonb;
  v_count int;
  v_levels int;
  v_index int;
  v_final int;
  v_in_conflict boolean;
  v_level jsonb;
  v_ord int;
  v_min_parties int;
  v_in_tiers jsonb;
  v_evidence text;
  v_base text;
  v_result text;
  v_rule text;
begin
  select c.type, c.evaluation_id into v_type, v_evaluation_id from public.claims c where c.id = p_claim_id;
  if not found or v_type = 'speculation' then
    return null;
  end if;

  select fc.confidence_rules into v_rules
  from public.evaluations e join public.framework_configs fc on fc.id = e.config_id
  where e.id = v_evaluation_id;

  -- Independent parties among the links not marked wrong. Sources with the
  -- same party (trimmed, whitespace-collapsed, case-insensitive) are one party.
  with links as (
    select s.code, s.tier::text as tier, trim(s.party) as party,
           lower(regexp_replace(trim(s.party), '\s+', ' ', 'g')) as k,
           substring(s.code from 2)::int as n
    from public.claim_sources cs join public.sources s on s.id = cs.source_id
    where cs.claim_id = p_claim_id and cs.marked_wrong_at is null
  ),
  grouped as (
    select k, (array_agg(party order by n))[1] as party, min(n) as first_n,
           array_agg(distinct tier) as tiers, array_agg(distinct n) as ns
    from links group by k
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'party', g.party,
           'tiers', (select coalesce(jsonb_agg(t order by o), '[]'::jsonb)
                     from unnest(array['primary', 'secondary', 'tertiary']) with ordinality u(t, o)
                     where t = any (g.tiers)),
           'sources', (select jsonb_agg('S' || n order by n) from unnest(g.ns) n)
         ) order by g.first_n), '[]'::jsonb)
  into v_parties
  from grouped g;
  v_count := jsonb_array_length(v_parties);

  -- First matching level, best to worst; the last level is the floor.
  v_levels := jsonb_array_length(v_rules -> 'levels');
  for v_level, v_ord in select l, o::int from jsonb_array_elements(v_rules -> 'levels') with ordinality x(l, o)
  loop
    v_min_parties := coalesce((v_level ->> 'min_parties')::int, 1);
    v_in_tiers := v_level -> 'min_parties_in_tiers';
    if v_count >= v_min_parties and (
      v_in_tiers is null or (
        select count(*) from jsonb_array_elements(v_parties) p
        where exists (
          select 1 from jsonb_array_elements_text(p -> 'tiers') t
          where t in (select jsonb_array_elements_text(v_in_tiers -> 'tiers'))
        )
      ) >= (v_in_tiers ->> 'min')::int
    ) then
      v_index := v_ord;
      exit;
    end if;
  end loop;
  v_index := coalesce(v_index, v_levels);

  v_in_conflict := exists (
    select 1 from public.conflicts x
    where x.kind = 'claim' and x.status = 'open' and p_claim_id in (x.side_a_id, x.side_b_id)
  );
  v_final := case when v_in_conflict
    then least(v_levels, v_index + coalesce((v_rules ->> 'open_conflict_downgrade')::int, 1))
    else v_index end;
  v_base := v_rules -> 'levels' -> (v_index - 1) ->> 'level';
  v_result := v_rules -> 'levels' -> (v_final - 1) ->> 'level';

  -- The same wording as lib/rules/confidence.ts.
  v_evidence := case
    when v_count = 0 then 'no source'
    when v_count = 1 then 'one ' || private.tier_labels(v_parties -> 0 -> 'tiers') || ' party (' || (v_parties -> 0 ->> 'party') || ')'
    else v_count || ' independent parties: ' || (
      select string_agg((p ->> 'party') || ' (' || private.tier_labels(p -> 'tiers') || ')', ', ' order by o)
      from jsonb_array_elements(v_parties) with ordinality y(p, o))
  end;
  v_rule := initcap(v_base) || ': ' || v_evidence;
  if v_final <> v_index then
    v_rule := v_rule || ' → ' || initcap(v_result) || ': in an open conflict';
  end if;

  update public.claims
  set confidence = v_result::public.claim_confidence,
      confidence_basis = jsonb_build_object(
        'rule', v_rule, 'base_level', v_base, 'downgraded', v_final <> v_index, 'parties', v_parties)
  where id = p_claim_id
    and (confidence, confidence_basis) is distinct from (v_result::public.claim_confidence, jsonb_build_object(
        'rule', v_rule, 'base_level', v_base, 'downgraded', v_final <> v_index, 'parties', v_parties));

  return v_result::public.claim_confidence;
end;
$$;

-- ["primary","secondary"] -> 'Primary/Secondary'
create function private.tier_labels(p_tiers jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(string_agg(initcap(t), '/' order by o), '')
  from jsonb_array_elements_text(p_tiers) with ordinality x(t, o)
$$;

-- ---------------------------------------------------------------------------
-- Conflicts: resolution by analysts
-- ---------------------------------------------------------------------------

-- As before, plus: when a signed-in user changes status or rationale, the
-- database stamps who and when (cleared again on reopening).
create or replace function private.guard_conflict()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform 1 from public.evaluations e where e.id = new.evaluation_id for update;
    select 'CR' || (count(*) + 1) into new.code
    from public.conflicts c where c.evaluation_id = new.evaluation_id;
  else
    if (new.evaluation_id, new.code, new.kind, new.side_a_id, new.side_b_id, new.passage_a, new.passage_b)
       is distinct from (old.evaluation_id, old.code, old.kind, old.side_a_id, old.side_b_id, old.passage_a, old.passage_b) then
      raise exception 'a conflict''s sides and passages cannot change' using errcode = 'check_violation';
    end if;
    if auth.uid() is not null and (new.status, new.rationale) is distinct from (old.status, old.rationale) then
      if new.status = 'open' then
        new.resolved_by := null;
        new.resolved_at := null;
      else
        new.resolved_by := auth.uid();
        new.resolved_at := now();
      end if;
    end if;
  end if;

  if new.status <> 'open' and (tg_op = 'INSERT' or old.status = 'open') and new.resolved_by is null then
    raise exception 'resolving a conflict needs a rationale, who resolved it and when'
      using errcode = 'check_violation';
  end if;

  if new.kind = 'source' then
    if (select count(*) from public.sources s
        where s.id in (new.side_a_id, new.side_b_id) and s.evaluation_id = new.evaluation_id) <> 2 then
      raise exception 'both sides of a source conflict must be sources of this evaluation'
        using errcode = 'check_violation';
    end if;
    if new.parent_conflict_id is not null then
      raise exception 'only claim conflicts have a parent conflict' using errcode = 'check_violation';
    end if;
  else
    if (select count(*) from public.claims c
        where c.id in (new.side_a_id, new.side_b_id) and c.evaluation_id = new.evaluation_id) <> 2 then
      raise exception 'both sides of a claim conflict must be claims of this evaluation'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.parent_conflict_id is not null and not exists (
    select 1 from public.conflicts p
    where p.id = new.parent_conflict_id and p.evaluation_id = new.evaluation_id and p.kind = 'source'
  ) then
    raise exception 'a parent conflict must be a source conflict of the same evaluation'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Log every resolution change; a claim conflict's status feeds R1 for both sides.
create function private.after_conflict_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.status, new.rationale) is distinct from (old.status, old.rationale) then
    if auth.uid() is not null then
      insert into public.analyst_actions (fund_id, actor_id, action, target_table, target_id, before, after)
      values (
        new.fund_id, auth.uid(), case when new.status = 'open' then 'conflict.reopened' else 'conflict.resolved' end,
        'conflicts', new.id,
        jsonb_build_object('code', old.code, 'status', old.status, 'rationale', old.rationale),
        jsonb_build_object('code', new.code, 'status', new.status, 'rationale', new.rationale)
      );
    end if;
    if new.kind = 'claim' and new.status is distinct from old.status then
      perform private.recompute_confidence(new.side_a_id);
      perform private.recompute_confidence(new.side_b_id);
    end if;
  end if;
  return null;
end;
$$;

create trigger after_update after update on public.conflicts
  for each row execute function private.after_conflict_update();

create policy "members resolve conflicts" on public.conflicts for update to authenticated
  using (fund_id = (select private.current_fund_id()))
  with check (fund_id = (select private.current_fund_id()));
grant update (status, rationale) on public.conflicts to authenticated;

-- ---------------------------------------------------------------------------
-- Evidence links: "mark link as wrong"
-- ---------------------------------------------------------------------------

-- Analysts set or clear marked_wrong_at; the database stamps the time and who.
create function private.stamp_link_marking()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and (new.marked_wrong_at is null) is distinct from (old.marked_wrong_at is null) then
    if new.marked_wrong_at is null then
      new.marked_wrong_by := null;
    else
      new.marked_wrong_at := now();
      new.marked_wrong_by := auth.uid();
    end if;
  elsif auth.uid() is not null then
    -- nothing else changes through the analyst path
    new.marked_wrong_at := old.marked_wrong_at;
    new.marked_wrong_by := old.marked_wrong_by;
  end if;
  return new;
end;
$$;

create function private.after_link_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.marked_wrong_at is null) is distinct from (old.marked_wrong_at is null) then
    if auth.uid() is not null then
      insert into public.analyst_actions (fund_id, actor_id, action, target_table, target_id, before, after)
      select new.fund_id, auth.uid(),
             case when new.marked_wrong_at is null then 'link.unmarked' else 'link.marked_wrong' end,
             'claim_sources', new.id,
             jsonb_build_object('claim', c.code, 'source', s.code, 'marked_wrong', old.marked_wrong_at is not null),
             jsonb_build_object('claim', c.code, 'source', s.code, 'marked_wrong', new.marked_wrong_at is not null)
      from public.claims c, public.sources s
      where c.id = new.claim_id and s.id = new.source_id;
    end if;
    perform private.recompute_confidence(new.claim_id);
  end if;
  return null;
end;
$$;

create trigger stamp_marking before update on public.claim_sources
  for each row execute function private.stamp_link_marking();
create trigger after_update after update on public.claim_sources
  for each row execute function private.after_link_update();

create policy "members mark links" on public.claim_sources for update to authenticated
  using (fund_id = (select private.current_fund_id()))
  with check (fund_id = (select private.current_fund_id()));
grant update (marked_wrong_at) on public.claim_sources to authenticated;

-- ---------------------------------------------------------------------------
-- Tier and party edits (decision 23) recompute every claim citing the source
-- ---------------------------------------------------------------------------

create function private.after_source_tier_party()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.tier, new.party) is distinct from (old.tier, old.party) then
    perform private.recompute_confidence(cs.claim_id)
    from (select distinct claim_id from public.claim_sources where source_id = new.id) cs;
  end if;
  return null;
end;
$$;

create trigger recompute_claims after update on public.sources
  for each row execute function private.after_source_tier_party();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.recompute_confidence(uuid) from public, anon, authenticated;
revoke all on function private.tier_labels(jsonb) from public, anon, authenticated;
revoke all on function private.after_conflict_update() from public, anon, authenticated;
revoke all on function private.stamp_link_marking() from public, anon, authenticated;
revoke all on function private.after_link_update() from public, anon, authenticated;
revoke all on function private.after_source_tier_party() from public, anon, authenticated;
