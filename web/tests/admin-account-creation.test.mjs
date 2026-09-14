import assert from "node:assert/strict";
import test from "node:test";
import { loadServerModule } from "./helpers/load-server-module.mjs";

test("アカウント作成の失敗理由を表示し、失敗時は画面を再検証しない", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const [code, expected] of [
    ["email_exists", /メールアドレスは既に使われています/],
    ["user_already_exists", /メールアドレスは既に使われています/],
    ["weak_password", /安全性要件/],
    ["email_address_invalid", /形式が正しくありません/],
    ["over_request_rate_limit", /しばらく待って/],
    ["request_timeout", /タイムアウト/],
    ["unexpected_failure", /認証情報を登録できませんでした/],
    [undefined, /認証情報を登録できませんでした/],
  ]) {
    const actions = loadServerModule("src/app/actions/admin.ts", {
      "@/lib/supabase/server": {},
      "@/lib/supabase/admin": {
        createAdminClient: () => ({
          auth: { admin: { createUser: async () => ({
            data: { user: null }, error: { code, message: "internal sensitive detail" },
          }) } },
          from: () => assert.fail("認証失敗後にプロフィールを保存しない"),
        }),
      },
      "@/lib/auth": { getCurrentUser: async () => ({ profile: { role: "admin" } }) },
      "next/cache": { revalidatePath: () => assert.fail("失敗時は再検証しない") },
      "next/navigation": {},
    });
    const form = new FormData();
    form.set("email", "existing@example.com");
    form.set("password", "test-password-123");
    form.set("full_name", "テスト管理者");
    const result = await actions.createAdmin({}, form);
    assert.equal(result.success, false);
    assert.match(result.error, expected);
    assert.doesNotMatch(result.error, /internal sensitive detail/);
  }
});
