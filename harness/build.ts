/**
 * One production build of a lane, timed end to end (wall clock around the Vite
 * process). A cold build first removes dist, the Vite cache and the library's own
 * generated or cached files, and includes the library's codegen step; a warm build
 * keeps them.
 */
import { createHash } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import type { PreparedLane } from "./prepare.ts";
import { run } from "./util.ts";

export const CARDS = Number(process.env.BENCH_CARDS ?? 120);

const ALWAYS_CLEAN = ["dist", ".vite-cache", "node_modules/.vite", ".swc"];

export const build = async (prepared: PreparedLane, cold: boolean): Promise<number> => {
  const { dir, source } = prepared;
  if (cold) {
    for (const sub of [...ALWAYS_CLEAN, ...(source.cleanDirs ?? [])]) {
      await rm(join(dir, sub), { recursive: true, force: true });
    }
  }
  const env = { NODE_ENV: "production", BENCH_CARDS: String(CARDS) };
  const start = performance.now();
  // A codegen step (Panda) runs once per checkout, so only a cold build pays for it.
  if (cold && source.codegen) await run(source.codegen[0]!, source.codegen.slice(1), { cwd: dir, env });
  await run(process.execPath, [join(dir, "node_modules", "vite", "bin", "vite.js"), "build", "--logLevel", "error"], { cwd: dir, env });
  return performance.now() - start;
};

export interface SizeMetrics {
  jsRaw: number;
  jsGzip: number;
  cssRaw: number;
  cssGzip: number;
  /** sha256 of the output (asset names normalized), to prove builds identical. */
  hash: string;
}

export const measureSize = async (prepared: PreparedLane): Promise<SizeMetrics> => {
  const assets = join(prepared.dir, "dist", "assets");
  const files = (await readdir(assets)).sort();
  const hash = createHash("sha256");
  const size: SizeMetrics = { jsRaw: 0, jsGzip: 0, cssRaw: 0, cssGzip: 0, hash: "" };
  for (const file of files) {
    const bytes = await readFile(join(assets, file));
    hash.update(file.replace(/-[\w-]{8}(\.\w+)$/, "$1"));
    hash.update(bytes);
    const gz = gzipSync(bytes, { level: 9 }).length;
    if (file.endsWith(".js")) {
      size.jsRaw += bytes.length;
      size.jsGzip += gz;
    } else if (file.endsWith(".css")) {
      size.cssRaw += bytes.length;
      size.cssGzip += gz;
    }
  }
  size.hash = hash.digest("hex").slice(0, 12);
  return size;
};
