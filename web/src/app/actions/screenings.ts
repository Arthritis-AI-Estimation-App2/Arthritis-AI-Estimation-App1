"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { throwSupabaseError } from "@/lib/supabase/error";
import { getCurrentUser } from "@/lib/auth";
import {
  isScreeningImagePath,
  screeningImageCreatorId,
} from "@/lib/screening-image-path";
import { HAND_IMAGES_BUCKET } from "@/lib/storage";
import { tryCreateSignedHandImageUrls } from "@/lib/supabase/signed-hand-images";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  endOfJapanDateExclusive,
  screeningIdPrefixBounds,
  startOfJapanDate,
} from "@/lib/admin-screening-filters";
import { isUnsatisfiableRange, pageRange, paginationMeta } from "@/lib/staff-pagination";
import {
  normalizeStaffScreeningFilters,
  type StaffScreeningFilters,
} from "@/lib/staff-screening-filters";

type ActionState = { error: string | null; success: boolean };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value: string) {
  return UUID_PATTERN.test(value);
}

/** 新規撮影記録を作成（status: uploading） */
export async function createScreening(subjectId?: string): Promise<{
  screeningId: string | null;
  error: string | null;
}> {
  const current = await getCurrentUser();
  if (!current) return { screeningId: null, error: "ログインが必要です" };

  const supabase = await createClient();

  // Subjectを指定する場合は、スタッフの所属医療機関と一致することを
  // Server Action側でも確認する。最終的な強制はDBのRLSで行う。
  if (subjectId) {
    let subjectQuery = supabase
      .from("subjects")
      .select("id")
      .eq("id", subjectId);

    if (current.profile.role !== "admin") {
      if (!current.profile.clinic_id) {
        return { screeningId: null, error: "医療機関所属のスタッフのみ実行可能です" };
      }
      subjectQuery = subjectQuery.eq("clinic_id", current.profile.clinic_id);
    }

    const { data: subject, error: subjectError } = await subjectQuery.maybeSingle();
    if (subjectError) {
      console.error("スクリーニング作成時のSubject確認エラー:", subjectError);
      return { screeningId: null, error: "Subjectの確認に失敗しました" };
    }
    if (!subject) {
      return { screeningId: null, error: "指定されたSubjectを利用できません" };
    }
  }

  // Service Role は、通常クライアントで認証・対象Subjectを確認した後の
  // この限定した書き込みにだけ使う。ブラウザのData APIから同じ更新を
  // 実行できないよう、screenings の書き込み権限は authenticated から外している。
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("screenings")
    .insert({
      subject_id: subjectId || null,
      created_by: current.userId,
      status: "uploading",
    })
    .select("id")
    .single();

  if (error) {
    console.error("スクリーニング作成エラー:", error);
    return { screeningId: null, error: "撮影記録の作成に失敗しました" };
  }
  return { screeningId: data.id, error: null };
}

/** 画像アップロード完了後に画像URLを登録 */
export async function updateScreeningImages(
  screeningId: string,
  rightImagePath: string,
  leftImagePath: string
): Promise<{ error: string | null }> {
  const current = await getCurrentUser();
  if (!current) return { error: "ログインが必要です" };

  const supabase = await createClient();
  const { data: screening, error: screeningError } = await supabase
    .from("screenings")
    .select("id, created_by, status")
    .eq("id", screeningId)
    .maybeSingle();

  if (screeningError) {
    console.error("画像更新時のスクリーニング確認エラー:", screeningError);
    return { error: "撮影記録の確認に失敗しました" };
  }
  if (!screening || screening.created_by !== current.userId) {
    return { error: "この撮影記録を更新する権限がありません" };
  }

  if (screening.status !== "uploading") {
    return { error: "この撮影記録は画像を更新できる状態ではありません" };
  }

  // Storageのパスを任意の別ユーザー・別スクリーニングのパスに
  // 差し替えられないよう、作成者とscreening IDの配下に限定する。
  if (
    !isScreeningImagePath(rightImagePath, current.userId, screeningId, "right") ||
    !isScreeningImagePath(leftImagePath, current.userId, screeningId, "left")
  ) {
    return { error: "画像パスが不正です" };
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("screenings")
    .update({
      right_image_url: rightImagePath,
      left_image_url: leftImagePath,
      status: "analyzing",
    })
    .eq("id", screeningId)
    .eq("created_by", current.userId)
    .eq("status", "uploading")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("スクリーニング画像更新エラー:", error);
    return { error: "画像情報の更新に失敗しました" };
  }
  if (!data) return { error: "この撮影記録は画像を更新できる状態ではありません" };
  return { error: null };
}

/** アップロード途中で失敗したscreeningと画像を破棄 */
export async function abandonScreeningUpload(
  screeningId: string,
  imagePaths: string[]
): Promise<{ error: string | null }> {
  const current = await getCurrentUser();
  if (!current) return { error: "ログインが必要です" };

  const supabase = await createClient();
  const { data: screening, error: screeningError } = await supabase
    .from("screenings")
    .select("id, created_by, status, right_image_url, left_image_url")
    .eq("id", screeningId)
    .maybeSingle();

  if (screeningError) {
    console.error("削除時のスクリーニング確認エラー:", screeningError);
    return { error: "撮影記録の確認に失敗しました" };
  }
  if (!screening || screening.created_by !== current.userId) {
    return { error: "この撮影記録を削除する権限がありません" };
  }

  if (screening.status !== "uploading") {
    return { error: "アップロード中の撮影記録のみ削除できます" };
  }

  const paths = [
    ...new Set([
      ...imagePaths,
      screening.right_image_url,
      screening.left_image_url,
    ].filter((path): path is string => Boolean(path))),
  ];

  if (
    paths.some((path) => !isScreeningImagePath(path, current.userId, screeningId))
  ) {
    return { error: "画像パスが不正です" };
  }

  // 認可・状態・パスの検証後だけService Roleを使う。
  // スタッフは画像を参照できず、通常クライアントのremoveは削除0件になってしまう。
  const adminClient = createAdminClient();
  if (paths.length > 0) {
    const { error: storageError } = await adminClient.storage
      .from(HAND_IMAGES_BUCKET)
      .remove(paths);
    if (storageError) {
      console.error("スクリーニング画像削除エラー:", storageError);
      return { error: "一時画像の削除に失敗しました" };
    }
  }

  const { data: deletedScreening, error: deleteError } = await adminClient
    .from("screenings")
    .delete()
    .eq("id", screeningId)
    .eq("created_by", current.userId)
    .eq("status", "uploading")
    .select("id")
    .maybeSingle();

  if (deleteError) {
    console.error("スクリーニング削除エラー:", deleteError);
    return { error: "撮影記録の削除に失敗しました" };
  }
  if (!deletedScreening) return { error: "この撮影記録を削除する権限がありません" };

  revalidatePath("/");
  revalidatePath("/grouping");
  revalidatePath("/screenings");
  return { error: null };
}

/**
 * 管理者が撮影記録と手画像を完全物理削除する。
 * 認可・パス検証の後だけService Roleを使い、画像削除に失敗したら行は残す。
 */
export async function deleteScreeningAsAdmin(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const current = await getCurrentUser();
  if (!current) return { error: "ログインが必要です", success: false };
  if (current.profile.role !== "admin") {
    return { error: "撮影記録の削除は管理者のみ実行できます", success: false };
  }

  const screeningIdValue = formData.get("screening_id");
  const screeningId =
    typeof screeningIdValue === "string" ? screeningIdValue.trim() : "";
  if (!isValidUuid(screeningId)) {
    return { error: "撮影記録の指定が不正です", success: false };
  }

  const supabase = await createClient();
  const { data: screening, error: screeningError } = await supabase
    .from("screenings")
    .select("id, created_by, subject_id, right_image_url, left_image_url")
    .eq("id", screeningId)
    .maybeSingle();

  if (screeningError) {
    console.error("管理者削除時のスクリーニング確認エラー:", screeningError);
    return { error: "撮影記録の確認に失敗しました", success: false };
  }
  if (!screening) {
    return { error: "撮影記録が見つかりません", success: false };
  }

  const paths = [
    ...new Set(
      [screening.right_image_url, screening.left_image_url].filter(
        (path): path is string => Boolean(path)
      )
    ),
  ];

  let creatorId = screening.created_by;
  if (paths.length > 0) {
    if (!creatorId) {
      const extracted = paths.map((path) =>
        screeningImageCreatorId(path, screeningId)
      );
      const uniqueCreators = new Set(extracted);
      if (extracted.some((id) => !id) || uniqueCreators.size !== 1) {
        return { error: "画像パスが不正です", success: false };
      }
      creatorId = extracted[0];
    }
    if (!creatorId) {
      return { error: "画像パスが不正です", success: false };
    }
    const imageOwnerId = creatorId;
    if (
      paths.some((path) => !isScreeningImagePath(path, imageOwnerId, screeningId))
    ) {
      return { error: "画像パスが不正です", success: false };
    }
  }

  // 認可・パスの検証後だけService Roleを使う。
  // 管理者の通常クライアントにもscreenings削除と完了後の画像削除は付与しない。
  const adminClient = createAdminClient();
  if (paths.length > 0) {
    const { error: storageError } = await adminClient.storage
      .from(HAND_IMAGES_BUCKET)
      .remove(paths);
    if (storageError) {
      console.error("管理者のスクリーニング画像削除エラー:", storageError);
      return { error: "手画像の削除に失敗しました", success: false };
    }
  }

  const { data: deletedScreening, error: deleteError } = await adminClient
    .from("screenings")
    .delete()
    .eq("id", screeningId)
    .select("id")
    .maybeSingle();

  if (deleteError) {
    console.error("管理者のスクリーニング削除エラー:", deleteError);
    return { error: "撮影記録の削除に失敗しました", success: false };
  }
  if (!deletedScreening) {
    return { error: "この撮影記録を削除できませんでした", success: false };
  }

  revalidatePath("/");
  revalidatePath("/admin/screenings");
  revalidatePath(`/admin/screenings/${screeningId}`);
  revalidatePath(`/results/${screeningId}`);
  revalidatePath("/screenings");
  if (screening.subject_id) revalidatePath(`/subjects/${screening.subject_id}`);
  redirect("/admin/screenings");
}

/** 所属医療機関の撮影記録を検索して1ページ取得 */
export async function getScreeningsForStaff(filters: StaffScreeningFilters) {
  const current = await getCurrentUser();
  const safeFilters = normalizeStaffScreeningFilters({
    from: typeof filters?.dateFrom === "string" ? filters.dateFrom : undefined,
    to: typeof filters?.dateTo === "string" ? filters.dateTo : undefined,
    status: typeof filters?.status === "string" ? filters.status : undefined,
    subject: typeof filters?.subjectId === "string" ? filters.subjectId : undefined,
    id:
      typeof filters?.screeningIdInput === "string" && filters.screeningIdInput
        ? filters.screeningIdInput
        : typeof filters?.screeningId === "string"
          ? filters.screeningId
          : undefined,
    page: typeof filters?.page === "number" ? String(filters.page) : undefined,
  });

  if (!current || current.profile.role !== "clinic_staff") {
    return { items: [], ...paginationMeta(0, safeFilters.page) };
  }

  if (
    safeFilters.screeningIdInput &&
    !safeFilters.screeningId &&
    !safeFilters.screeningIdPrefix
  ) {
    return { items: [], ...paginationMeta(0, 1) };
  }

  const supabase = await createClient();
  let query = supabase
    .from("screenings")
    .select(
      "id, subject_id, created_by, status, total_inflamed_joints, created_at",
      { count: "exact" }
    );

  if (safeFilters.status) query = query.eq("status", safeFilters.status);
  if (safeFilters.subjectId) query = query.eq("subject_id", safeFilters.subjectId);
  if (safeFilters.screeningId) {
    query = query.eq("id", safeFilters.screeningId);
  } else if (safeFilters.screeningIdPrefix) {
    const { from, to } = screeningIdPrefixBounds(safeFilters.screeningIdPrefix);
    query = query.gte("id", from).lte("id", to);
  }
  if (safeFilters.dateFrom) {
    query = query.gte("created_at", startOfJapanDate(safeFilters.dateFrom));
  }
  if (safeFilters.dateTo) {
    query = query.lt("created_at", endOfJapanDateExclusive(safeFilters.dateTo));
  }

  const { firstRow, lastRow } = pageRange(safeFilters.page);
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(firstRow, lastRow);
  let total = count ?? 0;
  if (error) {
    if (!isUnsatisfiableRange(error)) {
      throwSupabaseError(error, "撮影記録一覧の取得");
    }
    let countQuery = supabase
      .from("screenings")
      .select("id", { count: "exact", head: true });
    if (safeFilters.status) countQuery = countQuery.eq("status", safeFilters.status);
    if (safeFilters.subjectId) {
      countQuery = countQuery.eq("subject_id", safeFilters.subjectId);
    }
    if (safeFilters.screeningId) {
      countQuery = countQuery.eq("id", safeFilters.screeningId);
    } else if (safeFilters.screeningIdPrefix) {
      const { from, to } = screeningIdPrefixBounds(safeFilters.screeningIdPrefix);
      countQuery = countQuery.gte("id", from).lte("id", to);
    }
    if (safeFilters.dateFrom) {
      countQuery = countQuery.gte("created_at", startOfJapanDate(safeFilters.dateFrom));
    }
    if (safeFilters.dateTo) {
      countQuery = countQuery.lt(
        "created_at",
        endOfJapanDateExclusive(safeFilters.dateTo)
      );
    }
    const { count: fallbackCount, error: countError } = await countQuery;
    if (countError) throwSupabaseError(countError, "撮影記録の件数取得");
    total = fallbackCount ?? 0;
  }

  return {
    items: data ?? [],
    ...paginationMeta(total, safeFilters.page),
  };
}

/** 直近のスクリーニング履歴を取得 */
export async function getRecentScreenings(limit = 20) {
  const current = await getCurrentUser();
  if (!current) return [];

  const supabase = await createClient();
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const query = supabase
    .from("screenings")
    .select(
      "id, subject_id, created_by, status, total_inflamed_joints, created_at, subjects(id, clinic_id)"
    )
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  const { data, error } = await query;
  if (error) throwSupabaseError(error, "撮影記録の取得");
  return data ?? [];
}

/** スクリーニング詳細（関節結果 + 管理者向け画像Signed URL）を取得 */
export async function getScreeningDetail(screeningId: string) {
  const current = await getCurrentUser();
  if (!current) return null;

  const supabase = await createClient();
  const { data: screening, error: screeningError } = await supabase
    .from("screenings")
    .select(
      "id, subject_id, created_by, status, status_updated_at, total_inflamed_joints, ra_detected, ai_hands, ai_model_version, analysis_thr_node, analysis_thr_wrist, analyzed_at, analysis_error_code, analysis_error_http_status, analysis_error_at, right_image_url, left_image_url, created_at, profiles:created_by(full_name, deleted_at, clinics(name)), subjects(clinics(name))"
    )
    .eq("id", screeningId)
    .maybeSingle();

  if (screeningError) throwSupabaseError(screeningError, "スクリーニング詳細の取得");
  if (!screening) return null;

  const { data: joints, error: jointsError } = await supabase
    .from("joint_results")
    .select("id, screening_id, side, joint_name, is_inflamed, confidence_score")
    .eq("screening_id", screeningId);
  if (jointsError) throwSupabaseError(jointsError, "関節解析結果の取得");

  // 管理用の画像・解析情報・判定閾値は管理者にだけ返す。
  const canViewAdminDetails = current.profile.role === "admin";
  const canViewImages = canViewAdminDetails;
  const debugResponse = canViewImages
    ? await supabase
        .from("screening_analysis_debug_responses")
        .select("raw_response")
        .eq("screening_id", screeningId)
        .maybeSingle()
    : { data: null, error: null };
  if (debugResponse.error) {
    throwSupabaseError(debugResponse.error, "AI解析デバッグ情報の取得");
  }
  const canRetryAnalysis = Boolean(
    screening.right_image_url && screening.left_image_url
  );
  const images = canViewImages
    ? await tryCreateSignedHandImageUrls(
        supabase,
        {
          right: screening.right_image_url,
          left: screening.left_image_url,
        },
        3600
      )
    : { right: null, left: null };

  return {
    screening: canViewImages
      ? screening
      : {
          ...screening,
          right_image_url: null,
          left_image_url: null,
          ai_model_version: null,
          analyzed_at: null,
          analysis_error_code: null,
          analysis_error_http_status: null,
          analysis_error_at: null,
          analysis_thr_node: null,
          analysis_thr_wrist: null,
        },
    joints: joints ?? [],
    images,
    rawAiApiResponse: canViewImages ? debugResponse.data?.raw_response ?? null : null,
    canRetryAnalysis,
    canViewThresholds: canViewAdminDetails,
  };
}
