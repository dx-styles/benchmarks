import {existsSync, readdirSync, readFileSync, writeFileSync} from "node:fs";
import path from "node:path";

import {intervalMetrics} from "./intervals.ts";
import type {Interval} from "./intervals.ts";

type Window = {kind: string; size?: number; repetition?: number; startedAt: number; finishedAt: number};
type Action = {actionId: number; type?: string; startedAt?: number; finishedAt?: number; result?: string};
type Span = {method: string; startedAt: number; finishedAt: number; durationMs: number};
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const root = path.resolve(process.argv[2]);
for (const entry of readdirSync(root, {withFileTypes: true})) {
  const directory = path.join(root, entry.name);
  if (
    !entry.isDirectory() ||
    !existsSync(path.join(directory, "summary.json")) ||
    !existsSync(path.join(directory, "stages/actions.jsonl"))
  ) {
    continue;
  }
  const metadata = JSON.parse(readFileSync(path.join(directory, "metadata.json"), "utf8"));
  if (!metadata.timeOrigin) {
    continue;
  }
  const windows: Window[] = readFileSync(path.join(directory, "windows.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const stages = windows.map((): Record<string, number> => ({}));
  const methods = windows.map((): Record<string, number> => ({}));
  const intervals = windows.map((): Record<string, Interval[]> => ({}));
  const add = (startedAt: number, finishedAt: number, name: string, target: Record<string, number>[]) => {
    const start = startedAt + metadata.timeOrigin;
    const end = finishedAt + metadata.timeOrigin;
    const index = windows.findIndex((window) => start >= window.startedAt - 1 && end <= window.finishedAt + 1);
    if (index >= 0) {
      target[index][name] = (target[index][name] ?? 0) + finishedAt - startedAt;
      if (target === stages) {
        (intervals[index][name] ??= []).push({startedAt, finishedAt});
      }
    }
  };
  const active = new Map<number, {type: string; startedAt: number}>();
  for (const line of readFileSync(path.join(directory, "stages/actions.jsonl"), "utf8").trim().split("\n")) {
    const action: Action = JSON.parse(line);
    if (action.startedAt !== undefined && action.type !== undefined) {
      active.set(action.actionId, {type: action.type, startedAt: action.startedAt});
    } else if (action.finishedAt !== undefined) {
      const start = active.get(action.actionId);
      if (start) {
        add(start.startedAt, action.finishedAt, start.type, stages);
        active.delete(action.actionId);
      }
    }
  }
  for (const line of readFileSync(path.join(directory, "stages/perf-spans.jsonl"), "utf8").trim().split("\n")) {
    const span: Span = JSON.parse(line);
    add(span.startedAt, span.finishedAt, span.method, methods);
  }
  const groups = new Map<string, number[]>();
  windows.forEach((window, index) => {
    if (window.repetition === 0) {
      return;
    }
    const key = `${window.kind}:${window.size ?? 0}`;
    const group = groups.get(key) ?? [];
    group.push(index);
    groups.set(key, group);
  });
  const aggregate = (indices: number[], target: Record<string, number>[]) =>
    Object.fromEntries(
      [...new Set(indices.flatMap((index) => Object.keys(target[index])))]
        .sort()
        .map((name) => [name, median(indices.map((index) => target[index][name] ?? 0))])
    );
  const report = {
    note: "Inclusive action/method duration sums in ms; nested stages overlap and must not be added or interpreted as CPU percentages. Instrumented serial run.",
    rows: [...groups.entries()].map(([scenario, indices]) => ({
      scenario,
      n: indices.length,
      wallMs: median(indices.map((index) => windows[index].finishedAt - windows[index].startedAt)),
      actionsMs: aggregate(indices, stages),
      methodsMs: aggregate(indices, methods),
      actionIntervals: Object.fromEntries(
        [...new Set(indices.flatMap((index) => Object.keys(intervals[index])))].map((name) => {
          const metrics = indices.map((index) => intervalMetrics(intervals[index][name] ?? []));
          return [
            name,
            {
              count: median(metrics.map((m) => m.count)),
              sumMs: median(metrics.map((m) => m.sumMs)),
              unionMs: median(metrics.map((m) => m.unionMs)),
              peak: median(metrics.map((m) => m.peak)),
            },
          ];
        })
      ),
    })),
  };
  writeFileSync(path.join(directory, "stage-summary.json"), JSON.stringify(report, null, 2));
  process.stdout.write(`${entry.name}\n${JSON.stringify(report, null, 2)}\n`);
}
