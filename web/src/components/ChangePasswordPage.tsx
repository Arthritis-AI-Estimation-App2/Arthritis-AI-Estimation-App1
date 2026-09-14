import ChangeEmailForm from "@/components/ChangeEmailForm";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import BackLink from "@/components/ui/BackLink";

export default function ChangePasswordPage({
  backHref,
  backLabel,
  currentEmail,
}: {
  backHref: string;
  backLabel: string;
  currentEmail: string;
}) {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <BackLink href={backHref}>{backLabel}</BackLink>
        <h1 className="mt-2 text-2xl font-bold text-foreground">アカウント設定</h1>
      </div>
      <ChangeEmailForm currentEmail={currentEmail} />
      <ChangePasswordForm />
    </div>
  );
}
