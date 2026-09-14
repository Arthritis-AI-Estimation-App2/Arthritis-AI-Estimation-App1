import LoginForm from "@/components/LoginForm";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata = { title: "ログイン" };

export default async function LoginPage() {
  const current = await getCurrentUser();
  if (current) {
    redirect(current.profile.role === "admin" ? "/admin" : "/");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-safe-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">関節炎スクリーニング</h1>
          <p className="mt-2 text-sm text-muted-foreground">ログインしてください</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
