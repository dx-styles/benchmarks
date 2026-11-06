// Compiled: `css()` + `cssMap()` from @compiled/react on the `css` prop, one component per
// slot, CSS variables declared on the app root; built by @compiled/vite-plugin with CSS
// extraction for the production build.
import { MODULES, SLOTS } from "../scene/catalog.ts";
import type { Slot } from "../scene/ir.ts";
import { componentName, HEADER, jsRule, type LaneSource, plainVarObject, rootVarDecls } from "./common.ts";

const LIB = "compiled";
const ref = (path: string): string => `t.${path}`;

const slotSource = (slot: Slot): string => {
  const Name = componentName(slot.name);
  if (slot.kind === "flat") {
    const rule = slot.name === "appRoot" ? { ...slot.rule, decls: { ...rootVarDecls(), ...slot.rule.decls } } : slot.rule;
    return [
      `const ${slot.name}Styles = css(${jsRule(rule, ref, "  ")});`,
      `export const ${Name} = ({ $v, ...props }: any) => <${slot.tag} css={${slot.name}Styles} {...props} />;`,
    ].join("\n");
  }
  const variants = Object.entries(slot.variants)
    .map(([name, rule]) => `  ${name}: ${jsRule(rule, ref, "    ")},`)
    .join("\n");
  return [
    `const ${slot.name}Base = css(${jsRule(slot.base, ref, "  ")});`,
    `const ${slot.name}Variants = cssMap({\n${variants}\n});`,
    `export const ${Name} = ({ $v, ...props }: any) => (`,
    `  <${slot.tag} css={[${slot.name}Base, ${slot.name}Variants[$v as keyof typeof ${slot.name}Variants]]} {...props} />`,
    ");",
  ].join("\n");
};

export const generate = (): LaneSource => {
  const files: Record<string, string> = {};
  files["src/styles/tokens.ts"] = [HEADER(LIB), `export const t = ${plainVarObject()};`, ""].join("\n");
  for (const module of MODULES) {
    const slots = SLOTS.filter((slot) => slot.module === module);
    const apis = slots.some((s) => s.kind === "recipe") ? "css, cssMap" : "css";
    files[`src/styles/${module}.tsx`] = [HEADER(LIB), `import { ${apis} } from "@compiled/react";`, "", 'import { t } from "./tokens.ts";', "", ...slots.map(slotSource), ""].join("\n");
  }
  files["src/ui.ts"] = [
    HEADER(LIB),
    'import { createElement, type ReactNode } from "react";',
    "",
    'import { isRecipe, variantOf } from "./check";',
    ...MODULES.map((m, i) => `import * as m${i} from "./styles/${m}";`),
    "",
    `const C: Record<string, any> = { ${MODULES.map((_, i) => `...m${i}`).join(", ")} };`,
    "",
    "export const ui = {",
    "  node(s: string, v: string | undefined, props: Record<string, unknown>, children: ReactNode) {",
    "    const Component = C[s.charAt(0).toUpperCase() + s.slice(1)];",
    "    return createElement(Component, isRecipe(s) ? { ...props, $v: variantOf(s, v) } : props, children);",
    "  },",
    "};",
    "",
  ].join("\n");
  return {
    files,
    vite: {
      imports: ['import compiled from "@compiled/vite-plugin";'],
      first: ["compiled({ extract: true, importReact: false })"],
      plugins: [],
    },
  };
};
