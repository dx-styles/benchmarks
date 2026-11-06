/**
 * Build measurement: one unrecorded warm-up build per lane (it fills the OS file cache
 * after the install), then rounds. Every round builds every lane cold and then warm,
 * in forward order on even rounds and backward on odd ones, so no lane is always first
 * or last. Before each round the harness waits for the 1-minute load average to drop
 * under the limit, and records the load next to every sample.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { build } from "./build.ts";
import type { PreparedLane } from "./prepare.ts";
import { load1, log, sleep } from "./util.ts";

export interface BuildSample {
  lane: string;
  round: number;
  cold: number;
  warm: number;
  load: number;
  hash: string;
}

export const hashDist = async (p: PreparedLane): Promise<string> => {
  const assets = join(p.dir, "dist", "assets");
  const hash = createHash("sha256");
  for (const file of (await readdir(assets)).sort()) {
    hash.update(file.replace(/-[\w-]{8}(\.\w+)$/, "$1"));
    hash.update(await readFile(join(assets, file)));
  }
  return hash.digest("hex").slice(0, 12);
};

export const waitForQuiet = async (maxLoad: number, maxWaitS: number): Promise<number> => {
  const start = Date.now();
  while (load1() > maxLoad && Date.now() - start < maxWaitS * 1000) await sleep(15_000);
  return Math.round((Date.now() - start) / 1000);
};

export const measureBuilds = async (
  lanes: PreparedLane[],
  opts: { rounds: number; maxLoad: number; maxWait: number },
): Promise<BuildSample[]> => {
  for (const p of lanes) await build(p, true);
  log(`[builds] warm-up done (${lanes.length} lanes)`);
  const samples: BuildSample[] = [];
  for (let round = 0; round < opts.rounds; round += 1) {
    const waited = await waitForQuiet(opts.maxLoad, opts.maxWait);
    const order = round % 2 === 0 ? lanes : [...lanes].reverse();
    for (const p of order) {
      const load = load1();
      const cold = await build(p, true);
      const warm = await build(p, false);
      samples.push({ lane: p.lane.id, round, cold, warm, load, hash: await hashDist(p) });
    }
    log(`[builds] round ${round + 1}/${opts.rounds} (waited ${waited}s for load ≤ ${opts.maxLoad}, now ${load1()})`);
  }
  return samples;
};
