import Link from "next/link";
import ChangeEmailForm from "@/components/ChangeEmailForm";
import ChangePasswordForm from "@/components/ChangePasswordForm";

export default function ChangePasswordPage({
  backHref,
  currentEmail,
}: {
  backHref: string;
  currentEmail: string;
}) {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href={backHref} className="text-sm text-link hover:text-link-hover">
          ← 戻る
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-foreground">アカウント設定</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          セキュリティ確認のため、メールアドレス・パスワードのいずれも現在のパスワードの入力が必要です。
        </p>
      </div>
      <ChangeEmailForm currentEmail={currentEmail} />
      <ChangePasswordForm />
    </div>
  );
}
