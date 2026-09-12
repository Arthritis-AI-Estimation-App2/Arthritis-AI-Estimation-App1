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

type ActionState = { error: string | null; success: boolean };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value: string) {
  return UUID_PATTERN.test(value);
}

/** 新規スクリーニング記録を作成（status: uploading） */
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
    return { screeningId: null, error: "スクリーニング記録の作成に失敗しました" };
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
    return { error: "スクリーニング記録の確認に失敗しました" };
  }
  if (!screening || screening.created_by !== current.userId) {
    return { error: "このスクリーニングを更新する権限がありません" };
  }

  if (screening.status !== "uploading") {
    return { error: "このスクリーニングは画像を更新できる状態ではありません" };
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
  if (!data) return { error: "このスクリーニングは画像を更新できる状態ではありません" };
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
    return { error: "スクリーニング記録の確認に失敗しました" };
  }
  if (!screening || screening.created_by !== current.userId) {
    return { error: "このスクリーニングを削除する権限がありません" };
  }

  if (screening.status !== "uploading") {
    return { error: "アップロード中のスクリーニングのみ削除できます" };
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
    return { error: "スクリーニング記録の削除に失敗しました" };
  }
  if (!deletedScreening) return { error: "このスクリーニングを削除する権限がありません" };

  revalidatePath("/");
  revalidatePath("/grouping");
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
    return { error: "撮影・解析データの削除は管理者のみ実行できます", success: false };
  }

  const screeningIdValue = formData.get("screening_id");
  const screeningId =
    typeof screeningIdValue === "string" ? screeningIdValue.trim() : "";
  if (!isValidUuid(screeningId)) {
    return { error: "スクリーニング記録の指定が不正です", success: false };
  }

  const supabase = await createClient();
  const { data: screening, error: screeningError } = await supabase
    .from("screenings")
    .select("id, created_by, subject_id, right_image_url, left_image_url")
    .eq("id", screeningId)
    .maybeSingle();

  if (screeningError) {
    console.error("管理者削除時のスクリーニング確認エラー:", screeningError);
    return { error: "スクリーニング記録の確認に失敗しました", success: false };
  }
  if (!screening) {
    return { error: "スクリーニング記録が見つかりません", success: false };
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
    return { error: "スクリーニング記録の削除に失敗しました", success: false };
  }
  if (!deletedScreening) {
    return { error: "このスクリーニングを削除できませんでした", success: false };
  }

  revalidatePath("/");
  revalidatePath("/admin/screenings");
  revalidatePath(`/admin/screenings/${screeningId}`);
  revalidatePath(`/results/${screeningId}`);
  if (screening.subject_id) revalidatePath(`/subjects/${screening.subject_id}`);
  redirect("/admin/screenings");
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
  if (error) throwSupabaseError(error, "撮影履歴の取得");
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
      "id, subject_id, created_by, status, status_updated_at, total_inflamed_joints, ra_detected, ai_hands, ai_model_version, analyzed_at, analysis_error_code, analysis_error_http_status, analysis_error_at, right_image_url, left_image_url, created_at"
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

  // 撮影画像の閲覧は管理者のみ。スタッフにはパスも返さない。
  const canViewImages = current.profile.role === "admin";
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
        },
    joints: joints ?? [],
    images,
    rawAiApiResponse: canViewImages ? debugResponse.data?.raw_response ?? null : null,
    canRetryAnalysis,
  };
}
