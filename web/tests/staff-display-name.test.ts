import assert from "node:assert/strict";
import test from "node:test";
import {
  DELETED_USER_NAME,
  UNKNOWN_USER_NAME,
  staffDisplayName,
} from "../src/lib/staff-display-name.ts";

test("有効なプロフィールは氏名をそのまま表示する", () => {
  assert.equal(
    staffDisplayName({ full_name: "山田 太郎", deleted_at: null }),
    "山田 太郎"
  );
});

test("削除済みプロフィールは氏名がDBに残っていても(削除済みユーザー)と表示する", () => {
  // 削除済みアカウントの氏名は撮影データの提供者追跡のためDBに残すが、
  // 画面表示は常にdeleted_atの有無だけで判定する。
  assert.equal(
    staffDisplayName({ full_name: "山田 太郎", deleted_at: "2026-09-06T00:00:00.000Z" }),
    DELETED_USER_NAME
  );
});

test("プロフィールが存在しない場合は不明と表示する", () => {
  assert.equal(staffDisplayName(null), UNKNOWN_USER_NAME);
  assert.equal(staffDisplayName(undefined), UNKNOWN_USER_NAME);
});
