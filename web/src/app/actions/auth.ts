"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { validatePasswordChange } from "@/lib/password";
import { validateAccountEmail } from "@/lib/email";
import { redirect } from "next/navigation";

export type PasswordChangeState = { error: string | null; success: boolean };
export type EmailChangeState = { error: string | null; success: boolean };

function getPassword(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function login(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  const email = typeof emailValue === "string" ? emailValue.trim() : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";

  if (!email || !password) {
    return { error: "メールアドレスとパスワードを入力してください" };
  }

  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !authData.user) {
    return { error: "メールアドレスまたはパスワードが正しくありません" };
  }

  // ロールを確認して適切な画面へリダイレクト
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    console.error("ログイン時のプロフィール取得エラー:", profileError);
    await supabase.auth.signOut();
    return { error: "アカウント情報を確認できませんでした" };
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    return { error: "このアカウントは無効化されています" };
  }

  if (profile.role !== "admin" && profile.role !== "clinic_staff") {
    console.error("ログイン時のロールが不正です:", profile.role);
    await supabase.auth.signOut();
    return { error: "アカウント情報を確認できませんでした" };
  }

  redirect(profile.role === "admin" ? "/admin" : "/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** ログイン中の本人が、現在のパスワードを確認したうえで変更する。 */
export async function changePassword(
  _prevState: PasswordChangeState,
  formData: FormData
): Promise<PasswordChangeState> {
  const currentPassword = getPassword(formData, "current_password");
  const newPassword = getPassword(formData, "new_password");
  const passwordConfirmation = getPassword(formData, "password_confirmation");
  const validationError = validatePasswordChange({
    currentPassword,
    newPassword,
    passwordConfirmation,
  });

  if (validationError) {
    return { error: validationError, success: false };
  }

  let current: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    current = await getCurrentUser();
  } catch (error) {
    console.error("パスワード変更時のプロフィール確認エラー:", error);
    return { error: "ログイン情報を確認できませんでした。再度ログインしてください", success: false };
  }
  if (!current) {
    return { error: "ログイン情報を確認できませんでした。再度ログインしてください", success: false };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email || user.id !== current.userId) {
    console.error("パスワード変更時のユーザー確認エラー:", userError);
    return { error: "ログイン情報を確認できませんでした。再度ログインしてください", success: false };
  }

  // 現在のパスワードを使って再認証し、本人による変更であることを確認する。
  const { data: authData, error: authenticationError } =
    await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

  if (authenticationError || authData.user?.id !== current.userId) {
    return { error: "現在のパスワードが正しくありません", success: false };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateError) {
    console.error("本人パスワード変更エラー:", updateError);
    return { error: "パスワードの変更に失敗しました", success: false };
  }

  return { error: null, success: true };
}

/**
 * ログイン中の本人が、現在のパスワードを確認したうえでログイン用メールアドレスを変更する。
 * 確認メールは送らず即時に切り替える（アカウント発行・管理者によるメール変更と同様）。
 */
export async function changeEmail(
  _prevState: EmailChangeState,
  formData: FormData
): Promise<EmailChangeState> {
  const currentPassword = getPassword(formData, "current_password");
  const newEmailValue = formData.get("new_email");
  const newEmail = typeof newEmailValue === "string" ? newEmailValue.trim() : "";

  if (!currentPassword || !newEmail) {
    return { error: "すべての項目を入力してください", success: false };
  }
  const emailError = validateAccountEmail(newEmail);
  if (emailError) return { error: emailError, success: false };

  let current: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    current = await getCurrentUser();
  } catch (error) {
    console.error("メールアドレス変更時のプロフィール確認エラー:", error);
    return { error: "ログイン情報を確認できませんでした。再度ログインしてください", success: false };
  }
  if (!current) {
    return { error: "ログイン情報を確認できませんでした。再度ログインしてください", success: false };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email || user.id !== current.userId) {
    console.error("メールアドレス変更時のユーザー確認エラー:", userError);
    return { error: "ログイン情報を確認できませんでした。再度ログインしてください", success: false };
  }

  if (newEmail === user.email) {
    return { error: "現在のメールアドレスと同じです", success: false };
  }

  // 現在のパスワードを使って再認証し、本人による変更であることを確認する。
  const { data: authData, error: authenticationError } =
    await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

  if (authenticationError || authData.user?.id !== current.userId) {
    return { error: "現在のパスワードが正しくありません", success: false };
  }

  const adminClient = createAdminClient();
  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    current.userId,
    { email: newEmail, email_confirm: true }
  );
  if (updateError) {
    if (updateError.code === "email_exists") {
      return { error: "このメールアドレスは既に使われています", success: false };
    }
    console.error("本人メールアドレス変更エラー:", updateError);
    return { error: "メールアドレスの変更に失敗しました", success: false };
  }

  return { error: null, success: true };
}
