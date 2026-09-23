import assert from "node:assert/strict";
import test from "node:test";
import { loadServerModule } from "./helpers/load-server-module.mjs";

function fixture({ total = 501, changedCount = false, missingRow = false, duplicate = false,
  user = { profile: { is_active: true, role: "admin" } }, runs, compare = () => 0 } = {}) {
  const calls = []; let exported;
  const { GET } = loadServerModule("src/app/admin/screenings/history-export/route.ts", {
    "@/lib/auth": { getCurrentUser: async () => user },
    "@/app/actions/analysis-history": { getAnalysisHistoryExportPage: async (filters, page, cutoff) => {
      calls.push({ filters, page, cutoff });
      return { total: page > 1 && changedCount ? total - 1 : total,
        runs: runs ?? Array.from({ length: Math.min(500, Math.max(0, total - (page - 1) * 500)) - (missingRow ? 1 : 0) }, (_, i) => ({ id: duplicate ? "duplicate" : `${page}-${i}` })) };
    } },
    "@/lib/analysis-history-csv": {
      buildAnalysisHistoryCsv: (rows) => { exported = rows; return "csv"; },
      compareAnalysisHistoryRows: compare,
    },
  });
  return { run: () => GET({ nextUrl: new URL("http://localhost/admin/screenings/history-export?id=12345678&status=completed&page=10") }),
    calls, get exported() { return exported; } };
}

test("履歴CSVは全ページを同じ取得期限で集め、キャッシュ禁止で返す", async () => {
  const f = fixture(); const response = await f.run();
  assert.equal(response.status, 200);
  assert.equal(f.exported.length, 501);
  assert.deepEqual(f.calls.map((c) => c.page), [1, 2]);
  assert.equal(f.calls[0].cutoff, f.calls[1].cutoff);
  assert.equal(f.calls[0].filters.status, "completed");
  assert.equal(f.calls[0].filters.screeningIdPrefix, "12345678");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.match(response.headers.get("Content-Disposition"), /analysis_history_/);
});

test("10,000件はすべて出力し、10,001件は切り捨てず拒否する", async () => {
  const accepted = fixture({ total: 10_000 });
  assert.equal((await accepted.run()).status, 200);
  assert.equal(accepted.exported.length, 10_000);
  const rejected = fixture({ total: 10_001 });
  assert.equal((await rejected.run()).status, 422);
  assert.equal(rejected.exported, undefined);
  assert.equal(rejected.calls.length, 1);
});

test("取得途中の件数変更・欠損・重複があれば不完全なCSVを返さない", async () => {
  for (const options of [{ changedCount: true }, { missingRow: true }, { duplicate: true }]) {
    const f = fixture(options);
    assert.equal((await f.run()).status, 409);
    assert.equal(f.exported, undefined);
  }
});

test("履歴CSVは取得後に一覧と同じ新しい順へ並べてから出力する", async () => {
  const runs = [
    { id: "old", screening_id: "b", run_number: 2, screenings: { created_at: "2026-09-01T00:00:00Z" } },
    { id: "new-1", screening_id: "a", run_number: 1, screenings: { created_at: "2026-09-02T00:00:00Z" } },
    { id: "new-3", screening_id: "a", run_number: 3, screenings: { created_at: "2026-09-02T00:00:00Z" } },
  ];
  const f = fixture({ total: runs.length, runs, compare: (a, b) => {
    const createdAt = Date.parse(b.screenings.created_at) - Date.parse(a.screenings.created_at);
    if (createdAt !== 0) return createdAt;
    if (a.screening_id !== b.screening_id) return a.screening_id < b.screening_id ? 1 : -1;
    return b.run_number - a.run_number;
  } });
  assert.equal((await f.run()).status, 200);
  assert.deepEqual(f.exported.map((row) => row.id), ["new-3", "new-1", "old"]);
});

test("未認証・無効アカウント・スタッフは履歴を取得しない", async () => {
  for (const user of [null, { profile: { is_active: false, role: "admin" } }, { profile: { is_active: true, role: "clinic_staff" } }]) {
    const f = fixture({ user });
    assert.ok([401, 403].includes((await f.run()).status));
    assert.equal(f.calls.length, 0);
  }
});
