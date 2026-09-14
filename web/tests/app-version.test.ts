import assert from "node:assert/strict";
import test from "node:test";
import {
  createVersionChecker,
  isVersionReloadSafePath,
  VERSION_CHECK_INTERVAL_MS,
} from "../src/lib/app-version.ts";

function setup(fetchVersion: () => Promise<unknown> = async () => "new") {
  let time = 0;
  let safe = true;
  let requests = 0;
  let reloads = 0;
  const check = createVersionChecker({
    initialVersion: "old",
    now: () => time,
    isSafe: () => safe,
    fetchVersion: () => { requests++; return fetchVersion(); },
    reload: () => { reloads++; },
  });
  return {
    check,
    advance: () => { time += VERSION_CHECK_INTERVAL_MS; },
    setSafe: (value: boolean) => { safe = value; },
    requests: () => requests,
    reloads: () => reloads,
  };
}

test("撮影・編集・紐付け画面では自動更新しない", () => {
  for (const path of ["/", "/subjects", "/screenings", "/admin/screenings"]) {
    assert.equal(isVersionReloadSafePath(path), true);
  }
  for (const path of ["/capture", "/grouping", "/subjects/123", "/admin/staffs", "/admin/screenings/123", "/login"]) {
    assert.equal(isVersionReloadSafePath(path), false);
  }
});

test("1時間未満と安全でない画面では確認せず、安全な画面で新版だけ更新する", async () => {
  const app = setup();
  await app.check();
  assert.equal(app.requests(), 0);
  app.advance();
  app.setSafe(false);
  await app.check();
  assert.equal(app.requests(), 0);
  app.setSafe(true);
  await app.check();
  assert.equal(app.reloads(), 1);
});

test("同じ版・不正な応答では再読み込みせず、確認を1時間に制限する", async () => {
  for (const version of ["old", null, "", 123, {}]) {
    const app = setup(async () => version);
    app.advance();
    await app.check();
    await app.check();
    assert.equal(app.requests(), 1);
    assert.equal(app.reloads(), 0);
  }
});

test("確認中の画面移動や入力では更新を見送り、安全になってから更新する", async () => {
  let resolve!: (value: unknown) => void;
  const app = setup(() => new Promise((done) => { resolve = done; }));
  app.advance();
  const pending = app.check();
  await app.check();
  assert.equal(app.requests(), 1);
  app.setSafe(false);
  resolve("new");
  await pending;
  assert.equal(app.reloads(), 0);
  app.setSafe(true);
  await app.check();
  assert.equal(app.reloads(), 1);
  assert.equal(app.requests(), 1);
});

test("通信失敗後も利用を継続し、次の確認機会に再試行する", async () => {
  let offline = true;
  const app = setup(async () => {
    if (offline) throw new Error("offline");
    return "new";
  });
  app.advance();
  await app.check();
  assert.equal(app.reloads(), 0);
  offline = false;
  app.advance();
  await app.check();
  assert.equal(app.reloads(), 1);
});
