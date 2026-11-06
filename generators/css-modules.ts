// CSS Modules (no library): one .module.css per module, a class per structural slot and
// per variant, CSS variables declared on the app root. The baseline: no CSS-in-JS work.
import { MODULES, SLOTS } from "../scene/catalog.ts";
import type { Slot } from "../scene/ir.ts";
import { cssRule, HEADER, type LaneSource, plainVar, rootVarDecls } from "./common.ts";

const LIB = "css-modules";

const slotCss = (slot: Slot): string => {
  if (slot.kind === "flat") {
    const rule = slot.name === "appRoot" ? { ...slot.rule, decls: { ...rootVarDecls(), ...slot.rule.decls } } : slot.rule;
    return cssRule(`.${slot.name}`, rule, plainVar);
  }
  return [cssRule(".base", slot.base, plainVar), ...Object.entries(slot.variants).map(([name, rule]) => cssRule(`.${name}`, rule, plainVar))].join("\n");
};

export const generate = (): LaneSource => {
  const files: Record<string, string> = {};
  for (const module of MODULES) {
    const slots = SLOTS.filter((slot) => slot.module === module);
    files[`src/styles/${module}.module.css`] = `/* ${HEADER(LIB).trim().slice(3)} */\n${slots.map(slotCss).join("\n")}\n`;
  }
  const recipeModules = MODULES.filter((m) => SLOTS.some((s) => s.module === m && s.kind === "recipe"));
  const flatModules = MODULES.filter((m) => !recipeModules.includes(m));
  files["src/ui.ts"] = [
    HEADER(LIB),
    'import { createElement, type ReactNode } from "react";',
    "",
    'import { TAGS } from "./catalog.gen";',
    'import { isRecipe, variantOf } from "./check";',
    ...MODULES.map((m, i) => `import m${i} from "./styles/${m}.module.css";`),
    "",
    `const R: Record<string, Record<string, string>> = { ${recipeModules.map((m) => `${m}: m${MODULES.indexOf(m)}`).join(", ")} };`,
    `const F: Record<string, string> = { ${flatModules.map((m) => `...m${MODULES.indexOf(m)}`).join(", ")} };`,
    "",
    "export const ui = {",
    "  node(s: string, v: string | undefined, props: Record<string, unknown>, children: ReactNode) {",
    "    const className = isRecipe(s) ? `${R[s]!.base} ${R[s]![variantOf(s, v)]}` : F[s];",
    "    return createElement(TAGS[s]!, { ...props, className }, children);",
    "  },",
    "};",
    "",
  ].join("\n");
  return { files, vite: { imports: [], plugins: [] } };
};
