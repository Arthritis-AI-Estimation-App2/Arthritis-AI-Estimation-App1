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

function analysisFixture({ failSettings = false, missingDetails = false } = {}) {
  const fixture = { settings: { thr_node: 0.4, thr_wrist: 0.6 }, saved: [], failures: [], apiCalls: 0, reads: 0 };
  const screening = { id: "screening", status: "analyzing", right_image_url: "right", left_image_url: "left" };
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
  const ordinary = { from: (table) => {
    const query = {
      select: () => query, eq: () => query,
      maybeSingle: async () => ({ data: screening, error: null }),
      single: async () => {
        assert.equal(table, "screening_threshold_settings"); fixture.reads++;
        return { data: failSettings ? null : { ...fixture.settings }, error: null };
      },
    };
    return query;
  } };
  const service = {
    rpc: async (name, args) => {
      if (name === "begin_screening_reanalysis") return { data: [screening], error: null };
      assert.equal(name, "complete_screening_analysis_with_thresholds");
      fixture.saved.push(structuredClone(args)); return { error: null };
    },
    from: () => ({ update: (values) => {
      fixture.failures.push(values);
      const query = { eq: () => query }; return query;
    } }),
  };
  const actions = loadServerModule("src/app/actions/analyze.ts", {
    "@/lib/auth": { getCurrentUser: async () => admin },
    "@/lib/supabase/server": { createClient: async () => ordinary },
    "@/lib/supabase/admin": { createAdminClient: () => service },
    "@/lib/supabase/signed-hand-images": { createSignedHandImageUrls: async () => ({ right: "signed-right", left: "signed-left" }) },
    "@/lib/ai-api": { requestAiAnalysis: async () => {
      fixture.apiCalls++;
      fixture.settings = { thr_node: 0.8, thr_wrist: 0.2 };
      return { ...structuredClone(source), raw_response: structuredClone(source) };
    } },
    "next/cache": { revalidatePath: () => {} },
  });
  return { fixture, actions, screening, source };
}

test("解析中の設定変更を固定値から分離し、以降の解析・再解析だけに反映する", async (t) => {
  const previous = { url: process.env.AI_API_URL, key: process.env.AI_API_KEY };
  process.env.AI_API_URL = "https://ai.example"; process.env.AI_API_KEY = "test";
  t.after(() => {
    for (const [key, value] of [["AI_API_URL", previous.url], ["AI_API_KEY", previous.key]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const { fixture, actions, screening, source } = analysisFixture();
  assert.deepEqual(await actions.analyzeScreening("screening"), { error: null });
  const first = structuredClone(fixture.saved[0]);
  assert.equal(first.p_thr_node, 0.4); assert.equal(first.p_thr_wrist, 0.6);
  assert.deepEqual(first.p_hands[0].joints.map((j) => j.positive), [true, false]);
  assert.equal(first.p_total_positive_joints, 2);
  assert.deepEqual(first.p_raw_response, source);
  assert.deepEqual(await actions.analyzeScreening("screening"), { error: null });
  assert.deepEqual(fixture.saved[1].p_hands[0].joints.map((j) => j.positive), [false, true]);
  screening.status = "completed";
  assert.deepEqual(await actions.retryAnalysis("screening"), { error: null });
  assert.equal(fixture.saved[2].p_thr_wrist, 0.2);
  assert.deepEqual(fixture.saved[0], first);
  assert.equal(fixture.reads, 3);
  for (const options of [{ failSettings: true }, { missingDetails: true }]) {
    const failed = analysisFixture(options);
    assert.ok((await failed.actions.analyzeScreening("screening")).error);
    assert.equal(failed.fixture.saved.length, 0);
    assert.equal(failed.fixture.failures[0].status, "failed");
    assert.equal(failed.fixture.failures[0].analysis_error_code,
      options.failSettings ? "threshold_configuration_error" : "api_invalid_response");
    if (options.failSettings) assert.equal(failed.fixture.apiCalls, 0);
  }
});
