import assert from "node:assert/strict";
import { loadServerModule } from "./load-server-module.mjs";

export async function testAnalysisHistory(t, { adminApi, admin, staffA, staffB, anonymous,
  adminId, staffAId, staffBId, clinicAId, createdScreeningIds }) {
  await t.test("解析履歴: 条件固定・追記・競合・認可・CSV・完全削除", async () => {
    const settings = await adminApi.from("screening_threshold_settings").select("*").single();
    assert.ifError(settings.error);
    const setThresholds = async (node, wrist) => {
      assert.ifError((await adminApi.from("screening_threshold_settings")
        .update({ thr_node: node, thr_wrist: wrist }).eq("id", true)).error);
    };
    const createScreening = async (owner = staffAId) => {
      const id = crypto.randomUUID();
      assert.ifError((await adminApi.from("screenings").insert({ id, created_by: owner, status: "analyzing",
        right_image_url: `${owner}/${id}/right_1.jpg`, left_image_url: `${owner}/${id}/left_1.jpg` })).error);
      createdScreeningIds.push(id);
      return id;
    };
    const readScreening = async (id) => {
      const result = await adminApi.from("screenings").select("*").eq("id", id).single();
      assert.ifError(result.error); return result.data;
    };
    const readRuns = async (id, client = adminApi) => {
      const result = await client.from("screening_analysis_runs").select("*").eq("screening_id", id).order("run_number");
      assert.ifError(result.error); return result.data;
    };
    const beginArgs = (id, expected = null, kind = "initial", actor = staffAId) => ({
      p_screening_id: id, p_run_id: crypto.randomUUID(), p_actor_id: actor,
      p_expected_run_id: expected, p_kind: kind, p_source: "api",
    });
    const begin = async (args) => {
      const result = await adminApi.rpc("begin_screening_analysis_run", args);
      assert.ifError(result.error); return result.data;
    };
    const hands = (node, wrist) => ["left", "right"].map((side) => ({
      side, ra_detected: true, hand_probability: 0.5,
      num_positive_joints: Number(0.5 >= node) + Number(0.5 >= wrist), num_joints_detected: 2,
      joints: [
        { joint_id: 1, joint_name: "MCP1", probability: 0.5, positive: 0.5 >= node },
        { joint_id: 15, joint_name: "Wrist", probability: 0.5, positive: 0.5 >= wrist },
      ], warnings: [],
    }));
    const completeArgs = (run, model = "history-test") => {
      const resultHands = hands(run.analysis_thr_node, run.analysis_thr_wrist);
      return { p_screening_id: run.screening_id, p_run_id: run.id, p_ra_detected: true,
        p_total_positive_joints: resultHands.reduce((sum, h) => sum + h.num_positive_joints, 0),
        p_hands: resultHands, p_ai_model_version: model, p_raw_response: { original: true, model_version: model } };
    };
    const complete = async (run, model) => {
      const result = await adminApi.rpc("complete_screening_analysis_run", completeArgs(run, model));
      assert.ifError(result.error); assert.equal(result.data, true);
    };
    try {
      await setThresholds(0.5, 0.6);
      const id = await createScreening();
      const args = beginArgs(id);
      for (const client of [staffA, admin, anonymous]) {
        assert.ok((await client.rpc("begin_screening_analysis_run", args)).error);
      }
      assert.ok((await adminApi.rpc("begin_screening_analysis_run", { ...args, p_actor_id: staffBId })).error);
      const simultaneous = await Promise.all([begin(args), begin(args), begin(beginArgs(id))]);
      assert.equal(simultaneous.reduce((sum, rows) => sum + rows.length, 0), 1);
      const first = simultaneous.flat()[0];
      assert.equal(first.run_number, 1);
      assert.equal(first.executed_by, staffAId);
      assert.equal(first.analysis_thr_node, 0.5);
      assert.equal(first.right_image_url, `${staffAId}/${id}/right_1.jpg`);
      await setThresholds(0.8, 0.2);
      assert.equal((await readRuns(id))[0].analysis_thr_wrist, 0.6);

      const completion = completeArgs(first);
      for (const client of [staffA, admin, anonymous]) {
        assert.ok((await client.rpc("complete_screening_analysis_run", completion)).error);
      }
      for (const change of [
        { p_total_positive_joints: 99 },
        { p_hands: hands(0.8, 0.2) },
        { p_hands: completion.p_hands.slice().reverse() },
        { p_hands: completion.p_hands.map((h) => ({ ...h, joints: [] })) },
        { p_raw_response: [] },
      ]) {
        assert.ok((await adminApi.rpc("complete_screening_analysis_run", { ...completion, ...change })).error);
        assert.equal((await readScreening(id)).status, "analyzing");
        assert.equal((await readRuns(id))[0].status, "analyzing");
      }
      await complete(first);
      const original = (await readRuns(id))[0];
      assert.equal(original.joint_results.length, 4);
      assert.equal(original.ai_model_version, "history-test");
      assert.equal(original.status, "completed");
      assert.equal((await readScreening(id)).analysis_thr_node, 0.5);
      assert.equal((await readRuns(id, admin)).length, 1);
      for (const client of [staffA, staffB]) assert.equal((await readRuns(id, client)).length, 0);
      const anonRead = await anonymous.from("screening_analysis_runs").select("*");
      assert.ok(anonRead.error || anonRead.data.length === 0);
      for (const client of [staffA, admin]) {
        assert.ok((await client.from("screening_analysis_runs").insert({ ...original, id: crypto.randomUUID(), run_number: 99 })).error);
        assert.ok((await client.from("screening_analysis_runs").update({ ai_model_version: "changed" }).eq("id", first.id)).error);
        assert.ok((await client.from("screening_analysis_runs").delete().eq("id", first.id)).error);
      }
      assert.ok((await adminApi.from("screening_analysis_runs").update({ ai_model_version: "changed" }).eq("id", first.id)).error);
      assert.ok((await adminApi.from("screening_analysis_runs").delete().eq("id", first.id)).error);
      assert.ok((await adminApi.rpc("begin_screening_analysis_run", beginArgs(id, first.id, "retry"))).error);
      const [second] = await begin(beginArgs(id, first.id, "retry", adminId));
      assert.equal(second.run_number, 2);
      assert.equal(second.analysis_thr_node, 0.8);
      assert.equal((await readScreening(id)).total_inflamed_joints, null);
      assert.ok((await adminApi.from("screening_analysis_runs").update({ analysis_thr_node: 0.1 }).eq("id", second.id)).error);
      // 前回成功の遅延応答、失敗通知、古い画面からの再解析を拒否する。
      assert.equal((await adminApi.rpc("complete_screening_analysis_run", completion)).data, false);
      assert.equal((await adminApi.rpc("fail_screening_analysis_run", {
        p_screening_id: id, p_run_id: first.id, p_error_code: "api_timeout", p_http_status: null,
      })).data, false);
      assert.deepEqual(await begin(beginArgs(id, first.id, "retry", adminId)), []);
      await complete(second, "");
      assert.equal((await readRuns(id))[1].ai_model_version, null);
      assert.deepEqual((await readRuns(id))[0], original);
      const [third] = await begin(beginArgs(id, second.id, "retry", adminId));
      assert.equal(third.analysis_thr_node, second.analysis_thr_node, "同じ閾値でも別履歴");
      const failArgs = { p_screening_id: id, p_run_id: third.id, p_error_code: "api_http_error", p_http_status: 503 };
      for (const client of [staffA, admin]) assert.ok((await client.rpc("fail_screening_analysis_run", failArgs)).error);
      assert.equal((await adminApi.rpc("fail_screening_analysis_run", failArgs)).data, true);
      assert.equal((await readScreening(id)).status, "failed");
      assert.equal((await readRuns(id))[2].analysis_error_http_status, 503);
      const [fourth] = await begin(beginArgs(id, third.id, "retry", adminId));
      const updated = (await readScreening(id)).status_updated_at;
      const recovery = { p_screening_id: id, p_actor_id: adminId, p_expected_updated_at: updated };
      assert.equal((await adminApi.rpc("recover_interrupted_screening", recovery)).data, false);
      const staleAt = new Date(Date.now() - 11 * 60_000).toISOString();
      assert.ifError((await adminApi.from("screenings").update({ status_updated_at: staleAt }).eq("id", id)).error);
      assert.equal((await adminApi.rpc("recover_interrupted_screening", recovery)).data, false);
      recovery.p_expected_updated_at = staleAt;
      assert.ok((await staffA.rpc("recover_interrupted_screening", recovery)).error);
      assert.ok((await adminApi.rpc("recover_interrupted_screening", { ...recovery, p_actor_id: staffAId })).error);
      assert.equal((await adminApi.rpc("recover_interrupted_screening", recovery)).data, true);
      assert.equal((await readRuns(id))[3].analysis_error_code, "analysis_interrupted");
      const [fifth] = await begin(beginArgs(id, fourth.id, "retry", adminId));
      assert.equal((await adminApi.rpc("complete_screening_analysis_run", completeArgs(fourth))).data, false);
      assert.equal((await readScreening(id)).current_analysis_run_id, fifth.id);
      await complete(fifth);

      // 旧RPCはService Roleでも直接利用できない。
      const legacyArgs = { ...completion }; delete legacyArgs.p_run_id;
      assert.ok((await adminApi.rpc("complete_ra_screening_analysis_with_metadata", legacyArgs)).error);
      for (const client of [anonymous, admin, staffA]) {
        const denied = await client.rpc("complete_ra_screening_analysis_with_metadata", legacyArgs);
        assert.match(denied.error?.message ?? "", /permission denied for function/);
      }
      assert.ok((await adminApi.rpc("complete_screening_analysis_with_thresholds", {
        ...legacyArgs, p_thr_node: 0.5, p_thr_wrist: 0.6,
      })).error);
      assert.ok((await adminApi.rpc("begin_screening_reanalysis", { p_screening_id: id, p_changed_by: adminId })).error);

      const actions = loadServerModule("src/app/actions/analysis-history.ts", {
        "@/lib/supabase/server": { createClient: async () => admin },
      });
      const { normalizeAdminScreeningFilters } = loadServerModule("src/lib/admin-screening-filters.ts", {});
      const cutoff = new Date(Date.now() + 1000).toISOString();
      const filters = normalizeAdminScreeningFilters({ clinic: clinicAId, id: id.slice(0, 8), status: "completed" });
      const exported = await actions.getAnalysisHistoryExportPage(filters, 1, cutoff);
      assert.equal(exported.total, 5);
      assert.equal(exported.runs.length, 5);
      assert.deepEqual(exported.runs.map((r) => r.run_number), [1, 2, 3, 4, 5]);
      assert.equal(exported.runs[2].status, "failed", "撮影の最新状態で絞り込んでも過去の失敗を含める");
      assert.equal((await actions.getAnalysisHistory(id)).total, 5);
      const noMatch = normalizeAdminScreeningFilters({ id, status: "failed" });
      assert.equal((await actions.getAnalysisHistoryExportPage(noMatch, 1, cutoff)).total, 0);

      // Data APIの既定上限1,000件を超えてもページ取得で全履歴を辿れる。
      const pagedId = await createScreening();
      const manyRuns = Array.from({ length: 1001 }, (_, index) => ({
        id: crypto.randomUUID(), screening_id: pagedId, run_number: index + 1,
        kind: "legacy", status: "completed",
      }));
      assert.ifError((await adminApi.from("screening_analysis_runs").insert(manyRuns)).error);
      const pagedFilters = normalizeAdminScreeningFilters({ id: pagedId });
      const pageCutoff = new Date(Date.now() + 1000).toISOString();
      const pages = await Promise.all([1, 2, 3].map((page) => actions.getAnalysisHistoryExportPage(pagedFilters, page, pageCutoff)));
      assert.deepEqual(pages.map((p) => p.runs.length), [500, 500, 1]);
      assert.ok(pages.every((p) => p.total === 1001));
      assert.equal(new Set(pages.flatMap((p) => p.runs.map((r) => r.id))).size, 1001);
      const detailPage = await actions.getAnalysisHistory(pagedId, 2);
      assert.equal(detailPage.runs.length, 20);
      assert.equal(detailPage.runs[0].run_number, 981);

      assert.ifError((await adminApi.from("profiles").update({ is_active: false }).eq("id", adminId)).error);
      assert.equal((await readRuns(id, admin)).length, 0);
      assert.ok((await adminApi.rpc("begin_screening_analysis_run", beginArgs(id, fifth.id, "retry", adminId))).error);
      await assert.rejects(actions.getAnalysisHistory(id));
      assert.ifError((await adminApi.from("profiles").update({ is_active: true }).eq("id", adminId)).error);

      const missingSettingsId = await createScreening();
      assert.ifError((await adminApi.from("screening_threshold_settings").delete().eq("id", true)).error);
      const [missing] = await begin(beginArgs(missingSettingsId));
      assert.equal(missing.analysis_thr_node, null);
      assert.equal((await adminApi.rpc("fail_screening_analysis_run", {
        p_screening_id: missingSettingsId, p_run_id: missing.id,
        p_error_code: "threshold_configuration_error", p_http_status: null,
      })).data, true);
      assert.ifError((await adminApi.from("screenings").delete().eq("id", id)).error);
      assert.deepEqual(await readRuns(id), [], "撮影の完全削除で全履歴も削除される");
    } finally {
      assert.ifError((await adminApi.from("profiles").update({ is_active: true }).eq("id", adminId)).error);
      assert.ifError((await adminApi.from("screening_threshold_settings").upsert(settings.data)).error);
    }
  });
}
