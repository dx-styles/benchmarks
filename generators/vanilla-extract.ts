// vanilla-extract: a theme contract + a theme class (createThemeContract / createTheme)
// in a .css.ts file, `style()` for structural slots and `recipe()` from
// @vanilla-extract/recipes for variant families, one .css.ts per module.
import { MODULES, SLOTS } from "../scene/catalog.ts";
import type { Rule, Slot } from "../scene/ir.ts";
import { TOKENS } from "../scene/tokens.ts";
import { HEADER, jsRule, key, type LaneSource } from "./common.ts";

const LIB = "vanilla-extract";
const ref = (path: string): string => `t.${path}`;
// vanilla-extract takes simple pseudo selectors as top-level keys (":hover").
const obj = (rule: Rule, indent: string): string => jsRule(rule, ref, indent, (s) => s);

const slotSource = (slot: Slot): string => {
  if (slot.kind === "flat") return `export const ${slot.name} = style(${obj(slot.rule, "  ")});`;
  const variants = Object.entries(slot.variants)
    .map(([name, rule]) => `      ${name}: ${obj(rule, "        ")},`)
    .join("\n");
  return [
    `export const ${slot.name} = recipe({`,
    `  base: ${obj(slot.base, "    ")},`,
    `  variants: {\n    variant: {\n${variants}\n    },\n  },`,
    `  defaultVariants: { variant: ${JSON.stringify(slot.defaultVariant)} },`,
    "});",
  ].join("\n");
};

export const generate = (): LaneSource => {
  const files: Record<string, string> = {};
  const shape = Object.entries(TOKENS)
    .map(([group, entries]) => `  ${key(group)}: { ${Object.keys(entries).map((n) => `${key(n)}: null`).join(", ")} },`)
    .join("\n");
  const values = Object.entries(TOKENS)
    .map(([group, entries]) => `  ${key(group)}: {\n${Object.entries(entries).map(([n, v]) => `    ${key(n)}: ${JSON.stringify(v)},`).join("\n")}\n  },`)
    .join("\n");
  files["src/styles/tokens.css.ts"] = [
    HEADER(LIB),
    'import { createTheme, createThemeContract } from "@vanilla-extract/css";',
    "",
    `export const t = createThemeContract({\n${shape}\n});`,
    "",
    `export const theme = createTheme(t, {\n${values}\n});`,
    "",
  ].join("\n");
  for (const module of MODULES) {
    const slots = SLOTS.filter((slot) => slot.module === module);
    const imports = [
      slots.some((s) => s.kind === "flat") ? 'import { style } from "@vanilla-extract/css";' : "",
      slots.some((s) => s.kind === "recipe") ? 'import { recipe } from "@vanilla-extract/recipes";' : "",
    ].filter(Boolean);
    files[`src/styles/${module}.css.ts`] = [HEADER(LIB), ...imports, "", 'import { t } from "./tokens.css";', "", ...slots.map(slotSource), ""].join("\n");
  }
  files["src/ui.ts"] = [
    HEADER(LIB),
    'import { createElement, type ReactNode } from "react";',
    "",
    'import { TAGS } from "./catalog.gen";',
    'import { isRecipe, variantOf } from "./check";',
    'import { theme } from "./styles/tokens.css";',
    ...MODULES.map((m, i) => `import * as m${i} from "./styles/${m}.css";`),
    "",
    `const S: Record<string, any> = { ${MODULES.map((_, i) => `...m${i}`).join(", ")} };`,
    "const appRoot = `${theme} ${S.appRoot}`;",
    "",
    "export const ui = {",
    "  node(s: string, v: string | undefined, props: Record<string, unknown>, children: ReactNode) {",
    '    const className = s === "appRoot" ? appRoot : isRecipe(s) ? S[s]({ variant: variantOf(s, v) }) : S[s];',
    "    return createElement(TAGS[s]!, { ...props, className }, children);",
    "  },",
    "};",
    "",
  ].join("\n");
  return {
    files,
    vite: {
      imports: ['import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";'],
      plugins: ["vanillaExtractPlugin()"],
    },
  };
};
