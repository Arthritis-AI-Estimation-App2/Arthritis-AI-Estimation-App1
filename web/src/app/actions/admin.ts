"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { throwSupabaseError } from "@/lib/supabase/error";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Role } from "@/lib/types";
import { validateAccountPassword } from "@/lib/password";
import { validateAccountEmail } from "@/lib/email";
import { staffDisplayName } from "@/lib/staff-display-name";
import {
  ADMIN_SCREENINGS_PAGE_SIZE,
  endOfJapanDateExclusive,
  normalizeAdminScreeningFilters,
  screeningIdPrefixBounds,
  startOfJapanDate,
  type AdminScreeningFilters,
} from "@/lib/admin-screening-filters";

type ActionState = { error: string | null; success: boolean };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_NAME_LENGTH = 100;

function getRequiredText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isValidUuid(value: string) {
  return UUID_PATTERN.test(value);
}

async function requireAdmin() {
  const current = await getCurrentUser();
  if (!current || current.profile.role !== "admin") {
    throw new Error("管理者権限が必要です");
  }
  return current;
}

function getPassword(formData: FormData) {
  const value = formData.get("password");
  return typeof value === "string" ? value : "";
}

function getAccountCredentials(formData: FormData, nameLabel: string) {
  const email = getRequiredText(formData, "email");
  const password = getPassword(formData);
  const fullName = getRequiredText(formData, "full_name");

  if (!email || !password || !fullName) {
    return { credentials: null, error: "必須項目を入力してください" };
  }
  const emailError = validateAccountEmail(email);
  if (emailError) {
    return { credentials: null, error: emailError };
  }
  const passwordError = validateAccountPassword(password);
  if (passwordError) {
    return { credentials: null, error: passwordError };
  }
  if (fullName.length > MAX_NAME_LENGTH) {
    return { credentials: null, error: `${nameLabel}は100文字以内で入力してください` };
  }

  return { credentials: { email, password, fullName }, error: null };
}

async function createManagedAccount({
  email,
  password,
  fullName,
  role,
  clinicId,
  accountLabel,
}: {
  email: string;
  password: string;
  fullName: string;
  role: Role;
  clinicId: string | null;
  accountLabel: string;
}): Promise<ActionState> {
  // 呼び出し元で有効な管理者と、必要なら対象医療機関を確認してから使う。
  const adminClient = createAdminClient();
  const { data: newUser, error: authError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError) {
    console.error(`${accountLabel}アカウント作成エラー:`, authError);
    // Authの内部メッセージをそのまま公開せず、エラーコードを案内に変換する。
    const reasons: Record<string, string> = {
      email_exists: "このメールアドレスは既に使われています。別のメールアドレスを入力してください。",
      user_already_exists: "このメールアドレスは既に使われています。別のメールアドレスを入力してください。",
      email_address_invalid: "メールアドレスの形式が正しくありません。入力内容を確認してください。",
      weak_password: "パスワードが認証サービスの安全性要件を満たしていません。より強いパスワードを設定してください。",
      over_request_rate_limit: "作成リクエストが集中しています。しばらく待ってから再度お試しください。",
      request_timeout: "認証サービスへの接続がタイムアウトしました。しばらく待ってから再度お試しください。",
    };
    return {
      error: reasons[authError.code ?? ""] ??
        `${accountLabel}アカウントの認証情報を登録できませんでした。システム管理担当者にお問い合わせください。`,
      success: false,
    };
  }

  const { error: profileError } = await adminClient.from("profiles").insert({
    id: newUser.user.id,
    role,
    full_name: fullName,
    clinic_id: clinicId,
    is_active: true,
  });

  if (profileError) {
    console.error(`${accountLabel}プロフィール作成エラー:`, profileError);
    const { error: cleanupError } =
      await adminClient.auth.admin.deleteUser(newUser.user.id);
    if (cleanupError) {
      console.error(`${accountLabel}Authユーザー後片付けエラー:`, cleanupError);
    }
    return {
      error: cleanupError
        ? `${accountLabel}のプロフィール保存と作成途中の認証情報の削除に失敗しました。システム管理担当者にお問い合わせください。`
        : `${accountLabel}のプロフィールを保存できなかったため、アカウント作成を取り消しました。システム管理担当者にお問い合わせください。`,
      success: false,
    };
  }

  return { error: null, success: true };
}

/**
 * アカウントを削除する。撮影記録は削除せず、担当者表示・医療機関の紐付け・
 * 撮影記録の提供者追跡（監査目的）を保つため、profilesは氏名を残したまま
 * 「削除済み」の墓標行として残す（is_active=false, deleted_at設定）。
 * 画面表示はdeleted_atの有無で「(削除済みユーザー)」に切り替わるため、
 * 氏名自体をDBから消さなくても表示上は問題ない（staffDisplayName参照）。
 * メールアドレスを再登録できるようにするため、Authユーザーは実削除する。
 * 呼び出し元で有効な管理者であることを確認してから使う。
 */
async function deleteManagedAccount({
  currentUserId,
  accountId,
  role,
  accountLabel,
}: {
  currentUserId: string;
  accountId: string;
  role: Role;
  accountLabel: string;
}): Promise<ActionState> {
  if (accountId === currentUserId) {
    return { error: "自分自身のアカウントは削除できません", success: false };
  }

  const supabase = await createClient();

  if (role === "admin") {
    // 管理者が誰もいなくなると誰もアカウントを管理できなくなるため、最後の1人は削除させない。
    const { count, error: countError } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true)
      .is("deleted_at", null)
      .neq("id", accountId);
    if (countError) {
      console.error("管理者数確認エラー:", countError);
      return { error: "管理者数の確認に失敗しました", success: false };
    }
    if (!count) {
      return { error: "最後の管理者アカウントは削除できません", success: false };
    }
  }

  // Service Roleを使う前に、管理者の通常セッションとRLSで削除対象を確認する。
  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", accountId)
    .eq("role", role)
    .is("deleted_at", null)
    .maybeSingle();
  if (targetError) {
    console.error(`${accountLabel}削除時の確認エラー:`, targetError);
    return { error: `${accountLabel}の確認に失敗しました`, success: false };
  }
  if (!target) return { error: `${accountLabel}が見つかりません`, success: false };

  const { error: tombstoneError } = await supabase
    .from("profiles")
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq("id", accountId)
    .eq("role", role)
    .is("deleted_at", null);
  if (tombstoneError) {
    console.error(`${accountLabel}削除エラー:`, tombstoneError);
    return { error: `${accountLabel}の削除に失敗しました`, success: false };
  }

  // メールアドレスを解放し再登録できるようにするため、Authユーザーは実削除する。
  // 既に削除済み（再実行）の場合は成功として扱う。
  const adminClient = createAdminClient();
  const { error: authError } = await adminClient.auth.admin.deleteUser(accountId);
  if (authError && authError.status !== 404) {
    console.error(`${accountLabel}Authユーザー削除エラー:`, authError);
    return { error: `${accountLabel}の削除に失敗しました`, success: false };
  }

  return { error: null, success: true };
}

/**
 * 対象アカウントのAuthログインパスワードを再設定する。
 * Service Roleを使う前に、管理者の通常セッションとRLSで対象アカウントの存在・ロールを確認する。
 * 呼び出し元で有効な管理者であることを確認してから使う。
 */
async function updateManagedAccountPassword({
  accountId,
  role,
  password,
  accountLabel,
}: {
  accountId: string;
  role: Role;
  password: string;
  accountLabel: string;
}): Promise<ActionState> {
  const passwordError = validateAccountPassword(password);
  if (passwordError) return { error: passwordError, success: false };

  const supabase = await createClient();
  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", accountId)
    .eq("role", role)
    .is("deleted_at", null)
    .maybeSingle();
  if (targetError) {
    console.error(`${accountLabel}パスワード再設定時の確認エラー:`, targetError);
    return { error: `${accountLabel}の確認に失敗しました`, success: false };
  }
  if (!target) return { error: `${accountLabel}が見つかりません`, success: false };

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(accountId, {
    password,
  });
  if (error) {
    console.error(`${accountLabel}パスワード再設定エラー:`, error);
    return {
      error: `${accountLabel}のパスワードの再設定に失敗しました`,
      success: false,
    };
  }

  return { error: null, success: true };
}

/**
 * 対象アカウントのAuthログイン用メールアドレスを変更する。
 * Service Roleを使う前に、管理者の通常セッションとRLSで対象アカウントの存在・ロールを確認する。
 * 確認メールは送らず即時に切り替える（アカウント発行時のemail_confirmと同様）。
 * 呼び出し元で有効な管理者であることを確認してから使う。
 */
async function updateManagedAccountEmail({
  accountId,
  role,
  email,
  accountLabel,
}: {
  accountId: string;
  role: Role;
  email: string;
  accountLabel: string;
}): Promise<ActionState> {
  const emailError = validateAccountEmail(email);
  if (emailError) return { error: emailError, success: false };

  const supabase = await createClient();
  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", accountId)
    .eq("role", role)
    .is("deleted_at", null)
    .maybeSingle();
  if (targetError) {
    console.error(`${accountLabel}メール変更時の確認エラー:`, targetError);
    return { error: `${accountLabel}の確認に失敗しました`, success: false };
  }
  if (!target) return { error: `${accountLabel}が見つかりません`, success: false };

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(accountId, {
    email,
    email_confirm: true,
  });
  if (error) {
    if (error.code === "email_exists") {
      return { error: "このメールアドレスは既に使われています", success: false };
    }
    console.error(`${accountLabel}メール変更エラー:`, error);
    return {
      error: `${accountLabel}のメールアドレスの変更に失敗しました`,
      success: false,
    };
  }

  return { error: null, success: true };
}

/**
 * 対象アカウントのAuthログイン用メールアドレスを取得する。
 * 呼び出し元で対象がCookieセッション＋RLSで確認済みであることを前提とする。
 */
async function getAccountEmail(accountId: string): Promise<string | null> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.auth.admin.getUserById(accountId);
  if (error) {
    console.error("ログイン用メールアドレスの取得エラー:", error);
    return null;
  }
  return data.user?.email ?? null;
}

/** 医療機関の一覧を取得 */
export async function getClinics() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinics")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });
  if (error) throwSupabaseError(error, "医療機関の一覧の取得");
  return data ?? [];
}

/** 医療機関の新規登録 */
export async function createClinic(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "管理者権限が必要です", success: false };
  }

  const name = getRequiredText(formData, "name");
  if (!name) return { error: "医療機関名を入力してください", success: false };
  if (name.length > MAX_NAME_LENGTH) {
    return { error: "医療機関名は100文字以内で入力してください", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("clinics").insert({ name });

  if (error) {
    console.error("医療機関作成エラー:", error);
    return { error: "医療機関の作成に失敗しました", success: false };
  }

  revalidatePath("/admin/clinics");
  return { error: null, success: true };
}

/** 医療機関1件を取得 */
export async function getClinic(clinicId: string) {
  await requireAdmin();
  if (!isValidUuid(clinicId)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinics")
    .select("id, name, created_at")
    .eq("id", clinicId)
    .maybeSingle();
  if (error) throwSupabaseError(error, "医療機関の取得");
  return data;
}

const CLINIC_DETAIL_SCREENING_COLUMNS =
  "id, subject_id, created_by, status, total_inflamed_joints, created_at, profiles:created_by(full_name, deleted_at)";

type ClinicDetailScreeningProfile = { full_name: string; deleted_at: string | null };

type ClinicDetailScreeningRow = {
  id: string;
  subject_id: string | null;
  created_by: string | null;
  status: string;
  total_inflamed_joints: number | null;
  created_at: string;
  profiles: ClinicDetailScreeningProfile | ClinicDetailScreeningProfile[] | null;
};

function staffNameFromScreening(row: ClinicDetailScreeningRow) {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return staffDisplayName(profile);
}

/** 医療機関の詳細（所属スタッフ・撮影記録）を取得 */
export async function getClinicDetail(clinicId: string) {
  await requireAdmin();
  if (!isValidUuid(clinicId)) return null;

  const supabase = await createClient();
  const { data: clinic, error: clinicError } = await supabase
    .from("clinics")
    .select("id, name, created_at")
    .eq("id", clinicId)
    .maybeSingle();
  if (clinicError) throwSupabaseError(clinicError, "医療機関の取得");
  if (!clinic) return null;

  const [staffsResult, assignedResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, role, full_name, clinic_id, is_active, deleted_at, created_at")
      .eq("role", "clinic_staff")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false }),
    supabase
      .from("screenings")
      .select(
        `${CLINIC_DETAIL_SCREENING_COLUMNS}, subjects!inner(id, clinic_id)`
      )
      .eq("subjects.clinic_id", clinicId)
      .order("created_at", { ascending: false }),
  ]);

  if (staffsResult.error) {
    throwSupabaseError(staffsResult.error, "所属スタッフ一覧の取得");
  }
  if (assignedResult.error) {
    throwSupabaseError(assignedResult.error, "撮影記録の取得");
  }

  const allStaffs = staffsResult.data ?? [];
  // 削除済みスタッフが未割り当てで撮影した記録も医療機関詳細に残すため、
  // 未割り当て撮影記録の検索対象IDには削除済みスタッフも含める。
  const staffIds = allStaffs.map((staff) => staff.id);
  const staffs = allStaffs.filter((staff) => !staff.deleted_at);

  const unassignedResult =
    staffIds.length === 0
      ? { data: [] as ClinicDetailScreeningRow[], error: null }
      : await supabase
          .from("screenings")
          .select(CLINIC_DETAIL_SCREENING_COLUMNS)
          .is("subject_id", null)
          .in("created_by", staffIds)
          .order("created_at", { ascending: false });

  if (unassignedResult.error) {
    throwSupabaseError(unassignedResult.error, "未割り当て撮影記録の取得");
  }

  const screeningsById = new Map<
    string,
    {
      id: string;
      subject_id: string | null;
      created_by: string | null;
      status: string;
      total_inflamed_joints: number | null;
      created_at: string;
      staff_name: string | null;
    }
  >();

  for (const row of [
    ...(assignedResult.data ?? []),
    ...(unassignedResult.data ?? []),
  ] as ClinicDetailScreeningRow[]) {
    screeningsById.set(row.id, {
      id: row.id,
      subject_id: row.subject_id,
      created_by: row.created_by,
      status: row.status,
      total_inflamed_joints: row.total_inflamed_joints,
      created_at: row.created_at,
      staff_name: staffNameFromScreening(row),
    });
  }

  const screenings = [...screeningsById.values()].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
  );

  return { clinic, staffs, screenings };
}

/** 医療機関名を更新 */
export async function updateClinic(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "管理者権限が必要です", success: false };
  }

  const clinicId = getRequiredText(formData, "clinic_id");
  const name = getRequiredText(formData, "name");
  if (!isValidUuid(clinicId)) {
    return { error: "医療機関の指定が不正です", success: false };
  }
  if (!name) return { error: "医療機関名を入力してください", success: false };
  if (name.length > MAX_NAME_LENGTH) {
    return { error: "医療機関名は100文字以内で入力してください", success: false };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinics")
    .update({ name })
    .eq("id", clinicId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("医療機関更新エラー:", error);
    return { error: "医療機関の更新に失敗しました", success: false };
  }
  if (!data) return { error: "医療機関が見つかりません", success: false };

  revalidatePath("/admin/clinics");
  revalidatePath(`/admin/clinics/${clinicId}`);
  revalidatePath(`/admin/clinics/${clinicId}/edit`);
  revalidatePath("/admin/staffs");
  return { error: null, success: true };
}

/** 医療機関のスタッフ一覧を取得（削除済みアカウントは除く。ログイン用メールを含む） */
export async function getStaffs() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, full_name, clinic_id, is_active, created_at, clinics(name)")
    .eq("role", "clinic_staff")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throwSupabaseError(error, "スタッフ一覧の取得");
  const staffs = data ?? [];
  const emails = await Promise.all(staffs.map((staff) => getAccountEmail(staff.id)));
  return staffs.map((staff, index) => ({ ...staff, email: emails[index] }));
}

/** スタッフ1件を取得（削除済みアカウントは除く。ログイン用メールを含む） */
export async function getStaff(staffId: string) {
  await requireAdmin();
  if (!isValidUuid(staffId)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, full_name, clinic_id, is_active, created_at, clinics(name)")
    .eq("id", staffId)
    .eq("role", "clinic_staff")
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throwSupabaseError(error, "スタッフの取得");
  if (!data) return null;
  const email = await getAccountEmail(data.id);
  return { ...data, email };
}

/** スタッフの表示名・所属・有効状態を更新 */
export async function updateStaff(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "管理者権限が必要です", success: false };
  }

  const staffId = getRequiredText(formData, "staff_id");
  const fullName = getRequiredText(formData, "full_name");
  const clinicId = getRequiredText(formData, "clinic_id");
  const isActive = formData.get("is_active") === "on";

  if (!isValidUuid(staffId) || !isValidUuid(clinicId)) {
    return { error: "スタッフまたは所属医療機関の指定が不正です", success: false };
  }
  if (!fullName) return { error: "スタッフ氏名を入力してください", success: false };
  if (fullName.length > MAX_NAME_LENGTH) {
    return { error: "スタッフ氏名は100文字以内で入力してください", success: false };
  }

  const supabase = await createClient();
  const { data: clinic, error: clinicError } = await supabase
    .from("clinics")
    .select("id")
    .eq("id", clinicId)
    .maybeSingle();
  if (clinicError) {
    console.error("スタッフ更新時の医療機関確認エラー:", clinicError);
    return { error: "医療機関の確認に失敗しました", success: false };
  }
  if (!clinic) return { error: "選択した医療機関が見つかりません", success: false };

  const { data: existingStaff, error: existingStaffError } = await supabase
    .from("profiles")
    .select("id, clinic_id")
    .eq("id", staffId)
    .eq("role", "clinic_staff")
    .is("deleted_at", null)
    .maybeSingle();
  if (existingStaffError) {
    console.error("スタッフ更新時のスタッフ確認エラー:", existingStaffError);
    return { error: "スタッフ情報の更新に失敗しました", success: false };
  }
  if (!existingStaff) return { error: "スタッフが見つかりません", success: false };

  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, clinic_id: clinicId, is_active: isActive })
    .eq("id", staffId)
    .eq("role", "clinic_staff")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("スタッフ更新エラー:", error);
    return { error: "スタッフ情報の更新に失敗しました", success: false };
  }
  if (!data) return { error: "スタッフが見つかりません", success: false };

  revalidatePath("/admin/staffs");
  revalidatePath(`/admin/staffs/${staffId}/edit`);
  revalidatePath(`/admin/clinics/${clinicId}`);
  if (existingStaff.clinic_id && existingStaff.clinic_id !== clinicId) {
    revalidatePath(`/admin/clinics/${existingStaff.clinic_id}`);
  }
  return { error: null, success: true };
}

/** スタッフのログインパスワードを再設定 */
export async function resetStaffPassword(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "管理者権限が必要です", success: false };
  }

  const staffId = getRequiredText(formData, "staff_id");
  const password = getPassword(formData);

  if (!isValidUuid(staffId)) {
    return { error: "スタッフの指定が不正です", success: false };
  }

  return updateManagedAccountPassword({
    accountId: staffId,
    role: "clinic_staff",
    password,
    accountLabel: "スタッフ",
  });
}

/** スタッフのログイン用メールアドレスを変更 */
export async function updateStaffEmail(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "管理者権限が必要です", success: false };
  }

  const staffId = getRequiredText(formData, "staff_id");
  const email = getRequiredText(formData, "email");

  if (!isValidUuid(staffId)) {
    return { error: "スタッフの指定が不正です", success: false };
  }

  const result = await updateManagedAccountEmail({
    accountId: staffId,
    role: "clinic_staff",
    email,
    accountLabel: "スタッフ",
  });
  if (result.success) revalidatePath(`/admin/staffs/${staffId}/edit`);
  return result;
}

/** 医療機関スタッフアカウント発行 */
export async function createStaff(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "管理者権限が必要です", success: false };
  }

  const { credentials, error: credentialsError } = getAccountCredentials(
    formData,
    "スタッフ氏名"
  );
  const clinicId = getRequiredText(formData, "clinic_id");

  if (!credentials || !clinicId) {
    if (credentialsError) {
      return { error: credentialsError, success: false };
    }
    return { error: "必須項目を入力してください", success: false };
  }

  if (!isValidUuid(clinicId)) {
    return { error: "所属医療機関の指定が不正です", success: false };
  }

  // Service Roleを使う前に、管理者の通常セッションとRLSで対象医療機関を確認する。
  const supabase = await createClient();
  const { data: clinic, error: clinicError } = await supabase
    .from("clinics")
    .select("id")
    .eq("id", clinicId)
    .maybeSingle();
  if (clinicError) {
    console.error("スタッフ作成時の医療機関確認エラー:", clinicError);
    return { error: "医療機関の確認に失敗しました", success: false };
  }
  if (!clinic) return { error: "選択した医療機関が見つかりません", success: false };

  const result = await createManagedAccount({
    ...credentials,
    role: "clinic_staff",
    clinicId,
    accountLabel: "スタッフ",
  });
  if (!result.success) return result;

  revalidatePath("/admin/staffs");
  revalidatePath(`/admin/clinics/${clinicId}`);
  return result;
}

/**
 * 医療機関スタッフアカウントを削除する。
 * 撮影記録は削除せず、担当スタッフ名は「(削除済みユーザー)」と表示する。
 */
export async function deleteStaff(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  let current;
  try {
    current = await requireAdmin();
  } catch {
    return { error: "管理者権限が必要です", success: false };
  }

  const staffId = getRequiredText(formData, "staff_id");
  if (!isValidUuid(staffId)) {
    return { error: "スタッフの指定が不正です", success: false };
  }

  const result = await deleteManagedAccount({
    currentUserId: current.userId,
    accountId: staffId,
    role: "clinic_staff",
    accountLabel: "スタッフ",
  });
  if (!result.success) return result;

  revalidatePath("/admin/staffs");
  revalidatePath("/admin/clinics");
  revalidatePath("/admin/screenings");
  redirect("/admin/staffs");
}

/** 管理者一覧を取得（無効なアカウントも含む。削除済みアカウントは除く。ログイン用メールを含む） */
export async function getAdmins() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, is_active")
    .eq("role", "admin")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throwSupabaseError(error, "管理者一覧の取得");
  const admins = data ?? [];
  const emails = await Promise.all(admins.map((admin) => getAccountEmail(admin.id)));
  return admins.map((admin, index) => ({ ...admin, email: emails[index] }));
}

/** 管理者1件を取得（削除済みアカウントは除く。ログイン用メールを含む） */
export async function getAdmin(adminId: string) {
  await requireAdmin();
  if (!isValidUuid(adminId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, is_active")
    .eq("id", adminId)
    .eq("role", "admin")
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throwSupabaseError(error, "管理者の取得");
  if (!data) return null;
  const email = await getAccountEmail(data.id);
  return { ...data, email };
}

/** 管理者の表示名を更新 */
export async function updateAdminName(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "管理者権限が必要です", success: false };
  }
  const adminId = getRequiredText(formData, "admin_id");
  const fullName = getRequiredText(formData, "full_name");
  if (!isValidUuid(adminId)) {
    return { error: "管理者の指定が不正です", success: false };
  }
  if (!fullName) return { error: "管理者氏名を入力してください", success: false };
  if (fullName.length > MAX_NAME_LENGTH) {
    return { error: "管理者氏名は100文字以内で入力してください", success: false };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", adminId)
    .eq("role", "admin")
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("管理者氏名の更新エラー:", error);
    return { error: "管理者氏名の更新に失敗しました", success: false };
  }
  if (!data) return { error: "管理者が見つかりません", success: false };

  // 自分の名前を変更した場合はヘッダーの表示名も更新する。
  revalidatePath("/admin", "layout");
  return { error: null, success: true };
}

/** 管理者のログイン用メールアドレスを変更する（自分自身も対象にできる）。 */
export async function updateAdminEmail(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "管理者権限が必要です", success: false };
  }

  const adminId = getRequiredText(formData, "admin_id");
  const email = getRequiredText(formData, "email");

  if (!isValidUuid(adminId)) {
    return { error: "管理者の指定が不正です", success: false };
  }

  const result = await updateManagedAccountEmail({
    accountId: adminId,
    role: "admin",
    email,
    accountLabel: "管理者",
  });
  if (result.success) revalidatePath(`/admin/admins/${adminId}/edit`);
  return result;
}

/** 管理者のログインパスワードを再設定する（自分自身も対象にできる）。 */
export async function resetAdminPassword(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "管理者権限が必要です", success: false };
  }

  const adminId = getRequiredText(formData, "admin_id");
  const password = getPassword(formData);

  if (!isValidUuid(adminId)) {
    return { error: "管理者の指定が不正です", success: false };
  }

  return updateManagedAccountPassword({
    accountId: adminId,
    role: "admin",
    password,
    accountLabel: "管理者",
  });
}

/** 管理者アカウント発行 */
export async function createAdmin(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "管理者権限が必要です", success: false };
  }

  const { credentials, error } = getAccountCredentials(formData, "管理者氏名");
  if (!credentials) return { error, success: false };

  // Service Role を使う前に、呼び出し元が有効な管理者であることを確認する。
  const result = await createManagedAccount({
    ...credentials,
    role: "admin",
    clinicId: null,
    accountLabel: "管理者",
  });
  if (result.success) revalidatePath("/admin/admins");
  return result;
}

/**
 * 管理者アカウントを削除する。自分自身と、最後の1人の管理者は削除できない。
 */
export async function deleteAdmin(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  let current;
  try {
    current = await requireAdmin();
  } catch {
    return { error: "管理者権限が必要です", success: false };
  }

  const adminId = getRequiredText(formData, "admin_id");
  if (!isValidUuid(adminId)) {
    return { error: "管理者の指定が不正です", success: false };
  }

  const result = await deleteManagedAccount({
    currentUserId: current.userId,
    accountId: adminId,
    role: "admin",
    accountLabel: "管理者",
  });
  if (!result.success) return result;

  revalidatePath("/admin/admins");
  redirect("/admin/admins");
}

/** 管理者用：全医療機関の撮影記録を検索して1ページ取得 */
export async function getScreeningsForAdmin(
  filters: AdminScreeningFilters,
  requestedPageSize = ADMIN_SCREENINGS_PAGE_SIZE
) {
  await requireAdmin();
  const supabase = await createClient();
  // Server Actionは直接呼び出せるため、画面側で正規化済みでも再検証する。
  const safeFilters = normalizeAdminScreeningFilters({
    clinic: typeof filters?.clinicId === "string" ? filters.clinicId : undefined,
    from: typeof filters?.dateFrom === "string" ? filters.dateFrom : undefined,
    to: typeof filters?.dateTo === "string" ? filters.dateTo : undefined,
    status: typeof filters?.status === "string" ? filters.status : undefined,
    subject: typeof filters?.subjectId === "string" ? filters.subjectId : undefined,
    id:
      typeof filters?.screeningIdInput === "string" && filters.screeningIdInput
        ? filters.screeningIdInput
        : typeof filters?.screeningId === "string"
          ? filters.screeningId
          : undefined,
    page: typeof filters?.page === "number" ? String(filters.page) : undefined,
  });
  const pageSize =
    Number.isSafeInteger(requestedPageSize) && requestedPageSize > 0
      ? Math.min(requestedPageSize, 1000)
      : ADMIN_SCREENINGS_PAGE_SIZE;

  if (safeFilters.screeningIdInput && !safeFilters.screeningId && !safeFilters.screeningIdPrefix) {
    return {
      screenings: [],
      total: 0,
      page: 1,
      pageSize,
      totalPages: 1,
    };
  }

  let subjectIds: string[] | null = null;
  let staffIds: string[] | null = null;

  if (safeFilters.clinicId) {
    const [subjectsResult, staffsResult] = await Promise.all([
      supabase.from("subjects").select("id").eq("clinic_id", safeFilters.clinicId),
      supabase.from("profiles").select("id").eq("clinic_id", safeFilters.clinicId),
    ]);
    if (subjectsResult.error) {
      throwSupabaseError(subjectsResult.error, "医療機関の被験者一覧の取得");
    }
    if (staffsResult.error) {
      throwSupabaseError(staffsResult.error, "医療機関のスタッフ一覧の取得");
    }
    subjectIds = (subjectsResult.data ?? []).map(({ id }) => id);
    staffIds = (staffsResult.data ?? []).map(({ id }) => id);

    if (subjectIds.length === 0 && staffIds.length === 0) {
      return {
        screenings: [],
        total: 0,
        page: 1,
        pageSize,
        totalPages: 1,
      };
    }
  }

  let query = supabase
    .from("screenings")
    .select(
      "id, subject_id, created_by, status, status_updated_at, total_inflamed_joints, ra_detected, ai_model_version, analyzed_at, created_at, subjects(id, clinic_id, clinics(name)), profiles:created_by(full_name, deleted_at, clinic_id, clinics(name)), joint_results(side, joint_name, is_inflamed, confidence_score)",
      { count: "exact" }
    );

  if (subjectIds && staffIds) {
    const conditions: string[] = [];
    if (subjectIds.length > 0) {
      conditions.push(`subject_id.in.(${subjectIds.join(",")})`);
    }
    if (staffIds.length > 0) {
      conditions.push(
        `and(subject_id.is.null,created_by.in.(${staffIds.join(",")}))`
      );
    }
    query = query.or(conditions.join(","));
  }
  if (safeFilters.status) query = query.eq("status", safeFilters.status);
  if (safeFilters.subjectId) query = query.eq("subject_id", safeFilters.subjectId);
  if (safeFilters.screeningId) {
    query = query.eq("id", safeFilters.screeningId);
  } else if (safeFilters.screeningIdPrefix) {
    const { from, to } = screeningIdPrefixBounds(safeFilters.screeningIdPrefix);
    query = query.gte("id", from).lte("id", to);
  }
  if (safeFilters.dateFrom) {
    query = query.gte("created_at", startOfJapanDate(safeFilters.dateFrom));
  }
  if (safeFilters.dateTo) {
    query = query.lt("created_at", endOfJapanDateExclusive(safeFilters.dateTo));
  }

  const firstRow = (safeFilters.page - 1) * pageSize;
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(firstRow, firstRow + pageSize - 1);
  if (error) throwSupabaseError(error, "撮影記録一覧の取得");

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    screenings: data ?? [],
    total,
    page: Math.min(safeFilters.page, totalPages),
    pageSize,
    totalPages,
  };
}
