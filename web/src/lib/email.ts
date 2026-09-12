const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_EMAIL_LENGTH = 254;

/** ログイン用メールアドレスの簡易形式検証。Authでの一意性チェックは呼び出し元で行う。 */
export function validateAccountEmail(email: string) {
  if (!email) return "メールアドレスを入力してください";
  if (email.length > MAX_EMAIL_LENGTH) {
    return `メールアドレスは${MAX_EMAIL_LENGTH}文字以内で入力してください`;
  }
  if (!EMAIL_PATTERN.test(email)) {
    return "メールアドレスの形式が正しくありません";
  }
  return null;
}
