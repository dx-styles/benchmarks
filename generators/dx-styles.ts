// dx-styles: a token contract + a theme (createTokenContract / createTheme), `css()` for
// structural slots and `recipe()` for variant families. Built by wyw-in-js.
import { MODULES, SLOTS } from "../scene/catalog.ts";
import type { Slot } from "../scene/ir.ts";
import { TOKENS } from "../scene/tokens.ts";
import { HEADER, jsRule, key, type LaneSource, type Layout } from "./common.ts";

const LIB = "dx-styles";
const ref = (path: string): string => `t.${path}`;

const contractShape = (): string =>
  `{\n${Object.entries(TOKENS)
    .map(([group, entries]) => `  ${key(group)}: { ${Object.keys(entries).map((n) => `${key(n)}: null`).join(", ")} },`)
    .join("\n")}\n}`;

const themeValues = (): string =>
  `{\n${Object.entries(TOKENS)
    .map(
      ([group, entries]) =>
        `  ${key(group)}: {\n${Object.entries(entries)
          .map(([n, v]) => `    ${key(n)}: ${JSON.stringify(v)},`)
          .join("\n")}\n  },`,
    )
    .join("\n")}\n}`;

const tokensSource = (): string =>
  [
    `export const t = createTokenContract(${contractShape()}, { prefix: "tk" });`,
    "",
    `export const theme = createTheme(t, ${themeValues()});`,
  ].join("\n");

const slotSource = (slot: Slot): string => {
  if (slot.kind === "flat") return `export const ${slot.name} = css(${jsRule(slot.rule, ref)});`;
  const variants = Object.entries(slot.variants)
    .map(([name, rule]) => `      ${name}: ${jsRule(rule, ref, "        ")},`)
    .join("\n");
  return [
    `export const ${slot.name} = recipe({`,
    `  base: ${jsRule(slot.base, ref, "    ")},`,
    `  variants: {\n    variant: {\n${variants}\n    },\n  },`,
    `  defaultVariants: { variant: ${JSON.stringify(slot.defaultVariant)} },`,
    "});",
  ].join("\n");
};

const uiSource = (imports: string[], spreads: string[]): string =>
  [
    HEADER(LIB),
    'import { createElement, type ReactNode } from "react";',
    'import { cx } from "dx-styles";',
    "",
    'import { TAGS } from "./catalog.gen";',
    'import { isRecipe, variantOf } from "./check";',
    ...imports,
    "",
    `const S: Record<string, any> = { ${spreads.join(", ")} };`,
    "const appRoot = cx(theme, S.appRoot);",
    "",
    "export const ui = {",
    "  node(s: string, v: string | undefined, props: Record<string, unknown>, children: ReactNode) {",
    '    const className = s === "appRoot" ? appRoot : isRecipe(s) ? S[s]({ variant: variantOf(s, v) }) : S[s];',
    "    return createElement(TAGS[s]!, { ...props, className }, children);",
    "  },",
    "};",
    "",
  ].join("\n");

export const generate = (layout: Layout): LaneSource => {
  const files: Record<string, string> = {};
  if (layout === "single") {
    files["src/styles.ts"] = [
      HEADER(LIB),
      'import { createTheme, createTokenContract, css, recipe } from "dx-styles";',
      "",
      tokensSource(),
      "",
      ...SLOTS.map(slotSource),
      "",
    ].join("\n");
    files["src/ui.ts"] = uiSource(['import * as styles from "./styles";', 'import { theme } from "./styles";'], ["...styles"]);
  } else {
    files["src/styles/tokens.ts"] = [HEADER(LIB), 'import { createTheme, createTokenContract } from "dx-styles";', "", tokensSource(), ""].join("\n");
    for (const module of MODULES) {
      const slots = SLOTS.filter((slot) => slot.module === module);
      const apis = [...new Set(slots.map((slot) => (slot.kind === "flat" ? "css" : "recipe")))].sort();
      files[`src/styles/${module}.ts`] = [
        HEADER(LIB),
        `import { ${apis.join(", ")} } from "dx-styles";`,
        "",
        'import { t } from "./tokens";',
        "",
        ...slots.map(slotSource),
        "",
      ].join("\n");
    }
    files["src/ui.ts"] = uiSource(
      ['import { theme } from "./styles/tokens";', ...MODULES.map((m, i) => `import * as m${i} from "./styles/${m}";`)],
      MODULES.map((_, i) => `...m${i}`),
    );
  }
  return {
    files,
    vite: {
      imports: ['import wyw from "@wyw-in-js/vite";'],
      plugins: ["wyw({ displayName: false, prefixer: false, processors: { dxStyles: { minifyClassNames: true } } })"],
    },
  };
};
