-- ===================================================
-- Supabase マイグレーション用 SQL (v27: 撮影記録の医療機関)
-- v26_drop_legacy_complete_screening.sql の適用後に実行してください。
-- 既存テーブル・既存データは削除しません。
-- ===================================================
--
-- 割り当て済みは被験者の所属、未割り当ては作成スタッフの所属で
-- 医療機関を決める。アプリ側でIDを全件引いて .or() しない。

begin;

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

notify pgrst, 'reload schema';

commit;
