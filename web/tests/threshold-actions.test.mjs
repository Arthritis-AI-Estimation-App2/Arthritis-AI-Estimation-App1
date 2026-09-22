import assert from "node:assert/strict";
import test from "node:test";
import { loadServerModule } from "./helpers/load-server-module.mjs";

function settingsAction(current, persisted = { id: true }) {
  const writes = [];
  const action = loadServerModule("src/app/actions/settings.ts", {
    "@/lib/auth": { getCurrentUser: async () => current },
    "@/lib/supabase/server": { createClient: async () => ({ from: () => ({
      update: (values) => {
        writes.push(values);
        return { eq: () => ({ select: () => ({ single: async () => ({ data: persisted, error: null }) }) }) };
      },
    }) }) },
    "next/cache": { revalidatePath: () => {} },
  }).updateScreeningThresholds;
  return { action, writes };
}
function form(node = "0.34396984924623114", wrist = "0.4344221105527638") {
  const data = new FormData();
  data.set("thr_node", node); data.set("thr_wrist", wrist);
  return data;
}
const admin = { userId: "admin", profile: { role: "admin", is_active: true } };
test("設定Actionは管理者のみ更新し、無効値と更新対象欠損を拒否する", async () => {
  for (const user of [null, { profile: { role: "clinic_staff", is_active: true } }, { profile: { role: "admin", is_active: false } }]) {
    const { action, writes } = settingsAction(user);
    assert.ok((await action({}, form())).error);
    assert.equal(writes.length, 0);
  }
  const { action, writes } = settingsAction(admin);
  for (const invalid of ["", " ", "Infinity", "-1", "1.1", "abc"]) {
    assert.ok((await action({}, form(invalid))).error);
  }
  assert.equal(writes.length, 0);
  assert.equal((await action({}, form())).success, true);
  assert.deepEqual(writes, [{ thr_node: 0.34396984924623114, thr_wrist: 0.4344221105527638 }]);
  assert.ok((await settingsAction(admin, null).action({}, form())).error);
});

function analysisFixture({ failSettings = false, missingDetails = false, apiError = false,
  saveError = false, staleCompletion = false, user = admin, visible = true } = {}) {
  const fixture = { settings: { thr_node: 0.4, thr_wrist: 0.6 }, saved: [], failures: [], runs: [], apiCalls: 0, serviceCalls: 0 };
  const screening = { id: crypto.randomUUID(), status: "analyzing", current_analysis_run_id: null,
    right_image_url: "right", left_image_url: "left" };
  const source = {
    model_version: "model-1", ra_detected: true, total_positive_joints: 4,
    hands: ["left", "right"].map((side) => ({
      side, ra_detected: true, hand_probability: 0.5, num_positive_joints: 2, num_joints_detected: 2, warnings: [],
      joints: missingDetails ? [] : [
        { joint_id: 1, joint_name: "MCP1", probability: 0.5, positive: true },
        { joint_id: 15, joint_name: "Wrist", probability: 0.5, positive: true },
      ],
    })),
  };
  const ordinary = { from: () => {
    const query = { select: () => query, eq: () => query,
      maybeSingle: async () => ({ data: visible ? screening : null, error: null }) };
    return query;
  } };
  const service = { rpc: async (name, args) => {
    if (name === "begin_screening_analysis_run") {
      if (args.p_expected_run_id !== screening.current_analysis_run_id || fixture.runs.some((r) => r.id === args.p_run_id)) {
        return { data: [], error: null };
      }
      const run = { id: args.p_run_id, screening_id: screening.id,
        right_image_url: "right", left_image_url: "left", source: args.p_source,
        analysis_thr_node: failSettings ? null : fixture.settings.thr_node,
        analysis_thr_wrist: failSettings ? null : fixture.settings.thr_wrist };
      fixture.runs.push(run);
      screening.current_analysis_run_id = run.id;
      screening.status = "analyzing";
      return { data: [run], error: null };
    }
    if (name === "fail_screening_analysis_run") {
      fixture.failures.push(args); screening.status = "failed";
      return { data: true, error: null };
    }
    assert.equal(name, "complete_screening_analysis_run");
    if (saveError) return { error: { message: "save failed" }, data: null };
    if (staleCompletion) return { data: false, error: null };
    fixture.saved.push(structuredClone(args)); screening.status = "completed";
    return { data: true, error: null };
  } };
  const actions = loadServerModule("src/app/actions/analyze.ts", {
    "@/lib/auth": { getCurrentUser: async () => user },
    "@/lib/supabase/server": { createClient: async () => ordinary },
    "@/lib/supabase/admin": { createAdminClient: () => { fixture.serviceCalls++; return service; } },
    "@/lib/supabase/signed-hand-images": { createSignedHandImageUrls: async () => ({ right: "signed-right", left: "signed-left" }) },
    "@/lib/ai-api": { requestAiAnalysis: async () => {
      fixture.apiCalls++;
      if (apiError) throw new Error("network failed");
      fixture.settings = { thr_node: 0.8, thr_wrist: 0.2 };
      return { ...structuredClone(source), raw_response: structuredClone(source) };
    } },
    "next/cache": { revalidatePath: () => {} },
  });
  return { fixture, actions, screening, source };
}

function useTestApi(t) {
  const previous = { AI_API_URL: process.env.AI_API_URL, AI_API_KEY: process.env.AI_API_KEY };
  process.env.AI_API_URL = "https://ai.example"; process.env.AI_API_KEY = "test";
  t.mock.method(console, "error", () => {});
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
}

test("開始時の保存閾値で判定し、変更後の再解析を別の実行IDで確定する", async (t) => {
  useTestApi(t);
  const { fixture, actions, screening, source } = analysisFixture();
  assert.deepEqual(await actions.analyzeScreening(screening.id), { error: null });
  const first = structuredClone(fixture.saved[0]);
  assert.equal(fixture.runs[0].analysis_thr_node, 0.4);
  assert.equal(fixture.runs[0].analysis_thr_wrist, 0.6);
  assert.equal(fixture.runs[0].source, "api");
  assert.equal(first.p_run_id, fixture.runs[0].id);
  assert.deepEqual(first.p_hands[0].joints.map((j) => j.positive), [true, false]);
  assert.equal(first.p_total_positive_joints, 2);
  assert.deepEqual(first.p_raw_response, source);
  assert.ok((await actions.analyzeScreening(screening.id)).error);
  const expected = screening.current_analysis_run_id;
  const retryId = crypto.randomUUID();
  assert.deepEqual(await actions.retryAnalysis(screening.id, expected, retryId), { error: null });
  assert.deepEqual(fixture.saved[1].p_hands[0].joints.map((j) => j.positive), [false, true]);
  assert.equal(fixture.saved[1].p_run_id, retryId);
  assert.equal(fixture.runs[1].analysis_thr_wrist, 0.2);
  assert.deepEqual(fixture.saved[0], first);
  assert.ok((await actions.retryAnalysis(screening.id, expected, retryId)).error);
  assert.equal(fixture.apiCalls, 2);
  assert.equal(fixture.runs.length, 2);
});

test("設定欠損・API失敗・不正応答・保存失敗は同じ実行IDを失敗として記録する", async (t) => {
  useTestApi(t);
  for (const [options, code] of [
    [{ failSettings: true }, "threshold_configuration_error"],
    [{ missingDetails: true }, "api_invalid_response"],
    [{ apiError: true }, "unknown"],
    [{ saveError: true }, "result_save_failed"],
  ]) {
    const { fixture, actions, screening } = analysisFixture(options);
    assert.ok((await actions.analyzeScreening(screening.id)).error);
    assert.equal(fixture.saved.length, 0);
    assert.equal(fixture.runs.length, 1);
    assert.equal(fixture.failures[0].p_run_id, fixture.runs[0].id);
    assert.equal(fixture.failures[0].p_error_code, code);
    if (options.failSettings) assert.equal(fixture.apiCalls, 0);
  }
});

test("中断済みの確定拒否は、新しい実行を失敗にしない", async (t) => {
  useTestApi(t);
  const { fixture, actions, screening } = analysisFixture({ staleCompletion: true });
  assert.ok((await actions.analyzeScreening(screening.id)).error);
  assert.equal(fixture.failures.length, 0);
});

test("未認証・無効ユーザー・不可視記録・不正入力はService Roleへ到達しない", async () => {
  for (const options of [{ user: null }, { user: { ...admin, profile: { role: "admin", is_active: false } } }, { visible: false }]) {
    const { fixture, actions, screening } = analysisFixture(options);
    assert.ok((await actions.analyzeScreening(screening.id)).error);
    assert.ok((await actions.retryAnalysis(screening.id, null, crypto.randomUUID())).error);
    assert.equal(fixture.serviceCalls, 0);
  }
  const { fixture, actions, screening } = analysisFixture();
  assert.ok((await actions.analyzeScreening("invalid")).error);
  assert.ok((await actions.retryAnalysis(screening.id, "invalid", crypto.randomUUID())).error);
  assert.ok((await actions.retryAnalysis(screening.id, null, "invalid")).error);
  assert.equal(fixture.serviceCalls, 0);
});
