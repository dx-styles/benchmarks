/**
 * Write each lane as a standalone Vite project under work.noindex/<lane>/ and install
 * it from its committed lockfile (locks/<lane>.json) with `npm ci`; a lane without a
 * lockfile is installed with `npm install` and its lockfile is saved. Then assert
 * with `npm ls` that every watched package has exactly one installed version, the
 * pinned one. (The .noindex suffix keeps Spotlight from indexing fresh installs.)
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import type { LaneSource } from "../generators/common.ts";
import { RECIPES, SLOTS } from "../scene/catalog.ts";
import { AGE_PINS, type Lane } from "./lanes.ts";
import { ROOT, run } from "./util.ts";

export const WORK = join(ROOT, "work.noindex");
export const LOCKS = join(ROOT, "locks");
export const laneDir = (lane: Lane): string => join(WORK, lane.id);

const catalogGen = (): string =>
  [
    "// Generated from scene/catalog.ts — do not edit by hand.",
    `export const TAGS: Record<string, string> = ${JSON.stringify(Object.fromEntries(SLOTS.map((s) => [s.name, s.tag])), null, 2)};`,
    "",
    `export const RECIPE_KEYS: Record<string, string[]> = ${JSON.stringify(Object.fromEntries(RECIPES.map((r) => [r.name, Object.keys(r.variants)])))};`,
    "",
    `export const DEFAULTS: Record<string, string> = ${JSON.stringify(Object.fromEntries(RECIPES.map((r) => [r.name, r.defaultVariant])), null, 2)};`,
    "",
  ].join("\n");

const indexHtml = (lane: Lane): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${lane.label}</title>
    <style>body { margin: 0; }</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const mainTsx = (source: LaneSource): string =>
  [
    'import { StrictMode } from "react";',
    'import { createRoot } from "react-dom/client";',
    "",
    'import { App } from "./App";',
    ...(source.mainImports ?? []).map((path) => `import "${path}";`),
    "",
    'createRoot(document.getElementById("root")!).render(',
    "  <StrictMode>",
    "    <App />",
    "  </StrictMode>,",
    ");",
    "",
  ].join("\n");

/** The same build settings for every lane; only the styling plugin differs. */
const viteConfig = (source: LaneSource): string =>
  [
    'import react from "@vitejs/plugin-react";',
    'import { defineConfig } from "vite";',
    ...source.vite.imports,
    "",
    "export default defineConfig({",
    '  base: "./",',
    '  cacheDir: ".vite-cache",',
    "  define: { __BENCH_CARDS__: JSON.stringify(Number(process.env.BENCH_CARDS ?? 120)) },",
    `  plugins: [${[...(source.vite.first ?? []), "react()", ...source.vite.plugins].join(", ")}],`,
    ...(source.vite.extra ?? []).map((line) => `  ${line},`),
    "  build: {",
    '    target: "es2022",',
    "    sourcemap: false,",
    "    reportCompressedSize: false,",
    "    modulePreload: false,",
    "    cssCodeSplit: false,",
    '    outDir: "dist",',
    "    emptyOutDir: true,",
    "  },",
    "});",
    "",
  ].join("\n");

export interface PreparedLane {
  lane: Lane;
  dir: string;
  source: LaneSource;
}

const generatorFor = async (lib: string) =>
  (await import(join(ROOT, "generators", `${lib}.ts`))) as {
    generate: (layout: Lane["layout"], options: Record<string, boolean | number>) => LaneSource;
  };

/** (Re)write the lane's sources; keeps node_modules. */
export const writeLane = async (lane: Lane): Promise<PreparedLane> => {
  const dir = laneDir(lane);
  const { generate } = await generatorFor(lane.lib);
  const source = generate(lane.layout, lane.options ?? {});
  for (const sub of ["src", "dist", ".vite-cache", ...(source.cleanDirs ?? [])]) {
    await rm(join(dir, sub), { recursive: true, force: true });
  }
  const files: Record<string, string> = {
    "package.json": `${JSON.stringify(
      {
        name: `lane-${lane.id}`.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        private: true,
        type: "module",
        dependencies: lane.deps,
        overrides: { ...AGE_PINS, ...lane.overrides },
      },
      null,
      2,
    )}\n`,
    "index.html": indexHtml(lane),
    "vite.config.ts": viteConfig(source),
    "src/main.tsx": mainTsx(source),
    "src/catalog.gen.ts": catalogGen(),
    ...source.files,
  };
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, rel)), { recursive: true });
    await writeFile(join(dir, rel), content);
  }
  for (const file of ["App.tsx", "check.ts"]) {
    await cp(join(ROOT, "render", file), join(dir, "src", file));
  }
  return { lane, dir, source };
};

interface LsNode {
  version?: string;
  dependencies?: Record<string, LsNode>;
}

/** Every installed version of each watched package, from `npm ls --all --json`. */
const installedVersions = (tree: LsNode, names: Set<string>): Map<string, Set<string>> => {
  const found = new Map<string, Set<string>>();
  const walk = (node: LsNode): void => {
    for (const [name, child] of Object.entries(node.dependencies ?? {})) {
      if (names.has(name) && child.version) {
        const set = found.get(name) ?? new Set<string>();
        set.add(child.version);
        found.set(name, set);
      }
      walk(child);
    }
  };
  walk(tree);
  return found;
};

export const installLane = async (prepared: PreparedLane, log: (line: string) => void): Promise<void> => {
  const { lane, dir } = prepared;
  const lock = join(LOCKS, `${lane.id}.json`);
  await rm(join(dir, "node_modules"), { recursive: true, force: true });
  if (existsSync(lock)) {
    await cp(lock, join(dir, "package-lock.json"));
    await run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: dir });
  } else {
    await rm(join(dir, "package-lock.json"), { force: true });
    await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: dir });
    await mkdir(LOCKS, { recursive: true });
    await cp(join(dir, "package-lock.json"), lock);
    log(`[prepare] ${lane.id}: new lockfile locks/${lane.id}.json`);
  }
  const ls = await run("npm", ["ls", "--all", "--json"], { cwd: dir, allowFail: true });
  const tree = JSON.parse(ls.stdout) as LsNode;
  const versions = installedVersions(tree, new Set(Object.keys(lane.watch)));
  const problems: string[] = [];
  for (const [name, expected] of Object.entries(lane.watch)) {
    const got = [...(versions.get(name) ?? [])];
    if (got.length !== 1 || got[0] !== expected) problems.push(`${name}: expected ${expected}, installed ${got.join(", ") || "none"}`);
  }
  if (problems.length > 0) throw new Error(`[prepare] ${lane.id}: ${problems.join("; ")}`);
  log(`[prepare] ${lane.id}: installed, ${Object.keys(lane.watch).length} pinned packages deduped`);
};

export const readLock = async (lane: Lane): Promise<string> => readFile(join(LOCKS, `${lane.id}.json`), "utf8");
