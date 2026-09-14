import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { resolveRlsTestTarget } from "./load-supabase-env.mjs";
import { loadServerModule } from "./helpers/load-server-module.mjs";

const enabled = process.env.RUN_SUPABASE_RLS_TESTS === "true";
const target = enabled ? resolveRlsTestTarget() : null;

if (!enabled) {
  test(
    "RLS integration test is configured",
    { skip: "npm run test:rls で実行します" },
    () => {}
  );
} else if (target.error) {
  test("RLS integration test is configured", () => {
    assert.fail(target.error);
  });
} else {
  const { url, publishableKey, secretKey } = target;
  const runId = `rls-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const password = `RlsTest-${crypto.randomUUID()}!`;

  const adminApi = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const createdUserIds = [];
  const createdClinicIds = [];
  const createdScreeningIds = [];
  const createdStoragePaths = [];

  async function createUser(email) {
    const { data, error } = await adminApi.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assert.ifError(error);
    assert.ok(data.user, "テストユーザーを作成できること");
    createdUserIds.push(data.user.id);
    return data.user.id;
  }

  async function signIn(email) {
    const client = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await client.auth.signInWithPassword({ email, password });
    assert.ifError(error);
    return client;
  }

  async function cleanup() {
    if (createdStoragePaths.length > 0) {
      const { error } = await adminApi.storage
        .from("hand-images")
        .remove(createdStoragePaths);
      assert.ifError(error);
    }

    if (createdScreeningIds.length > 0) {
      const { error } = await adminApi
        .from("screenings")
        .delete()
        .in("id", createdScreeningIds);
      assert.ifError(error);
    }

    for (const userId of createdUserIds) {
      const { error } = await adminApi.auth.admin.deleteUser(userId);
      assert.ifError(error);
    }

    if (createdClinicIds.length > 0) {
      const { error } = await adminApi
        .from("clinics")
        .delete()
        .in("id", createdClinicIds);
      assert.ifError(error);
    }
  }

  test("RLS: 施設間隔離・Storage・無効アカウントを拒否する", async (t) => {
    let staffA;
    let staffPeer;
    let staffB;
    let admin;
    let staffAId;
    let staffPeerId;
    let clinicAId;

    try {
      const clinicA = await adminApi
        .from("clinics")
        .insert({ name: `${runId}-clinic-a` })
        .select("id")
        .single();
      assert.ifError(clinicA.error);
      clinicAId = clinicA.data.id;
      createdClinicIds.push(clinicAId);

      const clinicB = await adminApi
        .from("clinics")
        .insert({ name: `${runId}-clinic-b` })
        .select("id")
        .single();
      assert.ifError(clinicB.error);
      createdClinicIds.push(clinicB.data.id);

      const staffAEmail = `${runId}-staff-a@example.test`;
      const staffBEmail = `${runId}-staff-b@example.test`;
      const adminEmail = `${runId}-admin@example.test`;
      staffAId = await createUser(staffAEmail);
      staffPeerId = await createUser(`${runId}-staff-peer@example.test`);
      const staffBId = await createUser(staffBEmail);
      const adminId = await createUser(adminEmail);

      const { error: profilesError } = await adminApi.from("profiles").insert([
        {
          id: staffAId,
          role: "clinic_staff",
          full_name: `${runId}-staff-a`,
          clinic_id: clinicAId,
          is_active: true,
        },
        {
          id: staffPeerId,
          role: "clinic_staff",
          full_name: `${runId}-staff-peer`,
          clinic_id: clinicAId,
          is_active: true,
        },
        {
          id: staffBId,
          role: "clinic_staff",
          full_name: `${runId}-staff-b`,
          clinic_id: clinicB.data.id,
          is_active: true,
        },
        {
          id: adminId,
          role: "admin",
          full_name: `${runId}-admin`,
          clinic_id: null,
          is_active: true,
        },
      ]);
      assert.ifError(profilesError);

      staffA = await signIn(staffAEmail);
      staffPeer = await signIn(`${runId}-staff-peer@example.test`);
      staffB = await signIn(staffBEmail);
      admin = await signIn(adminEmail);

      await t.test("未認証ユーザーはDBとStorageのデータにアクセスできない", async () => {
        const unauthenticated = createClient(url, publishableKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const clinicRead = await unauthenticated.from("clinics").select("id");
        assert.equal(
          clinicRead.data?.length ?? 0,
          0,
          "未認証ユーザーには医療機関を返さないこと"
        );

        const subjectInsert = await unauthenticated
          .from("subjects")
          .insert({ clinic_id: clinicAId });
        assert.ok(subjectInsert.error, "未認証ユーザーのSubject作成は拒否されること");

        const storageRead = await unauthenticated.storage
          .from("hand-images")
          .createSignedUrl(`${staffAId}/unknown/right_1.jpg`, 60);
        assert.equal(storageRead.data?.signedUrl, undefined);
        assert.ok(storageRead.error, "未認証ユーザーの署名付きURL発行は失敗すること");
      });

      await t.test("スタッフは自院の医療機関名をData APIで直接更新できない", async () => {
        const staffUpdate = await staffA
          .from("clinics")
          .update({ name: `${runId}-staff-overwrite` })
          .eq("id", clinicAId)
          .select("id")
          .maybeSingle();
        assert.ifError(staffUpdate.error);
        assert.equal(staffUpdate.data, null, "スタッフによる医療機関名更新は拒否されること");

        const adminUpdate = await admin
          .from("clinics")
          .update({ name: `${runId}-admin-update` })
          .eq("id", clinicAId)
          .select("id")
          .single();
        assert.ifError(adminUpdate.error);
        assert.equal(adminUpdate.data?.id, clinicAId);
      });

      await t.test("スタッフはプロフィールを直接変更して権限を昇格できない", async () => {
        const roleEscalation = await staffA
          .from("profiles")
          .update({ role: "admin", clinic_id: clinicB.data.id, is_active: false })
          .eq("id", staffAId)
          .select("role, clinic_id, is_active")
          .maybeSingle();
        assert.equal(
          roleEscalation.data,
          null,
          "スタッフ自身のプロフィール変更は反映されないこと"
        );

        const currentProfile = await adminApi
          .from("profiles")
          .select("role, clinic_id, is_active")
          .eq("id", staffAId)
          .single();
        assert.ifError(currentProfile.error);
        assert.deepEqual(currentProfile.data, {
          role: "clinic_staff",
          clinic_id: clinicAId,
          is_active: true,
        });
      });

      await t.test("スタッフは他院のSubjectを作成できない", async () => {
        const crossClinicSubject = await staffA
          .from("subjects")
          .insert({ clinic_id: clinicB.data.id })
          .select("id")
          .maybeSingle();
        assert.equal(
          crossClinicSubject.data,
          null,
          "他院のSubject作成は反映されないこと"
        );
      });

      await t.test("他院スタッフは未割当の撮影記録を参照できない", async () => {
        const created = await adminApi
          .from("screenings")
          .insert({ created_by: staffAId, status: "uploading" })
          .select("id")
          .single();
        assert.ifError(created.error);
        createdScreeningIds.push(created.data.id);

        const staffBRead = await staffB
          .from("screenings")
          .select("id")
          .eq("id", created.data.id)
          .maybeSingle();
        assert.ifError(staffBRead.error);
        assert.equal(staffBRead.data, null);

        const adminRead = await admin
          .from("screenings")
          .select("id")
          .eq("id", created.data.id)
          .maybeSingle();
        assert.ifError(adminRead.error);
        assert.equal(adminRead.data?.id, created.data.id);
      });

      await t.test("同院スタッフは未割当の撮影記録と関節結果を参照できる", async () => {
        const screening = await adminApi
          .from("screenings")
          .insert({
            created_by: staffAId,
            status: "completed",
            total_inflamed_joints: 1,
            ra_detected: true,
            ai_hands: [{ side: "right" }],
          })
          .select("id")
          .single();
        assert.ifError(screening.error);
        createdScreeningIds.push(screening.data.id);

        const joint = await adminApi
          .from("joint_results")
          .insert({
            screening_id: screening.data.id,
            side: "right",
            joint_name: "thumbIP",
            is_inflamed: true,
            confidence_score: 0.9,
          })
          .select("id")
          .single();
        assert.ifError(joint.error);

        const peerRead = await staffPeer
          .from("screenings")
          .select("id, joint_results(id, side, joint_name, is_inflamed, confidence_score)")
          .eq("id", screening.data.id)
          .single();
        assert.ifError(peerRead.error);
        assert.equal(peerRead.data?.id, screening.data.id);
        assert.deepEqual(peerRead.data?.joint_results, [
          {
            id: joint.data.id,
            side: "right",
            joint_name: "thumbIP",
            is_inflamed: true,
            confidence_score: 0.9,
          },
        ]);

        const otherClinicScreeningRead = await staffB
          .from("screenings")
          .select("id")
          .eq("id", screening.data.id)
          .maybeSingle();
        assert.ifError(otherClinicScreeningRead.error);
        assert.equal(otherClinicScreeningRead.data, null);

        const otherClinicJointRead = await staffB
          .from("joint_results")
          .select("id")
          .eq("id", joint.data.id)
          .maybeSingle();
        assert.ifError(otherClinicJointRead.error);
        assert.equal(otherClinicJointRead.data, null);
      });

      await t.test("スタッフは撮影記録・解析結果をData APIで直接更新できない", async () => {
        const screeningId = createdScreeningIds[0];

        const directScreeningUpdate = await staffA
          .from("screenings")
          .update({ status: "completed", total_inflamed_joints: 30 })
          .eq("id", screeningId);
        assert.ok(directScreeningUpdate.error, "screeningsの直接更新は拒否されること");

        const directResultInsert = await staffA.from("joint_results").insert({
          screening_id: screeningId,
          side: "right",
          joint_name: "thumbIP",
          is_inflamed: true,
          confidence_score: 1,
        });
        assert.ok(directResultInsert.error, "joint_resultsの直接追加は拒否されること");

        const directCompletion = await staffA.rpc("complete_screening_analysis", {
          p_screening_id: screeningId,
          p_total_inflamed_joints: 0,
          p_right_joints: [],
          p_left_joints: [],
        });
        assert.ok(directCompletion.error, "解析確定RPCの直接実行は拒否されること");
      });

      await t.test("他院スタッフは紐付け済みのSubjectと撮影記録を参照できない", async () => {
        const subject = await staffA
          .from("subjects")
          .insert({ clinic_id: clinicAId })
          .select("id")
          .single();
        assert.ifError(subject.error);

        const screening = await adminApi
          .from("screenings")
          .insert({
            created_by: staffAId,
            subject_id: subject.data.id,
            status: "uploading",
          })
          .select("id")
          .single();
        assert.ifError(screening.error);
        createdScreeningIds.push(screening.data.id);

        const subjectRead = await staffB
          .from("subjects")
          .select("id")
          .eq("id", subject.data.id)
          .maybeSingle();
        assert.ifError(subjectRead.error);
        assert.equal(subjectRead.data, null);

        const screeningRead = await staffB
          .from("screenings")
          .select("id")
          .eq("id", screening.data.id)
          .maybeSingle();
        assert.ifError(screeningRead.error);
        assert.equal(screeningRead.data, null);
      });

      await t.test("同一医療機関のスタッフによる被験者ID訂正はService Role経由のみ更新できる", async () => {
        const [beforeSubject, afterSubject] = await Promise.all([
          staffA.from("subjects").insert({ clinic_id: clinicAId }).select("id").single(),
          staffA.from("subjects").insert({ clinic_id: clinicAId }).select("id").single(),
        ]);
        assert.ifError(beforeSubject.error);
        assert.ifError(afterSubject.error);

        const screening = await adminApi
          .from("screenings")
          .insert({
            created_by: staffAId,
            subject_id: beforeSubject.data.id,
            status: "uploading",
          })
          .select("id")
          .single();
        assert.ifError(screening.error);
        createdScreeningIds.push(screening.data.id);

        const directCorrection = await staffPeer.rpc("correct_screening_subject", {
          p_screening_id: screening.data.id,
          p_expected_subject_id: beforeSubject.data.id,
          p_new_subject_id: afterSubject.data.id,
          p_changed_by: staffPeerId,
        });
        assert.ok(directCorrection.error, "クライアントからの訂正RPC実行は拒否されること");

        const correction = await adminApi.rpc("correct_screening_subject", {
          p_screening_id: screening.data.id,
          p_expected_subject_id: beforeSubject.data.id,
          p_new_subject_id: afterSubject.data.id,
          p_changed_by: staffPeerId,
        });
        assert.ifError(correction.error);

        const correctedScreening = await staffPeer
          .from("screenings")
          .select("subject_id")
          .eq("id", screening.data.id)
          .single();
        assert.ifError(correctedScreening.error);
        assert.equal(correctedScreening.data?.subject_id, afterSubject.data.id);
      });

      await t.test("管理者だけが既存結果を消去して再解析を開始できる", async () => {
        const screening = await adminApi
          .from("screenings")
          .insert({
            created_by: staffAId,
            status: "completed",
            total_inflamed_joints: 1,
            ai_model_version: "old-model",
            analyzed_at: new Date().toISOString(),
            analysis_error_code: "api_http_error",
            analysis_error_http_status: 503,
            analysis_error_at: new Date().toISOString(),
            right_image_url: `${staffAId}/placeholder/right_1.jpg`,
            left_image_url: `${staffAId}/placeholder/left_1.jpg`,
          })
          .select("id")
          .single();
        assert.ifError(screening.error);
        createdScreeningIds.push(screening.data.id);

        const existingResult = await adminApi.from("joint_results").insert({
          screening_id: screening.data.id,
          side: "right",
          joint_name: "thumbIP",
          is_inflamed: true,
          confidence_score: 0.9,
        });
        assert.ifError(existingResult.error);

        const directStaffCall = await staffA.rpc("begin_screening_reanalysis", {
          p_screening_id: screening.data.id,
          p_changed_by: staffAId,
        });
        assert.ok(directStaffCall.error, "スタッフは再解析開始RPCを直接実行できないこと");

        const nonAdminActor = await adminApi.rpc("begin_screening_reanalysis", {
          p_screening_id: screening.data.id,
          p_changed_by: staffAId,
        });
        assert.ok(nonAdminActor.error, "Service Role経由でもスタッフ指定は拒否されること");

        const restarted = await adminApi.rpc("begin_screening_reanalysis", {
          p_screening_id: screening.data.id,
          p_changed_by: adminId,
        });
        assert.ifError(restarted.error);
        assert.equal(restarted.data?.[0]?.id, screening.data.id);

        const afterRestart = await adminApi
          .from("screenings")
          .select("status, total_inflamed_joints, ra_detected, ai_hands, ai_model_version, analyzed_at, analysis_error_code, analysis_error_http_status, analysis_error_at")
          .eq("id", screening.data.id)
          .single();
        assert.ifError(afterRestart.error);
        assert.deepEqual(afterRestart.data, {
          status: "analyzing",
          total_inflamed_joints: null,
          ra_detected: null,
          ai_hands: null,
          ai_model_version: null,
          analyzed_at: null,
          analysis_error_code: null,
          analysis_error_http_status: null,
          analysis_error_at: null,
        });

        const resultsAfterRestart = await adminApi
          .from("joint_results")
          .select("id")
          .eq("screening_id", screening.data.id);
        assert.ifError(resultsAfterRestart.error);
        assert.equal(resultsAfterRestart.data?.length, 0, "再解析開始時に旧結果を消去すること");

        const jointNames = [
          "thumbIP", "thumbMCP", "idxDIP", "idxPIP", "idxMCP",
          "midDIP", "midPIP", "midMCP", "ringDIP", "ringPIP", "ringMCP",
          "pinkyDIP", "pinkyPIP", "pinkyMCP", "wrist",
        ];
        const rightJoints = jointNames.map((joint_name, index) => ({
          joint_name,
          is_inflamed: index === 0,
          confidence_score: index === 0 ? 0.9 : 0.1,
        }));
        const leftJoints = jointNames.map((joint_name) => ({
          joint_name,
          is_inflamed: false,
          confidence_score: 0.1,
        }));
        const staleFailure = await adminApi
          .from("screenings")
          .update({
            analysis_error_code: "result_save_failed",
            analysis_error_http_status: null,
            analysis_error_at: new Date().toISOString(),
          })
          .eq("id", screening.data.id);
        assert.ifError(staleFailure.error);
        const completed = await adminApi.rpc("complete_screening_analysis_with_metadata", {
          p_screening_id: screening.data.id,
          p_total_inflamed_joints: 1,
          p_right_joints: rightJoints,
          p_left_joints: leftJoints,
          p_ai_model_version: "arthritis-v1.2.0",
        });
        assert.ifError(completed.error);
        const replacedResult = await adminApi
          .from("screenings")
          .select("status, total_inflamed_joints, ai_model_version, analyzed_at, analysis_error_code, analysis_error_http_status, analysis_error_at, joint_results(id)")
          .eq("id", screening.data.id)
          .single();
        assert.ifError(replacedResult.error);
        assert.equal(replacedResult.data?.status, "completed");
        assert.equal(replacedResult.data?.total_inflamed_joints, 1);
        assert.equal(replacedResult.data?.ai_model_version, "arthritis-v1.2.0");
        assert.ok(replacedResult.data?.analyzed_at, "解析確定時刻を保存すること");
        assert.equal(replacedResult.data?.analysis_error_code, null);
        assert.equal(replacedResult.data?.analysis_error_http_status, null);
        assert.equal(replacedResult.data?.analysis_error_at, null);
        assert.equal(replacedResult.data?.joint_results.length, 30, "新しい解析結果だけを保存すること");

        const retryWithoutVersion = await adminApi.rpc("begin_screening_reanalysis", {
          p_screening_id: screening.data.id,
          p_changed_by: adminId,
        });
        assert.ifError(retryWithoutVersion.error);
        const completeWithoutVersion = await adminApi.rpc("complete_screening_analysis_with_metadata", {
          p_screening_id: screening.data.id,
          p_total_inflamed_joints: 1,
          p_right_joints: rightJoints,
          p_left_joints: leftJoints,
          p_ai_model_version: "",
        });
        assert.ifError(completeWithoutVersion.error);
        const noVersionResult = await adminApi
          .from("screenings")
          .select("ai_model_version, analyzed_at")
          .eq("id", screening.data.id)
          .single();
        assert.ifError(noVersionResult.error);
        assert.equal(noVersionResult.data?.ai_model_version, null);
        assert.ok(noVersionResult.data?.analyzed_at);

        const failed = await adminApi
          .from("screenings")
          .insert({
            created_by: staffAId,
            status: "failed",
            analysis_error_code: "api_timeout",
            analysis_error_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        assert.ifError(failed.error);
        createdScreeningIds.push(failed.data.id);
        const retryFailed = await adminApi.rpc("begin_screening_reanalysis", {
          p_screening_id: failed.data.id,
          p_changed_by: adminId,
        });
        assert.ifError(retryFailed.error);
        const failedAfterRetry = await adminApi
          .from("screenings")
          .select("analysis_error_code, analysis_error_http_status, analysis_error_at")
          .eq("id", failed.data.id)
          .single();
        assert.ifError(failedAfterRetry.error);
        assert.deepEqual(failedAfterRetry.data, {
          analysis_error_code: null,
          analysis_error_http_status: null,
          analysis_error_at: null,
        });
      });

      await t.test("新RA API結果は検証後にService Roleだけが原子的に確定できる", async () => {
        const screening = await adminApi
          .from("screenings")
          .insert({ created_by: staffAId, status: "analyzing" })
          .select("id")
          .single();
        assert.ifError(screening.error);
        createdScreeningIds.push(screening.data.id);

        const hands = [
          {
            side: "left",
            ra_detected: true,
            hand_probability: 0.48,
            num_positive_joints: 2,
            num_joints_detected: 2,
            joints: [
              { joint_id: 14, joint_name: "IP1 (thumb)", probability: 0.48, positive: true },
              { joint_id: 15, joint_name: "Wrist", probability: 0.5, positive: true },
            ],
            warnings: [],
          },
          {
            side: "right",
            ra_detected: false,
            hand_probability: 0.22,
            num_positive_joints: 0,
            num_joints_detected: 1,
            joints: [
              { joint_id: 1, joint_name: "MCP1", probability: 0.45, positive: false },
            ],
            warnings: [],
          },
        ];

        const directStaffCall = await staffA.rpc("complete_ra_screening_analysis", {
          p_screening_id: screening.data.id,
          p_ra_detected: true,
          p_total_positive_joints: 2,
          p_hands: hands,
        });
        assert.ok(directStaffCall.error, "スタッフは解析確定RPCを直接実行できないこと");

        const inconsistent = await adminApi.rpc("complete_ra_screening_analysis", {
          p_screening_id: screening.data.id,
          p_ra_detected: true,
          p_total_positive_joints: 1,
          p_hands: hands,
        });
        assert.ok(inconsistent.error, "集計値が一致しない結果を拒否すること");

        const afterRejectedResult = await adminApi
          .from("screenings")
          .select("status")
          .eq("id", screening.data.id)
          .single();
        assert.ifError(afterRejectedResult.error);
        assert.equal(afterRejectedResult.data.status, "analyzing");

        const completed = await adminApi.rpc("complete_ra_screening_analysis_with_metadata", {
          p_screening_id: screening.data.id,
          p_ra_detected: true,
          p_total_positive_joints: 2,
          p_hands: hands,
          p_ai_model_version: "2026-09-08-v1",
        });
        assert.ifError(completed.error);

        const result = await adminApi
          .from("screenings")
          .select("status, total_inflamed_joints, ra_detected, ai_hands, ai_model_version, analyzed_at, joint_results(id)")
          .eq("id", screening.data.id)
          .single();
        assert.ifError(result.error);
        assert.equal(result.data.status, "completed");
        assert.equal(result.data.total_inflamed_joints, 2);
        assert.equal(result.data.ra_detected, true);
        assert.deepEqual(result.data.ai_hands, hands);
        assert.equal(result.data.ai_model_version, "2026-09-08-v1");
        assert.ok(result.data.analyzed_at);
        assert.equal(result.data.joint_results.length, 3);
      });

      await t.test("他院スタッフはStorage上の手画像を取得できない", async () => {
        const screeningId = createdScreeningIds[0];
        const path = `${staffAId}/${screeningId}/right_1.jpg`;
        createdStoragePaths.push(path);

        const upload = await staffA.storage.from("hand-images").upload(
          path,
          new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], {
            type: "image/jpeg",
          }),
          { contentType: "image/jpeg" }
        );
        assert.ifError(upload.error);

        const ownSignedUrl = await staffA.storage
          .from("hand-images")
          .createSignedUrl(path, 60);
        assert.equal(ownSignedUrl.data?.signedUrl, undefined);
        assert.ok(ownSignedUrl.error, "医療機関スタッフの署名付きURL発行は失敗すること");

        const adminSignedUrl = await admin.storage
          .from("hand-images")
          .createSignedUrl(path, 60);
        assert.ok(adminSignedUrl.data?.signedUrl, "管理者は署名付きURLを発行できること");

        const signedUrl = await staffB.storage
          .from("hand-images")
          .createSignedUrl(path, 60);
        assert.equal(signedUrl.data?.signedUrl, undefined);
        assert.ok(signedUrl.error, "他院スタッフの署名付きURL発行は失敗すること");

        const crossClinicUpload = await staffB.storage.from("hand-images").upload(
          `${staffBId}/${screeningId}/right_2.jpg`,
          new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], {
            type: "image/jpeg",
          }),
          { contentType: "image/jpeg" }
        );
        assert.ok(crossClinicUpload.error, "他院の撮影記録への画像追加は失敗すること");

        const crossClinicDelete = await staffB.storage.from("hand-images").remove([path]);
        assert.ok(
          crossClinicDelete.error || crossClinicDelete.data?.length === 0,
          "他院画像の削除は反映されないこと"
        );
        const imageAfterCrossClinicDelete = await adminApi.storage
          .from("hand-images")
          .download(path);
        assert.ifError(imageAfterCrossClinicDelete.error);
      });

      await t.test("解析開始後は作成者本人でも画像を削除できない", async () => {
        const screeningId = createdScreeningIds[0];
        const path = `${staffAId}/${screeningId}/left_1.jpg`;
        createdStoragePaths.push(path);

        const upload = await staffA.storage.from("hand-images").upload(
          path,
          new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], {
            type: "image/jpeg",
          }),
          { contentType: "image/jpeg" }
        );
        assert.ifError(upload.error);

        const startAnalysis = await adminApi
          .from("screenings")
          .update({ status: "analyzing" })
          .eq("id", screeningId);
        assert.ifError(startAnalysis.error);

        const deleteAfterAnalysis = await staffA.storage.from("hand-images").remove([path]);
        assert.ok(
          deleteAfterAnalysis.error || deleteAfterAnalysis.data?.length === 0,
          "解析開始後は作成者本人の画像削除が反映されないこと"
        );
        const imageAfterAnalysisDelete = await adminApi.storage
          .from("hand-images")
          .download(path);
        assert.ifError(imageAfterAnalysisDelete.error);
      });

      await t.test("Storageはファイル名の形式に依存せずuploading状態にだけアップロードできる", async () => {
        const { data: screening, error } = await adminApi
          .from("screenings")
          .insert({ created_by: staffAId, status: "uploading" })
          .select("id")
          .single();
        assert.ifError(error);
        createdScreeningIds.push(screening.id);
        const prefix = `${staffAId}/${screening.id}/`;
        const upload = async (filename) => {
          const path = prefix + filename;
          createdStoragePaths.push(path);
          return staffA.storage.from("hand-images").upload(
            path, new Blob(["test"], { type: "image/jpeg" }),
            { contentType: "image/jpeg" }
          );
        };

        for (const filename of ["right_1.jpg", "left_1.jpg", "right_latest.jpg", "capture-other.jpg"]) {
          assert.ifError((await upload(filename)).error);
        }
        for (const status of ["analyzing", "completed", "failed"]) {
          const update = await adminApi.from("screenings").update({ status }).eq("id", screening.id);
          assert.ifError(update.error);
          assert.ok((await upload("right_3.jpg")).error, `${status} への追加は拒否されること`);
        }
      });

      await t.test("未認証のDB・Storage操作は既存のテスト記録にもアクセスできない", async () => {
        const anon = createClient(url, publishableKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const subject = await staffA.from("subjects").insert({ clinic_id: clinicAId }).select("id").single();
        assert.ifError(subject.error);
        const screening = await adminApi.from("screenings")
          .insert({ created_by: staffAId, subject_id: subject.data.id, status: "uploading" })
          .select("id").single();
        assert.ifError(screening.error);
        createdScreeningIds.push(screening.data.id);
        const joint = await adminApi.from("joint_results")
          .insert({ screening_id: screening.data.id, side: "right", joint_name: "thumbIP" })
          .select("id").single();
        assert.ifError(joint.error);

        for (const [table, id, update] of [
          ["clinics", clinicAId, { name: "unauthorized" }],
          ["profiles", staffAId, { full_name: "unauthorized" }],
          ["subjects", subject.data.id, { created_at: "2000-01-01T00:00:00Z" }],
          ["screenings", screening.data.id, { status: "completed" }],
          ["joint_results", joint.data.id, { is_inflamed: true }],
        ]) {
          const read = await anon.from(table).select("id").eq("id", id);
          assert.equal(read.data?.length ?? 0, 0, `未認証の${table}参照は拒否すること`);
          const write = await anon.from(table).update(update).eq("id", id).select("id");
          assert.equal(write.data?.length ?? 0, 0, `未認証の${table}更新は拒否すること`);
          const remove = await anon.from(table).delete().eq("id", id).select("id");
          assert.equal(remove.data?.length ?? 0, 0, `未認証の${table}削除は拒否すること`);
          const remains = await adminApi.from(table).select("id").eq("id", id).single();
          assert.ifError(remains.error);
        }

        const path = `${staffAId}/${screening.data.id}/right_1.jpg`;
        const deniedPath = `${staffAId}/${screening.data.id}/left_1.jpg`;
        createdStoragePaths.push(path, deniedPath);
        const blob = new Blob(["test"], { type: "image/jpeg" });
        assert.ifError((await staffA.storage.from("hand-images").upload(path, blob, { contentType: "image/jpeg" })).error);
        assert.ok((await anon.storage.from("hand-images").download(path)).error);
        assert.ok((await anon.storage.from("hand-images").createSignedUrl(path, 60)).error);
        assert.ok((await anon.storage.from("hand-images").upload(deniedPath, blob, { contentType: "image/jpeg" })).error);
        const removal = await anon.storage.from("hand-images").remove([path]);
        assert.equal(removal.data?.length ?? 0, 0);
        assert.ifError((await adminApi.storage.from("hand-images").download(path)).error);
        const listing = await staffA.storage.from("hand-images").list(`${staffAId}/${screening.data.id}`);
        assert.equal(listing.data?.length ?? 0, 0, "スタッフの画像一覧を公開しないこと");
      });

      await t.test("後片付けActionは片手のみ保存・両手未保存のどちらも処理できる", async () => {
        const actions = loadServerModule("src/app/actions/screenings.ts", {
          "@/lib/supabase/server": { createClient: async () => staffA },
          "@/lib/supabase/admin": { createAdminClient: () => adminApi },
          "next/cache": { revalidatePath: () => {} },
          "next/navigation": { redirect: () => {} },
        });
        for (const saveRightImage of [true, false]) {
          const screening = await adminApi.from("screenings")
            .insert({ created_by: staffAId, status: "uploading" })
            .select("id").single();
          assert.ifError(screening.error);
          createdScreeningIds.push(screening.data.id);
          const imagePaths = ["right_1.jpg", "left_1.jpg"].map(
            (name) => `${staffAId}/${screening.data.id}/${name}`
          );
          createdStoragePaths.push(...imagePaths);
          if (saveRightImage) {
            const upload = await staffA.storage.from("hand-images").upload(
              imagePaths[0], new Blob(["test"], { type: "image/jpeg" }), { contentType: "image/jpeg" }
            );
            assert.ifError(upload.error);
          }
          const result = await actions.abandonScreeningUpload(screening.data.id, imagePaths);
          assert.equal(result.error, null);
          const remaining = await adminApi.from("screenings").select("id").eq("id", screening.data.id).maybeSingle();
          assert.ifError(remaining.error);
          assert.equal(remaining.data, null);
          const images = await adminApi.storage.from("hand-images").list(`${staffAId}/${screening.data.id}`);
          assert.ifError(images.error);
          assert.deepEqual(images.data, [], "画像が残らないこと");
        }
      });

      await t.test("管理者の通常クライアントでは解析開始後の記録と画像を直接削除できない", async () => {
        const screening = await adminApi.from("screenings")
          .insert({ created_by: staffAId, status: "uploading" })
          .select("id").single();
        assert.ifError(screening.error);
        createdScreeningIds.push(screening.data.id);
        const path = `${staffAId}/${screening.data.id}/right_1.jpg`;
        createdStoragePaths.push(path);
        const upload = await staffA.storage.from("hand-images").upload(
          path, new Blob(["test"], { type: "image/jpeg" }), { contentType: "image/jpeg" }
        );
        assert.ifError(upload.error);
        const startAnalysis = await adminApi
          .from("screenings")
          .update({
            status: "analyzing",
            right_image_url: path,
          })
          .eq("id", screening.data.id);
        assert.ifError(startAnalysis.error);

        const remove = await admin.storage.from("hand-images").remove([path]);
        assert.ok(
          remove.error || remove.data?.length === 0,
          "管理者の通常クライアントによる画像削除は反映されないこと"
        );
        const imageAfterDirectDelete = await adminApi.storage.from("hand-images").download(path);
        assert.ifError(imageAfterDirectDelete.error);

        const deleted = await admin.from("screenings").delete().eq("id", screening.data.id).select("id");
        assert.equal(deleted.data?.length ?? 0, 0, "管理者の通常クライアントによる記録削除は拒否すること");
        const remains = await adminApi.from("screenings").select("id").eq("id", screening.data.id).single();
        assert.ifError(remains.error);
      });

      await t.test("スタッフの完全削除Actionは拒否され記録と画像が残る", async () => {
        const screening = await adminApi.from("screenings")
          .insert({ created_by: staffAId, status: "uploading" })
          .select("id").single();
        assert.ifError(screening.error);
        createdScreeningIds.push(screening.data.id);
        const imagePaths = ["right_1.jpg", "left_1.jpg"].map(
          (name) => `${staffAId}/${screening.data.id}/${name}`
        );
        createdStoragePaths.push(...imagePaths);
        for (const path of imagePaths) {
          const upload = await staffA.storage.from("hand-images").upload(
            path, new Blob(["test"], { type: "image/jpeg" }), { contentType: "image/jpeg" }
          );
          assert.ifError(upload.error);
        }
        const complete = await adminApi.from("screenings").update({
          status: "completed",
          right_image_url: imagePaths[0],
          left_image_url: imagePaths[1],
        }).eq("id", screening.data.id);
        assert.ifError(complete.error);

        const actions = loadServerModule("src/app/actions/screenings.ts", {
          "@/lib/supabase/server": { createClient: async () => staffA },
          "@/lib/supabase/admin": { createAdminClient: () => {
            throw new Error("スタッフ削除でService Roleを使ってはいけない");
          } },
          "next/cache": { revalidatePath: () => {} },
          "next/navigation": { redirect: () => assert.fail("スタッフ削除はリダイレクトしない") },
        });
        const form = new FormData();
        form.set("screening_id", screening.data.id);
        const result = await actions.deleteScreeningAsAdmin({ error: null, success: false }, form);
        assert.ok(result.error, "スタッフの完全削除は拒否すること");

        const remaining = await adminApi.from("screenings").select("id").eq("id", screening.data.id).maybeSingle();
        assert.ifError(remaining.error);
        assert.ok(remaining.data, "スタッフ拒否後も撮影記録が残ること");
        const images = await adminApi.storage.from("hand-images").list(`${staffAId}/${screening.data.id}`);
        assert.ifError(images.error);
        assert.equal(images.data?.length ?? 0, 2, "スタッフ拒否後も画像が残ること");
      });

      await t.test("管理者の完全削除Actionは完了済み記録と画像を残さない", async () => {
        const screening = await adminApi.from("screenings")
          .insert({ created_by: staffAId, status: "uploading" })
          .select("id").single();
        assert.ifError(screening.error);
        createdScreeningIds.push(screening.data.id);
        const imagePaths = ["right_1.jpg", "left_1.jpg"].map(
          (name) => `${staffAId}/${screening.data.id}/${name}`
        );
        createdStoragePaths.push(...imagePaths);
        for (const path of imagePaths) {
          const upload = await staffA.storage.from("hand-images").upload(
            path, new Blob(["test"], { type: "image/jpeg" }), { contentType: "image/jpeg" }
          );
          assert.ifError(upload.error);
        }
        const complete = await adminApi.from("screenings").update({
          status: "completed",
          right_image_url: imagePaths[0],
          left_image_url: imagePaths[1],
        }).eq("id", screening.data.id);
        assert.ifError(complete.error);
        const joint = await adminApi.from("joint_results").insert({
          screening_id: screening.data.id,
          side: "right",
          joint_name: "thumbIP",
        });
        assert.ifError(joint.error);

        const actions = loadServerModule("src/app/actions/screenings.ts", {
          "@/lib/supabase/server": { createClient: async () => admin },
          "@/lib/supabase/admin": { createAdminClient: () => adminApi },
          "next/cache": { revalidatePath: () => {} },
          "next/navigation": { redirect: () => {} },
        });
        const form = new FormData();
        form.set("screening_id", screening.data.id);
        await actions.deleteScreeningAsAdmin({ error: null, success: false }, form);

        const remaining = await adminApi.from("screenings").select("id").eq("id", screening.data.id).maybeSingle();
        assert.ifError(remaining.error);
        assert.equal(remaining.data, null);
        const joints = await adminApi.from("joint_results").select("id").eq("screening_id", screening.data.id);
        assert.ifError(joints.error);
        assert.equal(joints.data?.length ?? 0, 0, "関節結果が残らないこと");
        const images = await adminApi.storage.from("hand-images").list(`${staffAId}/${screening.data.id}`);
        assert.ifError(images.error);
        assert.deepEqual(images.data, [], "画像が残らないこと");
      });

      await t.test("無効化済みスタッフはDBとStorageにアクセスできない", async () => {
        const { error: deactivateError } = await adminApi
          .from("profiles")
          .update({ is_active: false })
          .eq("id", staffAId);
        assert.ifError(deactivateError);

        const screeningRead = await staffA
          .from("screenings")
          .select("id")
          .eq("id", createdScreeningIds[0])
          .maybeSingle();
        assert.ifError(screeningRead.error);
        assert.equal(screeningRead.data, null);

        const deniedPath = `${staffAId}/${createdScreeningIds[0]}/left_1.jpg`;
        const upload = await staffA.storage.from("hand-images").upload(
          deniedPath,
          new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], {
            type: "image/jpeg",
          }),
          { contentType: "image/jpeg" }
        );
        assert.ok(upload.error, "無効化済みスタッフのアップロードは失敗すること");
      });
    } finally {
      await cleanup();
    }
  });
}
