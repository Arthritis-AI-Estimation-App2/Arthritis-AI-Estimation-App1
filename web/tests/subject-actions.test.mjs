import assert from "node:assert/strict";
import test from "node:test";
import { loadServerModule } from "./helpers/load-server-module.mjs";

const adminId = "11111111-1111-4111-8111-111111111111";
const screeningId = "22222222-2222-4222-8222-222222222222";
const clinicId = "33333333-3333-4333-8333-333333333333";

function loadCreateSubjectFixture() {
  const inserts = [];
  const client = {
    from: (table) => {
      const query = {
        select: () => query,
        eq: () => query,
        insert: (values) => {
          inserts.push({ table, values });
          return query;
        },
        maybeSingle: async () => {
          if (table === "screenings") {
            return {
              data: { subject_id: null, created_by: "44444444-4444-4444-8444-444444444444" },
              error: null,
            };
          }
          if (table === "profiles") {
            return { data: { clinic_id: clinicId }, error: null };
          }
          throw new Error(`unexpected maybeSingle: ${table}`);
        },
        single: async () => ({ data: { id: "keio47" }, error: null }),
      };
      return query;
    },
  };

  const actions = loadServerModule("src/app/actions/subjects.ts", {
    "@/lib/auth": {
      getCurrentUser: async () => ({
        userId: adminId,
        profile: { role: "admin", clinic_id: null },
      }),
    },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/supabase/admin": {
      createAdminClient: () => assert.fail("Service Roleは被験者ID発行に不要"),
    },
    "next/cache": { revalidatePath: () => {} },
  });

  return { actions, inserts };
}

test("管理者はスクリーニングの医療機関に被験者IDを発行できる", async () => {
  const { actions, inserts } = loadCreateSubjectFixture();

  assert.deepEqual(await actions.createSubject(screeningId), {
    subjectId: "keio47",
    error: null,
  });
  assert.deepEqual(inserts, [
    { table: "subjects", values: { clinic_id: clinicId } },
  ]);
});

test("医療機関に所属しない管理者は対象記録なしでは被験者IDを発行できない", async () => {
  const { actions, inserts } = loadCreateSubjectFixture();

  assert.deepEqual(await actions.createSubject(), {
    subjectId: null,
    error: "医療機関所属のスタッフのみ実行可能です",
  });
  assert.deepEqual(inserts, []);
});

test("不正なスクリーニングIDでは被験者IDを発行しない", async () => {
  const { actions, inserts } = loadCreateSubjectFixture();

  assert.deepEqual(await actions.createSubject("not-a-uuid"), {
    subjectId: null,
    error: "撮影記録の指定が不正です",
  });
  assert.deepEqual(inserts, []);
});
