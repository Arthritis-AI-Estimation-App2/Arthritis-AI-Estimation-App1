import assert from "node:assert/strict";
import test from "node:test";
import { createStaleTabRecovery, STALE_TAB_RELOAD_MS } from "../src/lib/stale-tab.ts";

function setup(online = true) {
  let time = 0;
  let connected = online;
  let reloads = 0;
  const recovery = createStaleTabRecovery({
    now: () => time,
    isOnline: () => connected,
    reload: () => { reloads++; },
  });
  return {
    ...recovery,
    advance: (ms: number) => { time += ms; },
    setOnline: (value: boolean) => { connected = value; },
    reloads: () => reloads,
  };
}

test("1時間未満の復帰では読み直さず、操作中は経過をリセットする", () => {
  const tab = setup();
  tab.advance(STALE_TAB_RELOAD_MS - 1);
  tab.noteVisible();
  assert.equal(tab.reloads(), 0);
  tab.advance(STALE_TAB_RELOAD_MS - 1);
  tab.noteVisible();
  assert.equal(tab.reloads(), 0);
});

test("1時間以上離れて復帰したら一度だけ読み直す", () => {
  const tab = setup();
  tab.advance(STALE_TAB_RELOAD_MS);
  tab.noteVisible();
  tab.noteVisible();
  assert.equal(tab.reloads(), 1);
});

test("離れた時刻から1時間を測り、遅れた非表示イベントでは経過を消さない", () => {
  const tab = setup();
  tab.advance(60_000);
  tab.noteHidden();
  tab.advance(STALE_TAB_RELOAD_MS);
  tab.noteVisible();
  assert.equal(tab.reloads(), 1);

  const delayed = setup();
  delayed.advance(STALE_TAB_RELOAD_MS);
  delayed.noteHidden();
  delayed.noteVisible();
  assert.equal(delayed.reloads(), 1);
});

test("オフラインでは読み直さず、復帰できる通信が戻ってから読み直す", () => {
  const tab = setup(false);
  tab.advance(STALE_TAB_RELOAD_MS);
  tab.noteVisible();
  assert.equal(tab.reloads(), 0);
  tab.setOnline(true);
  tab.noteVisible();
  assert.equal(tab.reloads(), 1);
});
