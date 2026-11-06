import type { TokenRef } from "./tokens.ts";

/** A declaration value: a literal or one token. Values never mix the two. */
export type Value = string | TokenRef;

/** camelCase CSS property -> value. */
export type Decls = Record<string, Value>;

/** The pseudo-classes a rule may style, in cascade order. */
export const STATES = ["hover", "active", "focusVisible", "disabled"] as const;
export type State = (typeof STATES)[number];

export const STATE_SELECTOR: Record<State, string> = {
  hover: ":hover",
  active: ":active",
  focusVisible: ":focus-visible",
  disabled: ":disabled",
};

export interface Rule {
  readonly decls: Decls;
  readonly states?: Partial<Record<State, Decls>>;
}

export interface FlatSlot {
  readonly kind: "flat";
  readonly name: string;
  readonly tag: string;
  /** The module (file) the slot's styles live in, for the per-component layout. */
  readonly module: string;
  readonly rule: Rule;
}

export interface RecipeSlot {
  readonly kind: "recipe";
  readonly name: string;
  readonly tag: string;
  readonly module: string;
  readonly base: Rule;
  /** Variant key (camelCase, from the axes) -> rule. */
  readonly variants: Record<string, Rule>;
  readonly defaultVariant: string;
}

export type Slot = FlatSlot | RecipeSlot;

export const isToken = (value: Value): value is TokenRef => typeof value === "object";

export const kebab = (prop: string): string => prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

export const cap = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** Every token path a rule references. */
export const ruleTokens = (rule: Rule): string[] => {
  const paths: string[] = [];
  const collect = (decls: Decls): void => {
    for (const value of Object.values(decls)) {
      if (isToken(value)) paths.push(value.t);
    }
  };
  collect(rule.decls);
  for (const decls of Object.values(rule.states ?? {})) collect(decls!);
  return paths;
};
