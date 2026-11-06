// Panda: tokens in panda.config.ts, `css()` for structural slots and `cva()` for variant
// families, extracted by Panda's PostCSS plugin after `panda codegen`.
import { MODULES, SLOTS } from "../scene/catalog.ts";
import type { Rule, Slot } from "../scene/ir.ts";
import { TOKENS } from "../scene/tokens.ts";
import { HEADER, jsRule, key, type LaneSource } from "./common.ts";

const LIB = "panda";

const CATEGORY: Record<string, string> = {
  color: "colors",
  space: "spacing",
  radius: "radii",
  font: "fonts",
  fontSize: "fontSizes",
  fontWeight: "fontWeights",
  leading: "lineHeights",
  shadow: "shadows",
  duration: "durations",
};

const ref = (path: string): string => {
  const [group, name] = path.split(".");
  return JSON.stringify(`{${CATEGORY[group!]}.${name}}`);
};

const CONDITION: Record<string, string> = { ":hover": "_hover", ":active": "_active", ":focus-visible": "_focusVisible", ":disabled": "_disabled" };
const obj = (rule: Rule, indent: string): string => jsRule(rule, ref, indent, (s) => CONDITION[s]!).replace(/"(_\w+)":/g, "$1:");

const slotSource = (slot: Slot): string => {
  if (slot.kind === "flat") return `export const ${slot.name} = css(${obj(slot.rule, "  ")});`;
  const variants = Object.entries(slot.variants)
    .map(([name, rule]) => `      ${name}: ${obj(rule, "        ")},`)
    .join("\n");
  return [
    `export const ${slot.name} = cva({`,
    `  base: ${obj(slot.base, "    ")},`,
    `  variants: {\n    variant: {\n${variants}\n    },\n  },`,
    `  defaultVariants: { variant: ${JSON.stringify(slot.defaultVariant)} },`,
    "});",
  ].join("\n");
};

export const generate = (): LaneSource => {
  const files: Record<string, string> = {};
  const tokens = Object.entries(TOKENS)
    .map(
      ([group, entries]) =>
        `      ${CATEGORY[group]}: {\n${Object.entries(entries)
          .map(([n, v]) => `        ${key(n)}: { value: ${JSON.stringify(v)} },`)
          .join("\n")}\n      },`,
    )
    .join("\n");
  files["panda.config.ts"] = [
    HEADER(LIB),
    'import { defineConfig } from "@pandacss/dev";',
    "",
    "export default defineConfig({",
    "  preflight: false,",
    '  include: ["./src/**/*.{ts,tsx}"],',
    "  exclude: [],",
    '  outdir: "styled-system",',
    `  theme: {\n    tokens: {\n${tokens}\n    },\n  },`,
    "});",
    "",
  ].join("\n");
  files["postcss.config.cjs"] = 'module.exports = { plugins: { "@pandacss/dev/postcss": {} } };\n';
  files["src/index.css"] = "@layer reset, base, tokens, recipes, utilities;\n";
  for (const module of MODULES) {
    const slots = SLOTS.filter((slot) => slot.module === module);
    const apis = [...new Set(slots.map((slot) => (slot.kind === "flat" ? "css" : "cva")))].sort();
    files[`src/styles/${module}.ts`] = [HEADER(LIB), `import { ${apis.join(", ")} } from "../../styled-system/css";`, "", ...slots.map(slotSource), ""].join("\n");
  }
  files["src/ui.ts"] = [
    HEADER(LIB),
    'import { createElement, type ReactNode } from "react";',
    "",
    'import { TAGS } from "./catalog.gen";',
    'import { isRecipe, variantOf } from "./check";',
    ...MODULES.map((m, i) => `import * as m${i} from "./styles/${m}";`),
    "",
    `const S: Record<string, any> = { ${MODULES.map((_, i) => `...m${i}`).join(", ")} };`,
    "",
    "export const ui = {",
    "  node(s: string, v: string | undefined, props: Record<string, unknown>, children: ReactNode) {",
    "    const className = isRecipe(s) ? S[s]({ variant: variantOf(s, v) }) : S[s];",
    "    return createElement(TAGS[s]!, { ...props, className }, children);",
    "  },",
    "};",
    "",
  ].join("\n");
  return {
    files,
    vite: { imports: [], plugins: [] },
    mainImports: ["./index.css"],
    codegen: ["node_modules/.bin/panda", "codegen", "--silent"],
    cleanDirs: ["styled-system"],
  };
};
