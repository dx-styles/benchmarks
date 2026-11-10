# Experiment proposal

The issue to investigate is shared-dependency rebuild cost, not a claim that native resolution consumes 22 seconds of CPU.

An anonymized reference workload had 9370 `resolveImports` actions on a cold build (209 ms sum and union, peak overlap 1). A warmed shared-token edit had 8434 actions (22,065 ms sum, 1748 ms union, peak overlap 99). Most of that union overlapped `collect`. All resolve actions completed successfully. Thus neither a retry storm nor an increase in native resolver calls has been demonstrated.

The static dependency layer did make repeated symbol requests: 8433 records represented 2693 unique `(filename, source, imported)` tuples. The outer dependency resolver yields `resolveImports` before checking its fallback cache, while entrypoints also cache resolution tasks. A scoped memoization experiment may save action/promise overhead, but it must preserve dependency tracking and invalidation. Measure actual native calls before attributing improvement to native resolution.

This fixture uses object-member interpolations, barrel chains, dense consumers, shared classes and mixed runtime code. It is calibrated against WYW stage proportions; application-specific webpack work remains intentionally absent. All code is generated independently.

Suggested experiment:

1. Run the pinned baseline with WYW workers off, webpack parallelism 100. Save all per-scenario samples and interval statistics.
2. Repeat at webpack parallelism 1. Compare action counts and union as well as sum and wall time.
3. Change one engine variable at a time. For a local engine build, replace its entire compatible package stack, not just transform, and record its revision. Keep the baseline lockfile and results separately.
4. Alternate baseline/candidate runs with the same graph and repetitions. Check output-change and invalidation assertions; include small leaf edits as a control.
5. If introducing native-call instrumentation, report its count separately from `resolveImports` action count.

A reduction in inclusive duration sum alone is not a performance fix. Look for repeatable improvements in compilation wall time or measured synchronous/native work while preserving the result and invalidation breadth.

## Observed concurrency result

On the paired core runs included in `measurements/`, webpack concurrency 1 produced root-edit wall samples 4946/5614/5932 ms and resolve sums 74/95/101 ms (peak 1). Concurrency 100 produced wall 4374/4533/10493 ms and resolve sums 6573/7282/16821 ms (peak 100). The last sample is an outlier; do not claim an exact speedup from three repetitions.

Action count rose from 7306 to 7906, entirely in shared chains: leaf actions stayed at 7066, branch actions grew 200 to 700, and group actions 40 to 140. The number of distinct files stayed at 1460, and all actions succeeded. Multiple actions can occur within the same entrypoint generation. This suggests an experiment around deduplicating in-flight static export work, but does not establish extra native resolver calls. Preserve invalidation correctness and measure native calls separately.
