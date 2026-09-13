"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { throwSupabaseError } from "@/lib/supabase/error";
import { getCurrentUser } from "@/lib/auth";
import {
  pageRange,
  paginationMeta,
  normalizePage,
  isUnsatisfiableRange,
} from "@/lib/staff-pagination";
import {
  escapeSubjectLikePattern,
  normalizeSubjectQuery,
} from "@/lib/subject-search";
import { revalidatePath } from "next/cache";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value: string) {
  return UUID_PATTERN.test(value);
}

/** 新規の被験者ID（Subject）を発行 */
export async function createSubject(screeningId?: string): Promise<{
  subjectId: string | null;
  error: string | null;
}> {
  const current = await getCurrentUser();
  if (!current) {
    return { subjectId: null, error: "ログインが必要です" };
  }

  const supabase = await createClient();
  let clinicId = current.profile.clinic_id;

  // 管理者は医療機関に所属しないため、詳細画面からの発行時は
  // 対象記録の被験者または撮影者から医療機関を確定する。
  if (screeningId !== undefined) {
    if (!isValidUuid(screeningId)) {
      return { subjectId: null, error: "撮影記録の指定が不正です" };
    }

    const { data: screening, error: screeningError } = await supabase
      .from("screenings")
      .select("subject_id, created_by")
      .eq("id", screeningId)
      .maybeSingle();
    if (screeningError) {
      console.error("被験者ID発行時のスクリーニング取得エラー:", screeningError);
      return { subjectId: null, error: "撮影記録の取得に失敗しました" };
    }
    if (!screening) {
      return { subjectId: null, error: "この撮影記録を変更する権限がありません" };
    }

    try {
      const screeningClinicId = await getScreeningClinicId(supabase, screening);
      if (!screeningClinicId) {
        return { subjectId: null, error: "記録の医療機関を特定できません" };
      }
      if (
        current.profile.role !== "admin" &&
        current.profile.clinic_id !== screeningClinicId
      ) {
        return { subjectId: null, error: "この医療機関の被験者IDを発行する権限がありません" };
      }
      clinicId = screeningClinicId;
    } catch (error) {
      console.error("被験者ID発行時の所属医療機関確認エラー:", error);
      return { subjectId: null, error: "記録の医療機関の確認に失敗しました" };
    }
  }

  if (!clinicId) {
    return { subjectId: null, error: "医療機関所属のスタッフのみ実行可能です" };
  }

  const { data, error } = await supabase
    .from("subjects")
    .insert({ clinic_id: clinicId })
    .select("id")
    .single();

  if (error) {
    console.error("Subject作成エラー:", error);
    return { subjectId: null, error: "被験者IDの作成に失敗しました" };
  }

  revalidatePath("/subjects");
  return { subjectId: data.id, error: null };
}

/** 自院の被験者（Subject）一覧を取得 */
export async function getSubjects() {
  const current = await getCurrentUser();
  if (!current) return [];

  const supabase = await createClient();
  let query = supabase
    .from("subjects")
    .select(
      "id, clinic_id, created_at, screenings(id, status, total_inflamed_joints, created_at)"
    )
    .order("created_at", { ascending: false });

  if (current.profile.role !== "admin" && current.profile.clinic_id) {
    query = query.eq("clinic_id", current.profile.clinic_id);
  }

  const { data, error } = await query;
  if (error) throwSupabaseError(error, "被験者一覧の取得");
  return data ?? [];
}

/** 自院の被験者（Subject）を検索して1ページ取得 */
export async function getSubjectsPage(
  filters: { page?: unknown; query?: unknown } = {}
) {
  const current = await getCurrentUser();
  const safePage = normalizePage(filters.page);
  const normalizedQuery = normalizeSubjectQuery(
    typeof filters.query === "string" ? filters.query : ""
  );
  if (!current) {
    return {
      items: [],
      ...paginationMeta(0, safePage),
      query: normalizedQuery,
    };
  }

  const supabase = await createClient();
  let subjectsQuery = supabase
    .from("subjects")
    .select("id, clinic_id, created_at, screenings(count)", { count: "exact" });

  if (current.profile.role !== "admin" && current.profile.clinic_id) {
    subjectsQuery = subjectsQuery.eq("clinic_id", current.profile.clinic_id);
  }
  if (normalizedQuery) {
    subjectsQuery = subjectsQuery.ilike(
      "id",
      `%${escapeSubjectLikePattern(normalizedQuery)}%`
    );
  }

  const { firstRow, lastRow } = pageRange(safePage);
  const { data, error, count } = await subjectsQuery
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(firstRow, lastRow);
  let total = count ?? 0;
  if (error) {
    if (!isUnsatisfiableRange(error)) {
      throwSupabaseError(error, "被験者一覧の取得");
    }

    let countQuery = supabase
      .from("subjects")
      .select("id", { count: "exact", head: true });
    if (current.profile.role !== "admin" && current.profile.clinic_id) {
      countQuery = countQuery.eq("clinic_id", current.profile.clinic_id);
    }
    if (normalizedQuery) {
      countQuery = countQuery.ilike(
        "id",
        `%${escapeSubjectLikePattern(normalizedQuery)}%`
      );
    }
    const { count: fallbackCount, error: countError } = await countQuery;
    if (countError) throwSupabaseError(countError, "被験者一覧の件数取得");
    total = fallbackCount ?? 0;
  }

  const items = (data ?? []).map(({ screenings, ...subject }) => ({
    ...subject,
    screening_count: screenings?.[0]?.count ?? 0,
  }));

  return {
    items,
    ...paginationMeta(total, safePage),
    query: normalizedQuery,
  };
}

/** 未割り当てのスクリーニングを1ページ取得 */
export async function getUnassignedScreenings(page = 1) {
  const current = await getCurrentUser();
  const safePage = normalizePage(page);
  if (!current) {
    return { items: [], ...paginationMeta(0, safePage) };
  }

  const supabase = await createClient();
  const { firstRow, lastRow } = pageRange(safePage);
  const { data, error, count } = await supabase
    .from("screenings")
    .select(
      "id, subject_id, created_by, status, total_inflamed_joints, created_at, profiles:created_by(full_name, deleted_at), joint_results(side, joint_name, is_inflamed)",
      { count: "exact" }
    )
    .is("subject_id", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(firstRow, lastRow);
  let total = count ?? 0;
  if (error) {
    if (!isUnsatisfiableRange(error)) {
      throwSupabaseError(error, "未割り当て撮影記録の取得");
    }
    const { count: fallbackCount, error: countError } = await supabase
      .from("screenings")
      .select("id", { count: "exact", head: true })
      .is("subject_id", null);
    if (countError) {
      throwSupabaseError(countError, "未割り当て撮影記録の件数取得");
    }
    total = fallbackCount ?? 0;
  }

  return {
    items: data ?? [],
    ...paginationMeta(total, safePage),
  };
}

/** 撮影記録を指定の Subject ID に紐付ける。 */
export async function assignScreeningsToSubject(
  subjectId: string,
  screeningIds: string[]
): Promise<{ error: string | null }> {
  const current = await getCurrentUser();
  if (!current) return { error: "ログインが必要です" };

  if (screeningIds.length === 0) return { error: null };

  const supabase = await createClient();

  // スタッフは自院のSubjectにしか紐付けられない。RLSでも強制するが、
  // ここで先に明示的に検証して、越境指定を早期に拒否する。
  if (current.profile.role !== "admin") {
    if (!current.profile.clinic_id) {
      return { error: "医療機関所属のスタッフのみ実行可能です" };
    }

    const { data: subject, error: subjectError } = await supabase
      .from("subjects")
      .select("id")
      .eq("id", subjectId)
      .eq("clinic_id", current.profile.clinic_id)
      .maybeSingle();

    if (subjectError) {
      console.error("紐付け時のSubject確認エラー:", subjectError);
      return { error: "Subjectの確認に失敗しました" };
    }
    if (!subject) return { error: "指定されたSubjectを利用できません" };
  }

  const uniqueScreeningIds = [...new Set(screeningIds)];
  const { data: accessibleScreenings, error: accessError } = await supabase
    .from("screenings")
    .select("id")
    .in("id", uniqueScreeningIds)
    .is("subject_id", null);

  if (
    accessError ||
    !accessibleScreenings ||
    accessibleScreenings.length !== uniqueScreeningIds.length
  ) {
    return { error: "指定された撮影記録を利用できません" };
  }

  // 対象Subjectと全screeningを通常クライアント＋RLSで確認してから、
  // Service Roleで紐付けだけを更新する。authenticatedにはscreeningsの
  // 直接更新権限を与えず、診断結果や状態の改ざん経路を閉じる。
  const adminClient = createAdminClient();
  const { data: updatedScreenings, error } = await adminClient
    .from("screenings")
    .update({ subject_id: subjectId })
    .in("id", uniqueScreeningIds)
    .is("subject_id", null)
    .select("id");

  if (error) {
    console.error("スクリーニングのSubject紐付けエラー:", error);
    return { error: "撮影記録の紐付けに失敗しました" };
  }
  if (!updatedScreenings || updatedScreenings.length !== uniqueScreeningIds.length) {
    return { error: "一部の撮影記録を更新できませんでした" };
  }

  revalidatePath("/subjects");
  revalidatePath(`/subjects/${subjectId}`);
  return { error: null };
}

async function getScreeningClinicId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  screening: { subject_id: string | null; created_by: string | null }
) {
  if (screening.subject_id) {
    const { data: subject, error } = await supabase
      .from("subjects")
      .select("clinic_id")
      .eq("id", screening.subject_id)
      .maybeSingle();
    if (error) throwSupabaseError(error, "被験者IDの所属医療機関の取得");
    return subject?.clinic_id ?? null;
  }

  if (!screening.created_by) return null;

  const { data: creator, error } = await supabase
    .from("profiles")
    .select("clinic_id")
    .eq("id", screening.created_by)
    .maybeSingle();
  if (error) throwSupabaseError(error, "撮影者の所属医療機関の取得");
  return creator?.clinic_id ?? null;
}

/** 被験者IDの紐付けを訂正または解除する。 */
export async function correctScreeningSubject(
  screeningId: string,
  newSubjectId: string | null
): Promise<{ error: string | null }> {
  const current = await getCurrentUser();
  if (!current) return { error: "ログインが必要です" };
  if (!isValidUuid(screeningId)) return { error: "撮影記録の指定が不正です" };

  const normalizedSubjectId = newSubjectId?.trim() || null;

  const supabase = await createClient();
  const { data: screening, error: screeningError } = await supabase
    .from("screenings")
    .select("id, subject_id, created_by")
    .eq("id", screeningId)
    .maybeSingle();
  if (screeningError) {
    console.error("被験者ID訂正時のスクリーニング取得エラー:", screeningError);
    return { error: "撮影記録の取得に失敗しました" };
  }
  if (!screening) return { error: "この撮影記録を変更する権限がありません" };
  if (screening.subject_id === normalizedSubjectId) {
    return { error: "変更前後の被験者IDが同じです" };
  }

  try {
    const screeningClinicId = await getScreeningClinicId(supabase, screening);
    if (
      current.profile.role !== "admin" &&
      (!current.profile.clinic_id || screeningClinicId !== current.profile.clinic_id)
    ) {
      return { error: "この医療機関の撮影記録を変更する権限がありません" };
    }

    if (normalizedSubjectId) {
      const { data: nextSubject, error: nextSubjectError } = await supabase
        .from("subjects")
        .select("id, clinic_id")
        .eq("id", normalizedSubjectId)
        .maybeSingle();
      if (nextSubjectError) throwSupabaseError(nextSubjectError, "変更先の被験者IDの取得");
      if (!nextSubject) return { error: "変更先の被験者IDが見つかりません" };
      if (screeningClinicId && nextSubject.clinic_id !== screeningClinicId) {
        return { error: "別の医療機関の被験者IDへは変更できません" };
      }
      if (current.profile.role !== "admin" && nextSubject.clinic_id !== current.profile.clinic_id) {
        return { error: "自院の被験者IDのみ指定できます" };
      }
    }
  } catch (error) {
    console.error("被験者ID訂正時の所属医療機関確認エラー:", error);
    return { error: "被験者IDまたは所属医療機関の確認に失敗しました" };
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.rpc("correct_screening_subject", {
    p_screening_id: screeningId,
    p_expected_subject_id: screening.subject_id,
    p_new_subject_id: normalizedSubjectId,
    p_changed_by: current.userId,
  });
  if (error) {
    console.error("被験者ID訂正エラー:", error);
    return { error: "被験者IDの訂正に失敗しました。画面を更新して再度お試しください" };
  }

  revalidatePath("/");
  revalidatePath("/grouping");
  revalidatePath("/subjects");
  revalidatePath("/admin/screenings");
  revalidatePath(`/results/${screeningId}`);
  revalidatePath(`/admin/screenings/${screeningId}`);
  if (screening.subject_id) revalidatePath(`/subjects/${screening.subject_id}`);
  if (normalizedSubjectId) revalidatePath(`/subjects/${normalizedSubjectId}`);

  return { error: null };
}

/** 指定した記録と同じ医療機関で、訂正先に選択できる被験者IDを取得する。 */
export async function getSubjectsForScreeningCorrection(screeningId: string) {
  const current = await getCurrentUser();
  if (!current || !isValidUuid(screeningId)) return [];

  const supabase = await createClient();
  const { data: screening, error: screeningError } = await supabase
    .from("screenings")
    .select("subject_id, created_by")
    .eq("id", screeningId)
    .maybeSingle();
  if (screeningError) throwSupabaseError(screeningError, "撮影記録の取得");
  if (!screening) return [];

  const clinicId = await getScreeningClinicId(supabase, screening);
  if (!clinicId) return [];

  const { data: subjects, error } = await supabase
    .from("subjects")
    .select("id, clinic_id, created_at")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false });
  if (error) throwSupabaseError(error, "訂正先の被験者ID一覧の取得");
  return subjects ?? [];
}

/** 被験者詳細および判定履歴を1ページ取得 */
export async function getSubjectDetail(subjectId: string, page = 1) {
  const current = await getCurrentUser();
  if (!current) return null;
  const safePage = normalizePage(page);

  const supabase = await createClient();
  const { data: subject, error: subjectError } = await supabase
    .from("subjects")
    .select("id, clinic_id, created_at")
    .eq("id", subjectId)
    .maybeSingle();

  if (subjectError) throwSupabaseError(subjectError, "被験者の取得");
  if (!subject) return null;

  const { firstRow, lastRow } = pageRange(safePage);
  const { data: screenings, error: screeningsError, count } = await supabase
    .from("screenings")
    .select(
      "id, subject_id, created_by, status, total_inflamed_joints, created_at",
      { count: "exact" }
    )
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(firstRow, lastRow);
  let total = count ?? 0;
  if (screeningsError) {
    if (!isUnsatisfiableRange(screeningsError)) {
      throwSupabaseError(screeningsError, "被験者の撮影履歴取得");
    }
    const { count: fallbackCount, error: countError } = await supabase
      .from("screenings")
      .select("id", { count: "exact", head: true })
      .eq("subject_id", subjectId);
    if (countError) throwSupabaseError(countError, "被験者の撮影履歴件数取得");
    total = fallbackCount ?? 0;
  }

  return {
    subject,
    items: screenings ?? [],
    ...paginationMeta(total, safePage),
  };
}
