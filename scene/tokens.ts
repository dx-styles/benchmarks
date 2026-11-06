/**
 * The scene's design tokens: one registry, grouped. Every library builds its own
 * token layer from it (a contract and a theme, CSS variables declared on the app
 * root, or the library's token config), and every style references tokens through
 * that layer, so each build does the work of resolving them.
 *
 * The palette is computed: six hues, ten lightness steps each.
 */

export const HUES = {
  neutral: { hue: 222, saturation: 14 },
  accent: { hue: 248, saturation: 72 },
  success: { hue: 152, saturation: 58 },
  warning: { hue: 36, saturation: 88 },
  danger: { hue: 2, saturation: 74 },
  info: { hue: 198, saturation: 78 },
} as const;

export type Hue = keyof typeof HUES;
export const INTENTS = Object.keys(HUES) as Hue[];

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export type Step = (typeof STEPS)[number];

const LIGHTNESS: Record<Step, number> = {
  50: 97,
  100: 93,
  200: 86,
  300: 77,
  400: 65,
  500: 55,
  600: 47,
  700: 39,
  800: 31,
  900: 23,
};

const hsl = (hue: number, saturation: number, lightness: number): string =>
  `hsl(${hue} ${saturation}% ${lightness}%)`;

const palette: Record<string, string> = {};
for (const [name, { hue, saturation }] of Object.entries(HUES)) {
  for (const step of STEPS) {
    palette[`${name}${step}`] = hsl(hue, saturation, LIGHTNESS[step]);
  }
}

/** Token groups: group -> name -> value. Names are identifiers (generators use them raw). */
export const TOKENS = {
  color: {
    ...palette,
    surface: hsl(222, 20, 98),
    surfaceRaised: "#ffffff",
    surfaceSunken: hsl(222, 16, 95),
    text: hsl(222, 24, 14),
    textMuted: hsl(222, 10, 42),
    textInverse: "#ffffff",
    border: hsl(222, 14, 86),
    borderStrong: hsl(222, 12, 74),
    focusRing: hsl(248, 90, 60),
    overlay: "hsl(222 30% 10% / 0.45)",
  },
  space: {
    s0: "0px",
    s1: "2px",
    s2: "4px",
    s3: "6px",
    s4: "8px",
    s5: "12px",
    s6: "16px",
    s7: "20px",
    s8: "24px",
    s9: "32px",
    s10: "40px",
  },
  radius: {
    sm: "4px",
    md: "6px",
    lg: "10px",
    xl: "14px",
    full: "999px",
  },
  font: {
    sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    mono: "ui-monospace, 'SF Mono', Menlo, monospace",
  },
  fontSize: {
    xs: "11px",
    sm: "12px",
    md: "14px",
    lg: "16px",
    xl: "20px",
    xxl: "26px",
  },
  fontWeight: {
    regular: "400",
    medium: "500",
    semibold: "600",
  },
  leading: {
    tight: "1.2",
    normal: "1.5",
  },
  shadow: {
    sm: "0 1px 2px hsl(222 30% 10% / 0.08)",
    md: "0 4px 12px hsl(222 30% 10% / 0.10)",
    lg: "0 12px 32px hsl(222 30% 10% / 0.16)",
  },
  duration: {
    fast: "120ms",
    normal: "200ms",
  },
} as const satisfies Record<string, Record<string, string>>;

export type TokenGroup = keyof typeof TOKENS;

/** A reference to a token, e.g. `{ t: "color.accent600" }`. */
export interface TokenRef {
  readonly t: string;
}

export const tok = (path: string): TokenRef => {
  const [group, name] = path.split(".");
  if (!group || !name || !(group in TOKENS) || !(name in (TOKENS as Record<string, object>)[group]!)) {
    throw new Error(`unknown token ${path}`);
  }
  return { t: path };
};

/** Flat list of every token: group, name, value. */
export const tokenList = (): { group: string; name: string; value: string }[] =>
  Object.entries(TOKENS).flatMap(([group, entries]) =>
    Object.entries(entries).map(([name, value]) => ({ group, name, value })),
  );

/** The CSS custom property a library without its own naming uses for a token. */
export const cssVarName = (path: string): string => {
  const dash = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
  const [group, name] = path.split(".");
  return `--tk-${dash(group!)}-${dash(name!)}`;
};
