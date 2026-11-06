// Linaria: `css` tagged templates, one class per structural slot and per variant
// (Linaria has no recipe API), tokens as an evaluated object of CSS variables declared
// on the app root. Built by the same wyw-in-js engine as dx-styles: the lane gauges
// the engine's share of the dx-styles build, not a competitor.
import { MODULES, SLOTS } from "../scene/catalog.ts";
import type { Rule, Slot } from "../scene/ir.ts";
import { cssNested, HEADER, type LaneSource, plainVarObject, rootVarDecls } from "./common.ts";

const LIB = "linaria";
const interp = (path: string): string => `\${t.${path}}`;
const block = (rule: Rule): string => `css\`\n${cssNested(rule, interp, "    ")}\n  \``;

const slotSource = (slot: Slot): string => {
  if (slot.kind === "flat") {
    const rule = slot.name === "appRoot" ? { ...slot.rule, decls: { ...rootVarDecls(), ...slot.rule.decls } } : slot.rule;
    return `export const ${slot.name} = ${block(rule)};`;
  }
  const entries = [`  base: ${block(slot.base)},`, ...Object.entries(slot.variants).map(([name, rule]) => `  ${name}: ${block(rule)},`)];
  return `export const ${slot.name} = {\n${entries.join("\n")}\n};`;
};

export const generate = (): LaneSource => {
  const files: Record<string, string> = {};
  files["src/styles/tokens.ts"] = [HEADER(LIB), `export const t = ${plainVarObject()};`, ""].join("\n");
  for (const module of MODULES) {
    const slots = SLOTS.filter((slot) => slot.module === module);
    files[`src/styles/${module}.ts`] = [HEADER(LIB), 'import { css } from "@linaria/core";', "", 'import { t } from "./tokens";', "", ...slots.map(slotSource), ""].join("\n");
  }
  files["src/ui.ts"] = [
    HEADER(LIB),
    'import { createElement, type ReactNode } from "react";',
    'import { cx } from "@linaria/core";',
    "",
    'import { TAGS } from "./catalog.gen";',
    'import { isRecipe, variantOf } from "./check";',
    ...MODULES.map((m, i) => `import * as m${i} from "./styles/${m}";`),
    "",
    `const S: Record<string, any> = { ${MODULES.map((_, i) => `...m${i}`).join(", ")} };`,
    "",
    "export const ui = {",
    "  node(s: string, v: string | undefined, props: Record<string, unknown>, children: ReactNode) {",
    "    const className = isRecipe(s) ? cx(S[s].base, S[s][variantOf(s, v)]) : S[s];",
    "    return createElement(TAGS[s]!, { ...props, className }, children);",
    "  },",
    "};",
    "",
  ].join("\n");
  return {
    files,
    vite: {
      imports: ['import wyw from "@wyw-in-js/vite";'],
      plugins: ["wyw({ displayName: false, prefixer: false })"],
    },
  };
};
