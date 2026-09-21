-- v27 → v28: Web側の関節判定閾値。既存結果・設定は上書きしない。
begin;
alter table public.screenings
  add column analysis_thr_node numeric,
  add column analysis_thr_wrist numeric,
  add constraint screenings_analysis_thresholds_check check (
    (analysis_thr_node is null and analysis_thr_wrist is null) or
    (analysis_thr_node is not null and analysis_thr_wrist is not null
     and analysis_thr_node between 0 and 1 and analysis_thr_wrist between 0 and 1)
  );

create or replace function public.begin_screening_reanalysis(
  p_screening_id uuid,
  p_changed_by uuid
)
returns table (id uuid, right_image_url text, left_image_url text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_role text;
  v_is_active boolean;
begin
  select role, is_active into v_role, v_is_active
  from public.profiles where profiles.id = p_changed_by;
  if not found or not v_is_active or v_role <> 'admin' then
    raise exception '有効な本部管理者のみ再解析できます';
  end if;
  update public.screenings
  set status = 'analyzing',
      total_inflamed_joints = null,
      ra_detected = null,
      ai_hands = null,
      ai_model_version = null,
      analysis_thr_node = null,
      analysis_thr_wrist = null,
      analyzed_at = null,
      analysis_error_code = null,
      analysis_error_http_status = null,
      analysis_error_at = null
  where screenings.id = p_screening_id and screenings.status in ('completed', 'failed')
  returning screenings.id, screenings.right_image_url, screenings.left_image_url
    into id, right_image_url, left_image_url;
  if not found then
    raise exception '完了または失敗した記録のみ再解析できます';
  end if;
  delete from public.joint_results where screening_id = p_screening_id;
  delete from public.screening_analysis_debug_responses where screening_id = p_screening_id;
  return next;
end;
$$;

create or replace function public.complete_ra_screening_analysis(
  p_screening_id uuid,
  p_ra_detected boolean,
  p_total_positive_joints integer,
  p_hands jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  updated_screening_id uuid;
  calculated_total integer;
  calculated_ra_detected boolean;
begin
  if p_ra_detected is null
     or p_total_positive_joints is null
     or p_total_positive_joints < 0 then
    raise exception 'RAスクリーニングの集計値が不正です';
  end if;

  if p_hands is null
     or jsonb_typeof(p_hands) <> 'array'
     or jsonb_array_length(p_hands) not between 1 and 2 then
    raise exception '手ごとの解析結果は1〜2件の配列である必要があります';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_hands) as items(hand)
    where jsonb_typeof(hand) <> 'object'
      or hand->>'side' not in ('left', 'right')
      or jsonb_typeof(hand->'ra_detected') <> 'boolean'
      or jsonb_typeof(hand->'hand_probability') <> 'number'
      or (hand->>'hand_probability')::numeric not between 0 and 1
      or jsonb_typeof(hand->'num_positive_joints') <> 'number'
      or hand->>'num_positive_joints' !~ '^[0-9]+$'
      or jsonb_typeof(hand->'num_joints_detected') <> 'number'
      or hand->>'num_joints_detected' !~ '^[0-9]+$'
      or (hand->>'num_positive_joints')::numeric
         > (hand->>'num_joints_detected')::numeric
      or jsonb_typeof(hand->'joints') <> 'array'
      or jsonb_typeof(hand->'warnings') <> 'array'
  ) then
    raise exception '手ごとの解析結果の内容が不正です';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_hands) as items(hand)
    where jsonb_array_length(hand->'joints') > 0
      and (
        jsonb_array_length(hand->'joints') <> (hand->>'num_joints_detected')::integer
        or (
          select count(*)
          from jsonb_array_elements(hand->'joints') as joint_items(joint)
          where (joint->>'positive')::boolean
        ) <> (hand->>'num_positive_joints')::integer
        or (
          select count(distinct joint->>'joint_name')
          from jsonb_array_elements(hand->'joints') as joint_items(joint)
        ) <> jsonb_array_length(hand->'joints')
        or exists (
          select 1
          from jsonb_array_elements(hand->'joints') as joint_items(joint)
          where jsonb_typeof(joint) <> 'object'
            or public.ra_api_joint_name(joint->>'joint_name') is null
            or jsonb_typeof(joint->'probability') <> 'number'
            or (joint->>'probability')::numeric not between 0 and 1
            or jsonb_typeof(joint->'positive') <> 'boolean'
        )
      )
  ) then
    raise exception '関節別解析結果の内容または集計値が不正です';
  end if;

  if (
    select count(distinct hand->>'side')
    from jsonb_array_elements(p_hands) as items(hand)
  ) <> jsonb_array_length(p_hands) then
    raise exception '手ごとの解析結果でsideが重複しています';
  end if;

  select
    sum((hand->>'num_positive_joints')::integer),
    bool_or((hand->>'ra_detected')::boolean)
  into calculated_total, calculated_ra_detected
  from jsonb_array_elements(p_hands) as items(hand);

  if calculated_total <> p_total_positive_joints
     or calculated_ra_detected <> p_ra_detected then
    raise exception 'RAスクリーニングの集計値と手ごとの結果が一致しません';
  end if;

  update public.screenings
  set status = 'completed',
      total_inflamed_joints = p_total_positive_joints,
      ra_detected = p_ra_detected,
      ai_hands = p_hands,
      ai_model_version = null,
      analysis_thr_node = null,
      analysis_thr_wrist = null,
      analyzed_at = now(),
      analysis_error_code = null,
      analysis_error_http_status = null,
      analysis_error_at = null
  where id = p_screening_id and status = 'analyzing'
  returning id into updated_screening_id;

  if updated_screening_id is null then
    raise exception '解析中ではないスクリーニングは確定できません';
  end if;

  delete from public.joint_results where screening_id = p_screening_id;

  insert into public.joint_results (
    screening_id, side, joint_name, is_inflamed, confidence_score
  )
  select
    p_screening_id,
    hand->>'side',
    public.ra_api_joint_name(joint->>'joint_name'),
    (joint->>'positive')::boolean,
    (joint->>'probability')::double precision
  from jsonb_array_elements(p_hands) as hand_items(hand)
  cross join lateral jsonb_array_elements(hand->'joints') as joint_items(joint);
end;
$$;

-- ========== 関節判定の共通閾値 ==========
create table if not exists public.screening_threshold_settings (
  id boolean primary key default true check (id),
  thr_node numeric not null check (thr_node between 0 and 1),
  thr_wrist numeric not null check (thr_wrist between 0 and 1)
);

-- 2026-09-15-v1 checkpointの初期値。モデル差し替えでも既存設定を上書きしない。
insert into public.screening_threshold_settings (id, thr_node, thr_wrist)
values (true, 0.34396984924623114, 0.4344221105527638)
on conflict (id) do nothing;

alter table public.screening_threshold_settings enable row level security;
revoke all on public.screening_threshold_settings from anon, authenticated;
grant select, update on public.screening_threshold_settings to authenticated;
grant all on public.screening_threshold_settings to service_role;
create policy "threshold_settings_read_active"
  on public.screening_threshold_settings for select to authenticated
  using (public.is_active_user());
create policy "threshold_settings_update_admin"
  on public.screening_threshold_settings for update to authenticated
  using (public.is_active_user() and public.is_admin())
  with check (public.is_active_user() and public.is_admin());

-- API原文とは別に、Webで閾値を適用した結果と使用値を原子的に確定する。
create or replace function public.complete_screening_analysis_with_thresholds(
  p_screening_id uuid,
  p_ra_detected boolean,
  p_total_positive_joints integer,
  p_hands jsonb,
  p_ai_model_version text,
  p_raw_response jsonb,
  p_thr_node numeric,
  p_thr_wrist numeric
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_thr_node is null or p_thr_wrist is null
     or not (p_thr_node between 0 and 1) or not (p_thr_wrist between 0 and 1) then
    raise exception '判定閾値は0〜1で指定してください';
  end if;

  -- 既存の検証・保存も同じトランザクション内。以降の検証失敗は全体をロールバックする。
  perform public.complete_ra_screening_analysis_with_metadata(
    p_screening_id, p_ra_detected, p_total_positive_joints,
    p_hands, p_ai_model_version, p_raw_response
  );

  if exists (
    select 1 from jsonb_array_elements(p_hands) as h(hand)
    where jsonb_array_length(hand->'joints') is distinct from (hand->>'num_joints_detected')::integer
       or (hand->>'num_joints_detected')::integer not between 0 and 11
       or (hand->>'num_positive_joints')::integer is distinct from (
         select count(*)::integer from jsonb_array_elements(hand->'joints') as j(joint)
         where (joint->>'positive')::boolean
       )
  ) or exists (
    select 1 from jsonb_array_elements(p_hands) as h(hand)
    cross join lateral jsonb_array_elements(hand->'joints') as j(joint)
    where jsonb_typeof(joint->'probability') is distinct from 'number'
       or jsonb_typeof(joint->'positive') is distinct from 'boolean'
       or (joint->>'probability')::double precision not between 0 and 1
       or public.ra_api_joint_name(joint->>'joint_name') is null
       or (joint->>'positive')::boolean is distinct from (
         (joint->>'probability')::numeric >=
           case when joint->>'joint_name' = 'Wrist' then p_thr_wrist else p_thr_node end
       )
  ) then
    raise exception '関節結果と判定閾値が一致しません';
  end if;

  update public.screenings
  set analysis_thr_node = p_thr_node, analysis_thr_wrist = p_thr_wrist
  where id = p_screening_id;
end;
$$;

revoke all on function public.complete_screening_analysis_with_thresholds(uuid, boolean, integer, jsonb, text, jsonb, numeric, numeric) from public, authenticated;
grant execute on function public.complete_screening_analysis_with_thresholds(uuid, boolean, integer, jsonb, text, jsonb, numeric, numeric) to service_role;

commit;
