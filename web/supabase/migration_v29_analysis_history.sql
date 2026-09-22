-- v28 → v29: 解析履歴。解析受付を停止し、進行中の解析を解消してから適用する。
begin;
lock table public.screenings in access exclusive mode;
do $$ begin
  if exists (select 1 from public.screenings where status = 'analyzing') then
    raise exception '解析中の記録があります。完了または中断復旧の後にv29を適用してください';
  end if;
end $$;
drop function public.begin_screening_reanalysis(uuid, uuid);
revoke all on function public.complete_ra_screening_analysis(uuid, boolean, integer, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.complete_ra_screening_analysis_with_metadata(uuid, boolean, integer, jsonb, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.complete_screening_analysis_with_thresholds(uuid, boolean, integer, jsonb, text, jsonb, numeric, numeric) from public, anon, authenticated, service_role;

-- ========== 解析履歴（v29） ==========
create table public.screening_analysis_runs (
  id uuid primary key,
  screening_id uuid not null references public.screenings(id) on delete cascade,
  run_number integer not null check (run_number > 0),
  kind text not null check (kind in ('initial', 'retry', 'legacy')),
  executed_by uuid references public.profiles(id),
  executor_name text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  status text not null check (status in ('analyzing', 'completed', 'failed')),
  source text check (source in ('api', 'mock')),
  right_image_url text,
  left_image_url text,
  analysis_thr_node numeric check (analysis_thr_node between 0 and 1),
  analysis_thr_wrist numeric check (analysis_thr_wrist between 0 and 1),
  ai_model_version text,
  ra_detected boolean,
  total_inflamed_joints integer check (total_inflamed_joints between 0 and 30),
  ai_hands jsonb,
  joint_results jsonb not null default '[]'::jsonb check (jsonb_typeof(joint_results) = 'array'),
  raw_response jsonb check (jsonb_typeof(raw_response) = 'object'),
  analysis_error_code text,
  analysis_error_http_status integer,
  analysis_error_at timestamptz,
  unique (screening_id, run_number),
  check ((analysis_thr_node is null) = (analysis_thr_wrist is null)),
  check (kind = 'legacy' or (executed_by is not null and started_at is not null and source is not null)),
  check (kind = 'legacy' or ((status = 'analyzing') = (finished_at is null)))
);

create unique index screening_analysis_runs_one_running
  on public.screening_analysis_runs(screening_id) where status = 'analyzing';
alter table public.screenings add column current_analysis_run_id uuid
  references public.screening_analysis_runs(id) on delete set null;

alter table public.screening_analysis_runs enable row level security;
revoke all on public.screening_analysis_runs from public, anon, authenticated;
grant select on public.screening_analysis_runs to authenticated;
grant select, insert, update, delete on public.screening_analysis_runs to service_role;
create policy screening_analysis_runs_admin_select
  on public.screening_analysis_runs for select to authenticated
  using (public.is_active_user() and public.is_admin());

-- 条件は開始時に固定し、実行中から確定状態への更新だけを許す。
-- 単独削除を拒否し、撮影記録の完全削除によるCASCADEだけを許す。
create or replace function public.protect_screening_analysis_run()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.screenings where id = old.screening_id) then
      raise exception '解析履歴は単独で削除できません';
    end if;
    return old;
  end if;
  if old.status <> 'analyzing' or new.status not in ('completed', 'failed')
     or (to_jsonb(new) - array['status','finished_at','ai_model_version','ra_detected',
       'total_inflamed_joints','ai_hands','joint_results','raw_response',
       'analysis_error_code','analysis_error_http_status','analysis_error_at'])
       is distinct from
       (to_jsonb(old) - array['status','finished_at','ai_model_version','ra_detected',
       'total_inflamed_joints','ai_hands','joint_results','raw_response',
       'analysis_error_code','analysis_error_http_status','analysis_error_at']) then
    raise exception '確定した解析履歴と解析条件は変更できません';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_screening_analysis_run() from public, anon, authenticated, service_role;
create trigger protect_screening_analysis_run
  before update or delete on public.screening_analysis_runs
  for each row execute function public.protect_screening_analysis_run();

create or replace function public.begin_screening_analysis_run(
  p_screening_id uuid, p_run_id uuid, p_actor_id uuid,
  p_expected_run_id uuid, p_kind text, p_source text
)
returns setof public.screening_analysis_runs
language plpgsql security invoker set search_path = public as $$
declare
  s public.screenings;
  actor public.profiles;
  settings public.screening_threshold_settings;
  next_number integer;
begin
  select * into actor from public.profiles where id = p_actor_id;
  if not found or not actor.is_active or actor.deleted_at is not null then
    raise exception '有効なアカウントが必要です';
  end if;
  select * into s from public.screenings where id = p_screening_id for update;
  if not found then raise exception '撮影記録が見つかりません'; end if;
  if actor.role <> 'admin' and
     (actor.role <> 'clinic_staff' or actor.clinic_id is null
      or actor.clinic_id is distinct from public.screening_clinic_id(s)) then
    raise exception '対象医療機関への権限がありません';
  end if;
  if p_kind is null or p_kind not in ('initial', 'retry')
     or p_source is null or p_source not in ('api', 'mock') or p_run_id is null then
    raise exception '解析開始の指定が不正です';
  end if;
  if p_kind = 'retry' and actor.role <> 'admin' then
    raise exception '有効な本部管理者のみ再解析できます';
  end if;
  -- 二重送信・古い画面からの実行は受け付けない。既存実行を再実行もしない。
  if exists (select 1 from public.screening_analysis_runs where id = p_run_id)
     or s.current_analysis_run_id is distinct from p_expected_run_id then
    return;
  end if;
  if (p_kind = 'initial' and (s.status <> 'analyzing' or s.current_analysis_run_id is not null
      or exists (select 1 from public.screening_analysis_runs where screening_id = s.id)))
     or (p_kind = 'retry' and s.status not in ('completed', 'failed')) then
    return;
  end if;
  select * into settings from public.screening_threshold_settings where id = true;
  select coalesce(max(run_number), 0) + 1 into next_number
    from public.screening_analysis_runs where screening_id = s.id;
  insert into public.screening_analysis_runs (
    id, screening_id, run_number, kind, executed_by, executor_name, started_at,
    status, source, right_image_url, left_image_url, analysis_thr_node, analysis_thr_wrist
  ) values (
    p_run_id, s.id, next_number, p_kind, actor.id, actor.full_name, now(),
    'analyzing', p_source, s.right_image_url, s.left_image_url, settings.thr_node, settings.thr_wrist
  );
  update public.screenings set
    current_analysis_run_id = p_run_id, status = 'analyzing', status_updated_at = now(),
    total_inflamed_joints = null, ra_detected = null, ai_hands = null,
    ai_model_version = null, analyzed_at = null,
    analysis_thr_node = null, analysis_thr_wrist = null,
    analysis_error_code = null, analysis_error_http_status = null, analysis_error_at = null
  where id = s.id;
  delete from public.joint_results where screening_id = s.id;
  delete from public.screening_analysis_debug_responses where screening_id = s.id;
  return query select * from public.screening_analysis_runs where id = p_run_id;
end;
$$;
revoke all on function public.begin_screening_analysis_run(uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.begin_screening_analysis_run(uuid, uuid, uuid, uuid, text, text) to service_role;

-- 旧確定関数は外部から実行不可。この限定された入口から検証処理として呼ぶ。
create or replace function public.complete_screening_analysis_run(
  p_screening_id uuid, p_run_id uuid, p_ra_detected boolean,
  p_total_positive_joints integer, p_hands jsonb,
  p_ai_model_version text, p_raw_response jsonb
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  s public.screenings;
  r public.screening_analysis_runs;
begin
  select * into s from public.screenings where id = p_screening_id for update;
  if not found or s.status <> 'analyzing' or s.current_analysis_run_id is distinct from p_run_id then
    return false;
  end if;
  select * into r from public.screening_analysis_runs
    where id = p_run_id and screening_id = s.id for update;
  if not found or r.status <> 'analyzing' then return false; end if;
  if jsonb_array_length(p_hands) is distinct from 2
     or p_hands->0->>'side' is distinct from 'left'
     or p_hands->1->>'side' is distinct from 'right' then
    raise exception '入力した左右の手と解析結果が一致しません';
  end if;
  perform public.complete_screening_analysis_with_thresholds(
    s.id, p_ra_detected, p_total_positive_joints, p_hands, p_ai_model_version,
    p_raw_response, r.analysis_thr_node, r.analysis_thr_wrist
  );
  update public.screening_analysis_runs set
    status = 'completed', finished_at = now(),
    ai_model_version = nullif(trim(p_ai_model_version), ''),
    ra_detected = p_ra_detected, total_inflamed_joints = p_total_positive_joints,
    ai_hands = p_hands, raw_response = p_raw_response,
    joint_results = (select coalesce(jsonb_agg(to_jsonb(j) order by j.side, j.joint_name), '[]'::jsonb)
      from public.joint_results j where j.screening_id = s.id)
  where id = r.id;
  return true;
end;
$$;
revoke all on function public.complete_screening_analysis_run(uuid, uuid, boolean, integer, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.complete_screening_analysis_run(uuid, uuid, boolean, integer, jsonb, text, jsonb) to service_role;

create or replace function public.fail_screening_analysis_run(
  p_screening_id uuid, p_run_id uuid, p_error_code text, p_http_status integer
)
returns boolean language plpgsql security invoker set search_path = public as $$
declare s public.screenings;
begin
  select * into s from public.screenings where id = p_screening_id for update;
  if not found or s.status <> 'analyzing' or s.current_analysis_run_id is distinct from p_run_id then
    return false;
  end if;
  update public.screening_analysis_runs set
    status = 'failed', finished_at = now(), analysis_error_code = p_error_code,
    analysis_error_http_status = p_http_status, analysis_error_at = now()
  where id = p_run_id and screening_id = s.id and status = 'analyzing';
  if not found then return false; end if;
  update public.screenings set status = 'failed', analysis_error_code = p_error_code,
    analysis_error_http_status = p_http_status, analysis_error_at = now()
  where id = s.id;
  return true;
end;
$$;
revoke all on function public.fail_screening_analysis_run(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.fail_screening_analysis_run(uuid, uuid, text, integer) to service_role;

create or replace function public.recover_interrupted_screening(
  p_screening_id uuid, p_actor_id uuid, p_expected_updated_at timestamptz
)
returns boolean language plpgsql security invoker set search_path = public as $$
declare s public.screenings;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id
    and is_active and deleted_at is null and role = 'admin') then
    raise exception '有効な本部管理者のみ復旧できます';
  end if;
  select * into s from public.screenings where id = p_screening_id for update;
  if not found or s.status not in ('uploading', 'analyzing')
    or s.status_updated_at is distinct from p_expected_updated_at
    or s.status_updated_at > now() - interval '10 minutes' then return false; end if;
  if s.current_analysis_run_id is not null then
    return public.fail_screening_analysis_run(s.id, s.current_analysis_run_id, 'analysis_interrupted', null);
  end if;
  -- アップロード途中・解析受付前の中断は、解析を実施した履歴を捏造しない。
  update public.screenings set status = 'failed', analysis_error_code = 'analysis_interrupted',
    analysis_error_http_status = null, analysis_error_at = now() where id = s.id;
  return true;
end;
$$;
revoke all on function public.recover_interrupted_screening(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.recover_interrupted_screening(uuid, uuid, timestamptz) to service_role;

-- 残っている情報だけを移す。初回扱いにせず、過去の実行者・開始日時・実行元は推測しない。
insert into public.screening_analysis_runs (
  id, screening_id, run_number, kind, status, finished_at,
  right_image_url, left_image_url, analysis_thr_node, analysis_thr_wrist,
  ai_model_version, ra_detected, total_inflamed_joints, ai_hands,
  joint_results, raw_response, analysis_error_code, analysis_error_http_status, analysis_error_at
)
select gen_random_uuid(), s.id, 1, 'legacy', s.status,
  case when s.status = 'completed' then s.analyzed_at else s.analysis_error_at end,
  s.right_image_url, s.left_image_url, s.analysis_thr_node, s.analysis_thr_wrist,
  s.ai_model_version, s.ra_detected, s.total_inflamed_joints, s.ai_hands,
  (select coalesce(jsonb_agg(to_jsonb(j) order by j.side, j.joint_name), '[]'::jsonb)
    from public.joint_results j where j.screening_id = s.id),
  d.raw_response, s.analysis_error_code, s.analysis_error_http_status, s.analysis_error_at
from public.screenings s
left join public.screening_analysis_debug_responses d on d.screening_id = s.id
where s.status in ('completed', 'failed');
update public.screenings s set current_analysis_run_id = r.id
from public.screening_analysis_runs r where r.screening_id = s.id;
notify pgrst, 'reload schema';
commit;
