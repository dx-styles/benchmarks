// StyleX: tokens as `defineVars` groups in tokens.stylex.ts, `stylex.create` per module
// (pseudo-classes as per-property conditions), `stylex.props` at render. Built by the
// official unplugin (@stylexjs/unplugin/vite).
import { MODULES, SLOTS } from "../scene/catalog.ts";
import { STATE_SELECTOR, STATES, type Rule, type Slot, type Value } from "../scene/ir.ts";
import { TOKENS } from "../scene/tokens.ts";
import { HEADER, jsValue, key, type LaneSource } from "./common.ts";

const LIB = "stylex";
const ref = (path: string): string => path; // `color.accent600`: the defineVars group is imported by name
const GROUPS = Object.keys(TOKENS);

/** A rule as a StyleX namespace: a property set in a state becomes `{ default, ":hover": … }`. */
const namespace = (rule: Rule, indent: string): string => {
  const props = new Map<string, Map<string, Value | null>>();
  const set = (prop: string, condition: string, value: Value): void => {
    const entry = props.get(prop) ?? new Map<string, Value | null>([["default", null]]);
    entry.set(condition, value);
    props.set(prop, entry);
  };
  for (const [prop, value] of Object.entries(rule.decls)) set(prop, "default", value);
  for (const state of STATES) {
    for (const [prop, value] of Object.entries(rule.states?.[state] ?? {})) set(prop, STATE_SELECTOR[state], value);
  }
  const lines = [...props].map(([prop, conditions]) => {
    if (conditions.size === 1) return `${indent}${key(prop)}: ${jsValue(conditions.get("default")!, ref)},`;
    const inner = [...conditions]
      .map(([cond, value]) => `${key(cond)}: ${value === null ? "null" : jsValue(value, ref)}`)
      .join(", ");
    return `${indent}${key(prop)}: { ${inner} },`;
  });
  return `{\n${lines.join("\n")}\n${indent.slice(2)}}`;
};

const recipeSource = (slot: Extract<Slot, { kind: "recipe" }>): string => {
  const entries = [`  base: ${namespace(slot.base, "    ")},`, ...Object.entries(slot.variants).map(([name, rule]) => `  ${name}: ${namespace(rule, "    ")},`)];
  return `export const ${slot.name} = stylex.create({\n${entries.join("\n")}\n});`;
};

export const generate = (): LaneSource => {
  const files: Record<string, string> = {};
  files["src/styles/tokens.stylex.ts"] = [
    HEADER(LIB),
    'import * as stylex from "@stylexjs/stylex";',
    "",
    ...Object.entries(TOKENS).map(
      ([group, entries]) =>
        `export const ${group} = stylex.defineVars({\n${Object.entries(entries)
          .map(([n, v]) => `  ${key(n)}: ${JSON.stringify(v)},`)
          .join("\n")}\n});\n`,
    ),
  ].join("\n");
  for (const module of MODULES) {
    const slots = SLOTS.filter((slot) => slot.module === module);
    const flats = slots.filter((s) => s.kind === "flat");
    const recipes = slots.filter((s): s is Extract<Slot, { kind: "recipe" }> => s.kind === "recipe");
    files[`src/styles/${module}.ts`] = [
      HEADER(LIB),
      'import * as stylex from "@stylexjs/stylex";',
      "",
      `import { ${GROUPS.join(", ")} } from "./tokens.stylex";`,
      "",
      ...(flats.length > 0
        ? [`export const flat = stylex.create({\n${flats.map((s) => `  ${s.name}: ${namespace(s.kind === "flat" ? s.rule : s.base, "    ")},`).join("\n")}\n});`]
        : []),
      ...recipes.map(recipeSource),
      "",
    ].join("\n");
  }
  files["src/global.css"] = "body { margin: 0; }\n";
  files["src/ui.ts"] = [
    HEADER(LIB),
    'import { createElement, type ReactNode } from "react";',
    'import * as stylex from "@stylexjs/stylex";',
    "",
    'import { TAGS } from "./catalog.gen";',
    'import { isRecipe, variantOf } from "./check";',
    ...MODULES.map((m, i) => `import * as m${i} from "./styles/${m}";`),
    "",
    `const MODULES: Record<string, any>[] = [${MODULES.map((_, i) => `m${i}`).join(", ")}];`,
    "const R: Record<string, any> = {};",
    "const F: Record<string, string | undefined> = {};",
    "for (const m of MODULES) {",
    "  for (const [name, value] of Object.entries(m)) {",
    '    if (name === "flat") {',
    "      for (const [slot, style] of Object.entries(value as Record<string, any>)) F[slot] = stylex.props(style).className;",
    "    } else R[name] = value;",
    "  }",
    "}",
    "",
    "export const ui = {",
    "  node(s: string, v: string | undefined, props: Record<string, unknown>, children: ReactNode) {",
    "    const className = isRecipe(s) ? stylex.props(R[s].base, R[s][variantOf(s, v)]).className : F[s];",
    "    return createElement(TAGS[s]!, { ...props, className }, children);",
    "  },",
    "};",
    "",
  ].join("\n");
  return {
    files,
    vite: { imports: ['import stylex from "@stylexjs/unplugin";'], first: ["stylex.vite()"], plugins: [] },
    mainImports: ["./global.css"],
  };
};
