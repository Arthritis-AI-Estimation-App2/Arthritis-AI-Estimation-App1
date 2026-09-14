/** 管理画面でスタッフ・管理者へ渡す初期／再設定パスワードの長さ。 */
export const GENERATED_PASSWORD_LENGTH = 16;

const LOWERCASE = "abcdefghijkmnpqrstuvwxyz";
const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^*_-+=?";
const ALL = `${LOWERCASE}${UPPERCASE}${DIGITS}${SYMBOLS}`;

function randomIndex(length: number) {
  if (length <= 0 || length > 256) {
    throw new Error("unsupported range");
  }

  const maxUnbiased = Math.floor(256 / length) * length;
  const bytes = new Uint8Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(bytes);
    value = bytes[0] ?? 0;
  } while (value >= maxUnbiased);

  return value % length;
}

function pick(charset: string) {
  return charset[randomIndex(charset.length)] ?? charset[0] ?? "";
}

function shuffle(chars: string[]) {
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    const current = chars[i] ?? "";
    chars[i] = chars[j] ?? "";
    chars[j] = current;
  }
  return chars;
}

/**
 * 大文字・小文字・数字・記号を含む、推測されにくいパスワードを生成する。
 * 0/O/1/l/I など読み間違えやすい文字は含めない。
 */
export function generatePassword(length = GENERATED_PASSWORD_LENGTH) {
  if (length < 4) {
    throw new Error("password length is too short");
  }

  const chars = [pick(LOWERCASE), pick(UPPERCASE), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) {
    chars.push(pick(ALL));
  }

  return shuffle(chars).join("");
}
