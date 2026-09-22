"use server";

import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { throwSupabaseError } from "@/lib/supabase/error";
import {
  normalizeAdminScreeningFilters, screeningIdPrefixBounds,
  startOfJapanDate, endOfJapanDateExclusive, type AdminScreeningFilters,
} from "@/lib/admin-screening-filters";

async function requireHistoryAdmin() {
  const current = await getCurrentUser();
  if (!current?.profile.is_active || current.profile.role !== "admin") {
    throw new Error("解析履歴の閲覧には有効な管理者アカウントが必要です");
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getAnalysisHistory(screeningId: string, requestedPage = 1, currentRunId?: string | null) {
  await requireHistoryAdmin();
  if (typeof screeningId !== "string" || !UUID_PATTERN.test(screeningId)) throw new Error("撮影IDが不正です");
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = 20;
  const supabase = await createClient();
  let query = supabase.from("screening_analysis_runs")
    .select("*", { count: "exact" }).eq("screening_id", screeningId);
  if (typeof currentRunId === "string" && UUID_PATTERN.test(currentRunId)) query = query.neq("id", currentRunId);
  const { data, error, count } = await query
    .order("run_number", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throwSupabaseError(error, "解析履歴の取得");
  return { runs: data ?? [], total: count ?? 0, page, totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)) };
}

/** 一覧条件は撮影記録に適用し、該当する記録の全実行を出力する。 */
export async function getAnalysisHistoryExportPage(
  filters: AdminScreeningFilters, page: number, createdBefore: string,
) {
  await requireHistoryAdmin();
  const safe = normalizeAdminScreeningFilters({
    clinic: typeof filters?.clinicId === "string" ? filters.clinicId : undefined,
    from: typeof filters?.dateFrom === "string" ? filters.dateFrom : undefined,
    to: typeof filters?.dateTo === "string" ? filters.dateTo : undefined,
    status: typeof filters?.status === "string" ? filters.status : undefined,
    subject: typeof filters?.subjectId === "string" ? filters.subjectId : undefined,
    id: typeof filters?.screeningIdInput === "string" ? filters.screeningIdInput : undefined,
  });
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  if (typeof createdBefore !== "string" || !Number.isFinite(Date.parse(createdBefore))) throw new Error("出力日時が不正です");
  const supabase = await createClient();
  let query = supabase.from("screening_analysis_runs").select(`
    id, screening_id, run_number, kind, executed_by, executor_name, started_at, finished_at,
    status, source, analysis_thr_node, analysis_thr_wrist, ai_model_version,
    ra_detected, total_inflamed_joints, joint_results,
    analysis_error_code, analysis_error_http_status, analysis_error_at,
    screenings!screening_analysis_runs_screening_id_fkey!inner(
      id, subject_id, created_at, subjects(clinics(name)), profiles:created_by(clinics(name))
    )`, { count: "exact" }).lte("created_at", createdBefore);
  if (safe.screeningIdInput && !safe.screeningId && !safe.screeningIdPrefix) {
    return { runs: [], total: 0 };
  }
  if (safe.clinicId) query = query.eq("screenings.screening_clinic_id", safe.clinicId);
  if (safe.status) query = query.eq("screenings.status", safe.status);
  if (safe.subjectId) query = query.eq("screenings.subject_id", safe.subjectId);
  if (safe.screeningId) query = query.eq("screening_id", safe.screeningId);
  else if (safe.screeningIdPrefix) {
    const bounds = screeningIdPrefixBounds(safe.screeningIdPrefix);
    query = query.gte("screening_id", bounds.from).lte("screening_id", bounds.to);
  }
  if (safe.dateFrom) query = query.gte("screenings.created_at", startOfJapanDate(safe.dateFrom));
  if (safe.dateTo) query = query.lt("screenings.created_at", endOfJapanDateExclusive(safe.dateTo));
  const { data, error, count } = await query.order("screening_id").order("run_number")
    .range((safePage - 1) * 500, safePage * 500 - 1);
  if (error) throwSupabaseError(error, "解析履歴CSVの取得");
  return { runs: data ?? [], total: count ?? 0 };
}
