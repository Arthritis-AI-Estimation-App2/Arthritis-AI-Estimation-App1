import assert from "node:assert/strict";
import test from "node:test";
import {
  escapeSubjectLikePattern,
  filterSubjectsById,
  normalizeSubjectQuery,
  subjectIdMatchesQuery,
} from "../src/lib/subject-search.ts";

// 被験者ID検索の入力正規化、LIKE用エスケープ、部分一致と一覧絞り込みの規則を検証する。
test("検索語の空白と大文字小文字を正規化する", () => {
  assert.equal(normalizeSubjectQuery("  KEIO 47 "), "keio47");
  assert.equal(normalizeSubjectQuery(""), "");
});

test("LIKE検索のワイルドカードをエスケープする", () => {
  assert.equal(escapeSubjectLikePattern("keio%_\\47"), "keio\\%\\_\\\\47");
});

test("空の検索語は全件に一致する", () => {
  assert.equal(subjectIdMatchesQuery("keio47", ""), true);
  assert.equal(subjectIdMatchesQuery("keio47", "   "), true);
});

test("被験者IDは部分一致で絞り込める", () => {
  assert.equal(subjectIdMatchesQuery("keio47", "47"), true);
  assert.equal(subjectIdMatchesQuery("keio47", "KEIO 47"), true);
  assert.equal(subjectIdMatchesQuery("keio47", "keio1"), false);
});

test("一覧は正規化したIDでフィルタする", () => {
  const subjects = [{ id: "keio1" }, { id: "keio47" }, { id: "keio12" }];
  assert.deepEqual(
    filterSubjectsById(subjects, "47").map((subject) => subject.id),
    ["keio47"]
  );
  assert.deepEqual(
    filterSubjectsById(subjects, "keio1").map((subject) => subject.id),
    ["keio1", "keio12"]
  );
  assert.equal(filterSubjectsById(subjects, "").length, 3);
});
