import assert from "node:assert/strict";
import test from "node:test";
import { screeningIdPrefixBounds } from "../src/lib/admin-screening-filters.ts";
import {
  normalizeStaffScreeningFilters,
  staffScreeningListHref,
} from "../src/lib/staff-screening-filters.ts";

test("スタッフの撮影一覧の検索条件を正規化する", () => {
  assert.deepEqual(
    normalizeStaffScreeningFilters({
      from: "2026-09-01",
      to: "2026-09-31",
      status: "completed",
      subject: "  keio47  ",
      page: "3",
    }),
    {
      dateFrom: "2026-09-01",
      dateTo: "",
      status: "completed",
      subjectId: "keio47",
      screeningIdInput: "",
      screeningId: "",
      screeningIdPrefix: "",
      page: 3,
    }
  );
});

test("不正な検索条件には安全な既定値を使う", () => {
  assert.deepEqual(
    normalizeStaffScreeningFilters({
      from: "yesterday",
      status: "unknown",
      page: "-1",
    }),
    {
      dateFrom: "",
      dateTo: "",
      status: "",
      subjectId: "",
      screeningIdInput: "",
      screeningId: "",
      screeningIdPrefix: "",
      page: 1,
    }
  );
});

test("ページリンクは検索条件を維持し、1ページ目はpageを省略する", () => {
  const filters = normalizeStaffScreeningFilters({
    status: "failed",
    subject: "keio 1",
    page: "2",
  });
  assert.equal(
    staffScreeningListHref(filters, 3),
    "/screenings?status=failed&subject=keio+1&page=3"
  );
  assert.equal(
    staffScreeningListHref(filters, 1),
    "/screenings?status=failed&subject=keio+1"
  );
});

test("撮影IDの先頭8文字は部分一致の検索条件になる", () => {
  const filters = normalizeStaffScreeningFilters({ id: "09C6191D" });
  assert.equal(filters.screeningIdInput, "09C6191D");
  assert.equal(filters.screeningId, "");
  assert.equal(filters.screeningIdPrefix, "09c6191d");
  assert.deepEqual(screeningIdPrefixBounds(filters.screeningIdPrefix), {
    from: "09c6191d-0000-0000-0000-000000000000",
    to: "09c6191d-ffff-ffff-ffff-ffffffffffff",
  });
  assert.equal(staffScreeningListHref(filters, 1), "/screenings?id=09C6191D");
});

test("形式が正しくない撮影IDは入力を残し、絞り込みなしにはしない", () => {
  const filters = normalizeStaffScreeningFilters({ id: "keio1" });
  assert.equal(filters.screeningIdInput, "keio1");
  assert.equal(filters.screeningId, "");
  assert.equal(filters.screeningIdPrefix, "");
  assert.equal(staffScreeningListHref(filters, 1), "/screenings?id=keio1");
  assert.equal(
    normalizeStaffScreeningFilters({ id: "09c6191" }).screeningIdPrefix,
    ""
  );
});
