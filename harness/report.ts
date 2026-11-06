/** Render a run's JSON into Markdown tables. */
import type { BrowserResult } from "./browser.ts";
import type { SizeMetrics } from "./build.ts";
import type { Lane } from "./lanes.ts";
import type { BuildSample } from "./measure.ts";
import { median, min } from "./util.ts";

export interface Environment {
  date: string;
  machine: string;
  cores: number;
  memoryGb: number;
  os: string;
  node: string;
  npm: string;
  chromium?: string;
  benchCommit: string;
  cards: number;
  rounds: number;
  maxLoad: number;
}

export interface RunResult {
  group: "market" | "wyw" | "diag";
  environment: Environment;
  lanes: Lane[];
  builds: BuildSample[];
  sizes: Record<string, SizeMetrics>;
  browser?: Record<string, BrowserResult & { differing: number; examples: string[] }>;
}

const kb = (bytes: number): string => (bytes / 1024).toFixed(1);
const s = (ms: number): string => (ms / 1000).toFixed(2);
const stat = (values: number[]): string => `${s(median(values))} (${s(min(values))})`;

const header = (env: Environment): string[] => [
  `_${env.date} · ${env.machine}, ${env.cores} cores, ${env.memoryGb} GB · ${env.os} · Node ${env.node} · npm ${env.npm}${env.chromium ? ` · Chromium ${env.chromium}` : ""} · bench ${env.benchCommit}_`,
  "",
  `_${env.cards} cards · ${env.rounds} interleaved rounds of one cold and one warm build per lane · median (minimum) · builds started at 1-minute load ≤ ${env.maxLoad}_`,
  "",
];

const loads = (samples: BuildSample[]): string => {
  const values = samples.map((x) => x.load);
  return `${min(values)}–${Math.max(...values)}`;
};

export const renderMarket = (run: RunResult): string => {
  const rows = run.lanes
    .map((lane) => ({ lane, builds: run.builds.filter((b) => b.lane === lane.id) }))
    .sort((a, b) => median(a.builds.map((x) => x.warm)) - median(b.builds.map((x) => x.warm)));
  const lines = [
    "| Library | Cold build, s | Warm build, s | JS raw / gzip, KB | CSS raw / gzip, KB | Total raw / gzip, KB | FCP, ms | LCP, ms | Renders like dx-styles |",
    "| --- | --: | --: | --: | --: | --: | --: | --: | --- |",
  ];
  for (const { lane, builds } of rows) {
    const size = run.sizes[lane.id]!;
    const browser = run.browser?.[lane.id];
    const fcp = browser ? browser.samples.map((x) => x.fcp) : [];
    const lcp = browser ? browser.samples.map((x) => x.lcp ?? Number.NaN).filter((x) => !Number.isNaN(x)) : [];
    lines.push(
      [
        lane.label,
        stat(builds.map((x) => x.cold)),
        stat(builds.map((x) => x.warm)),
        `${kb(size.jsRaw)} / ${kb(size.jsGzip)}`,
        `${kb(size.cssRaw)} / ${kb(size.cssGzip)}`,
        `${kb(size.jsRaw + size.cssRaw)} / ${kb(size.jsGzip + size.cssGzip)}`,
        fcp.length ? `${median(fcp).toFixed(0)} (${min(fcp).toFixed(0)})` : "—",
        lcp.length ? median(lcp).toFixed(0) : "—",
        browser ? (browser.differing === 0 ? "yes" : `no: ${browser.differing} elements differ`) : "—",
      ].join(" | ").replace(/^/, "| ").concat(" |"),
    );
  }
  return [...header(run.environment), ...lines, "", `Load during the builds: ${loads(run.builds)}.`, ""].join("\n");
};

export const renderWyw = (run: RunResult): string => {
  const out: string[] = [...header(run.environment)];
  for (const layout of ["app", "single"] as const) {
    const lanes = run.lanes.filter((l) => l.layout === layout);
    if (lanes.length === 0) continue;
    const base = run.builds.filter((b) => b.lane === lanes[0]!.id).map((x) => x.warm);
    out.push(
      `### ${layout === "app" ? "Per-component modules" : "One styles module"}`,
      "",
      "| dx-styles | wyw-in-js | Cold build, s | Warm build, s | Warm vs first row | Warm range, s | Output |",
      "| --- | --- | --: | --: | --: | --- | --- |",
    );
    for (const lane of lanes) {
      const builds = run.builds.filter((b) => b.lane === lane.id);
      const warm = builds.map((x) => x.warm);
      const dx = lane.deps["dx-styles"]!;
      const wyw = lane.overrides["@wyw-in-js/transform"]!;
      const delta = (median(warm) / median(base) - 1) * 100;
      const hashes = [...new Set(builds.map((x) => x.hash))];
      out.push(
        `| ${dx} | ${wyw} | ${stat(builds.map((x) => x.cold))} | ${stat(warm)} | ${lane === lanes[0] ? "—" : `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(0)}%`} | ${s(min(warm))}–${s(Math.max(...warm))} | \`${hashes.join(", ")}\` |`,
      );
    }
    out.push("");
  }
  out.push(`Load during the builds: ${loads(run.builds)}. Output is the hash of the built assets; rows with the same hash built byte-identical bundles.`, "");
  return out.join("\n");
};
