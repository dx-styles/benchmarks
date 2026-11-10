import {mkdirSync, writeFileSync} from "node:fs";
import path from "node:path";

export type IncrementGraph = {
  leaves: number;
  groups: number;
  depth: number;
  templates: number;
  fanout: number;
  declarations: number;
  heavyEvery: number;
  heavyTemplates: number;
  runtimeModules: number;
  sharedGroups: number;
  componentFields: number;
};
export type IncrementScenario = {kind: "leaf" | "group" | "root" | "composition" | "imports"; size: number};
export type IncrementSample = IncrementScenario & {
  repetition: number;
  timeMs: number;
  latencyMs: number;
  builtModules: number;
  hash: string;
};

export function incrementSizes(value: string) {
  const sizes = value === "1" ? [1, 10, 100, 1000] : value.split(",").map(Number);
  if (sizes.some((size) => !Number.isSafeInteger(size) || size < 1)) {
    throw new Error("WYW_BENCH_INCREMENTS must be 1 or a comma-separated list of positive sizes");
  }
  return [...new Set(sizes)].sort((a, b) => a - b);
}

export function writeIncrementGraph(directory: string, graph: IncrementGraph) {
  mkdirSync(directory, {recursive: true});
  const write = (name: string, content: string) => writeFileSync(path.join(directory, name), content);
  write("root.js", "export const space = 4;\n");
  write("alternate.js", "export const token = 97;\n");
  for (let group = 0; group < graph.groups; group += 1) {
    write(`group-${group}.js`, groupSource(group, graph, 0));
    for (let level = 0; level < graph.depth; level += 1) {
      const parent = level === 0 ? `group-${group}` : `branch-${group}-${level - 1}`;
      write(
        `branch-${group}-${level}.js`,
        `import {token as parent} from './${parent}.js';\nexport {tokens} from './${parent}.js';\nexport const token = parent + 1;\n`
      );
    }
  }
  write(
    "base.js",
    "import {css} from '@linaria/core';\nexport const base = css`display: flex; align-items: center;`;\n"
  );
  for (let leaf = 0; leaf < graph.leaves; leaf += 1) {
    write(`leaf-${leaf}.js`, leafSource(leaf, graph, 0));
  }
  for (let index = 0; index < graph.runtimeModules; index += 1) {
    const parent =
      index > 0 ? `import {value as parent} from './runtime-${Math.floor((index - 1) / 2)}.js';` : "const parent = 0;";
    write(
      `runtime-${index}.js`,
      `${parent}\nexport const value = parent + ${index};\nexport function model(input) { return {${Array.from({length: 40}, (_, field) => `field${field}: input.field${field} ?? value + ${field}`).join(",")}}; }\nglobalThis['model${index}'] = model;`
    );
  }
  write(
    "entry.js",
    Array.from(
      {length: graph.leaves},
      (_, leaf) =>
        `import {style as style${leaf}} from './leaf-${leaf}.js';\nglobalThis['fibrous${leaf}'] = style${leaf};`
    ).join("\n") +
      "\n" +
      Array.from({length: graph.runtimeModules}, (_, index) => `import './runtime-${index}.js';`).join("\n")
  );
}

function groupSource(group: number, graph: IncrementGraph, revision: number) {
  const root = group < graph.sharedGroups ? "import {space} from './root.js';" : "const space = 4;";
  return `${root}\nexport const token = space + ${group + revision};\nexport const tokens = {${Array.from({length: 32}, (_, index) => `s${index}: space + ${index + revision}`).join(",")}};\n`;
}

function leafSource(leaf: number, graph: IncrementGraph, revision: number) {
  const group = leaf % graph.groups;
  const imports = Array.from(
    {length: graph.fanout},
    (_, offset) =>
      `import {token as token${offset}} from './branch-${(group + offset) % graph.groups}-${graph.depth - 1}.js';`
  ).join("\n");
  const sum = Array.from({length: graph.fanout}, (_, offset) => `token${offset}`).join(" + ");
  const templates = leaf % graph.heavyEvery === graph.heavyEvery - 1 ? graph.heavyTemplates : graph.templates;
  const extra = Array.from(
    {length: templates - 1},
    (_, index) =>
      `export const variant${index} = css\`padding: ${(index + leaf) % 2 ? `\${tokens.s8 + ${index}}` : index + 4}px; ${Array.from({length: graph.declarations}, (_, declaration) => `&:nth-child(${declaration + 1}) { margin: ${declaration}px; padding: ${index % 8}px; border-radius: ${declaration % 6}px; }`).join(" ")}\`;`
  ).join("\n");
  return `import {css} from '@linaria/core';
${imports}
import {tokens} from './branch-${group}-${graph.depth - 1}.js';
const token = ${sum};
import {base} from './base.js';
export const style = css\`
  padding: \${token + tokens.s8}px;
  margin: ${revision}px;
  width: ${100 + (leaf % 100)}px;
  &.\${base} { gap: \${token + 1}px; }
  &:hover { opacity: 0.9; }
\`;
${extra}
export function render(input) {
  const fields = {${Array.from({length: graph.componentFields}, (_, index) => `field${index}: input.field${index} ? {value: input.field${index}, className: style, enabled: input.enabled !== false} : null`).join(",")}};
  return {fields, className: style, children: input.children};
}
`;
}

export function changeIncrementGraph(
  directory: string,
  graph: IncrementGraph,
  scenario: IncrementScenario,
  revision: number
) {
  const names: string[] = [];
  for (let index = 0; index < scenario.size; index += 1) {
    const name =
      scenario.kind === "root"
        ? "root.js"
        : scenario.kind === "composition"
          ? "base.js"
          : scenario.kind === "imports"
            ? `branch-${index}-${graph.depth - 1}.js`
            : `${scenario.kind}-${index}.js`;
    const source =
      scenario.kind === "leaf"
        ? leafSource(index, graph, revision)
        : scenario.kind === "composition"
          ? `import {css} from '@linaria/core';\nexport const base = css\`display: flex; gap: ${revision}px;\`;\n`
          : scenario.kind === "imports"
            ? `import {token as parent} from './group-${index}.js';\nexport {tokens} from './group-${index}.js';\nimport {token as extra} from './${revision % 2 ? "alternate" : `group-${index}`}.js';\nexport const token = parent + extra + ${revision};\n`
            : scenario.kind === "root"
              ? `export const space = ${4 + revision};\n`
              : groupSource(index, graph, revision);
    writeFileSync(path.join(directory, name), source);
    names.push(name);
  }
  return names;
}

export function summarizeIncrements(samples: IncrementSample[]) {
  const groups = new Map<string, IncrementSample[]>();
  for (const sample of samples) {
    const key = `${sample.kind}:${sample.size}`;
    const group = groups.get(key) ?? [];
    group.push(sample);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([scenario, group]) => {
    const times = group.map((sample) => sample.timeMs).sort((a, b) => a - b);
    const middle = Math.floor(times.length / 2);
    return {
      scenario,
      n: times.length,
      minMs: times[0],
      medianMs: times.length % 2 ? times[middle] : (times[middle - 1] + times[middle]) / 2,
      maxMs: times[times.length - 1],
    };
  });
}
