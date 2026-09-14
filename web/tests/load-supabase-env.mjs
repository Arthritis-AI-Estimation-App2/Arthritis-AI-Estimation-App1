import { existsSync } from "node:fs";
import path from "node:path";

function loadProjectEnv() {
  const root = process.cwd();
  // loadEnvFile は既存の値を上書きしないので、.env.local を先に読む
  for (const name of [".env.local", ".env"]) {
    const file = path.join(root, name);
    if (existsSync(file)) {
      process.loadEnvFile(file);
    }
  }
}

function isLocalSupabaseUrl(url) {
  try {
    const { hostname } = new URL(url);
    return hostname === "127.0.0.1" || hostname === "localhost";
  } catch {
    return false;
  }
}

function definedCount(values) {
  return values.filter((value) => value).length;
}

export function resolveRlsTestTarget() {
  loadProjectEnv();

  const testTarget = {
    url: process.env.TEST_SUPABASE_URL,
    publishableKey: process.env.TEST_SUPABASE_PUBLISHABLE_KEY,
    secretKey: process.env.TEST_SUPABASE_SECRET_KEY,
  };
  const testCount = definedCount(Object.values(testTarget));
  if (testCount === 3) {
    return testTarget;
  }
  if (testCount > 0) {
    return {
      error:
        "TEST_SUPABASE_URL / TEST_SUPABASE_PUBLISHABLE_KEY / TEST_SUPABASE_SECRET_KEY は3つ揃えて設定してください。",
    };
  }

  const appTarget = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    secretKey: process.env.SUPABASE_SECRET_KEY,
  };
  if (definedCount(Object.values(appTarget)) === 3) {
    if (isLocalSupabaseUrl(appTarget.url)) {
      return appTarget;
    }
    return {
      error:
        `RLSテストはアプリ用のリモートSupabase（${appTarget.url}）を自動では使いません。` +
        "ローカルなら .env.local の NEXT_PUBLIC_SUPABASE_URL を http://127.0.0.1:54321 にしてください。" +
        "専用のテストプロジェクトを使う場合は TEST_SUPABASE_* を .env.local に書いてください。本番のキーは使わないでください。",
    };
  }

  return {
    error:
      ".env.local にローカルSupabaseの NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY を設定するか、専用テストプロジェクト向けに TEST_SUPABASE_* を設定してください。",
  };
}
