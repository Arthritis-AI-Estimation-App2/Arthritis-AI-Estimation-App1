import assert from "node:assert/strict";
import test from "node:test";
import {
  newerScreeningOrFilter,
  olderScreeningOrFilter,
  pickAdjacentScreenings,
  type TimedScreening,
} from "../src/lib/screening-neighbors.ts";

const CURRENT: TimedScreening = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  createdAt: "2026-09-23T08:00:00.000Z",
};

test("撮影日時の直前と直後を選ぶ", () => {
  const earlier = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", createdAt: "2026-09-23T07:00:00.000Z" };
  const later = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", createdAt: "2026-09-23T09:00:00.000Z" };
  const adjacent = pickAdjacentScreenings(CURRENT, [later, CURRENT, earlier]);

  assert.deepEqual(adjacent.previous, earlier);
  assert.deepEqual(adjacent.next, later);
});

test("同じ撮影日時では id の辞書順で前後を決める", () => {
  const smallerId = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    createdAt: CURRENT.createdAt,
  };
  const largerId = {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    createdAt: CURRENT.createdAt,
  };
  const adjacent = pickAdjacentScreenings(CURRENT, [largerId, smallerId, CURRENT]);

  assert.equal(adjacent.previous?.id, smallerId.id);
  assert.equal(adjacent.next?.id, largerId.id);
});

test("同時刻の記録は、より離れた別時刻より近い前後になる", () => {
  const sameTimeBefore = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    createdAt: CURRENT.createdAt,
  };
  const muchEarlier = {
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    createdAt: "2026-09-22T08:00:00.000Z",
  };
  const adjacent = pickAdjacentScreenings(CURRENT, [muchEarlier, sameTimeBefore]);

  assert.equal(adjacent.previous?.id, sameTimeBefore.id);
  assert.equal(adjacent.next, null);
});

test("端の記録には片側だけ隣がある", () => {
  const onlyLater = {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    createdAt: "2026-09-23T09:00:00.000Z",
  };

  assert.deepEqual(pickAdjacentScreenings(CURRENT, [onlyLater]), {
    previous: null,
    next: onlyLater,
  });
  assert.deepEqual(pickAdjacentScreenings(CURRENT, [CURRENT]), {
    previous: null,
    next: null,
  });
});

test("前後の検索条件は撮影日時と id を引用符で包む", () => {
  const createdAt = '2026-09-23T08:00:00.000+00:00';
  const older = olderScreeningOrFilter(CURRENT.id, createdAt);
  const newer = newerScreeningOrFilter(CURRENT.id, createdAt);

  assert.equal(
    older,
    `created_at.lt."${createdAt}",and(created_at.eq."${createdAt}",id.lt."${CURRENT.id}")`
  );
  assert.equal(
    newer,
    `created_at.gt."${createdAt}",and(created_at.eq."${createdAt}",id.gt."${CURRENT.id}")`
  );
});
