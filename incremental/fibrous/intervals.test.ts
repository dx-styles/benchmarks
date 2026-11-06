import assert from "node:assert/strict";
import {test} from "node:test";

import {intervalMetrics} from "./intervals.ts";

test("overlapping async waits do not inflate interval union", () => {
  assert.deepEqual(
    intervalMetrics([
      {startedAt: 0, finishedAt: 10},
      {startedAt: 2, finishedAt: 6},
      {startedAt: 10, finishedAt: 13},
    ]),
    {count: 3, sumMs: 17, unionMs: 13, peak: 2}
  );
  assert.deepEqual(intervalMetrics([]), {count: 0, sumMs: 0, unionMs: 0, peak: 0});
});
