import assert from "node:assert/strict";
import test from "node:test";
import { loadServerModule } from "./helpers/load-server-module.mjs";

const userId = "11111111-1111-4111-8111-111111111111";
const screeningId = "22222222-2222-4222-8222-222222222222";
const paths = ["right_1.jpg", "left_1.jpg"].map(
  (file) => `${userId}/${screeningId}/${file}`
);

test("未ログインの更新ActionはService Roleへ到達しない", async () => {
  let adminCalls = 0;
  let dataCalls = 0;
  const dependencies = {
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: null } }) },
        from: () => { dataCalls++; throw new Error("未認証のDB操作"); },
      }),
    },
    "@/lib/supabase/admin": {
      createAdminClient: () => { adminCalls++; throw new Error("未認証のService Role使用"); },
    },
    "next/cache": { revalidatePath: () => assert.fail("未認証の更新") },
    "next/navigation": { redirect: () => assert.fail("未認証の更新") },
  };
  const cases = [
    ["screenings", "createScreening", []],
    ["screenings", "updateScreeningImages", [screeningId, ...paths]],
    ["screenings", "abandonScreeningUpload", [screeningId, paths]],
    ["screenings", "deleteScreeningAsAdmin", [{ error: null, success: false }, (() => {
      const form = new FormData();
      form.set("screening_id", screeningId);
      return form;
    })()]],
    ["analyze", "analyzeScreening", [screeningId]],
    ["analyze", "retryAnalysis", [screeningId]],
    ["analyze", "markInterruptedScreeningFailed", [screeningId]],
    ["subjects", "createSubject", []],
    ["subjects", "assignScreeningsToSubject", ["keio1", [screeningId]]],
    ["subjects", "correctScreeningSubject", [screeningId, "keio1"]],
    ...[
      "createClinic",
      "updateClinic",
      "updateStaff",
      "updateAdminName",
      "resetStaffPassword",
      "updateStaffEmail",
      "resetAdminPassword",
      "updateAdminEmail",
      "createStaff",
      "createAdmin",
      "deleteStaff",
      "deleteAdmin",
    ].map((name) => ["admin", name, [{ error: null, success: false }, new FormData()]]),
  ];
  for (const [file, name, args] of cases) {
    const actions = loadServerModule(`src/app/actions/${file}.ts`, dependencies);
    const result = await actions[name](...args);
    assert.ok(result.error, `${name} は未ログインを拒否する`);
  }
  assert.equal(adminCalls, 0);
  assert.equal(dataCalls, 0);
});

function cleanupFixture({
  active = true,
  screening = { id: screeningId, created_by: userId, status: "uploading", right_image_url: null, left_image_url: null },
  savedPaths = [paths[0]],
  storageError = null,
} = {}) {
  const files = new Set(savedPaths);
  const events = [];
  let deleted = false;
  let adminCalls = 0;
  const sessionClient = {
    auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    from: (table) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: table === "profiles"
            ? { id: userId, role: "clinic_staff", clinic_id: "clinic-a", is_active: active }
            : screening,
          error: null,
        }),
      };
      return query;
    },
    // 修正前のRLSによる「成功扱い・削除0件」を再現する。
    storage: { from: () => ({ remove: async () => ({ data: [], error: null }) }) },
  };
  const adminClient = {
    storage: {
      from: (bucket) => {
        assert.equal(bucket, "hand-images");
        return {
          remove: async (requestedPaths) => {
            events.push("remove");
            assert.deepEqual(requestedPaths, paths);
            if (storageError) return { data: null, error: storageError };
            const removed = requestedPaths.filter((path) => files.delete(path));
            return { data: removed.map((name) => ({ name })), error: null };
          },
        };
      },
    },
    from: (table) => {
      assert.equal(table, "screenings");
      const filters = {};
      const query = {
        delete: () => query,
        eq: (column, value) => { filters[column] = value; return query; },
        select: () => query,
        maybeSingle: async () => {
          assert.deepEqual(filters, { id: screeningId, created_by: userId, status: "uploading" });
          events.push("delete");
          deleted = true;
          return { data: { id: screeningId }, error: null };
        },
      };
      return query;
    },
  };
  const actions = loadServerModule("src/app/actions/screenings.ts", {
    "@/lib/supabase/server": { createClient: async () => sessionClient },
    "@/lib/supabase/admin": { createAdminClient: () => { adminCalls++; return adminClient; } },
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: () => assert.fail("後片付けはリダイレクトしない") },
  });
  return {
    run: (requestedPaths = paths) => actions.abandonScreeningUpload(screeningId, requestedPaths),
    files, events,
    get deleted() { return deleted; },
    get adminCalls() { return adminCalls; },
  };
}

test("後片付け: 片手だけ保存された画像を削除してから撮影記録を削除する", async () => {
  const fixture = cleanupFixture();
  assert.deepEqual(await fixture.run(), { error: null });
  assert.equal(fixture.files.size, 0);
  assert.equal(fixture.deleted, true);
  assert.deepEqual(fixture.events, ["remove", "delete"]);
});

test("後片付け: 両手とも未保存でも撮影記録を削除できる", async () => {
  const fixture = cleanupFixture({ savedPaths: [] });
  assert.deepEqual(await fixture.run(), { error: null });
  assert.equal(fixture.deleted, true);
});

test("後片付け: Storage削除失敗時は画像と撮影記録を残す", async (t) => {
  t.mock.method(console, "error", () => {});
  const fixture = cleanupFixture({ storageError: { message: "storage unavailable" } });
  assert.ok((await fixture.run()).error);
  assert.equal(fixture.deleted, false);
  assert.equal(fixture.files.size, 1);
  assert.deepEqual(fixture.events, ["remove"]);
});

test("後片付け: 無効ユーザー・参照不可・他作成者・解析開始済み・不正パスを拒否する", async () => {
  for (const options of [
    { active: false },
    { screening: null },
    { screening: { id: screeningId, created_by: "other-user", status: "uploading" } },
    ...["analyzing", "completed", "failed"].map((status) => ({
      screening: { id: screeningId, created_by: userId, status },
    })),
  ]) {
    const fixture = cleanupFixture(options);
    assert.ok((await fixture.run()).error);
    assert.equal(fixture.adminCalls, 0);
    assert.equal(fixture.deleted, false);
  }
  for (const path of [
    `other-user/${screeningId}/right_1.jpg`,
    `${userId}/other-screening/right_1.jpg`,
    `${userId}/${screeningId}/arbitrary/note.txt`,
  ]) {
    const fixture = cleanupFixture();
    assert.ok((await fixture.run([path])).error);
    assert.equal(fixture.adminCalls, 0);
  }
});

const adminId = userId;
const creatorId = "44444444-4444-4444-8444-444444444444";
const adminDeletePaths = ["right_1.jpg", "left_1.jpg"].map(
  (file) => `${creatorId}/${screeningId}/${file}`
);

function adminDeleteForm(id = screeningId) {
  const form = new FormData();
  form.set("screening_id", id);
  return form;
}

function adminDeleteFixture({
  role = "admin",
  active = true,
  screening = {
    id: screeningId,
    created_by: creatorId,
    subject_id: null,
    right_image_url: adminDeletePaths[0],
    left_image_url: adminDeletePaths[1],
  },
  savedPaths = adminDeletePaths,
  storageError = null,
  expectedPaths = adminDeletePaths,
} = {}) {
  const files = new Set(savedPaths);
  const events = [];
  const redirected = [];
  let deleted = false;
  let adminCalls = 0;
  const sessionClient = {
    auth: { getUser: async () => ({ data: { user: { id: adminId } } }) },
    from: (table) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: table === "profiles"
            ? { id: adminId, role, clinic_id: null, is_active: active }
            : screening,
          error: null,
        }),
      };
      return query;
    },
  };
  const adminClient = {
    storage: {
      from: (bucket) => {
        assert.equal(bucket, "hand-images");
        return {
          remove: async (requestedPaths) => {
            events.push("remove");
            assert.deepEqual(requestedPaths, expectedPaths);
            if (storageError) return { data: null, error: storageError };
            const removed = requestedPaths.filter((path) => files.delete(path));
            return { data: removed.map((name) => ({ name })), error: null };
          },
        };
      },
    },
    from: (table) => {
      assert.equal(table, "screenings");
      const filters = {};
      const query = {
        delete: () => query,
        eq: (column, value) => { filters[column] = value; return query; },
        select: () => query,
        maybeSingle: async () => {
          assert.deepEqual(filters, { id: screeningId });
          events.push("delete");
          deleted = true;
          return { data: { id: screeningId }, error: null };
        },
      };
      return query;
    },
  };
  const actions = loadServerModule("src/app/actions/screenings.ts", {
    "@/lib/supabase/server": { createClient: async () => sessionClient },
    "@/lib/supabase/admin": { createAdminClient: () => { adminCalls++; return adminClient; } },
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: (path) => { redirected.push(path); } },
  });
  return {
    run: (form = adminDeleteForm()) =>
      actions.deleteScreeningAsAdmin({ error: null, success: false }, form),
    files,
    events,
    redirected,
    get deleted() { return deleted; },
    get adminCalls() { return adminCalls; },
  };
}

test("管理者削除: スタッフはService Roleへ到達しない", async () => {
  const fixture = adminDeleteFixture({ role: "clinic_staff" });
  assert.ok((await fixture.run()).error);
  assert.equal(fixture.adminCalls, 0);
  assert.equal(fixture.deleted, false);
});

test("管理者削除: 画像を削除してから撮影記録を削除する", async () => {
  const fixture = adminDeleteFixture();
  await fixture.run();
  assert.equal(fixture.files.size, 0);
  assert.equal(fixture.deleted, true);
  assert.deepEqual(fixture.events, ["remove", "delete"]);
  assert.deepEqual(fixture.redirected, ["/admin/screenings"]);
});

test("管理者削除: Storage削除失敗時は画像と撮影記録を残す", async (t) => {
  t.mock.method(console, "error", () => {});
  const fixture = adminDeleteFixture({ storageError: { message: "storage unavailable" } });
  assert.ok((await fixture.run()).error);
  assert.equal(fixture.deleted, false);
  assert.equal(fixture.files.size, 2);
  assert.deepEqual(fixture.events, ["remove"]);
  assert.deepEqual(fixture.redirected, []);
});

test("管理者削除: 解析中・完了済みでも削除できる", async () => {
  for (const status of ["analyzing", "completed"]) {
    const fixture = adminDeleteFixture({
      screening: {
        id: screeningId,
        created_by: creatorId,
        subject_id: null,
        status,
        right_image_url: adminDeletePaths[0],
        left_image_url: adminDeletePaths[1],
      },
    });
    await fixture.run();
    assert.equal(fixture.deleted, true, status);
    assert.deepEqual(fixture.events, ["remove", "delete"]);
  }
});

test("管理者削除: 参照不可・不正パス・不正IDを拒否する", async () => {
  for (const options of [
    { screening: null },
    {
      screening: {
        id: screeningId,
        created_by: creatorId,
        subject_id: null,
        right_image_url: `other-user/${screeningId}/right_1.jpg`,
        left_image_url: adminDeletePaths[1],
      },
    },
  ]) {
    const fixture = adminDeleteFixture(options);
    assert.ok((await fixture.run()).error);
    assert.equal(fixture.adminCalls, 0);
    assert.equal(fixture.deleted, false);
  }

  const fixture = adminDeleteFixture();
  assert.ok((await fixture.run(adminDeleteForm("not-a-uuid"))).error);
  assert.equal(fixture.adminCalls, 0);
});

test("管理者削除: 作成者が空でも正規の画像パスなら削除できる", async () => {
  const fixture = adminDeleteFixture({
    screening: {
      id: screeningId,
      created_by: null,
      subject_id: null,
      right_image_url: adminDeletePaths[0],
      left_image_url: adminDeletePaths[1],
    },
  });
  await fixture.run();
  assert.equal(fixture.deleted, true);
  assert.deepEqual(fixture.events, ["remove", "delete"]);
});

test("管理者名更新: 対象ロールを限定し、表示名だけを更新する", async () => {
  const filters = {};
  const invalidated = [];
  let updates = 0;
  const query = {
    update: (values) => { updates++; assert.deepEqual(values, { full_name: "変更後" }); return query; },
    eq: (key, value) => { filters[key] = value; return query; },
    is: () => query,
    select: () => query,
    maybeSingle: async () => ({ data: { id: userId }, error: null }),
  };
  const actions = loadServerModule("src/app/actions/admin.ts", {
    "@/lib/supabase/admin": { createAdminClient: () => assert.fail("Service Roleは使用しない") },
    "@/lib/auth": { getCurrentUser: async () => ({ userId, profile: { role: "admin", is_active: true } }) },
    "@/lib/supabase/server": { createClient: async () => ({ from: () => query }) },
    "next/cache": { revalidatePath: (...args) => invalidated.push(args) },
    "next/navigation": { redirect: () => assert.fail("この操作はリダイレクトしない") },
  });
  const form = new FormData();
  form.set("admin_id", userId);
  for (const name of ["", " ", "あ".repeat(101)]) {
    form.set("full_name", name);
    assert.ok((await actions.updateAdminName({}, form)).error);
  }
  assert.equal(updates, 0);
  form.set("full_name", " 変更後 ");
  form.set("role", "clinic_staff");
  assert.equal((await actions.updateAdminName({}, form)).success, true);
  assert.deepEqual(filters, { id: userId, role: "admin" });
  assert.deepEqual(invalidated, [["/admin", "layout"]]);
});

const otherAdminId = "22222222-2222-4222-8222-222222222222";
const otherStaffId = "33333333-3333-4333-8333-333333333333";

function loadAdminActionsWithTarget({ found = true } = {}) {
  const filters = {};
  const calls = { updateUserById: 0 };
  const query = {
    select: () => query,
    eq: (key, value) => { filters[key] = value; return query; },
    is: () => query,
    maybeSingle: async () => ({
      data: found ? { id: filters.id } : null,
      error: null,
    }),
  };
  const adminClient = {
    auth: {
      admin: {
        updateUserById: async (id, attributes) => {
          calls.updateUserById++;
          calls.lastId = id;
          calls.lastAttributes = attributes;
          return { data: { user: { id } }, error: null };
        },
      },
    },
  };
  const actions = loadServerModule("src/app/actions/admin.ts", {
    "@/lib/supabase/admin": { createAdminClient: () => adminClient },
    "@/lib/auth": {
      getCurrentUser: async () => ({
        userId,
        profile: { role: "admin", is_active: true },
      }),
    },
    "@/lib/supabase/server": { createClient: async () => ({ from: () => query }) },
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: () => assert.fail("この操作はリダイレクトしない") },
  });
  return { actions, filters, calls };
}

test("管理者メール変更: 自分自身も対象にでき、対象ロールを限定してService Roleを使う", async () => {
  const { actions, filters, calls } = loadAdminActionsWithTarget();

  const selfForm = new FormData();
  selfForm.set("admin_id", userId);
  selfForm.set("email", "new-self@example.com");
  const selfResult = await actions.updateAdminEmail({}, selfForm);
  assert.equal(selfResult.success, true);
  assert.equal(calls.updateUserById, 1);
  assert.equal(calls.lastId, userId);
  assert.deepEqual(calls.lastAttributes, {
    email: "new-self@example.com",
    email_confirm: true,
  });
  assert.deepEqual(filters, { id: userId, role: "admin" });

  const form = new FormData();
  form.set("admin_id", otherAdminId);
  form.set("email", "new-admin@example.com");
  const result = await actions.updateAdminEmail({}, form);
  assert.equal(result.success, true);
  assert.equal(calls.updateUserById, 2);
  assert.equal(calls.lastId, otherAdminId);
  assert.deepEqual(calls.lastAttributes, {
    email: "new-admin@example.com",
    email_confirm: true,
  });
  assert.deepEqual(filters, { id: otherAdminId, role: "admin" });
});

test("管理者パスワード再設定: 自分自身も対象にでき、対象ロールを限定してService Roleを使う", async () => {
  const { actions, filters, calls } = loadAdminActionsWithTarget();

  const selfForm = new FormData();
  selfForm.set("admin_id", userId);
  selfForm.set("password", "new-password-123");
  const selfResult = await actions.resetAdminPassword({}, selfForm);
  assert.equal(selfResult.success, true);
  assert.equal(calls.updateUserById, 1);
  assert.equal(calls.lastId, userId);
  assert.deepEqual(calls.lastAttributes, { password: "new-password-123" });
  assert.deepEqual(filters, { id: userId, role: "admin" });

  const form = new FormData();
  form.set("admin_id", otherAdminId);
  form.set("password", "new-password-123");
  const result = await actions.resetAdminPassword({}, form);
  assert.equal(result.success, true);
  assert.equal(calls.updateUserById, 2);
  assert.equal(calls.lastId, otherAdminId);
  assert.deepEqual(calls.lastAttributes, { password: "new-password-123" });
  assert.deepEqual(filters, { id: otherAdminId, role: "admin" });
});

test("管理者メール変更・パスワード再設定: 対象が見つからない場合はService Roleを使わない", async () => {
  const emailCase = loadAdminActionsWithTarget({ found: false });
  const emailForm = new FormData();
  emailForm.set("admin_id", otherAdminId);
  emailForm.set("email", "new-admin@example.com");
  assert.ok((await emailCase.actions.updateAdminEmail({}, emailForm)).error);
  assert.equal(emailCase.calls.updateUserById, 0);

  const passwordCase = loadAdminActionsWithTarget({ found: false });
  const passwordForm = new FormData();
  passwordForm.set("admin_id", otherAdminId);
  passwordForm.set("password", "new-password-123");
  assert.ok((await passwordCase.actions.resetAdminPassword({}, passwordForm)).error);
  assert.equal(passwordCase.calls.updateUserById, 0);
});

test("スタッフメール変更: 対象ロールを限定してService Roleを使う", async () => {
  const { actions, filters, calls } = loadAdminActionsWithTarget();

  const form = new FormData();
  form.set("staff_id", otherStaffId);
  form.set("email", "new-staff@example.com");
  const result = await actions.updateStaffEmail({}, form);
  assert.equal(result.success, true);
  assert.equal(calls.updateUserById, 1);
  assert.deepEqual(calls.lastAttributes, {
    email: "new-staff@example.com",
    email_confirm: true,
  });
  assert.deepEqual(filters, { id: otherStaffId, role: "clinic_staff" });
});

test("スタッフパスワード再設定: 対象ロールを限定してService Roleを使う", async () => {
  const { actions, filters, calls } = loadAdminActionsWithTarget();

  const form = new FormData();
  form.set("staff_id", otherStaffId);
  form.set("password", "new-password-123");
  const result = await actions.resetStaffPassword({}, form);
  assert.equal(result.success, true);
  assert.equal(calls.updateUserById, 1);
  assert.deepEqual(calls.lastAttributes, { password: "new-password-123" });
  assert.deepEqual(filters, { id: otherStaffId, role: "clinic_staff" });
});

test("メールアドレス変更: 不正な形式は入力検証で拒否し、Service Roleへ到達しない", async () => {
  const { actions, calls } = loadAdminActionsWithTarget();
  for (const email of ["", "not-an-email", " "]) {
    const form = new FormData();
    form.set("admin_id", otherAdminId);
    form.set("email", email);
    assert.ok((await actions.updateAdminEmail({}, form)).error);
  }
  assert.equal(calls.updateUserById, 0);
});
