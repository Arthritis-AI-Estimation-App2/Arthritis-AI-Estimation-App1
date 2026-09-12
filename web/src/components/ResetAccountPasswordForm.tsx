"use client";

import { useActionState } from "react";
import GeneratedPasswordField from "@/components/GeneratedPasswordField";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

type ActionState = { error: string | null; success: boolean };
type ResetPasswordAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

interface Props {
  action: ResetPasswordAction;
  idFieldName: string;
  idFieldValue: string;
  initialPassword: string;
  entityLabel: string;
}

/** 管理者・スタッフ共通のパスワード再設定フォーム。 */
export default function ResetAccountPasswordForm({
  action,
  idFieldName,
  idFieldValue,
  initialPassword,
  entityLabel,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    success: false,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>パスワードを再設定</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} autoComplete="off" className="flex flex-col gap-4">
          <input type="hidden" name={idFieldName} value={idFieldValue} />
          <GeneratedPasswordField
            id="reset_password"
            label="新しいパスワード（8文字以上）"
            initialPassword={initialPassword}
            hint={`再設定すると、${entityLabel}は新しいパスワードでのみログインできます。共有前にコピーしてください。`}
          />
          {state.error && (
            <p role="alert" className="rounded-lg bg-danger p-3 text-sm text-danger-foreground">
              {state.error}
            </p>
          )}
          {state.success && (
            <p role="status" className="rounded-lg bg-success p-3 text-sm text-success-foreground">
              パスワードを再設定しました。新しいパスワードを{entityLabel}へ共有してください。
            </p>
          )}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "再設定中..." : "パスワードを再設定"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
