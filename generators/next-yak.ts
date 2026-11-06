// next-yak: styled-components syntax extracted to CSS at build time by its swc plugin;
// one styled component per slot, each variant a `css` block behind a `$v` condition.
// Templates must be static, so token references are written as CSS variables
// (declared on the app root) rather than interpolated.
import { MODULES, SLOTS } from "../scene/catalog.ts";
import type { Slot } from "../scene/ir.ts";
import { componentName, cssNested, HEADER, type LaneSource, plainVar, rootVarDecls } from "./common.ts";
import { componentUi } from "./emotion.ts";

const LIB = "next-yak";

const slotSource = (slot: Slot): string => {
  const Name = componentName(slot.name);
  if (slot.kind === "flat") {
    const rule = slot.name === "appRoot" ? { ...slot.rule, decls: { ...rootVarDecls(), ...slot.rule.decls } } : slot.rule;
    return `export const ${Name} = styled.${slot.tag}\`\n${cssNested(rule, plainVar)}\n\`;`;
  }
  const conditions = Object.entries(slot.variants)
    .map(([name, rule]) => `  \${({ $v }) => $v === ${JSON.stringify(name)} && css\`\n${cssNested(rule, plainVar, "    ")}\n  \`}`)
    .join("\n");
  return `export const ${Name} = styled.${slot.tag}<{ $v: string }>\`\n${cssNested(slot.base, plainVar)}\n${conditions}\n\`;`;
};

export const generate = (): LaneSource => {
  const files: Record<string, string> = {};
  for (const module of MODULES) {
    const slots = SLOTS.filter((slot) => slot.module === module);
    const apis = slots.some((s) => s.kind === "recipe") ? "css, styled" : "styled";
    files[`src/styles/${module}.ts`] = [HEADER(LIB), `import { ${apis} } from "next-yak";`, "", ...slots.map(slotSource), ""].join("\n");
  }
  files["src/ui.ts"] = componentUi(LIB);
  return { files, vite: { imports: ['import { viteYak } from "next-yak/vite";'], plugins: ["viteYak()"] } };
};
