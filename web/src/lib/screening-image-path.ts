/** 作成者・スクリーニングに紐づく、許可された手画像パスだけを受け入れる。 */
export function isScreeningImagePath(
  path: string,
  userId: string,
  screeningId: string,
  side?: "right" | "left"
): boolean {
  const prefix = `${userId}/${screeningId}/`;
  if (!path.startsWith(prefix)) return false;

  const sidePattern = side ?? "(?:right|left)";
  return new RegExp(`^${sidePattern}_[0-9]+\\.jpg$`).test(path.slice(prefix.length));
}

/** 許可された手画像パスから作成者IDを取り出す。形式が不正なら null。 */
export function screeningImageCreatorId(
  path: string,
  screeningId: string
): string | null {
  const separator = `/${screeningId}/`;
  const index = path.indexOf(separator);
  if (index <= 0) return null;
  const userId = path.slice(0, index);
  return isScreeningImagePath(path, userId, screeningId) ? userId : null;
}
