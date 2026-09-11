import { getScreeningDetail } from "@/app/actions/screenings";
import { getCurrentUser } from "@/lib/auth";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/** AI画像解析レスポンスデータ（管理者向けデバッグ情報）をJSONファイルとしてダウンロードする */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const current = await getCurrentUser();
  if (!current) {
    return Response.redirect(new URL("/login", request.url));
  }

  const { id } = await params;

  // 権限・テナント境界の確認はgetScreeningDetail内のRLS付き通常クライアントで行う。
  // 本部管理者以外（is_active=falseを含む）にはrawAiApiResponseがnullで返る。
  const detail = await getScreeningDetail(id);
  if (!detail) {
    return new Response("撮影データが見つかりません。", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  if (!detail.rawAiApiResponse) {
    return new Response("この解析のAPIレスポンスは保存されていません。", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(JSON.stringify(detail.rawAiApiResponse, null, 2), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="ai-response_${id}.json"`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
