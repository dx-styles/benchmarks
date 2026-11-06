/**
 * Lanes: one directory per measured setup, each with its own package.json (exact
 * pins), lockfile and node_modules, so a lane's library resolves only its own
 * dependency tree and lanes can be interleaved without reinstalling.
 *
 * Third-party versions were the newest published at least 7 days before the lanes
 * were pinned (2026-11-06). dx-styles, @wyw-in-js/* and @linaria/* are exempt: they
 * are the measured engine and its own products, published from reviewed commits.
 */
import type { Layout } from "../generators/common.ts";

export const PINNED_ON = "2026-11-06";

export const BASE_DEPS = {
  react: "19.3.1",
  "react-dom": "19.3.1",
  vite: "8.3.5",
  "@vitejs/plugin-react": "6.1.2",
};

/**
 * The published package set of each wyw-in-js release (transform version), read from
 * the registry: the packages are not versioned in lockstep, and they pin each other
 * exactly, so the whole set is overridden together.
 */
export const WYW: Record<string, Record<string, string>> = {
  "2.3.0": { transform: "2.3.0", "processor-utils": "2.3.0", shared: "2.3.0", vite: "2.3.0" },
  "2.4.4": { transform: "2.4.4", "processor-utils": "2.4.1", shared: "2.4.0", vite: "2.4.4" },
  "2.5.1": { transform: "2.5.1", "processor-utils": "2.5.0", shared: "2.5.0", vite: "2.5.1" },
  "2.6.0": { transform: "2.6.0", "processor-utils": "2.6.0", shared: "2.6.0", vite: "2.6.0" },
  "2.7.1": { transform: "2.7.1", "processor-utils": "2.7.1", shared: "2.7.1", vite: "2.7.1" },
};

const wywStack = (version: string): { deps: Record<string, string>; overrides: Record<string, string> } => {
  const set = WYW[version];
  if (!set) throw new Error(`no package set for wyw ${version}`);
  const overrides = Object.fromEntries(Object.entries(set).map(([name, v]) => [`@wyw-in-js/${name}`, v]));
  return { deps: { "@wyw-in-js/vite": set.vite! }, overrides };
};

/**
 * Transitive packages whose newest in-range release was younger than the rule allows
 * when the lanes were pinned, held at the newest older release of the same major
 * (`npm run check-release-age` lists them). Applied to every lane; npm ignores an
 * override for a package a lane does not have.
 */
export const AGE_PINS: Record<string, string> = {
  "@babel/core@^7": "7.29.7",
  "@babel/generator@^7": "7.29.12",
  "@babel/helper-compilation-targets@^7": "7.29.7",
  "@babel/helper-module-transforms@^7": "7.29.7",
  "@babel/helper-string-parser@^7": "7.29.11",
  "@babel/helpers@^7": "7.29.10",
  "@babel/parser@^7": "7.29.12",
  "@babel/parser@^8": "8.0.10",
  "@babel/runtime@^7": "7.29.10",
  "@babel/traverse@^7": "7.29.12",
  "@babel/types@^8": "8.0.10",
  "@napi-rs/wasm-runtime@^1": "1.2.6",
  "baseline-browser-mapping@^2": "2.11.34",
  "enhanced-resolve@^5": "5.26.0",
  "is-core-module@^2": "2.17.0",
  "node-releases@^2": "2.0.61",
  "resolve@^1": "1.22.13",
  "semver@^6": "6.3.1",
  "tslib@^2": "2.8.1",
  "ws@^8": "8.22.0",
};

export interface Lane {
  id: string;
  group: "market" | "wyw";
  /** Generator module name under generators/. */
  lib: string;
  layout: Layout;
  /** Human label for the report. */
  label: string;
  deps: Record<string, string>;
  overrides: Record<string, string>;
  /** Packages whose single installed version the dedupe check asserts. */
  watch: Record<string, string>;
}

const lane = (
  id: string,
  group: Lane["group"],
  lib: string,
  layout: Layout,
  label: string,
  deps: Record<string, string>,
  overrides: Record<string, string> = {},
): Lane => {
  const all = { ...BASE_DEPS, ...deps };
  return {
    id,
    group,
    lib,
    layout,
    label,
    deps: all,
    overrides,
    watch: { ...all, ...overrides },
  };
};

const dxLane = (group: Lane["group"], layout: Layout, dx: string, wyw: string): Lane => {
  const stack = wywStack(wyw);
  return lane(
    group === "market" ? "market-dx-styles" : `wyw-${layout}-dx${dx}-wyw${wyw}`,
    group,
    "dx-styles",
    layout,
    group === "market" ? `dx-styles ${dx}` : `dx-styles ${dx} · wyw ${wyw}`,
    { "dx-styles": dx, ...stack.deps },
    stack.overrides,
  );
};

/** dx-styles × wyw-in-js combinations of the version series (dx-styles 1.3.0 accepts wyw ≥ 2.3.0). */
export const SERIES: [string, string][] = [
  ["1.3.0", "2.3.0"],
  ["1.3.0", "2.4.4"],
  ["1.3.0", "2.5.1"],
  ["1.3.0", "2.6.0"],
  ["1.3.0", "2.7.1"],
  ["1.4.1", "2.4.4"],
  ["1.4.1", "2.7.1"],
  ["1.5.0", "2.7.1"],
];

const linaria = wywStack("2.7.1");

export const LANES: Lane[] = [
  dxLane("market", "app", "1.5.0", "2.7.1"),
  lane("market-linaria", "market", "linaria", "app", "Linaria 8.3.0", { "@linaria/core": "8.3.0", ...linaria.deps }, linaria.overrides),
  lane("market-vanilla-extract", "market", "vanilla-extract", "app", "vanilla-extract 1.21.3", {
    "@vanilla-extract/css": "1.21.3",
    "@vanilla-extract/recipes": "0.5.7",
    "@vanilla-extract/vite-plugin": "5.2.6",
  }),
  lane("market-panda", "market", "panda", "app", "Panda 2.4.0", { "@pandacss/dev": "2.4.0", postcss: "8.5.32" }),
  lane("market-stylex", "market", "stylex", "app", "StyleX 0.19.1", { "@stylexjs/stylex": "0.19.1", "@stylexjs/unplugin": "0.19.1" }),
  lane(
    "market-compiled",
    "market",
    "compiled",
    "app",
    "Compiled 2.0.0",
    { "@compiled/react": "2.0.0", "@compiled/vite-plugin": "2.0.4" },
  ),
  lane("market-emotion", "market", "emotion", "app", "Emotion 11.14", { "@emotion/react": "11.14.0", "@emotion/styled": "11.14.1" }),
  lane("market-styled-components", "market", "styled-components", "app", "styled-components 6.6.0", { "styled-components": "6.6.0" }),
  lane("market-next-yak", "market", "next-yak", "app", "next-yak 9.10.3", { "next-yak": "9.10.3" }),
  lane("market-css-modules", "market", "css-modules", "app", "CSS Modules (no library)", {}),
  ...(["app", "single"] as const).flatMap((layout) => SERIES.map(([dx, wyw]) => dxLane("wyw", layout, dx, wyw))),
];

export const laneById = (id: string): Lane => {
  const found = LANES.find((l) => l.id === id);
  if (!found) throw new Error(`unknown lane ${id}`);
  return found;
};
