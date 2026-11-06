/**
 * The component catalog of the scene: structural (flat) slots and recipe families.
 *
 * Each recipe family exposes the cartesian product of its axes (for most of them
 * intent × appearance × size) as ONE variant axis, so every library emits one rule
 * per combination and no library gets to collapse the catalog through compound
 * variants: the CSS volume is the same for all of them.
 */
import { cap, type Decls, type FlatSlot, type RecipeSlot, type Rule, type Slot } from "./ir.ts";
import { type Hue, INTENTS, tok } from "./tokens.ts";

const color = (name: string) => tok(`color.${name}`);
const space = (name: string) => tok(`space.${name}`);
const radius = (name: string) => tok(`radius.${name}`);
const fontSize = (name: string) => tok(`fontSize.${name}`);
const fontWeight = (name: string) => tok(`fontWeight.${name}`);
const shade = (intent: Hue, step: number) => color(`${intent}${step}`);

const focusRing: Decls = {
  outlineStyle: "solid",
  outlineWidth: "2px",
  outlineColor: color("focusRing"),
  outlineOffset: "2px",
};

/** Variant keys and rules from axes: [["accent", "solid", "md"], …] -> "accentSolidMd". */
const product = <A extends readonly string[][]>(axes: A): string[][] =>
  axes.reduce<string[][]>((acc, axis) => acc.flatMap((prefix) => axis.map((v) => [...prefix, v])), [[]]);

const keyOf = (parts: string[]): string => parts.map((p, i) => (i === 0 ? p : cap(p))).join("");

const recipe = (
  name: string,
  tag: string,
  base: Rule,
  axes: string[][],
  variant: (...parts: string[]) => Rule,
): RecipeSlot => {
  const combos = product(axes);
  const variants = Object.fromEntries(combos.map((parts) => [keyOf(parts), variant(...parts)]));
  const middle = combos[Math.floor(combos.length / 2)]!;
  return { kind: "recipe", name, tag, module: name, base, variants, defaultVariant: keyOf(middle) };
};

const flat = (module: string, name: string, tag: string, decls: Decls, states?: Rule["states"]): FlatSlot => ({
  kind: "flat",
  name,
  tag,
  module,
  rule: states ? { decls, states } : { decls },
});

// ---------------------------------------------------------------- interactive

const APPEARANCES4 = ["solid", "soft", "outline", "ghost"];
const SIZES3 = ["sm", "md", "lg"];

const interactiveColors = (intent: Hue, appearance: string): Rule => {
  switch (appearance) {
    case "solid":
      return {
        decls: { backgroundColor: shade(intent, 600), color: color("textInverse"), borderColor: shade(intent, 600) },
        states: {
          hover: { backgroundColor: shade(intent, 700), borderColor: shade(intent, 700) },
          active: { backgroundColor: shade(intent, 800), borderColor: shade(intent, 800) },
        },
      };
    case "soft":
      return {
        decls: { backgroundColor: shade(intent, 100), color: shade(intent, 800), borderColor: shade(intent, 100) },
        states: {
          hover: { backgroundColor: shade(intent, 200), borderColor: shade(intent, 200) },
          active: { backgroundColor: shade(intent, 300), borderColor: shade(intent, 300) },
        },
      };
    case "outline":
      return {
        decls: { backgroundColor: "transparent", color: shade(intent, 700), borderColor: shade(intent, 300) },
        states: {
          hover: { backgroundColor: shade(intent, 50), borderColor: shade(intent, 400) },
          active: { backgroundColor: shade(intent, 100), borderColor: shade(intent, 500) },
        },
      };
    default:
      return {
        decls: { backgroundColor: "transparent", color: shade(intent, 700), borderColor: "transparent" },
        states: {
          hover: { backgroundColor: shade(intent, 100) },
          active: { backgroundColor: shade(intent, 200) },
        },
      };
  }
};

interface InteractiveSpec {
  name: string;
  tag: string;
  radius: string;
  weight: string;
  heights: [number, number, number];
  pads: [string, string, string];
  fonts: [string, string, string];
  square?: boolean;
  extra?: Decls;
}

const merge = (a: Rule, b: Decls): Rule => ({ decls: { ...a.decls, ...b }, states: a.states });

const interactive = (spec: InteractiveSpec): RecipeSlot =>
  recipe(
    spec.name,
    spec.tag,
    {
      decls: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderStyle: "solid",
        borderWidth: "1px",
        borderRadius: radius(spec.radius),
        fontFamily: tok("font.sans"),
        fontWeight: fontWeight(spec.weight),
        lineHeight: tok("leading.tight"),
        whiteSpace: "nowrap",
        cursor: "pointer",
        userSelect: "none",
        transitionProperty: "background-color, border-color, color",
        transitionDuration: tok("duration.fast"),
        ...spec.extra,
      },
      states: { focusVisible: focusRing, disabled: { opacity: "0.5", cursor: "not-allowed" } },
    },
    [INTENTS, APPEARANCES4, SIZES3],
    (intent, appearance, size) => {
      const i = SIZES3.indexOf(size);
      const height = `${spec.heights[i]}px`;
      return merge(interactiveColors(intent as Hue, appearance), {
        height,
        ...(spec.square ? { width: height, paddingInline: space("s0") } : { paddingInline: space(spec.pads[i]!) }),
        fontSize: fontSize(spec.fonts[i]!),
        gap: space(i === 0 ? "s2" : "s4"),
      });
    },
  );

// ---------------------------------------------------------------- indicators

const indicatorColors = (intent: Hue, appearance: string): Decls => {
  if (appearance === "solid") {
    return { backgroundColor: shade(intent, 600), color: color("textInverse"), borderColor: shade(intent, 600) };
  }
  if (appearance === "soft") {
    return { backgroundColor: shade(intent, 100), color: shade(intent, 800), borderColor: shade(intent, 200) };
  }
  return { backgroundColor: "transparent", color: shade(intent, 700), borderColor: shade(intent, 400) };
};

const indicator = (
  name: string,
  opts: { radius: string; weight: string; sizes: string[]; heights: number[]; pads: string[]; fonts: string[] },
): RecipeSlot =>
  recipe(
    name,
    "span",
    {
      decls: {
        display: "inline-flex",
        alignItems: "center",
        gap: space("s2"),
        borderStyle: "solid",
        borderWidth: "1px",
        borderRadius: radius(opts.radius),
        fontFamily: tok("font.sans"),
        fontWeight: fontWeight(opts.weight),
        lineHeight: tok("leading.tight"),
        whiteSpace: "nowrap",
      },
    },
    [INTENTS, ["solid", "soft", "outline"], opts.sizes],
    (intent, appearance, size) => {
      const i = opts.sizes.indexOf(size);
      return {
        decls: {
          ...indicatorColors(intent as Hue, appearance),
          height: `${opts.heights[i]}px`,
          paddingInline: space(opts.pads[i]!),
          fontSize: fontSize(opts.fonts[i]!),
        },
      };
    },
  );

const bar = (name: string, rad: string, heights: number[]): RecipeSlot =>
  recipe(
    name,
    "div",
    { decls: { display: "block", width: "100%", borderRadius: radius(rad), overflow: "hidden" } },
    [INTENTS, ["solid", "soft"], SIZES3],
    (intent, appearance, size) => ({
      decls: {
        height: `${heights[SIZES3.indexOf(size)]}px`,
        backgroundColor: shade(intent as Hue, appearance === "solid" ? 600 : 300),
        borderColor: shade(intent as Hue, 200),
      },
    }),
  );

// ---------------------------------------------------------------- surfaces

const surfaceColors = (intent: Hue, appearance: string): Decls => {
  switch (appearance) {
    case "solid":
      return { backgroundColor: shade(intent, 700), color: color("textInverse"), borderColor: shade(intent, 700) };
    case "soft":
      return { backgroundColor: shade(intent, 50), color: shade(intent, 900), borderColor: shade(intent, 200) };
    case "elevated":
      return { backgroundColor: color("surfaceRaised"), color: color("text"), borderColor: shade(intent, 100), boxShadow: tok("shadow.md") };
    default:
      return { backgroundColor: color("surfaceRaised"), color: color("text"), borderColor: shade(intent, 300) };
  }
};

const surface = (
  name: string,
  tag: string,
  opts: { radius: string; appearances: string[]; densities: string[]; pads: string[]; gaps: string[]; fonts: string[]; extra?: Decls },
): RecipeSlot =>
  recipe(
    name,
    tag,
    {
      decls: {
        display: "flex",
        flexDirection: "column",
        borderStyle: "solid",
        borderWidth: "1px",
        borderRadius: radius(opts.radius),
        fontFamily: tok("font.sans"),
        lineHeight: tok("leading.normal"),
        ...opts.extra,
      },
    },
    [INTENTS, opts.appearances, opts.densities],
    (intent, appearance, density) => {
      const i = opts.densities.indexOf(density);
      return {
        decls: {
          ...surfaceColors(intent as Hue, appearance),
          padding: space(opts.pads[i]!),
          gap: space(opts.gaps[i]!),
          fontSize: fontSize(opts.fonts[i]!),
        },
      };
    },
  );

// ---------------------------------------------------------------- form controls

const CONTROL_STATES = ["default", "invalid", "valid", "readonly"];
const controlBorder: Record<string, [string, string, string]> = {
  default: ["border", "borderStrong", "focusRing"],
  invalid: ["danger500", "danger600", "danger400"],
  valid: ["success500", "success600", "success400"],
  readonly: ["neutral200", "neutral200", "neutral300"],
};

const control = (name: string, tag: string, sizing: (i: number) => Decls): RecipeSlot =>
  recipe(
    name,
    tag,
    {
      decls: {
        display: "block",
        width: "100%",
        borderStyle: "solid",
        borderWidth: "1px",
        borderRadius: radius("md"),
        fontFamily: tok("font.sans"),
        color: color("text"),
        lineHeight: tok("leading.normal"),
        transitionProperty: "border-color, background-color",
        transitionDuration: tok("duration.fast"),
      },
      states: { disabled: { opacity: "0.6", cursor: "not-allowed" } },
    },
    [CONTROL_STATES, ["outline", "filled"], SIZES3],
    (state, appearance, size) => {
      const [rest, hover, ring] = controlBorder[state]!;
      return {
        decls: {
          ...sizing(SIZES3.indexOf(size)),
          borderColor: color(rest),
          backgroundColor:
            state === "readonly" ? color("surfaceSunken") : appearance === "filled" ? color("neutral50") : color("surfaceRaised"),
        },
        states: {
          hover: { borderColor: color(hover) },
          focusVisible: { outlineStyle: "solid", outlineWidth: "2px", outlineColor: color(ring), outlineOffset: "1px" },
        },
      };
    },
  );

const toggle = (name: string, sizes: (i: number) => Decls, rad: string): RecipeSlot =>
  recipe(
    name,
    "span",
    {
      decls: {
        display: "inline-block",
        flexShrink: "0",
        borderStyle: "solid",
        borderWidth: "1px",
        borderRadius: radius(rad),
        cursor: "pointer",
        transitionProperty: "background-color, border-color",
        transitionDuration: tok("duration.fast"),
      },
    },
    [INTENTS, SIZES3],
    (intent, size) => ({
      decls: { ...sizes(SIZES3.indexOf(size)), borderColor: shade(intent as Hue, 500), backgroundColor: shade(intent as Hue, 50) },
      states: {
        hover: { backgroundColor: shade(intent as Hue, 100) },
        active: { backgroundColor: shade(intent as Hue, 200) },
      },
    }),
  );

// ---------------------------------------------------------------- rows

const row = (name: string, opts: { tag: string; radius: string; weight: string; padsBlock: string[]; padInline: string; extra?: Decls }): RecipeSlot =>
  recipe(
    name,
    opts.tag,
    {
      decls: {
        display: "flex",
        alignItems: "center",
        gap: space("s4"),
        paddingInline: space(opts.padInline),
        borderRadius: radius(opts.radius),
        fontWeight: fontWeight(opts.weight),
        cursor: "pointer",
        ...opts.extra,
      },
      states: { focusVisible: focusRing },
    },
    [INTENTS, ["plain", "soft"], SIZES3],
    (intent, appearance, size) => {
      const i = SIZES3.indexOf(size);
      const soft = appearance === "soft";
      return {
        decls: {
          paddingBlock: space(opts.padsBlock[i]!),
          fontSize: fontSize(["sm", "md", "lg"][i]!),
          color: soft ? shade(intent as Hue, 800) : color("text"),
          backgroundColor: soft ? shade(intent as Hue, 50) : "transparent",
        },
        states: {
          hover: { backgroundColor: shade(intent as Hue, soft ? 100 : 50), color: shade(intent as Hue, 800) },
          active: { backgroundColor: shade(intent as Hue, soft ? 200 : 100) },
        },
      };
    },
  );

// ---------------------------------------------------------------- the families

export const RECIPES: RecipeSlot[] = [
  interactive({ name: "button", tag: "button", radius: "md", weight: "medium", heights: [28, 32, 40], pads: ["s4", "s5", "s6"], fonts: ["sm", "md", "lg"] }),
  interactive({ name: "iconButton", tag: "button", radius: "md", weight: "medium", heights: [28, 32, 40], pads: ["s0", "s0", "s0"], fonts: ["sm", "md", "lg"], square: true }),
  interactive({ name: "toggleButton", tag: "button", radius: "sm", weight: "regular", heights: [26, 30, 36], pads: ["s4", "s5", "s6"], fonts: ["sm", "md", "lg"] }),
  interactive({ name: "segment", tag: "button", radius: "sm", weight: "medium", heights: [24, 28, 34], pads: ["s4", "s5", "s6"], fonts: ["xs", "sm", "md"], extra: { flex: "1 1 0" } }),
  interactive({ name: "chip", tag: "button", radius: "full", weight: "medium", heights: [24, 28, 32], pads: ["s4", "s5", "s6"], fonts: ["xs", "sm", "md"] }),
  interactive({ name: "tab", tag: "button", radius: "sm", weight: "semibold", heights: [30, 36, 42], pads: ["s4", "s5", "s6"], fonts: ["sm", "md", "lg"], extra: { borderBottomWidth: "2px" } }),
  indicator("badge", { radius: "sm", weight: "semibold", sizes: ["sm", "md"], heights: [18, 22], pads: ["s2", "s3"], fonts: ["xs", "sm"] }),
  indicator("tag", { radius: "sm", weight: "medium", sizes: SIZES3, heights: [20, 24, 28], pads: ["s3", "s4", "s5"], fonts: ["xs", "sm", "md"] }),
  indicator("pill", { radius: "full", weight: "medium", sizes: ["sm", "md"], heights: [20, 24], pads: ["s4", "s5"], fonts: ["xs", "sm"] }),
  recipe(
    "statusDot",
    "span",
    { decls: { display: "inline-block", flexShrink: "0", borderRadius: radius("full") } },
    [INTENTS, SIZES3],
    (intent, size) => {
      const px = `${[6, 8, 10][SIZES3.indexOf(size)]}px`;
      return { decls: { width: px, height: px, backgroundColor: shade(intent as Hue, 500) } };
    },
  ),
  bar("progressBar", "full", [4, 6, 10]),
  bar("meter", "sm", [6, 8, 12]),
  recipe(
    "spinner",
    "span",
    { decls: { display: "inline-block", borderStyle: "solid", borderRadius: radius("full"), borderWidth: "2px" } },
    [INTENTS, SIZES3],
    (intent, size) => {
      const px = `${[12, 16, 24][SIZES3.indexOf(size)]}px`;
      return { decls: { width: px, height: px, borderColor: shade(intent as Hue, 200), borderTopColor: shade(intent as Hue, 600) } };
    },
  ),
  surface("alert", "div", { radius: "md", appearances: ["solid", "soft", "outline"], densities: ["compact", "comfortable"], pads: ["s4", "s6"], gaps: ["s2", "s4"], fonts: ["sm", "md"] }),
  surface("banner", "div", { radius: "sm", appearances: ["solid", "soft", "outline"], densities: ["compact", "comfortable"], pads: ["s5", "s7"], gaps: ["s4", "s5"], fonts: ["sm", "md"], extra: { flexDirection: "row", alignItems: "center" } }),
  surface("toast", "div", { radius: "lg", appearances: ["solid", "soft", "outline"], densities: ["compact", "comfortable"], pads: ["s5", "s6"], gaps: ["s2", "s4"], fonts: ["sm", "md"], extra: { boxShadow: tok("shadow.md") } }),
  surface("callout", "aside", { radius: "md", appearances: ["solid", "soft", "outline"], densities: ["compact", "comfortable"], pads: ["s5", "s7"], gaps: ["s4", "s5"], fonts: ["sm", "md"], extra: { borderInlineStartWidth: "4px" } }),
  surface("tooltip", "div", { radius: "sm", appearances: ["solid", "soft"], densities: ["sm", "md"], pads: ["s2", "s3"], gaps: ["s1", "s2"], fonts: ["xs", "sm"], extra: { maxWidth: "240px" } }),
  surface("card", "article", { radius: "lg", appearances: ["elevated", "outline", "soft"], densities: ["sm", "md", "lg"], pads: ["s5", "s6", "s8"], gaps: ["s4", "s5", "s6"], fonts: ["sm", "md", "md"] }),
  surface("panel", "section", { radius: "xl", appearances: ["elevated", "outline", "soft"], densities: ["sm", "md", "lg"], pads: ["s6", "s8", "s9"], gaps: ["s5", "s6", "s8"], fonts: ["md", "md", "lg"] }),
  control("input", "input", (i) => ({ height: `${[28, 32, 40][i]}px`, paddingInline: space(["s4", "s5", "s6"][i]!), fontSize: fontSize(["sm", "md", "lg"][i]!) })),
  control("select", "select", (i) => ({ height: `${[28, 32, 40][i]}px`, paddingInlineStart: space(["s4", "s5", "s6"][i]!), paddingInlineEnd: space("s9"), fontSize: fontSize(["sm", "md", "lg"][i]!) })),
  control("textarea", "textarea", (i) => ({ minHeight: `${[64, 80, 120][i]}px`, padding: space(["s4", "s5", "s6"][i]!), fontSize: fontSize(["sm", "md", "lg"][i]!), resize: "vertical" })),
  toggle("checkbox", (i) => ({ width: `${[14, 16, 20][i]}px`, height: `${[14, 16, 20][i]}px` }), "sm"),
  toggle("radio", (i) => ({ width: `${[14, 16, 20][i]}px`, height: `${[14, 16, 20][i]}px` }), "full"),
  toggle("switchControl", (i) => ({ width: `${[28, 34, 42][i]}px`, height: `${[16, 20, 24][i]}px` }), "full"),
  toggle("slider", (i) => ({ width: "120px", height: `${[4, 6, 8][i]}px` }), "full"),
  row("menuItem", { tag: "div", radius: "sm", weight: "regular", padsBlock: ["s2", "s3", "s4"], padInline: "s5" }),
  row("listItem", { tag: "li", radius: "sm", weight: "regular", padsBlock: ["s4", "s5", "s6"], padInline: "s6", extra: { borderBottomStyle: "solid", borderBottomWidth: "1px", borderBottomColor: tok("color.border") } }),
  row("navItem", { tag: "a", radius: "md", weight: "medium", padsBlock: ["s3", "s4", "s5"], padInline: "s5", extra: { textDecoration: "none" } }),
  recipe(
    "tableRow",
    "tr",
    { decls: { borderBottomStyle: "solid", borderBottomWidth: "1px", borderBottomColor: color("border") } },
    [INTENTS, ["plain", "striped"]],
    (intent, appearance) => ({
      decls: { backgroundColor: appearance === "striped" ? shade(intent as Hue, 50) : color("surfaceRaised") },
      states: { hover: { backgroundColor: shade(intent as Hue, appearance === "striped" ? 100 : 50) } },
    }),
  ),
  recipe(
    "avatar",
    "span",
    {
      decls: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: "0",
        fontFamily: tok("font.sans"),
        fontWeight: fontWeight("semibold"),
        overflow: "hidden",
      },
    },
    [INTENTS, ["circle", "rounded"], ["xs", "sm", "md", "lg", "xl"]],
    (intent, shape, size) => {
      const i = ["xs", "sm", "md", "lg", "xl"].indexOf(size);
      const px = `${[20, 24, 32, 40, 56][i]}px`;
      return {
        decls: {
          width: px,
          height: px,
          fontSize: fontSize(["xs", "xs", "sm", "md", "xl"][i]!),
          borderRadius: radius(shape === "circle" ? "full" : "md"),
          backgroundColor: shade(intent as Hue, 100),
          color: shade(intent as Hue, 800),
        },
      };
    },
  ),
  recipe(
    "kbd",
    "kbd",
    { decls: { display: "inline-flex", alignItems: "center", fontFamily: tok("font.mono"), borderStyle: "solid", borderWidth: "1px", borderRadius: radius("sm") } },
    [["outline", "soft"], SIZES3],
    (appearance, size) => {
      const i = SIZES3.indexOf(size);
      return {
        decls: {
          fontSize: fontSize(["xs", "sm", "md"][i]!),
          paddingInline: space(["s2", "s3", "s4"][i]!),
          height: `${[18, 22, 26][i]}px`,
          borderColor: color(appearance === "outline" ? "borderStrong" : "border"),
          backgroundColor: color(appearance === "outline" ? "surfaceRaised" : "surfaceSunken"),
        },
      };
    },
  ),
  recipe(
    "link",
    "a",
    { decls: { fontFamily: tok("font.sans"), cursor: "pointer", textUnderlineOffset: "2px" }, states: { focusVisible: focusRing } },
    [INTENTS, ["default", "subtle"], SIZES3],
    (intent, appearance, size) => ({
      decls: {
        color: shade(intent as Hue, appearance === "default" ? 700 : 600),
        textDecoration: appearance === "default" ? "underline" : "none",
        fontSize: fontSize(["sm", "md", "lg"][SIZES3.indexOf(size)]!),
      },
      states: { hover: { color: shade(intent as Hue, 800), textDecoration: "underline" } },
    }),
  ),
];

// ---------------------------------------------------------------- flat slots

const text = (name: string) => color(name);

export const FLATS: FlatSlot[] = [
  flat("layout", "appRoot", "div", {
    minHeight: "100vh",
    backgroundColor: text("surface"),
    color: text("text"),
    fontFamily: tok("font.sans"),
    fontSize: fontSize("md"),
    lineHeight: tok("leading.normal"),
  }),
  flat("layout", "shell", "div", { display: "grid", gridTemplateColumns: "240px 1fr", minHeight: "100vh" }),
  flat("layout", "sidebar", "nav", {
    display: "flex",
    flexDirection: "column",
    gap: space("s2"),
    padding: space("s6"),
    backgroundColor: text("surfaceRaised"),
    borderInlineEndStyle: "solid",
    borderInlineEndWidth: "1px",
    borderInlineEndColor: text("border"),
  }),
  flat("layout", "sidebarTitle", "div", { fontSize: fontSize("xs"), fontWeight: fontWeight("semibold"), color: text("textMuted"), textTransform: "uppercase", letterSpacing: "0.06em", paddingBlock: space("s4") }),
  flat("layout", "main", "main", { display: "flex", flexDirection: "column", minWidth: "0" }),
  flat("layout", "topbar", "header", {
    display: "flex",
    alignItems: "center",
    gap: space("s5"),
    height: "56px",
    paddingInline: space("s8"),
    backgroundColor: text("surfaceRaised"),
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
    borderBottomColor: text("border"),
  }),
  flat("layout", "brand", "div", { fontSize: fontSize("lg"), fontWeight: fontWeight("semibold"), color: text("text"), marginInlineEnd: "auto" }),
  flat("layout", "content", "div", { display: "flex", flexDirection: "column", gap: space("s9"), padding: space("s8") }),
  flat("layout", "section", "section", { display: "flex", flexDirection: "column", gap: space("s6") }),
  flat("layout", "toolbar", "div", { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space("s4") }),
  flat("layout", "segmented", "div", { display: "inline-flex", gap: space("s1"), padding: space("s1"), borderRadius: radius("md"), backgroundColor: text("surfaceSunken") }),
  flat("layout", "spacer", "div", { flex: "1 1 auto" }),
  flat("layout", "statGrid", "div", { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: space("s6") }),
  flat("layout", "cardGrid", "div", { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: space("s6") }),
  flat("layout", "split", "div", { display: "grid", gridTemplateColumns: "2fr 1fr", gap: space("s8"), alignItems: "start" }),
  flat("layout", "stack", "div", { display: "flex", flexDirection: "column", gap: space("s4") }),
  flat("layout", "inline", "div", { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space("s3") }),
  flat("layout", "divider", "hr", { borderStyle: "none", height: "1px", backgroundColor: text("border"), marginBlock: space("s4") }),
  flat("typography", "pageTitle", "h1", { margin: space("s0"), fontSize: fontSize("xxl"), fontWeight: fontWeight("semibold"), lineHeight: tok("leading.tight") }),
  flat("typography", "pageSubtitle", "p", { margin: space("s0"), color: text("textMuted"), fontSize: fontSize("md") }),
  flat("typography", "sectionTitle", "h2", { margin: space("s0"), fontSize: fontSize("xl"), fontWeight: fontWeight("semibold"), lineHeight: tok("leading.tight") }),
  flat("typography", "cardTitle", "h3", { margin: space("s0"), fontSize: fontSize("lg"), fontWeight: fontWeight("semibold") }),
  flat("typography", "body", "p", { margin: space("s0"), fontSize: fontSize("md"), color: text("text") }),
  flat("typography", "muted", "span", { fontSize: fontSize("sm"), color: text("textMuted") }),
  flat("typography", "code", "code", { fontFamily: tok("font.mono"), fontSize: fontSize("sm"), paddingInline: space("s2"), borderRadius: radius("sm"), backgroundColor: text("surfaceSunken") }),
  flat("stats", "stat", "div", {
    display: "flex",
    flexDirection: "column",
    gap: space("s2"),
    padding: space("s6"),
    borderRadius: radius("lg"),
    backgroundColor: text("surfaceRaised"),
    boxShadow: tok("shadow.sm"),
  }),
  flat("stats", "statLabel", "span", { fontSize: fontSize("sm"), color: text("textMuted") }),
  flat("stats", "statValue", "span", { fontSize: fontSize("xxl"), fontWeight: fontWeight("semibold"), lineHeight: tok("leading.tight") }),
  flat("table", "tableWrap", "div", { overflowX: "auto", borderRadius: radius("lg"), borderStyle: "solid", borderWidth: "1px", borderColor: text("border"), backgroundColor: text("surfaceRaised") }),
  flat("table", "table", "table", { width: "100%", borderCollapse: "collapse", fontSize: fontSize("sm") }),
  flat("table", "th", "th", {
    textAlign: "start",
    paddingBlock: space("s4"),
    paddingInline: space("s6"),
    fontWeight: fontWeight("semibold"),
    color: text("textMuted"),
    backgroundColor: text("surfaceSunken"),
  }),
  flat("table", "td", "td", { paddingBlock: space("s4"), paddingInline: space("s6"), verticalAlign: "middle" }),
  flat("forms", "form", "form", { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: space("s6") }),
  flat("forms", "field", "label", { display: "flex", flexDirection: "column", gap: space("s3") }),
  flat("forms", "fieldLabel", "span", { fontSize: fontSize("sm"), fontWeight: fontWeight("medium"), color: text("text") }),
  flat("forms", "hint", "span", { fontSize: fontSize("xs"), color: text("textMuted") }),
  flat("forms", "checkRow", "label", { display: "flex", alignItems: "center", gap: space("s4"), fontSize: fontSize("sm") }),
  flat("dialog", "overlay", "div", { position: "relative", padding: space("s9"), borderRadius: radius("xl"), backgroundColor: text("overlay") }),
  flat("dialog", "dialog", "div", {
    display: "flex",
    flexDirection: "column",
    gap: space("s6"),
    maxWidth: "480px",
    marginInline: "auto",
    padding: space("s8"),
    borderRadius: radius("xl"),
    backgroundColor: text("surfaceRaised"),
    boxShadow: tok("shadow.lg"),
  }),
  flat("dialog", "dialogFooter", "div", { display: "flex", justifyContent: "flex-end", gap: space("s4") }),
  flat("gallery", "gallery", "div", { display: "flex", flexDirection: "column", gap: space("s8") }),
  flat("gallery", "galleryGroup", "div", { display: "flex", flexDirection: "column", gap: space("s4") }),
  flat("gallery", "galleryTitle", "h3", { margin: space("s0"), fontSize: fontSize("md"), fontWeight: fontWeight("semibold"), fontFamily: tok("font.mono") }),
  flat("gallery", "galleryGrid", "div", { display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: space("s4") }),
  flat("gallery", "galleryWide", "div", { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: space("s4") }),
];

export const SLOTS: Slot[] = [...FLATS, ...RECIPES];

/** Modules of the per-component layout: one per recipe family, a few for the flat slots. */
export const MODULES: string[] = [...new Set(SLOTS.map((slot) => slot.module))];

export const catalogStats = () => ({
  flatSlots: FLATS.length,
  recipeFamilies: RECIPES.length,
  variants: RECIPES.reduce((n, r) => n + Object.keys(r.variants).length, 0),
  modules: MODULES.length,
});
