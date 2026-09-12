"use client";

import { useActionState } from "react";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

type ActionState = { error: string | null; success: boolean };
type DeleteAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

interface Props {
  action: DeleteAction;
  idFieldName: string;
  idFieldValue: string;
  entityLabel: string;
}

/**
 * 管理者・スタッフアカウントの削除フォーム。
 * 撮影・解析データは削除せず、担当者名を「(削除済みユーザー)」と表示するために
 * profilesを墓標として残す旨と、メールアドレスが再登録できる旨を明記する。
 */
export default function DeleteAccountForm({
  action,
  idFieldName,
  idFieldValue,
  entityLabel,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    success: false,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{entityLabel}アカウントの削除</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          action={formAction}
          onSubmit={(event) => {
            if (
              !window.confirm(
                `この${entityLabel}アカウントを削除します。この操作は取り消せません。続行しますか？`
              )
            ) {
              event.preventDefault();
            }
          }}
          className="space-y-4"
        >
          <input type="hidden" name={idFieldName} value={idFieldValue} />
          <p className="text-xs text-muted-foreground">
            削除すると、このアカウントではログインできなくなります。撮影・解析データは削除せず保持され、担当者名は「(削除済みユーザー)」と表示されます。メールアドレスは別のアカウントで再登録できます。
          </p>
          {state.error && (
            <p role="alert" className="rounded-lg bg-danger p-3 text-sm text-danger-foreground">
              {state.error}
            </p>
          )}
          <Button type="submit" variant="danger" disabled={pending} className="w-full">
            {pending ? "削除中..." : `この${entityLabel}アカウントを削除する`}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
