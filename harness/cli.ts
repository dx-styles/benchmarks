/**
 * node harness/cli.ts <command> [--option=value …]
 *
 *   all       install every lane, then run `market` and `wyw` in one session
 *   market    the library comparison (build, size, first paint, render parity)
 *   wyw       the dx-styles × wyw-in-js version series
 *   diag      the diagnostic lanes next to the report lanes they explain
 *   prepare   write and install lanes without measuring
 *   report    re-render Markdown from a results JSON (--from=results/<file>.json)
 *   summary   rewrite RESULTS.md from the newest results of each group
 *
 * Options: --rounds=7 --fcp=10 --max-load=8 --max-wait=900 --settle=90
 *          --lanes=<id,id> --no-install (reuse installed lanes)
 */
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { cpus, totalmem } from "node:os";
import { join } from "node:path";

import { fingerprintDiff, measureBrowser } from "./browser.ts";
import { CARDS, measureSize, parallelFallbacks, type SizeMetrics } from "./build.ts";
import { DIAG_COMPARE, type Lane, LANES } from "./lanes.ts";
import { measureBuilds } from "./measure.ts";
import { installLane, type PreparedLane, writeLane } from "./prepare.ts";
import { type Environment, renderMarket, renderWyw, type RunResult } from "./report.ts";
import { log, ROOT, sleep } from "./util.ts";

const [command = "all", ...rest] = process.argv.slice(2);
const opt = (name: string, fallback: string): string =>
  rest.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const flag = (name: string): boolean => rest.includes(`--${name}`);

const rounds = Number(opt("rounds", "7"));
const fcpSamples = Number(opt("fcp", "10"));
const maxLoad = Number(opt("max-load", "8"));
const maxWait = Number(opt("max-wait", "900"));
const settle = Number(opt("settle", "90"));
const only = opt("lanes", "").split(",").filter(Boolean);

const sh = (cmd: string, args: string[]): string => execFileSync(cmd, args, { encoding: "utf8" }).trim();

const benchCommit = (): string => {
  try {
    const head = sh("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"]);
    return `${head}${sh("git", ["-C", ROOT, "status", "--porcelain"]) ? "+dirty" : ""}`;
  } catch {
    return "uncommitted";
  }
};

const COMMIT = benchCommit();

const environment = (chromium?: string): Environment => ({
  date: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
  machine: sh("sysctl", ["-n", "machdep.cpu.brand_string"]),
  cores: cpus().length,
  memoryGb: Math.round(totalmem() / 2 ** 30),
  os: `${sh("sw_vers", ["-productName"])} ${sh("sw_vers", ["-productVersion"])}`,
  node: process.versions.node,
  npm: sh("npm", ["--version"]),
  chromium,
  benchCommit: COMMIT,
  cards: CARDS,
  rounds,
  maxLoad,
});

const select = (group?: Lane["group"]): Lane[] =>
  LANES.filter((l) =>
    only.length > 0
      ? only.includes(l.id)
      : group === "diag"
        ? l.group === "diag" || DIAG_COMPARE.includes(l.id)
        : group
          ? l.group === group
          : l.group !== "diag",
  );

const prepare = async (lanes: Lane[], install: boolean): Promise<PreparedLane[]> => {
  const prepared: PreparedLane[] = [];
  for (const lane of lanes) {
    const p = await writeLane(lane);
    if (install) await installLane(p, log);
    prepared.push(p);
  }
  if (install && settle > 0) {
    log(`[prepare] settling ${settle}s after the installs`);
    await sleep(settle * 1000);
  }
  return prepared;
};

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

const save = async (run: RunResult): Promise<string> => {
  const dir = join(ROOT, "results");
  await mkdir(dir, { recursive: true });
  const base = join(dir, `${stamp}-${run.group}`);
  await writeFile(`${base}.json`, `${JSON.stringify(run, null, 2)}\n`);
  const md = run.group === "wyw" ? renderWyw(run) : renderMarket(run);
  await writeFile(`${base}.md`, md);
  log(`[results] ${base}.json\n${md}`);
  return md;
};

const sizes = async (prepared: PreparedLane[]): Promise<Record<string, SizeMetrics>> => {
  const out: Record<string, SizeMetrics> = {};
  for (const p of prepared) out[p.lane.id] = await measureSize(p);
  return out;
};

const runMarket = async (prepared: PreparedLane[], group: RunResult["group"] = "market"): Promise<RunResult> => {
  for (const p of prepared.filter((x) => x.lane.options?.parallel !== undefined)) {
    const fallbacks = await parallelFallbacks(p);
    if (fallbacks.length > 0) throw new Error(`${p.lane.id}: wyw-in-js did not use its workers:\n${fallbacks.join("\n")}`);
    log(`[parallel] ${p.lane.id}: no fallback reported, transforms ran in workers`);
  }
  const builds = await measureBuilds(prepared, { rounds, maxLoad, maxWait });
  const size = await sizes(prepared);
  const browser = await measureBrowser(prepared, fcpSamples);
  const reference = browser.get("market-dx-styles")?.fingerprint ?? [];
  const withDiff: NonNullable<RunResult["browser"]> = {};
  for (const [id, result] of browser) withDiff[id] = { ...result, ...fingerprintDiff(reference, result.fingerprint), fingerprint: [] };
  const chromium = [...browser.values()][0]?.chromium;
  return { group, environment: environment(chromium), lanes: prepared.map((p) => p.lane), builds, sizes: size, browser: withDiff };
};

const runWyw = async (prepared: PreparedLane[]): Promise<RunResult> => {
  const builds = await measureBuilds(prepared, { rounds, maxLoad, maxWait });
  return { group: "wyw", environment: environment(), lanes: prepared.map((p) => p.lane), builds, sizes: await sizes(prepared) };
};

/** RESULTS.md from the newest results file of each group. */
const summary = async (): Promise<void> => {
  const dir = join(ROOT, "results");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const latest = (group: string): string | undefined => files.filter((f) => f.endsWith(`-${group}.json`)).at(-1);
  const render = async (group: string): Promise<string | null> => {
    const file = latest(group);
    if (!file) return null;
    const run = JSON.parse(await readFile(join(dir, file), "utf8")) as RunResult;
    return `${run.group === "wyw" ? renderWyw(run) : renderMarket(run)}\nRaw data: \`results/${file}\`.\n`;
  };
  const parts = ["# Results", "", "Generated by `npm run bench` (`npm run bench:diag` for the diagnostics). Methodology: README.md.", ""];
  const market = await render("market");
  const wyw = await render("wyw");
  const diag = await render("diag");
  if (market) parts.push("## Libraries on one scene", "", market);
  if (wyw) parts.push("## dx-styles across wyw-in-js versions", "", wyw);
  if (diag) {
    parts.push(
      "## Diagnostics",
      "",
      "Variants that explain report lanes, measured next to them: Linaria with its tokens written as static CSS variables, Compiled with its opt-in `collisionResistantHash`, and wyw-in-js transforms in worker threads (`parallel`, experimental since 2.6.0; `true` means min(4, cores − 1) workers).",
      "",
      diag,
    );
  }
  await writeFile(join(ROOT, "RESULTS.md"), parts.join("\n"));
};

switch (command) {
  case "prepare":
    await prepare(select(), true);
    break;
  case "market":
    await save(await runMarket(await prepare(select("market"), !flag("no-install"))));
    break;
  case "wyw":
    await save(await runWyw(await prepare(select("wyw"), !flag("no-install"))));
    break;
  case "all": {
    const prepared = await prepare(select(), !flag("no-install"));
    await save(await runMarket(prepared.filter((p) => p.lane.group === "market")));
    await save(await runWyw(prepared.filter((p) => p.lane.group === "wyw")));
    await summary();
    break;
  }
  case "diag":
    await save(await runMarket(await prepare(select("diag"), !flag("no-install")), "diag"));
    await summary();
    break;
  case "summary":
    await summary();
    break;
  case "report": {
    const run = JSON.parse(await readFile(opt("from", ""), "utf8")) as RunResult;
    log(run.group === "wyw" ? renderWyw(run) : renderMarket(run));
    break;
  }
  default:
    throw new Error(`unknown command ${command}`);
}
