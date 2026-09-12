import assert from "node:assert/strict";
import test from "node:test";
import { loadServerModule } from "./helpers/load-server-module.mjs";

const userId = "11111111-1111-4111-8111-111111111111";
const currentEmail = "current@example.com";
const currentPassword = "current-password-123";

function buildAuthActions({ adminClientOverrides } = {}) {
  const profile = {
    id: userId,
    role: "admin",
    full_name: "テスト管理者",
    clinic_id: null,
    is_active: true,
    deleted_at: null,
    created_at: "2024-01-01T00:00:00.000Z",
  };
  const sessionClient = {
    auth: {
      getUser: async () => ({
        data: { user: { id: userId, email: currentEmail } },
        error: null,
      }),
      signInWithPassword: async ({ email, password }) => {
        if (email === currentEmail && password === currentPassword) {
          return { data: { user: { id: userId } }, error: null };
        }
        return {
          data: { user: null },
          error: { message: "invalid_credentials" },
        };
      },
    },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: profile, error: null }),
      };
      return query;
    },
  };
  const calls = { updateUserById: 0 };
  const adminClient = {
    auth: {
      admin: {
        updateUserById: async (id, attributes) => {
          calls.updateUserById++;
          calls.lastId = id;
          calls.lastAttributes = attributes;
          if (adminClientOverrides?.updateUserById) {
            return adminClientOverrides.updateUserById(id, attributes);
          }
          return { data: { user: { id } }, error: null };
        },
      },
    },
  };
  const actions = loadServerModule("src/app/actions/auth.ts", {
    "@/lib/supabase/server": { createClient: async () => sessionClient },
    "@/lib/supabase/admin": { createAdminClient: () => adminClient },
    "next/navigation": { redirect: () => assert.fail("この操作はリダイレクトしない") },
  });
  return { actions, calls };
}

function emailForm({ newEmail = "new@example.com", password = currentPassword } = {}) {
  const form = new FormData();
  form.set("new_email", newEmail);
  form.set("current_password", password);
  return form;
}

test("メールアドレス変更: 未ログインの場合はService Roleへ到達しない", async () => {
  const calls = { updateUserById: 0 };
  const actions = loadServerModule("src/app/actions/auth.ts", {
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      }),
    },
    "@/lib/supabase/admin": {
      createAdminClient: () => {
        calls.updateUserById++;
        throw new Error("未ログインでService Role使用");
      },
    },
    "next/navigation": { redirect: () => assert.fail("この操作はリダイレクトしない") },
  });
  const result = await actions.changeEmail({}, emailForm());
  assert.ok(result.error);
  assert.equal(calls.updateUserById, 0);
});

test("メールアドレス変更: 入力検証で不正な形式・未入力を拒否する", async () => {
  const { actions, calls } = buildAuthActions();
  for (const [newEmail, password] of [
    ["", currentPassword],
    ["new@example.com", ""],
    ["not-an-email", currentPassword],
    [" ", currentPassword],
  ]) {
    const result = await actions.changeEmail({}, emailForm({ newEmail, password }));
    assert.ok(result.error, `"${newEmail}" は拒否される`);
  }
  assert.equal(calls.updateUserById, 0);
});

test("メールアドレス変更: 現在のメールアドレスと同じ場合は拒否する", async () => {
  const { actions, calls } = buildAuthActions();
  const result = await actions.changeEmail({}, emailForm({ newEmail: currentEmail }));
  assert.ok(result.error);
  assert.equal(calls.updateUserById, 0);
});

test("メールアドレス変更: 現在のパスワードが誤っている場合は拒否する", async () => {
  const { actions, calls } = buildAuthActions();
  const result = await actions.changeEmail({}, emailForm({ password: "wrong-password" }));
  assert.ok(result.error);
  assert.equal(calls.updateUserById, 0);
});

test("メールアドレス変更: 本人確認後にService Roleで即時切替する", async () => {
  const { actions, calls } = buildAuthActions();
  const result = await actions.changeEmail({}, emailForm({ newEmail: "new-admin@example.com" }));
  assert.equal(result.success, true);
  assert.equal(calls.updateUserById, 1);
  assert.equal(calls.lastId, userId);
  assert.deepEqual(calls.lastAttributes, {
    email: "new-admin@example.com",
    email_confirm: true,
  });
});

test("メールアドレス変更: 重複メールをわかりやすいメッセージに変換する", async () => {
  const { actions } = buildAuthActions({
    adminClientOverrides: {
      updateUserById: async () => ({
        data: { user: null },
        error: { message: "Email already exists", code: "email_exists" },
      }),
    },
  });
  const result = await actions.changeEmail({}, emailForm({ newEmail: "duplicate@example.com" }));
  assert.equal(result.error, "このメールアドレスは既に使われています");
});

test("メールアドレス変更: その他のService Roleエラーは汎用メッセージにする", async (t) => {
  t.mock.method(console, "error", () => {});
  const { actions } = buildAuthActions({
    adminClientOverrides: {
      updateUserById: async () => ({
        data: { user: null },
        error: { message: "unexpected" },
      }),
    },
  });
  const result = await actions.changeEmail({}, emailForm({ newEmail: "new-admin@example.com" }));
  assert.ok(result.error);
  assert.notEqual(result.error, "このメールアドレスは既に使われています");
});
