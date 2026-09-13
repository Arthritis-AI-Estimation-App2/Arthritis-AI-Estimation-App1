"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePassword } from "@/app/actions/auth";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/lib/password";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

const INITIAL_STATE = { error: null, success: false };

export default function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, INITIAL_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>パスワードを変更</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-4">
          <Input
            id="current_password"
            name="current_password"
            type="password"
            label="現在のパスワード"
            autoComplete="current-password"
            required
          />
          <Input
            id="new_password"
            name="new_password"
            type="password"
            label={`新しいパスワード（${MIN_PASSWORD_LENGTH}文字以上）`}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            required
          />
          <Input
            id="password_confirmation"
            name="password_confirmation"
            type="password"
            label="新しいパスワード（確認）"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            required
          />
          <p className="text-sm text-muted-foreground">
            新しいパスワードは{MIN_PASSWORD_LENGTH}〜{MAX_PASSWORD_LENGTH}文字で入力してください。
          </p>
          {state.error && (
            <p role="alert" className="rounded-lg bg-danger p-3 text-sm text-danger-foreground">
              {state.error}
            </p>
          )}
          {state.success && (
            <p
              role="status"
              className="rounded-lg bg-success p-3 text-sm text-success-foreground"
            >
              パスワードを変更しました。次回から新しいパスワードでログインしてください。
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "変更中..." : "パスワードを変更"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
