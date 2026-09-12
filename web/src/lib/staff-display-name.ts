/** 削除済みアカウントの表示名。撮影・解析データは削除せず、この文字列で担当スタッフを表示する。 */
export const DELETED_USER_NAME = "(削除済みユーザー)";

/** 表示名が不明な場合（撮影者のプロフィールが存在しない等）の文字列。 */
export const UNKNOWN_USER_NAME = "不明";

type DisplayNameProfile = {
  full_name: string;
  deleted_at: string | null;
};

/**
 * 撮影データの担当スタッフ・管理者名を表示用に整形する。
 * 削除済みアカウントも氏名自体はDBに残すが（撮影データの提供者を内部で追跡できるように
 * するため）、画面には常に表示用の代替文字列を出すので、full_nameの内容に関わらず
 * deleted_atの有無だけで判定する。
 */
export function staffDisplayName(
  profile: DisplayNameProfile | null | undefined
): string {
  if (!profile) return UNKNOWN_USER_NAME;
  return profile.deleted_at ? DELETED_USER_NAME : profile.full_name;
}
