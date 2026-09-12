-- ===================================================
-- Supabase マイグレーション用 SQL (v25: アカウント削除)
-- v24_ai_response_debug.sql の適用後に実行してください。
-- 既存テーブル・既存データは削除しません。
-- ===================================================
--
-- 管理者がアカウント（管理者・スタッフ）を削除できるようにする。
-- 削除済みアカウントに紐付いていた撮影データは削除せず、担当スタッフ名を
-- 「(削除済みユーザー)」として表示できるように、profilesを削除済みの
-- 墓標行として残す。auth.usersの削除時にprofilesへcascadeさせないよう、
-- 外部キー制約を外し、削除済みを示すdeleted_atを追加する。

begin;

alter table public.profiles drop constraint if exists profiles_id_fkey;

alter table public.profiles add column if not exists deleted_at timestamptz;

-- ダッシュボード等からauth.usersが直接削除され孤立したprofilesが残った場合の保険として、
-- 有効ユーザー判定の各ヘルパー関数にもdeleted_atの確認を追加する。
create or replace function public.is_active_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
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
    select 1 from public.profiles
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
  select clinic_id from public.profiles
  where id = auth.uid() and is_active = true and deleted_at is null;
$$;

commit;
