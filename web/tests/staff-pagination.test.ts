import assert from "node:assert/strict";
import test from "node:test";
import {
  isUnsatisfiableRange,
  normalizePage,
  pageRange,
  paginatedListHref,
  paginationMeta,
} from "../src/lib/staff-pagination.ts";

test("ページ番号を正規化する", () => {
  assert.equal(normalizePage("3"), 3);
  assert.equal(normalizePage("0"), 1);
  assert.equal(normalizePage("-2"), 1);
  assert.equal(normalizePage("2abc"), 1);
  assert.equal(normalizePage(1.5), 1);
  assert.equal(normalizePage("invalid"), 1);
  assert.equal(normalizePage({ page: 2 }), 1);
});

test("PostgRESTの範囲外エラーだけを識別する", () => {
  assert.equal(isUnsatisfiableRange({ code: "PGRST103" }), true);
  assert.equal(isUnsatisfiableRange({ code: "42501" }), false);
  assert.equal(isUnsatisfiableRange(null), false);
});

test("20件単位の取得範囲とページ情報を計算する", () => {
  assert.deepEqual(pageRange(2), { firstRow: 20, lastRow: 39 });
  assert.deepEqual(paginationMeta(41, 3), {
    total: 41,
    page: 3,
    pageSize: 20,
    totalPages: 3,
  });
  assert.deepEqual(paginationMeta(0, 8), {
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  });
});

test("ページURLは検索語を維持し1ページ目ではpageを省略する", () => {
  assert.equal(
    paginatedListHref("/subjects", 3, { q: "keio 47" }),
    "/subjects?q=keio+47&page=3"
  );
  assert.equal(
    paginatedListHref("/subjects", 1, { q: "keio47" }),
    "/subjects?q=keio47"
  );
  assert.equal(paginatedListHref("/grouping", 1), "/grouping");
  assert.equal(
    paginatedListHref("/admin/clinics/825b641d-26cd-43d8-9bec-ff775d6e6d88", 2),
    "/admin/clinics/825b641d-26cd-43d8-9bec-ff775d6e6d88?page=2"
  );
  assert.equal(
    paginatedListHref("/admin/clinics/825b641d-26cd-43d8-9bec-ff775d6e6d88", 1),
    "/admin/clinics/825b641d-26cd-43d8-9bec-ff775d6e6d88"
  );
});
