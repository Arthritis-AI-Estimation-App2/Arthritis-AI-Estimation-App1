import assert from "node:assert/strict";
import test from "node:test";
import { loadServerModule } from "./helpers/load-server-module.mjs";

const screening = {
  id: "screening-1",
  status: "completed",
  right_image_url: "user/screening-1/right_1.jpg",
  left_image_url: "user/screening-1/left_1.jpg",
  ai_model_version: "model-1",
  analyzed_at: "2026-09-22T00:00:00Z",
  analysis_error_code: null,
  analysis_error_http_status: null,
  analysis_error_at: null,
  analysis_thr_node: 0.34,
  analysis_thr_wrist: 0.43,
};

function loadDetailAction(role) {
  const results = {
    screenings: { data: { ...screening }, error: null },
    joint_results: { data: [], error: null },
    screening_analysis_debug_responses: {
      data: { raw_response: { model_version: "model-1" } },
      error: null,
    },
  };
  const client = {
    from(table) {
      const result = results[table];
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => result,
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
      };
      return query;
    },
  };

  return loadServerModule("src/app/actions/screenings.ts", {
    "@/lib/auth": {
      getCurrentUser: async () => ({
        userId: "user-1",
        profile: { role, is_active: true, clinic_id: "clinic-1" },
      }),
    },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/supabase/admin": { createAdminClient: () => ({}) },
    "@/lib/supabase/error": {
      throwSupabaseError: (_error, operation) => {
        throw new Error(operation);
      },
    },
    "@/lib/supabase/signed-hand-images": {
      tryCreateSignedHandImageUrls: async () => ({
        right: "signed-right",
        left: "signed-left",
      }),
    },
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: () => {} },
  }).getScreeningDetail;
}

test("判定閾値は管理者の詳細取得にだけ含める", async () => {
  const adminDetail = await loadDetailAction("admin")("screening-1");
  assert.equal(adminDetail.canViewThresholds, true);
  assert.equal(adminDetail.screening.analysis_thr_node, 0.34);
  assert.equal(adminDetail.screening.analysis_thr_wrist, 0.43);

  const staffDetail = await loadDetailAction("clinic_staff")("screening-1");
  assert.equal(staffDetail.canViewThresholds, false);
  assert.equal(staffDetail.screening.analysis_thr_node, null);
  assert.equal(staffDetail.screening.analysis_thr_wrist, null);
});
