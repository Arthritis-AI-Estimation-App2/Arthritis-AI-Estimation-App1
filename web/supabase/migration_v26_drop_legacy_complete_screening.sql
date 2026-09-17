-- ===================================================
-- Supabase マイグレーション用 SQL (v26: 旧解析確定RPCの削除)
-- v25_account_deletion.sql の適用後に実行してください。
-- 既存テーブル・既存データは削除しません。
-- ===================================================
--
-- 左右15関節配列で解析を確定していた旧RPCは、アプリから呼ばれなくなった。
-- service_role に残っている実行権限をなくすため、関数ごと削除する。

begin;

drop function if exists public.complete_screening_analysis_with_metadata(
  uuid, integer, jsonb, jsonb, text
);
drop function if exists public.complete_screening_analysis(
  uuid, integer, jsonb, jsonb
);

commit;
