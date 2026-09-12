"use client";

import { useActionState } from "react";
import { deleteScreeningAsAdmin } from "@/app/actions/screenings";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

/**
 * 管理者が撮影記録と手画像を完全物理削除するフォーム。
 * 取り消しできない操作のため、確認ダイアログを必須にする。
 */
export default function DeleteScreeningForm({
  screeningId,
}: {
  screeningId: string;
}) {
  const [state, formAction, pending] = useActionState(deleteScreeningAsAdmin, {
    error: null,
    success: false,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>撮影・解析データの削除</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          action={formAction}
          onSubmit={(event) => {
            if (
              !window.confirm(
                "この撮影・解析データを画像も含めて完全に削除します。この操作は取り消せません。続行しますか？"
              )
            ) {
              event.preventDefault();
            }
          }}
          className="space-y-4"
        >
          <input type="hidden" name="screening_id" value={screeningId} />
          <p className="text-xs text-muted-foreground">
            削除すると、手画像、関節判定、AIレスポンスを含むこの撮影記録は復元できません。
          </p>
          {state.error && (
            <p role="alert" className="rounded-lg bg-danger p-3 text-sm text-danger-foreground">
              {state.error}
            </p>
          )}
          <Button type="submit" variant="danger" disabled={pending} className="w-full">
            {pending ? "削除中..." : "この撮影・解析データを削除する"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
