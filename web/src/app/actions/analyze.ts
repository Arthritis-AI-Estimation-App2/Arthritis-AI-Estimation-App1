"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { requestAiAnalysis } from "@/lib/ai-api";
import {
  AnalysisExecutionError,
  createAnalysisFailureUpdate,
  logAnalysisFailure,
  logAnalysisFailurePersistenceError,
  normalizeAnalysisError,
} from "@/lib/analysis-error";
import { createSignedHandImageUrls } from "@/lib/supabase/signed-hand-images";
import {
  isProcessingStatus,
  isStaleProcessing,
} from "@/lib/screening-staleness";
import type { Json } from "@/lib/supabase/database.types";
import type {
  AiHandResult,
  AnalyzeResponse,
  AnalyzeResponseWithRaw,
  HandSide,
  Screening,
} from "@/lib/types";
import { revalidatePath } from "next/cache";

/** AI_API_URLが未設定のローカル開発用モック。 */
function mockHandAnalyze(side: HandSide): AiHandResult {
  const numPositiveJoints = Math.floor(Math.random() * 5);
  const handProbability = Math.round(Math.random() * 100) / 100;

  return {
    side,
    ra_detected: handProbability >= 0.5,
    hand_probability: handProbability,
    num_positive_joints: numPositiveJoints,
    num_joints_detected: 11,
    joints: [],
    warnings: [],
  };
}

function mockAnalyze(): AnalyzeResponseWithRaw {
  const hands = [mockHandAnalyze("left"), mockHandAnalyze("right")];
  const analysis: AnalyzeResponse = {
    model_version: "mock-v1",
    hands,
    ra_detected: hands.some((hand) => hand.ra_detected),
    total_positive_joints: hands.reduce(
      (total, hand) => total + hand.num_positive_joints,
      0
    ),
  };
  return { ...analysis, raw_response: analysis as unknown as Json };
}

async function callAiApi(
  rightImageUrl: string,
  leftImageUrl: string
): Promise<AnalyzeResponseWithRaw> {
  const aiApiUrl = process.env.AI_API_URL?.trim();

  if (!aiApiUrl) {
    // モック（解析らしく少し待つ）
    await new Promise((r) => setTimeout(r, 2000));
    return mockAnalyze();
  }

  const aiApiKey = process.env.AI_API_KEY?.trim();
  if (!aiApiKey) {
    throw new AnalysisExecutionError(
      "api_configuration_error",
      "AI_API_URLを設定する場合はAI_API_KEYも設定してください"
    );
  }

  return requestAiAnalysis(aiApiUrl, aiApiKey, [
    { side: "left", image_url: leftImageUrl },
    { side: "right", image_url: rightImageUrl },
  ]);
}

async function runAnalysis(
  screening: Pick<Screening, "id" | "right_image_url" | "left_image_url">
): Promise<{ error: string | null }> {
  try {
    if (!screening.right_image_url || !screening.left_image_url) {
      throw new AnalysisExecutionError(
        "missing_images",
        "左右両方の画像が登録されていません"
      );
    }

    // 手画像のStorage参照は管理者のみ。解析用URLは認可済みの
    // このServer ActionからService Roleで発行する。
    let imageUrls: { right: string | null; left: string | null };
    try {
      imageUrls = await createSignedHandImageUrls(
        createAdminClient(),
        {
          right: screening.right_image_url,
          left: screening.left_image_url,
        },
        300
      );
    } catch (error) {
      throw new AnalysisExecutionError(
        "signed_url_failed",
        "解析用の画像URLを発行できませんでした",
        { cause: error }
      );
    }
    if (!imageUrls.right || !imageUrls.left) {
      throw new AnalysisExecutionError(
        "signed_url_failed",
        "左右両方の画像URLを発行できませんでした"
      );
    }

    const result = await callAiApi(imageUrls.right, imageUrls.left);

    // AIレスポンスを検証したこのServer Actionからだけ確定できるよう、
    // complete_ra_screening_analysis_with_metadata の実行権限はservice_roleに限定する。
    const adminClient = createAdminClient();
    try {
      const { error: completeError } = await adminClient.rpc(
        "complete_ra_screening_analysis_with_metadata",
        {
          p_screening_id: screening.id,
          p_ra_detected: result.ra_detected,
          p_total_positive_joints: result.total_positive_joints,
          p_ai_model_version: result.model_version ?? "",
          p_raw_response: result.raw_response,
          p_hands: result.hands.map((hand) => ({
            side: hand.side,
            ra_detected: hand.ra_detected,
            hand_probability: hand.hand_probability,
            num_positive_joints: hand.num_positive_joints,
            num_joints_detected: hand.num_joints_detected,
            joints: hand.joints.map((joint) => ({
              joint_id: joint.joint_id,
              joint_name: joint.joint_name,
              probability: joint.probability,
              positive: joint.positive,
            })),
            warnings: hand.warnings,
          }) satisfies Json),
        }
      );

      if (completeError) throw completeError;
    } catch (error) {
      throw new AnalysisExecutionError(
        "result_save_failed",
        "AI解析結果をデータベースへ保存できませんでした",
        { cause: error }
      );
    }

    return { error: null };
  } catch (e) {
    const error = normalizeAnalysisError(e);
    const occurredAt = new Date().toISOString();
    logAnalysisFailure(screening.id, error, occurredAt);
    try {
      const adminClient = createAdminClient();
      const { error: persistenceError } = await adminClient
        .from("screenings")
        .update(createAnalysisFailureUpdate(error, occurredAt))
        .eq("id", screening.id)
        .eq("status", "analyzing");
      if (persistenceError) throw persistenceError;
    } catch (persistenceError) {
      logAnalysisFailurePersistenceError(
        screening.id,
        persistenceError,
        new Date().toISOString()
      );
    }
    return { error: "AI解析に失敗しました。再度お試しください。" };
  }
}

/** AI解析を実行し、結果をDBに保存する */
export async function analyzeScreening(
  screeningId: string
): Promise<{ error: string | null }> {
  const current = await getCurrentUser();
  if (!current) return { error: "ログインが必要です" };

  const supabase = await createClient();

  const { data: screening, error: fetchError } = await supabase
    .from("screenings")
    .select("id, status, right_image_url, left_image_url")
    .eq("id", screeningId)
    .maybeSingle();

  if (fetchError) {
    console.error("解析時のスクリーニング取得エラー:", fetchError);
    return { error: "撮影記録の取得に失敗しました" };
  }
  if (!screening) {
    return { error: "撮影記録が見つかりません" };
  }

  if (screening.status !== "analyzing") {
    return {
      error:
        screening.status === "completed"
          ? "この撮影記録はすでに解析済みです"
          : "解析を実行できる状態ではありません",
    };
  }

  return runAnalysis(screening);
}

/** 10分以上更新されていない途中状態を failed にして、管理者が再解析できる状態へ戻す。 */
export async function markInterruptedScreeningFailed(
  screeningId: string
): Promise<{ error: string | null }> {
  const current = await getCurrentUser();
  if (!current) return { error: "ログインが必要です" };
  if (current.profile.role !== "admin") {
    return { error: "中断状態の復旧は管理者のみ実行できます" };
  }

  const supabase = await createClient();
  const { data: screening, error: fetchError } = await supabase
    .from("screenings")
    .select("id, status, status_updated_at")
    .eq("id", screeningId)
    .maybeSingle();

  if (fetchError) {
    console.error("中断状態復旧時のスクリーニング取得エラー:", fetchError);
    return { error: "撮影記録の取得に失敗しました" };
  }
  if (!screening) return { error: "撮影記録が見つかりません" };
  if (!isProcessingStatus(screening.status)) {
    return { error: "この撮影記録はすでに処理中ではありません" };
  }
  if (!isStaleProcessing(screening.status, screening.status_updated_at)) {
    return { error: "最終更新から10分未満のため、まだ復旧できません" };
  }

  const adminClient = createAdminClient();
  const { data: recovered, error: updateError } = await adminClient
    .from("screenings")
    .update({ status: "failed" })
    .eq("id", screening.id)
    .eq("status", screening.status)
    .eq("status_updated_at", screening.status_updated_at)
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error("中断状態の復旧エラー:", updateError);
    return { error: "中断状態の復旧に失敗しました" };
  }
  if (!recovered) {
    return { error: "処理状態が更新されています。画面を更新して確認してください" };
  }

  revalidatePath("/");
  revalidatePath("/admin/screenings");
  revalidatePath(`/results/${screeningId}`);
  revalidatePath(`/admin/screenings/${screeningId}`);
  return { error: null };
}

/** 管理者が完了または失敗したスクリーニングを再実行する */
export async function retryAnalysis(
  screeningId: string
): Promise<{ error: string | null }> {
  const current = await getCurrentUser();
  if (!current) return { error: "ログインが必要です" };
  if (current.profile.role !== "admin") {
    return { error: "再解析は管理者のみ実行できます" };
  }

  const supabase = await createClient();
  const { data: screening, error: fetchError } = await supabase
    .from("screenings")
    .select("id, status")
    .eq("id", screeningId)
    .maybeSingle();

  if (fetchError) {
    console.error("再解析時のスクリーニング取得エラー:", fetchError);
    return { error: "撮影記録の取得に失敗しました" };
  }
  if (!screening || !["completed", "failed"].includes(screening.status)) {
    return { error: "解析完了または解析失敗の撮影記録のみ再解析できます" };
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc("begin_screening_reanalysis", {
    p_screening_id: screeningId,
    p_changed_by: current.userId,
  });

  if (error) {
    console.error("再解析開始エラー:", error);
    return { error: "再解析の開始に失敗しました" };
  }
  const reanalysis = data?.[0];
  if (!reanalysis) {
    return { error: "再解析を開始できる状態ではありません" };
  }

  return runAnalysis(reanalysis);
}
