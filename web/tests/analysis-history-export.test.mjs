import assert from "node:assert/strict";
import test from "node:test";
import { loadServerModule } from "./helpers/load-server-module.mjs";

function fixture({ total = 501, changedCount = false, missingRow = false, duplicate = false,
  user = { profile: { is_active: true, role: "admin" } } } = {}) {
  const calls = []; let exported;
  const { GET } = loadServerModule("src/app/admin/screenings/history-export/route.ts", {
    "@/lib/auth": { getCurrentUser: async () => user },
    "@/app/actions/analysis-history": { getAnalysisHistoryExportPage: async (filters, page, cutoff) => {
      calls.push({ filters, page, cutoff });
      return { total: page > 1 && changedCount ? total - 1 : total,
        runs: Array.from({ length: Math.min(500, Math.max(0, total - (page - 1) * 500)) - (missingRow ? 1 : 0) }, (_, i) => ({ id: duplicate ? "duplicate" : `${page}-${i}` })) };
    } },
    "@/lib/analysis-history-csv": { buildAnalysisHistoryCsv: (rows) => { exported = rows; return "csv"; } },
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

test("未認証・無効アカウント・スタッフは履歴を取得しない", async () => {
  for (const user of [null, { profile: { is_active: false, role: "admin" } }, { profile: { is_active: true, role: "clinic_staff" } }]) {
    const f = fixture({ user });
    assert.ok([401, 403].includes((await f.run()).status));
    assert.equal(f.calls.length, 0);
  }
});
