// Emotion: @emotion/styled object styles, one styled component per slot, the variant
// picked by a transient `$v` prop at render; CSS variables declared on the app root.
// Styles are serialized and inserted at runtime.
import { MODULES, SLOTS } from "../scene/catalog.ts";
import type { Slot } from "../scene/ir.ts";
import { componentName, HEADER, jsRule, type LaneSource, plainVarObject, rootVarDecls } from "./common.ts";

const LIB = "emotion";
const ref = (path: string): string => `t.${path}`;

const slotSource = (slot: Slot): string => {
  const Name = componentName(slot.name);
  if (slot.kind === "flat") {
    const rule = slot.name === "appRoot" ? { ...slot.rule, decls: { ...rootVarDecls(), ...slot.rule.decls } } : slot.rule;
    return `export const ${Name} = styled.${slot.tag}(${jsRule(rule, ref, "  ")});`;
  }
  const variants = Object.entries(slot.variants)
    .map(([name, rule]) => `  ${name}: ${jsRule(rule, ref, "    ")},`)
    .join("\n");
  return [
    `const ${slot.name}Variants: Record<string, object> = {\n${variants}\n};`,
    `export const ${Name} = styled.${slot.tag}<{ $v: string }>(`,
    `  ${jsRule(slot.base, ref, "    ")},`,
    `  ({ $v }) => ${slot.name}Variants[$v],`,
    ");",
  ].join("\n");
};

export const generate = (): LaneSource => {
  const files: Record<string, string> = {};
  files["src/styles/tokens.ts"] = [HEADER(LIB), `export const t = ${plainVarObject()};`, ""].join("\n");
  for (const module of MODULES) {
    const slots = SLOTS.filter((slot) => slot.module === module);
    files[`src/styles/${module}.ts`] = [HEADER(LIB), 'import styled from "@emotion/styled";', "", 'import { t } from "./tokens";', "", ...slots.map(slotSource), ""].join("\n");
  }
  files["src/ui.ts"] = componentUi(LIB);
  return { files, vite: { imports: [], plugins: [] } };
};

/** The `ui` of component-first libraries: one component per slot, `$v` selects the variant. */
export const componentUi = (lib: string): string =>
  [
    HEADER(lib),
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
