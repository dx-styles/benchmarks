# dx-styles benchmarks

Build time, bundle size, first paint and render parity of [dx-styles](https://dx-styles.dev),
eight other CSS-in-JS libraries and plain CSS Modules, all on one generated scene; plus the build of dx-styles
across [wyw-in-js](https://github.com/Anber/wyw-in-js) releases, the engine it compiles with.

The numbers of the last run are in [RESULTS.md](./RESULTS.md). This file explains what they
measure and how to reproduce them.

## Run it

```sh
npm ci
npx playwright install chromium
npm run bench
```

Node 24 or newer. A full run installs 26 lanes (about 2 GB under `work.noindex/`), waits 90 s,
and then takes about an hour; it writes `results/<time>-market.{json,md}`,
`results/<time>-wyw.{json,md}` and `RESULTS.md`. `npm run bench:market` and `npm run bench:wyw`
run one half; `npm run bench:diag` runs the two diagnostic lanes next to the lanes they explain.
Options: `--rounds=7`, `--fcp=10`, `--max-load=8`, `--no-install` (reuse installed lanes),
`--lanes=<id,…>`.

## The scene

For a separate webpack watcher workload focused on shared-dependency invalidation,
see [Fibrous](./incremental/fibrous/README.md). It includes cold builds, leaf/batch edits,
shared-token and composition edits, plus WYW action traces and a webpack concurrency
experiment. It has its own pinned pnpm installation and does not participate in the
Vite market rankings above.

Everything is generated from one description in `scene/`, so every library renders the same
page with the same design:

- **Tokens** (`scene/tokens.ts`): 104 tokens — six hues of ten steps each, semantic colors,
  spacing, radii, type, shadows and durations.
- **Catalog** (`scene/catalog.ts`): 45 structural slots and 34 recipe families (button, icon
  button, tab, chip, badge, tag, alert, toast, card, input, select, avatar, menu item, …) with
  **1,308 variants** in total, mostly intent × appearance × size. Each family exposes its
  combinations as one variant axis, so every library emits one rule per combination and none can
  shrink the catalog through compound variants.
- **Page** (`render/App.tsx`): an issue-tracker screen (sidebar, toolbar, 120 cards, table,
  form, dialog) and a gallery that renders every variant once: 3,642 elements.
- **Generators** (`generators/`): one per library, writing idiomatic code for it: its own token
  layer, its own API, its documented Vite integration. The styles live in 41 modules (one per
  component family plus a few layout modules) that import one shared token module.

| Lane | Version | Token layer | Styles | Build |
| --- | --- | --- | --- | --- |
| dx-styles | 1.5.0 | `createTokenContract` + `createTheme` | `css`, `recipe` | `@wyw-in-js/vite` 2.7.1 |
| Linaria | 8.3.0 | CSS variables on the app root, an evaluated JS object | `css` (a class per variant) | `@wyw-in-js/vite` 2.7.1 |
| vanilla-extract | 1.21.3 | `createThemeContract` + `createTheme` | `style`, `recipe` | `@vanilla-extract/vite-plugin` 5.2.6 |
| Panda | 2.4.0 | config tokens | `css`, `cva` | `panda codegen` + PostCSS |
| StyleX | 0.19.1 | `defineVars` | `stylex.create`, `stylex.props` | `@stylexjs/unplugin` |
| Compiled | 2.0.0 | CSS variables on the app root | `css`, `cssMap`, `css` prop | `@compiled/vite-plugin` 2.0.4, extraction on |
| Emotion | 11.14 | CSS variables on the app root | `@emotion/styled` objects | none (runtime) |
| styled-components | 6.6.0 | CSS variables on the app root | template literals | none (runtime) |
| next-yak | 9.10.3 | CSS variables on the app root | template literals, `css` per variant | `next-yak/vite` |
| CSS Modules | — | CSS variables on the app root | `.module.css` | Vite |

Linaria runs on the same engine as dx-styles (wyw-in-js 2.7.1), so its lane is a gauge of what the
shared engine costs, not a competitor. CSS Modules is the baseline with no CSS-in-JS at all.

## Lanes and method

- **One lane per setup.** Each lane (`harness/lanes.ts`) is a standalone Vite 8.3.5 + React
  19.3.1 project under `work.noindex/<lane>/` with exact pins, its committed lockfile
  (`locks/<lane>.json`) and its own `node_modules`, installed with `npm ci`. The whole wyw-in-js
  stack is pinned through `overrides` (its packages are not versioned in lockstep, so each release
  has its own set), and `npm ls` asserts that every pinned package has exactly one installed
  version.
- **Release age.** Third-party versions are the newest that were at least 7 days old when the
  lanes were pinned (2026-11-06), transitive ones included (`npm run check-release-age` checks
  every lockfile). Exempt: dx-styles, `@wyw-in-js/*` and `@linaria/*`, the measured engine and its
  products, and the browser-data packages `caniuse-lite` and `electron-to-chromium`.
- **Same build everywhere.** Every lane uses the same Vite config (`harness/prepare.ts`); only the
  styling plugin differs.
- **Order.** All lanes are installed in one session, then the harness waits 90 s, does one
  unrecorded warm-up build per lane, and runs 7 rounds. A round builds every lane cold and then
  warm, forward on even rounds and backward on odd ones. It starts only once the 1-minute load
  average is under 8, and every sample records the load.
- **Cold and warm.** A cold build first deletes `dist/`, the Vite cache and the library's
  generated files (Panda's `styled-system/`), and includes Panda's codegen. A warm build is the
  same build again with those in place. Times are wall clock around the Vite process; the tables
  give the median and the minimum.
- **Size.** The JS and CSS assets of `dist/`, raw and gzip -9. Runtime libraries ship their CSS
  inside the JS.
- **First paint.** Headless Chromium (Playwright) loads each built page from a local server in a
  fresh context and reads `first-contentful-paint` and `largest-contentful-paint`: 10 loads per
  lane after a warm-up, interleaved across lanes.
- **Render parity.** On the warm-up load the harness reads 22 computed properties (colors,
  borders, radii, padding, gap, type, shadow, opacity, width, height, …) of every element and
  compares them with the dx-styles lane. Hover, focus and active states are not compared.

## dx-styles across wyw-in-js releases

The `wyw` half builds the dx-styles scene on wyw-in-js 2.3.0, 2.4.4, 2.5.1, 2.6.0 and 2.7.1 with
dx-styles 1.3.0 (the release whose range accepts all of them), and adds dx-styles 1.4.1 on 2.4.4
and 2.7.1 and dx-styles 1.5.0 on 2.7.1 (1.5.0 requires 2.7.1). Each combination runs in two
layouts: the per-component modules above, and all styles in one module.

## What the run of 2026-11-06 shows

Full tables: [RESULTS.md](./RESULTS.md). Apple M3 Max, 16 cores, macOS 26.6.2, Node 24.4.1;
medians of 7 warm builds.

- **dx-styles across wyw-in-js releases.** With dx-styles 1.3.0 and per-component modules the
  build takes 1.43 s on wyw-in-js 2.3.0, 1.35 s on 2.4.4, 0.91 s on 2.5.1 and 0.68 s on 2.6.0
  and 2.7.1; with one styles module, 1.94 s → 1.78 → 1.34 → 0.78 → 0.78 s. Every step but 2.6.0
  → 2.7.1 is outside the noise (the ranges do not overlap), and each dx-styles release builds a
  byte-identical bundle on every wyw-in-js release.
- **dx-styles 1.4.1 on 2.4.4 → 1.5.0 on 2.7.1:** 1.34 s → 0.68 s (−49%) with per-component
  modules, 1.79 s → 0.78 s (−56%) with one module. The gain comes from the engine: on 2.7.1,
  dx-styles 1.4.1 and 1.5.0 build byte-identical bundles in the same time, and 1.5.0 requires
  wyw-in-js 2.7.1.
- **Libraries (warm build):** styled-components 0.16 s, Emotion 0.17 s, Panda 0.21 s, next-yak
  0.30 s, vanilla-extract 0.56 s, CSS Modules 0.66 s, dx-styles 0.68 s, Linaria 1.86 s, StyleX
  2.06 s, Compiled 5.93 s.
- **The Linaria lane** runs on the same engine as dx-styles, wyw-in-js 2.7.1. Its gap comes from
  the token model of the port: its styles interpolate tokens from a JS object that the engine
  evaluates for each of the 41 style modules, while dx-styles declares a token contract that its
  processors resolve without evaluation. Written as static CSS variables, the same Linaria scene
  builds in 0.38 s with an output of the same size (`npm run bench:diag`).
- **wyw-in-js worker threads** (`parallel`, experimental since 2.6.0, measured on 2.7.1 with
  `npm run bench:diag`) pay off where the engine evaluates a lot in every module: the Linaria
  lane goes from 1.88 s to 1.03 s. Elsewhere they give little or cost time: dx-styles with
  per-component modules 0.67 s → 0.58 s (the ranges touch), with one styles module 0.78 s →
  0.99 s (one file cannot be split across workers), Linaria with static CSS variables 0.38 s →
  0.43 s. Eight workers do no better than the default four (min(4, cores − 1)). The output is
  byte-identical with and without workers.
- **Render parity:** every lane but Compiled renders all 3,642 elements with the same computed
  styles as dx-styles. With its default class hash, Compiled 2.0.0 gives two atomic declarations,
  `color: var(--tk-color-danger600)` and `color: var(--tk-color-info800)`, the same class name, so
  5 elements get the wrong color (a known issue,
  [atlassian-labs/compiled#1423](https://github.com/atlassian-labs/compiled/issues/1423)); with
  its opt-in `collisionResistantHash`
  ([atlassian-labs/compiled#1920](https://github.com/atlassian-labs/compiled/pull/1920)) it
  renders the same as the others.

## Where dx-styles does not win

- **Build time.** The runtime libraries do no build-time extraction (styled-components 0.16 s,
  Emotion 0.17 s); Panda (0.21 s), next-yak (0.30 s) and vanilla-extract (0.56 s) build faster
  than dx-styles (0.68 s), and CSS Modules with no library at all (0.66 s) is level with it.
  Linaria with static CSS variables (0.38 s) shows what the dx-styles processors (token
  contract, recipes) cost on top of the shared engine: about 0.3 s on this scene.
- **Size.** dx-styles ships 99.4 KB gzip in total, more than the atomic engines (Compiled
  88.7 KB, Panda 89.2 KB, StyleX 89.5 KB), Emotion (93.5 KB), vanilla-extract (94.9 KB),
  next-yak (96.3 KB) and styled-components (97.2 KB). Its CSS is 382 KB raw against 314 KB for
  vanilla-extract, which hashes its token variable names; dx-styles keeps them readable
  (`--tk-color-accent600`) because they are the theming contract.
- **First paint.** dx-styles (162 ms) is level with CSS Modules, vanilla-extract and Linaria
  (156–160 ms), not ahead of them; the runtime libraries paint later (208–212 ms).

## Caveats

- One machine, one scene. Build times are wall clock and move with the machine's load; compare
  lanes within one run, not across machines.
- The scene is generated: it is large and regular on purpose, which is not how every app looks.
- First paint is measured on a fast local machine with no throttling; at this size it is
  dominated by React rendering the page.
