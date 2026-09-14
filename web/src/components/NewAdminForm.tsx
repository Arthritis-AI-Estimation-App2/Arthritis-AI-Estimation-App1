"use client";

import { useActionState } from "react";
import { createAdmin } from "@/app/actions/admin";
import Button from "@/components/ui/Button";
import GeneratedPasswordField from "@/components/GeneratedPasswordField";
import Input from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";

export default function NewAdminForm({
  initialPassword,
}: {
  initialPassword: string;
}) {
  const [state, formAction, pending] = useActionState(createAdmin, {
    error: null,
    success: false,
  });

  return (
    <Card>
      <CardContent>
        <form action={formAction} autoComplete="off" className="flex flex-col gap-4">
          <Input
            id="full_name"
            name="full_name"
            label="管理者氏名（表示用）"
            placeholder="例: 山田 花子"
            maxLength={100}
            required
          />

          <Input
            id="email"
            name="email"
            type="email"
            label="ログイン用メールアドレス"
            placeholder="admin@example.com"
            autoComplete="off"
            required
          />

          <GeneratedPasswordField
            id="password"
            label="初期パスワード（8文字以上）"
            initialPassword={initialPassword}
            hint="自動生成したパスワードです。自由に変更できます。"
          />

          {state.error && (
            <p className="rounded-lg bg-danger p-3 text-sm text-danger-foreground">{state.error}</p>
          )}
          {state.success && (
            <p className="rounded-lg bg-success p-3 text-sm text-success-foreground">
              管理者アカウントを発行しました。初期パスワードを管理者へ共有してください。
            </p>
          )}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "発行中..." : "管理者アカウントを発行"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
