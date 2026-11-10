# Fibrous: incremental WYW workload

A standalone webpack/Linaria workload for engine experiments, suitable as an optional `incremental/fibrous/` directory in dx-styles/benchmarks. It complements the existing Vite build lanes: a fresh build process is not a watcher rebuild. No application source, private packages, services or browser are required.

## Run

Node 24+, pnpm 12. Install the pinned dependency graph:

```sh
pnpm install --frozen-lockfile --ignore-scripts
node --test intervals.test.ts
pnpm bench
```

A run starts one cold compiler with memory cache, then changes generated files through webpack's filesystem watcher. One pass per scenario is warmup; the following three passes are measured. The order rotates. Generated files are isolated in the run directory and removed after the compiler closes. Each step must change output and rebuild the expected number of style consumers; an extra compilation fails the run. There are no artificial work loops or sleeps in the timed compilation. Quiescence and filesystem aggregation waits are outside webpack wall time, but inside the separately recorded edit latency where applicable.

Stage attribution disables WYW workers explicitly:

```sh
WYW_BENCH_STAGES=1 WYW_PARALLEL=0 pnpm bench
pnpm stages
```

`results/<run>/` contains metadata, `cold.json`, `samples.jsonl`, `summary.json`, compilation windows, and optional raw WYW traces plus `stage-summary.json`. Keep the metadata with any reported result. The lock pins the whole WYW stack, including processor-utils; pinning only webpack-loader can silently mix engine releases. The package does not load any external application config.

## Graph and scenarios

Default: 2000 style consumers, 30 token groups, five reexport levels, 6960 CSS templates, 11,000 ordinary JS modules. Every hundredth style module has 150 templates; the others have two. Styles repeatedly use shared object members and composed classes. Component functions coexist with style declarations, so transform and cleanup see runtime code. Twenty token groups depend on the root token; the rest stay independent. Changing the root currently invalidates 1340 consumers.

Scenarios: edit CSS in 1/10/100/1000 leaves, edit one group token, edit the root token, edit a composed class, and change an import edge while retaining the root dependency. Each edit uses a new value; outputs cannot be satisfied by an unchanged-content cache hit.

Configuration is via environment variables:

| Variable                        | Default | Meaning                                                                                    |
| ------------------------------- | ------: | ------------------------------------------------------------------------------------------ |
| `WYW_BENCH_INCREMENTS`          |     `1` | `1` means 1/10/100/1000; otherwise comma-separated batch sizes. Use `1,1` for only size 1. |
| `WYW_BENCH_SCENARIOS`           |     all | Comma-separated `leaf,group,root,composition,imports`                                      |
| `WYW_BENCH_INCREMENT_REPEATS`   |       3 | Measured passes after warmup                                                               |
| `WYW_BENCH_LEAVES`              |    2000 | Style consumers                                                                            |
| `WYW_BENCH_GROUPS`              |      30 | Token groups                                                                               |
| `WYW_BENCH_SHARED_GROUPS`       |      20 | Groups depending on the root token                                                         |
| `WYW_BENCH_DEPTH`               |       5 | Reexport chain depth                                                                       |
| `WYW_BENCH_FANOUT`              |       1 | Token-group imports per consumer; higher values create overlapping dependency paths        |
| `WYW_BENCH_TEMPLATES`           |       2 | Templates in ordinary consumers                                                            |
| `WYW_BENCH_HEAVY_EVERY`         |     100 | Frequency of dense consumers                                                               |
| `WYW_BENCH_HEAVY_TEMPLATES`     |     150 | Templates in dense consumers                                                               |
| `WYW_BENCH_DECLARATIONS`        |       5 | Nested static rules per extra template                                                     |
| `WYW_BENCH_COMPONENT_FIELDS`    |      40 | Runtime descriptor fields per style consumer                                               |
| `WYW_BENCH_RUNTIME_MODULES`     |   11000 | Non-style module tree                                                                      |
| `WYW_BENCH_WEBPACK_PARALLELISM` |     100 | Webpack module concurrency, independent of WYW workers                                     |
| `WYW_PARALLEL`                  |       1 | WYW worker setting; use 0 for traces                                                       |

## Resolver experiment

Run the same graph with WYW workers off and webpack concurrency 100 versus 1:

```sh
WYW_BENCH_INCREMENTS=1,1 WYW_BENCH_SCENARIOS=leaf,root WYW_BENCH_STAGES=1 WYW_PARALLEL=0 WYW_BENCH_WEBPACK_PARALLELISM=100 pnpm bench
WYW_BENCH_INCREMENTS=1,1 WYW_BENCH_SCENARIOS=leaf,root WYW_BENCH_STAGES=1 WYW_PARALLEL=0 WYW_BENCH_WEBPACK_PARALLELISM=1 pnpm bench
pnpm stages
```

The stage report includes count, sum, interval union and peak overlap for each action. `resolveImports` times asynchronous action lifetimes, including waits for cached promises. Its sum can exceed compilation wall time, and its union can overlap `collect`; neither is resolver CPU time. A repeated action does not prove another native resolver call. Compare wall time and union alongside the sum before proposing an optimization.

## Calibration limits

The reference was an anonymized large private application, measured on Apple M5 Max, Node 24.19.0, WYW 2.7.0 and Linaria 8.2.0. A diagnostic serial reference had cold transform/collect/resolve/extract sums of 3989/2178/209/129 ms. An initial clean-install calibration here measured 3554/2168/210/139 ms. This is a stage-profile match, not an assertion that the entire application has been reproduced.

Reference default-worker wall times were 17.161 s cold, 3.886 s for a leaf edit and 8.146 s for a shared-token edit. The serial traced reference was 22.755/3.623/10.667 s. Synthetic compilation and especially leaf rebuilds are faster because application bundler/plugin work is absent. Synthetic CSS is consumed as source assets rather than extracted for browser HMR. Do not compare its whole-build speed directly to the existing Vite market lanes or use it as a library ranking. OS filesystem caches are not flushed. Run experiments serially on an otherwise idle machine; compare matching settings and retain ranges.
