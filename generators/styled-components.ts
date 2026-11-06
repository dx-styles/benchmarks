// styled-components: template-literal styled components, one per slot, the variant's CSS
// interpolated from a transient `$v` prop; CSS variables declared on the app root.
// Styles are parsed and inserted at runtime.
import { MODULES, SLOTS } from "../scene/catalog.ts";
import type { Slot } from "../scene/ir.ts";
import { componentName, cssNested, HEADER, type LaneSource, plainVarObject, rootVarDecls } from "./common.ts";
import { componentUi } from "./emotion.ts";

const LIB = "styled-components";
const interp = (path: string): string => `\${t.${path}}`;

const slotSource = (slot: Slot): string => {
  const Name = componentName(slot.name);
  if (slot.kind === "flat") {
    const rule = slot.name === "appRoot" ? { ...slot.rule, decls: { ...rootVarDecls(), ...slot.rule.decls } } : slot.rule;
    return `export const ${Name} = styled.${slot.tag}\`\n${cssNested(rule, interp)}\n\`;`;
  }
  const variants = Object.entries(slot.variants)
    .map(([name, rule]) => `  ${name}: \`\n${cssNested(rule, interp, "    ")}\n  \`,`)
    .join("\n");
  return [
    `const ${slot.name}Variants: Record<string, string> = {\n${variants}\n};`,
    `export const ${Name} = styled.${slot.tag}<{ $v: string }>\`\n${cssNested(slot.base, interp)}\n  \${({ $v }) => ${slot.name}Variants[$v]}\n\`;`,
  ].join("\n");
};

export const generate = (): LaneSource => {
  const files: Record<string, string> = {};
  files["src/styles/tokens.ts"] = [HEADER(LIB), `export const t = ${plainVarObject()};`, ""].join("\n");
  for (const module of MODULES) {
    const slots = SLOTS.filter((slot) => slot.module === module);
    files[`src/styles/${module}.ts`] = [HEADER(LIB), 'import styled from "styled-components";', "", 'import { t } from "./tokens";', "", ...slots.map(slotSource), ""].join("\n");
  }
  files["src/ui.ts"] = componentUi(LIB);
  return { files, vite: { imports: [], plugins: [] } };
};
