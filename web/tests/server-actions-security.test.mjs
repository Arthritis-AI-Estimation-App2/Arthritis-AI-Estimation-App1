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
    ["analyze", "analyzeScreening", [screeningId]],
    ["analyze", "retryAnalysis", [screeningId]],
    ["analyze", "markInterruptedScreeningFailed", [screeningId]],
    ["subjects", "createSubject", []],
    ["subjects", "assignScreeningsToSubject", ["keio1", [screeningId]]],
    ["subjects", "correctScreeningSubject", [screeningId, "keio1"]],
    ...["createClinic", "updateClinic", "updateStaff", "updateAdminName", "resetStaffPassword", "createStaff", "createAdmin", "deleteStaff", "deleteAdmin"]
      .map((name) => ["admin", name, [{ error: null, success: false }, new FormData()]]),
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
