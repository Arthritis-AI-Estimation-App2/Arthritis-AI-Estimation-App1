"use client";

import { useActionState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

type ActionState = { error: string | null; success: boolean };
type ChangeEmailAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

interface Props {
  action: ChangeEmailAction;
  idFieldName: string;
  idFieldValue: string;
  currentEmail: string | null;
  entityLabel: string;
}

/** 管理者・スタッフ共通のログイン用メールアドレス変更フォーム。 */
export default function ChangeAccountEmailForm({
  action,
  idFieldName,
  idFieldValue,
  currentEmail,
  entityLabel,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    success: false,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>ログイン用メールアドレスを変更</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} autoComplete="off" className="flex flex-col gap-4">
          <input type="hidden" name={idFieldName} value={idFieldValue} />
          <Input
            id="email"
            name="email"
            type="email"
            label="ログイン用メールアドレス"
            defaultValue={currentEmail ?? ""}
            autoComplete="off"
            required
          />
          <p className="text-xs text-muted-foreground">
            変更すると、{entityLabel}は新しいメールアドレスでのみログインできます。確認メールは送信されません。
          </p>
          {state.error && (
            <p role="alert" className="rounded-lg bg-danger p-3 text-sm text-danger-foreground">
              {state.error}
            </p>
          )}
          {state.success && (
            <p role="status" className="rounded-lg bg-success p-3 text-sm text-success-foreground">
              メールアドレスを変更しました。
            </p>
          )}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "変更中..." : "メールアドレスを変更"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
