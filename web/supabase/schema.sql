-- 関節炎スクリーニング支援AI データベーススキーマ
-- Supabase SQL Editor で実行してください

-- ========== clinics (医療機関) ==========
create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ========== profiles ==========
-- 管理者はアカウントを削除できるが、撮影データの担当者表示・医療機関の紐付けを保つため、
-- auth.usersの削除時にprofilesへcascadeさせず、削除済みの墓標行として残す（deleted_at）。
create table if not exists public.profiles (
  id uuid primary key,
  role text not null check (role in ('admin', 'clinic_staff')),
  full_name text not null,
  clinic_id uuid references public.clinics(id) on delete set null, -- admin の場合は NULL 可
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- 被験者ID用シーケンス (keio1, keio2, keio3...)
create sequence if not exists public.subject_number_seq start 1;

-- ========== subjects (匿名の被験者グループ) ==========
create table if not exists public.subjects (
  id text primary key default ('keio' || nextval('public.subject_number_seq')::text),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_subjects_clinic on public.subjects(clinic_id, created_at desc);

-- ========== screenings ==========
create table if not exists public.screenings (
  id uuid primary key default gen_random_uuid(),
  subject_id text references public.subjects(id) on delete set null, -- 未割り当ての場合は NULL
  created_by uuid references public.profiles(id) on delete set null,
  status text not null default 'uploading'
    check (status in ('uploading', 'analyzing', 'completed', 'failed')),
  status_updated_at timestamptz not null default now(),
  total_inflamed_joints integer,
  ra_detected boolean,
  ai_hands jsonb,
  ai_model_version text,
  analysis_thr_node numeric,
  analysis_thr_wrist numeric,
  constraint screenings_analysis_thresholds_check check (
    (analysis_thr_node is null and analysis_thr_wrist is null) or
    (analysis_thr_node is not null and analysis_thr_wrist is not null
     and analysis_thr_node between 0 and 1 and analysis_thr_wrist between 0 and 1)
  ),
  analyzed_at timestamptz,
  analysis_error_code text,
  analysis_error_http_status integer,
  analysis_error_at timestamptz,
  right_image_url text,
  left_image_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_screenings_subject on public.screenings(subject_id, created_at desc);

-- 割り当て済みは被験者の所属、未割り当ては作成スタッフの所属。
create or replace function public.screening_clinic_id(p_screening public.screenings)
returns uuid
language sql
stable
parallel safe
set search_path = public
as $$
  select coalesce(
    (
      select subjects.clinic_id
      from public.subjects
      where subjects.id = p_screening.subject_id
    ),
    (
      select profiles.clinic_id
      from public.profiles
      where profiles.id = p_screening.created_by
    )
  );
$$;

revoke all on function public.screening_clinic_id(public.screenings) from public;
grant execute on function public.screening_clinic_id(public.screenings)
  to authenticated, service_role;

-- 途中状態の滞留を検出できるよう、状態遷移時刻を自動更新する。
create or replace function public.touch_screening_status_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    new.status_updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists screenings_touch_status_updated_at on public.screenings;
create trigger screenings_touch_status_updated_at
  before update of status on public.screenings
  for each row execute function public.touch_screening_status_updated_at();

-- ========== joint_results ==========
create table if not exists public.joint_results (
  id uuid primary key default gen_random_uuid(),
  screening_id uuid not null references public.screenings(id) on delete cascade,
  side text not null check (side in ('right', 'left')),
  joint_name text not null,
  is_inflamed boolean not null default false,
  confidence_score double precision not null default 0
    check (confidence_score between 0 and 1)
);

create index if not exists idx_joint_results_screening on public.joint_results(screening_id);
create unique index if not exists idx_joint_results_screening_side_joint
  on public.joint_results(screening_id, side, joint_name);

-- ========== screening_analysis_debug_responses ==========
-- AI APIの成功レスポンス原文。管理者のみがデバッグ目的で参照できる。
create table if not exists public.screening_analysis_debug_responses (
  screening_id uuid primary key references public.screenings(id) on delete cascade,
  raw_response jsonb not null check (jsonb_typeof(raw_response) = 'object'),
  created_at timestamptz not null default now()
);

-- SupabaseのData APIでRLSを評価させるため、利用ロールにテーブル権限を付与する。
-- 実際に許可する行・操作は下記のRLSポリシーで制限する。
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on table
  public.clinics,
  public.profiles,
  public.subjects
to authenticated;
grant select on table
  public.screenings,
  public.joint_results
to authenticated;
grant select, insert, update, delete on table
  public.clinics,
  public.profiles,
  public.subjects,
  public.screenings,
  public.joint_results
to service_role;
grant usage, select on sequence public.subject_number_seq to authenticated, service_role;

-- 被験者IDの訂正を確定する。
-- 直接実行はService Roleに限定し、呼び出し元の有効状態・ロール・施設もDBで再確認する。
create or replace function public.correct_screening_subject(
  p_screening_id uuid,
  p_expected_subject_id text,
  p_new_subject_id text,
  p_changed_by uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current_subject_id text;
  v_created_by uuid;
  v_old_clinic_id uuid;
  v_new_clinic_id uuid;
  v_clinic_id uuid;
  v_actor_role text;
  v_actor_clinic_id uuid;
  v_actor_is_active boolean;
begin
  select subject_id, created_by
    into v_current_subject_id, v_created_by
  from public.screenings
  where id = p_screening_id;

  if not found then
    raise exception 'スクリーニング記録が見つかりません';
  end if;

  if v_current_subject_id is distinct from p_expected_subject_id then
    raise exception '被験者IDがすでに変更されています。画面を更新して確認してください';
  end if;

  if v_current_subject_id is not distinct from p_new_subject_id then
    raise exception '変更前後の被験者IDが同じです';
  end if;

  if v_current_subject_id is not null then
    select clinic_id into v_old_clinic_id
    from public.subjects
    where id = v_current_subject_id;
  elsif v_created_by is not null then
    select clinic_id into v_old_clinic_id
    from public.profiles
    where id = v_created_by;
  end if;

  if p_new_subject_id is not null then
    select clinic_id into v_new_clinic_id
    from public.subjects
    where id = p_new_subject_id;

    if not found then
      raise exception '変更先の被験者IDが見つかりません';
    end if;
  end if;

  if v_old_clinic_id is not null
     and v_new_clinic_id is not null
     and v_old_clinic_id <> v_new_clinic_id then
    raise exception '別の医療機関の被験者IDへは変更できません';
  end if;

  v_clinic_id := coalesce(v_old_clinic_id, v_new_clinic_id);
  if v_clinic_id is null then
    raise exception '記録の医療機関を特定できないため変更できません';
  end if;

  select role, clinic_id, is_active
    into v_actor_role, v_actor_clinic_id, v_actor_is_active
  from public.profiles
  where id = p_changed_by;

  if not found or not v_actor_is_active then
    raise exception '有効なユーザーのみ変更できます';
  end if;

  if v_actor_role <> 'admin'
     and (v_actor_role <> 'clinic_staff' or v_actor_clinic_id is distinct from v_clinic_id) then
    raise exception 'この医療機関の記録を変更する権限がありません';
  end if;

  update public.screenings
  set subject_id = p_new_subject_id
  where id = p_screening_id
    and subject_id is not distinct from p_expected_subject_id;

  if not found then
    raise exception '被験者IDがすでに変更されています。画面を更新して確認してください';
  end if;
end;
$$;

revoke all on function public.correct_screening_subject(uuid, text, text, uuid) from public;
revoke all on function public.correct_screening_subject(uuid, text, text, uuid) from authenticated;
grant execute on function public.correct_screening_subject(uuid, text, text, uuid) to service_role;

-- ========== ヘルパー関数 ==========
create or replace function public.is_active_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and is_active = true and deleted_at is null
  );
$$;

revoke all on function public.is_active_user() from public;
grant execute on function public.is_active_user() to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin' and is_active = true and deleted_at is null
  );
$$;

create or replace function public.get_user_clinic_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select clinic_id from profiles
  where id = auth.uid() and is_active = true and deleted_at is null;
$$;

-- ========== RLS ==========
alter table public.clinics enable row level security;
alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.screenings enable row level security;
alter table public.joint_results enable row level security;
alter table public.screening_analysis_debug_responses enable row level security;

-- clinics
drop policy if exists "clinics: admin は全件参照・編集可能, staff は自分の所属クリニックを参照可能" on public.clinics;
drop policy if exists "clinics: admin は全件, staff は自院を参照" on public.clinics;
drop policy if exists "clinics_active_access" on public.clinics;
drop policy if exists "clinics: 有効なユーザーがアクセス可能" on public.clinics;
drop policy if exists "clinics_select" on public.clinics;
drop policy if exists "clinics_admin_insert" on public.clinics;
drop policy if exists "clinics_admin_update" on public.clinics;
drop policy if exists "clinics_admin_delete" on public.clinics;

create policy "clinics_select"
  on public.clinics for select
  using (public.is_active_user() and (public.is_admin() or id = public.get_user_clinic_id()));

create policy "clinics_admin_insert"
  on public.clinics for insert
  with check (public.is_active_user() and public.is_admin());

create policy "clinics_admin_update"
  on public.clinics for update
  using (public.is_active_user() and public.is_admin())
  with check (public.is_active_user() and public.is_admin());

create policy "clinics_admin_delete"
  on public.clinics for delete
  using (public.is_active_user() and public.is_admin());

-- profiles
-- スタッフはプロフィールを参照できるが、role / clinic_id / is_active を含む
-- プロフィールの変更は管理者のみ可能。Server Actionでも管理者権限を確認してから実行する。
drop policy if exists "profiles: admin は全件参照・編集可能, staff は自分自身のプロファイルを参照可能" on public.profiles;
drop policy if exists "profiles: admin は全件, staff は自分・自院を参照" on public.profiles;
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_admin_insert" on public.profiles;
drop policy if exists "profiles_admin_update" on public.profiles;
drop policy if exists "profiles_admin_delete" on public.profiles;

create policy "profiles_select"
  on public.profiles for select
  using (
    public.is_active_user()
    and (public.is_admin() or id = auth.uid() or clinic_id = public.get_user_clinic_id())
  );

create policy "profiles_admin_insert"
  on public.profiles for insert
  with check (public.is_admin());

create policy "profiles_admin_update"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "profiles_admin_delete"
  on public.profiles for delete
  using (public.is_admin());

-- subjects
drop policy if exists "subjects: admin は全件参照・編集可能, staff は自院の subjects を全操作可能" on public.subjects;
drop policy if exists "subjects: admin は全件, staff は自院データを操作" on public.subjects;
drop policy if exists "subjects_active_tenant_access" on public.subjects;
drop policy if exists "subjects: 有効なユーザーが自院データを操作可能" on public.subjects;
create policy "subjects: 有効なユーザーが自院データを操作可能"
  on public.subjects for all
  using (public.is_active_user() and (public.is_admin() or clinic_id = public.get_user_clinic_id()))
  with check (public.is_active_user() and (public.is_admin() or clinic_id = public.get_user_clinic_id()));

-- screenings
drop policy if exists "screenings: admin は全件参照・編集可能, staff は自院の subjects / 自身が作成した screenings を参照・操作可能" on public.screenings;
drop policy if exists "screenings: admin は全件, staff は自院データを操作" on public.screenings;
drop policy if exists "screenings_tenant_access" on public.screenings;

-- 未割り当ての記録も、作成者と同じ医療機関のスタッフが訂正できるようにする。
-- Subjectに紐付いた記録は、Subjectの所属クリニック内のみアクセス可能にする。
create policy "screenings_tenant_access"
  on public.screenings for select
  using (
    public.is_active_user()
    and (
      public.is_admin()
      or (
        subject_id is null
        and exists (
          select 1 from public.profiles creator
          where creator.id = created_by
            and creator.clinic_id = public.get_user_clinic_id()
        )
      )
      or exists (
        select 1 from public.subjects s
        where s.id = subject_id and s.clinic_id = public.get_user_clinic_id()
      )
    )
  );

-- joint_results
drop policy if exists "joint_results: admin は全件, staff は自院の screenings に紐づくものを全操作可能" on public.joint_results;
drop policy if exists "joint_results: admin は全件, staff は自院データを操作" on public.joint_results;
drop policy if exists "joint_results_tenant_access" on public.joint_results;

create policy "joint_results_tenant_access"
  on public.joint_results for select
  using (
    public.is_active_user()
    and (
      public.is_admin()
      or exists (
        select 1 from public.screenings s
        where s.id = screening_id and (
          (
            s.subject_id is null
            and exists (
              select 1 from public.profiles creator
              where creator.id = s.created_by
                and creator.clinic_id = public.get_user_clinic_id()
            )
          )
          or exists (
            select 1 from public.subjects sub
            where sub.id = s.subject_id and sub.clinic_id = public.get_user_clinic_id()
          )
        )
      )
    )
  );

-- screening_analysis_debug_responses
-- Data APIからの読み取りも、RLSで有効な本部管理者だけに限定する。
drop policy if exists "screening_analysis_debug_responses_admin_select"
  on public.screening_analysis_debug_responses;
create policy "screening_analysis_debug_responses_admin_select"
  on public.screening_analysis_debug_responses for select
  using (public.is_admin());

grant select on table public.screening_analysis_debug_responses to authenticated, service_role;
grant insert, update, delete on table public.screening_analysis_debug_responses to service_role;

-- ========== Storage バケット ==========
insert into storage.buckets (id, name, public)
values ('hand-images', 'hand-images', false)
on conflict (id) do nothing;

-- Storage RLS: スタッフは撮影時のアップロードと失敗時の削除のみ。参照は本部管理者に限定する。
update storage.buckets
set file_size_limit = 10 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg']::text[]
where id = 'hand-images';

drop policy if exists "hand-images: 認証済みユーザーがアップロード" on storage.objects;
drop policy if exists "hand-images: 認証済みユーザーが参照" on storage.objects;
drop policy if exists "hand_images_insert_own_screening" on storage.objects;
drop policy if exists "hand_images_select_authorized_screening" on storage.objects;
drop policy if exists "hand_images_delete_own_uploading_screening" on storage.objects;

create policy "hand_images_insert_own_screening"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'hand-images'
    and public.is_active_user()
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and exists (
      select 1
      from public.screenings s
      where s.id::text = (storage.foldername(name))[2]
        and s.created_by = auth.uid()
        and s.status = 'uploading'
        and (
          s.subject_id is null
          or exists (
            select 1
            from public.subjects sub
            where sub.id = s.subject_id
              and sub.clinic_id = public.get_user_clinic_id()
          )
        )
    )
  );

create policy "hand_images_delete_own_uploading_screening"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'hand-images'
    and public.is_active_user()
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and exists (
      select 1
      from public.screenings s
      where s.id::text = (storage.foldername(name))[2]
        and s.created_by = auth.uid()
        and s.status = 'uploading'
    )
  );

create policy "hand_images_select_authorized_screening"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'hand-images'
    and public.is_active_user()
    and public.is_admin()
  );

-- ========== 管理者による解析結果の再実行 ==========
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

revoke all on function public.begin_screening_reanalysis(uuid, uuid) from public;
revoke all on function public.begin_screening_reanalysis(uuid, uuid) from authenticated;
grant execute on function public.begin_screening_reanalysis(uuid, uuid) to service_role;

-- ========== RAスクリーニングAPI結果の原子的な確定 ==========
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

revoke all on function public.complete_ra_screening_analysis(uuid, boolean, integer, jsonb) from public;
revoke all on function public.complete_ra_screening_analysis(uuid, boolean, integer, jsonb) from authenticated;
grant execute on function public.complete_ra_screening_analysis(uuid, boolean, integer, jsonb) to service_role;

create or replace function public.ra_api_joint_name(p_api_joint_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_api_joint_name
    when 'MCP1' then 'thumbMCP'
    when 'MCP2' then 'idxMCP'
    when 'MCP3' then 'midMCP'
    when 'MCP4' then 'ringMCP'
    when 'MCP5' then 'pinkyMCP'
    when 'PIP2' then 'idxPIP'
    when 'PIP3' then 'midPIP'
    when 'PIP4' then 'ringPIP'
    when 'PIP5' then 'pinkyPIP'
    when 'IP1 (thumb)' then 'thumbIP'
    when 'Wrist' then 'wrist'
    else null
  end;
$$;

revoke all on function public.ra_api_joint_name(text) from public;
revoke all on function public.ra_api_joint_name(text) from authenticated;
grant execute on function public.ra_api_joint_name(text) to service_role;

create or replace function public.complete_ra_screening_analysis_with_metadata(
  p_screening_id uuid,
  p_ra_detected boolean,
  p_total_positive_joints integer,
  p_hands jsonb,
  p_ai_model_version text,
  p_raw_response jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform public.complete_ra_screening_analysis(
    p_screening_id,
    p_ra_detected,
    p_total_positive_joints,
    p_hands
  );

  update public.screenings
  set ai_model_version = nullif(trim(p_ai_model_version), '')
  where id = p_screening_id;

  insert into public.screening_analysis_debug_responses (
    screening_id, raw_response
  )
  values (p_screening_id, p_raw_response)
  on conflict (screening_id) do update
  set raw_response = excluded.raw_response,
      created_at = now();
end;
$$;

revoke all on function public.complete_ra_screening_analysis_with_metadata(uuid, boolean, integer, jsonb, text, jsonb) from public;
revoke all on function public.complete_ra_screening_analysis_with_metadata(uuid, boolean, integer, jsonb, text, jsonb) from authenticated;
grant execute on function public.complete_ra_screening_analysis_with_metadata(uuid, boolean, integer, jsonb, text, jsonb) to service_role;

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
