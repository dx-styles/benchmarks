import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import {createRequire} from "node:module";
import os from "node:os";
import path from "node:path";
import {performance} from "node:perf_hooks";

import {WYWinJSDebugPlugin} from "@wyw-in-js/webpack-loader";
import type {Stats} from "webpack";
import webpack from "webpack";

import {changeIncrementGraph, incrementSizes, summarizeIncrements, writeIncrementGraph} from "./graph.ts";
import type {IncrementGraph, IncrementSample, IncrementScenario} from "./graph.ts";
const wywBundlerOptions = {
  configFile: path.join(import.meta.dirname, "wyw.config.mjs"),
  prefixer: false,
  sourceMap: false,
  parallel: Number(process.env.WYW_PARALLEL ?? 1),
};

const require = createRequire(import.meta.url);
if (process.env.WYW_BENCH_STAGES === "1" && wywBundlerOptions.parallel !== 0) {
  throw new Error("WYW_BENCH_STAGES requires WYW_PARALLEL=0: the debug plugin disables workers");
}
const say = (value: string) => process.stdout.write(`${value}\n`);
const history = path.resolve(process.argv[2]);
const sizes = incrementSizes(process.env.WYW_BENCH_INCREMENTS ?? "1");
const repeats = Number(process.env.WYW_BENCH_INCREMENT_REPEATS ?? 3);
const graph: IncrementGraph = {
  leaves: Number(process.env.WYW_BENCH_LEAVES ?? Math.max(2000, ...sizes)),
  groups: Number(process.env.WYW_BENCH_GROUPS ?? 30),
  depth: Number(process.env.WYW_BENCH_DEPTH ?? 5),
  templates: Number(process.env.WYW_BENCH_TEMPLATES ?? 2),
  fanout: Number(process.env.WYW_BENCH_FANOUT ?? 1),
  declarations: Number(process.env.WYW_BENCH_DECLARATIONS ?? 5),
  heavyEvery: Number(process.env.WYW_BENCH_HEAVY_EVERY ?? 100),
  heavyTemplates: Number(process.env.WYW_BENCH_HEAVY_TEMPLATES ?? 150),
  runtimeModules: Number(process.env.WYW_BENCH_RUNTIME_MODULES ?? 11000),
  sharedGroups: Number(process.env.WYW_BENCH_SHARED_GROUPS ?? 20),
  componentFields: Number(process.env.WYW_BENCH_COMPONENT_FIELDS ?? 40),
};
for (const [name, value] of Object.entries({...graph, repeats})) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
}
if (Math.max(...sizes) > graph.leaves || graph.groups > graph.leaves || graph.fanout > graph.groups) {
  throw new Error("Graph must contain enough leaves for all sizes and groups");
}
mkdirSync(history, {recursive: true});

if (process.argv.includes("--history")) {
  for (const entry of readdirSync(history, {withFileTypes: true})) {
    if (!entry.isDirectory()) {
      continue;
    }
    try {
      const report = readFileSync(path.join(history, entry.name, "summary.json"), "utf8");
      say(`${entry.name}\n${report}`);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
  }
} else {
  await main();
}

async function main() {
  const directory = realpathSync(mkdtempSync(path.join(history, `${new Date().toISOString().replaceAll(":", "-")}-`)));
  const fixture = path.join(directory, "fixture");
  writeIncrementGraph(fixture, graph);
  symlinkSync(path.resolve("node_modules"), path.join(fixture, "node_modules"), "dir");
  const metadata = {
    schema: 1,
    timeOrigin: performance.timeOrigin,
    graph,
    sizes,
    repeats,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()[0]?.model,
    parallel: wywBundlerOptions.parallel,
    webpack: webpack.version,
    wyw: JSON.parse(readFileSync("node_modules/@wyw-in-js/webpack-loader/package.json", "utf8")).version,
    linaria: JSON.parse(readFileSync("node_modules/@linaria/core/package.json", "utf8")).version,
    cache: "memory; new compiler per cold run",
    timing: "webpack compilation wall time; not WYW CPU time",
    stages: process.env.WYW_BENCH_STAGES === "1",
    webpackParallelism: Number(process.env.WYW_BENCH_WEBPACK_PARALLELISM ?? 100),
  };
  writeFileSync(path.join(directory, "metadata.json"), JSON.stringify(metadata, null, 2));
  const compiler = webpack({
    parallelism: Number(process.env.WYW_BENCH_WEBPACK_PARALLELISM ?? 100),
    plugins: metadata.stages ? [new WYWinJSDebugPlugin({dir: path.join(directory, "stages"), print: false})] : [],
    mode: "development",
    context: fixture,
    entry: path.join(fixture, "entry.js"),
    devtool: false,
    cache: {type: "memory"},
    output: {path: path.join(directory, "dist"), filename: "bundle.js"},
    resolve: {modules: [path.resolve("node_modules"), "node_modules"]},
    module: {
      rules: [
        {
          test: /(?:leaf-\d+|base)\.js$/,
          include: fixture,
          use: [{loader: require.resolve("@wyw-in-js/webpack-loader"), options: wywBundlerOptions}],
        },
        {test: /\.css$/, type: "asset/source"},
      ],
    },
    optimization: {minimize: false},
  });
  if (!compiler) {
    throw new Error("webpack did not create a compiler");
  }
  let pending: {resolve(stats: Stats): void; reject(error: Error): void} | undefined;
  let unexpected: Error | undefined;
  let measuring = false;
  const nextBuild = () =>
    new Promise<Stats>((resolve, reject) => {
      if (unexpected) {
        reject(unexpected);
        return;
      }
      const timer = setTimeout(() => {
        pending = undefined;
        reject(new Error("Compilation timed out after 120 seconds"));
      }, 120_000);
      pending = {
        resolve(stats) {
          clearTimeout(timer);
          resolve(stats);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        },
      };
    });
  const initial = nextBuild();
  const watcher = compiler.watch({aggregateTimeout: 300}, (error, stats) => {
    const recipient = pending;
    pending = undefined;
    const failure =
      error ??
      (!stats
        ? new Error("No compilation stats")
        : stats.hasErrors()
          ? new Error(stats.toString({all: false, errors: true}))
          : undefined);
    if (!recipient) {
      if (failure || measuring) {
        unexpected = failure ?? new Error("Unexpected extra compilation; sample would be ambiguous");
      }
    } else if (failure) {
      recipient.reject(failure);
    } else if (stats) {
      recipient.resolve(stats);
    }
  });
  const stop = () => {
    pending?.reject(new Error("Benchmark interrupted"));
  };
  if (!watcher) {
    throw new Error("webpack did not start watching");
  }
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const cold = await initial;
    appendFileSync(
      path.join(directory, "windows.jsonl"),
      `${JSON.stringify({kind: "cold", startedAt: cold.startTime, finishedAt: cold.endTime})}\n`
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    measuring = true;
    writeFileSync(path.join(directory, "cold.json"), JSON.stringify({timeMs: cold.endTime - cold.startTime}, null, 2));
    const scenarios: IncrementScenario[] = [
      ...sizes.map((size): IncrementScenario => ({kind: "leaf", size})),
      {kind: "group", size: 1},
      {kind: "root", size: 1},
      {kind: "composition", size: 1},
      {kind: "imports", size: 1},
    ];
    const selected = process.env.WYW_BENCH_SCENARIOS?.split(",");
    if (selected) {
      scenarios.splice(0, scenarios.length, ...scenarios.filter((scenario) => selected.includes(scenario.kind)));
    }
    const samples: IncrementSample[] = [];
    let revision = 0;
    let previousHash = cold.hash;
    for (let repetition = 0; repetition <= repeats; repetition += 1) {
      const rotated = [
        ...scenarios.slice(repetition % scenarios.length),
        ...scenarios.slice(0, repetition % scenarios.length),
      ];
      for (const scenario of rotated) {
        await new Promise<void>((resolve) => setTimeout(resolve, 350));
        revision += 1;
        const completed = nextBuild();
        const started = performance.now();
        const files = changeIncrementGraph(fixture, graph, scenario, revision);
        const stats = await completed;
        appendFileSync(
          path.join(directory, "windows.jsonl"),
          `${JSON.stringify({...scenario, repetition, startedAt: stats.startTime, finishedAt: stats.endTime})}\n`
        );
        if (!stats.hash || stats.hash === previousHash) {
          throw new Error(`No output change for ${scenario.kind}:${scenario.size}`);
        }
        previousHash = stats.hash;
        const builtLeaves = [...stats.compilation.modules].filter(
          (module) =>
            stats.compilation.builtModules.has(module) && /[/\\]leaf-\d+\.js$/.test(module.nameForCondition() ?? "")
        ).length;
        const expectedLeaves =
          scenario.kind === "leaf"
            ? scenario.size
            : scenario.kind === "composition"
              ? graph.leaves
              : scenario.kind === "root"
                ? Array.from({length: graph.leaves}, (_, leaf) => leaf).filter((leaf) =>
                    Array.from(
                      {length: graph.fanout},
                      (_, offset) => ((leaf % graph.groups) + offset) % graph.groups
                    ).some((group) => group < graph.sharedGroups)
                  ).length
                : Array.from({length: graph.leaves}, (_, leaf) => leaf).filter((leaf) =>
                    Array.from(
                      {length: graph.fanout},
                      (_, offset) => ((leaf % graph.groups) + offset) % graph.groups
                    ).includes(0)
                  ).length;
        if (builtLeaves !== expectedLeaves) {
          throw new Error(
            `Ambiguous invalidation for ${scenario.kind}:${scenario.size}: expected ${expectedLeaves} leaves, built ${builtLeaves}`
          );
        }
        const sample: IncrementSample = {
          ...scenario,
          repetition,
          timeMs: stats.endTime - stats.startTime,
          latencyMs: performance.now() - started,
          builtModules: [...stats.compilation.modules].filter((module) => stats.compilation.builtModules.has(module))
            .length,
          hash: stats.hash,
        };
        appendFileSync(
          path.join(directory, "samples.jsonl"),
          `${JSON.stringify({...sample, files, warmup: repetition === 0})}\n`
        );
        if (repetition > 0) {
          samples.push(sample);
        }
        say(
          `[wyw-increments] ${scenario.kind}:${scenario.size} #${repetition} ${sample.timeMs}ms (${sample.builtModules} modules)`
        );
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 350));
    if (unexpected) {
      throw unexpected;
    }
    const summary = {metadata, coldMs: cold.endTime - cold.startTime, scenarios: summarizeIncrements(samples)};
    writeFileSync(path.join(directory, "summary.json"), JSON.stringify(summary, null, 2));
    say(JSON.stringify(summary, null, 2));
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await new Promise<void>((resolve, reject) => watcher.close((error) => (error ? reject(error) : resolve())));
    await new Promise<void>((resolve, reject) => compiler.close((error) => (error ? reject(error) : resolve())));
    rmSync(fixture, {recursive: true, force: true});
    rmSync(path.join(directory, "dist"), {recursive: true, force: true});
  }
}
