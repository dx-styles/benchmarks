# Measured results

Apple M5 Max, Node 24.19.0, webpack 5.108.4, WYW 2.7.0, Linaria 8.2.0. Cold: one sample. Rebuilds: median of three after warmup. Timings in milliseconds.

Serial traced full matrix (`WYW_PARALLEL=0`, webpack concurrency 100):

| Scenario | Compilation | transform sum | collect sum | resolve sum | resolve union | resolve peak |
|---|---:|---:|---:|---:|---:|---:|
| cold:0 | 12282 | 3850.4 | 2439.9 | 243.0 | 243.0 | 1 |
| leaf:10 | 645 | 28.4 | 17.0 | 1.1 | 1.1 | 1 |
| leaf:100 | 1081 | 249.2 | 116.4 | 8.4 | 8.4 | 1 |
| leaf:1000 | 4896 | 1794.3 | 1135.5 | 86.2 | 86.2 | 1 |
| group:1 | 767 | 86.5 | 66.5 | 124.3 | 7.4 | 63 |
| root:1 | 5212 | 1951.2 | 1377.2 | 8420.1 | 1347.0 | 100 |
| composition:1 | 8239 | 3197.5 | 2143.4 | 11934.2 | 2848.4 | 100 |
| imports:1 | 784 | 94.0 | 68.9 | 161.7 | 10.5 | 63 |
| leaf:1 | 540 | 2.2 | 1.0 | 0.1 | 0.1 | 1 |

Action intervals overlap; neither sum nor union is CPU time. Raw sample ranges and metadata are retained in the adjacent directories.

Ordinary WYW worker baseline (same core leaf/root graph): cold 7568 ms; leaf median 431 ms (412–485); shared-token median 3488 ms (3474–3596).

The private reference has a substantially slower bundler baseline. This fixture reproduces cold WYW stages and broad shared invalidation, but does not reproduce the full application wall time. See README calibration limits and EXPERIMENT for the paired concurrency result.
