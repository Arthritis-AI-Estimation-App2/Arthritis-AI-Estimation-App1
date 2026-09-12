"use client";

import { useActionState, useEffect, useRef } from "react";
import { changeEmail } from "@/app/actions/auth";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";

const INITIAL_STATE = { error: null, success: false };

export default function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction, pending] = useActionState(changeEmail, INITIAL_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <Card>
      <CardContent>
        <form ref={formRef} action={formAction} autoComplete="off" className="space-y-4">
          <Input
            id="new_email"
            name="new_email"
            type="email"
            label="ログイン用メールアドレス"
            defaultValue={currentEmail}
            autoComplete="off"
            required
          />
          <Input
            id="email_current_password"
            name="current_password"
            type="password"
            label="現在のパスワード"
            autoComplete="current-password"
            required
          />
          <p className="text-sm text-muted-foreground">
            セキュリティ確認のため、現在のパスワードも入力してください。変更すると、次回から新しいメールアドレスでログインします。確認メールは送信されません。
          </p>
          {state.error && (
            <p role="alert" className="rounded-lg bg-danger p-3 text-sm text-danger-foreground">
              {state.error}
            </p>
          )}
          {state.success && (
            <p role="status" className="rounded-lg bg-success p-3 text-sm text-success-foreground">
              メールアドレスを変更しました。次回から新しいメールアドレスでログインしてください。
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "変更中..." : "メールアドレスを変更"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
