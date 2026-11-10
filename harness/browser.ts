/**
 * The browser side: serve each lane's dist over HTTP, load it in headless Chromium,
 * read first-contentful-paint and largest-contentful-paint, and take a computed-style
 * fingerprint of every rendered element, at rest and in every state (to show that every
 * lane renders the same page). Samples interleave the lanes, alternating the order every round.
 */
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

import { chromium, type Browser, type Page } from "playwright";

import { STATE_SELECTOR } from "../scene/ir.ts";
import { CARDS } from "./build.ts";
import type { PreparedLane } from "./prepare.ts";
import { load1, log } from "./util.ts";

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const serve = (root: string): Promise<{ server: Server; url: string }> =>
  new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]!)).replace(/^(\.\.[/\\])+/, "");
      const file = join(root, path === "/" ? "index.html" : path);
      try {
        const body = await readFile(file);
        res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
        res.end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/` });
    });
  });

/** The properties compared for every element. */
const PROPS = [
  "display",
  "position",
  "color",
  "backgroundColor",
  "borderTopColor",
  "borderTopWidth",
  "borderBottomWidth",
  "borderInlineStartWidth",
  "borderTopLeftRadius",
  "paddingTop",
  "paddingLeft",
  "marginTop",
  "gap",
  "fontSize",
  "fontWeight",
  "fontFamily",
  "lineHeight",
  "boxShadow",
  "opacity",
  "textDecorationLine",
  "width",
  "height",
  "outlineStyle",
  "outlineWidth",
  "outlineColor",
  "outlineOffset",
];

/**
 * Runs in the page. One line per element under #root: its tag and resting computed styles,
 * then, for each state, the properties that change when every element is in that state.
 *
 * Nothing on the page is hovered, pressed, focused or disabled, so a state is forced through
 * the style rules: in every selector the state's pseudo-class is replaced by a `:not()` of a
 * class no element has, which always matches and has the pseudo-class's specificity. The
 * selectors are put back afterwards. A selector that styles a pseudo-element in a state keeps
 * its text (the replacement does not parse there); it does not change an element's own styles.
 */
const fingerprintInPage = ({ props, states }: { props: string[]; states: string[] }): string[] => {
  const elements = [...document.querySelectorAll("#root *")];
  const read = (): string[][] =>
    elements.map((el) => {
      const computed = getComputedStyle(el) as unknown as Record<string, string>;
      return props.map((p) => computed[p]!);
    });
  const resting = read();
  const lines = elements.map((el, i) => `${el.tagName}|${resting[i]!.join("|")}`);

  const rules: CSSStyleRule[] = [];
  const collect = (list: CSSRuleList): void => {
    for (const rule of list) {
      if ("selectorText" in rule) rules.push(rule as CSSStyleRule);
      if ("cssRules" in rule) collect(rule.cssRules as CSSRuleList);
    }
  };
  for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) collect(sheet.cssRules);

  // A transition would hold a state's styles at their resting values while they are read.
  const still = document.createElement("style");
  still.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
  document.head.append(still);
  for (const state of states) {
    // not the same text inside an escaped class name, nor a longer pseudo-class
    const pseudo = new RegExp(`(?<!\\\\)${state}(?![\\w-])`, "g");
    const forced: [CSSStyleRule, string][] = [];
    for (const rule of rules) {
      const selector = rule.selectorText;
      const always = selector.replace(pseudo, ":not(.bench-no-such-class)");
      if (always === selector) continue;
      rule.selectorText = always;
      forced.push([rule, selector]);
    }
    read().forEach((values, i) => {
      const changed = props.flatMap((p, j) => (values[j] === resting[i]![j] ? [] : [`${p}:${values[j]}`]));
      if (changed.length > 0) lines[i] += ` ${state}{${changed.join(";")}}`;
    });
    for (const [rule, selector] of forced) rule.selectorText = selector;
  }
  // back to the resting styles before transitions are allowed again
  void document.body.offsetWidth;
  still.remove();
  return lines;
};

/**
 * The computed styles of every element under #root, at rest and in each state the scene's
 * rules style, one line per element.
 */
export const fingerprintPage = (page: Page): Promise<string[]> =>
  page.evaluate(fingerprintInPage, { props: PROPS, states: Object.values(STATE_SELECTOR) });

const PAINT = `new Promise((resolve) => {
  let lcp = null;
  new PerformanceObserver((list) => { for (const e of list.getEntries()) lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
  const started = performance.now();
  const poll = () => {
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null;
    if (fcp !== null || performance.now() - started > 5000) resolve({ fcp, lcp });
    else setTimeout(poll, 25);
  };
  poll();
})`;

export interface PaintSample {
  fcp: number;
  lcp: number | null;
  load: number;
}

export interface BrowserResult {
  samples: PaintSample[];
  fingerprint: string[];
  chromium: string;
}

const visit = async (browser: Browser, url: string, withFingerprint: boolean): Promise<{ fcp: number; lcp: number | null; fingerprint?: string[] }> => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction((n) => document.querySelectorAll('[data-bench="card"]').length === n, CARDS, { timeout: 30_000 });
    if (errors.length > 0) throw new Error(`page error: ${errors[0]}`);
    const paint = (await page.evaluate(PAINT)) as { fcp: number | null; lcp: number | null };
    if (paint.fcp === null) throw new Error("no first-contentful-paint entry");
    return { fcp: paint.fcp, lcp: paint.lcp, ...(withFingerprint ? { fingerprint: await fingerprintPage(page) } : {}) };
  } finally {
    await context.close();
  }
};

export const measureBrowser = async (lanes: PreparedLane[], samples: number): Promise<Map<string, BrowserResult>> => {
  // The full Chromium build in new headless mode reports paint timing like a desktop browser.
  const browser = await chromium.launch({ channel: "chromium" });
  const servers = new Map<string, { server: Server; url: string }>();
  const results = new Map<string, BrowserResult>();
  try {
    for (const p of lanes) {
      servers.set(p.lane.id, await serve(join(p.dir, "dist")));
      results.set(p.lane.id, { samples: [], fingerprint: [], chromium: browser.version() });
    }
    // Round 0 is the warm-up and the fingerprint; rounds 1..samples are recorded.
    for (let round = 0; round <= samples; round += 1) {
      const order = round % 2 === 0 ? lanes : [...lanes].reverse();
      for (const p of order) {
        const visitResult = await visit(browser, servers.get(p.lane.id)!.url, round === 0);
        const result = results.get(p.lane.id)!;
        if (round === 0) result.fingerprint = visitResult.fingerprint ?? [];
        else result.samples.push({ fcp: visitResult.fcp, lcp: visitResult.lcp, load: load1() });
      }
      if (round > 0) log(`[browser] round ${round}/${samples}`);
    }
  } finally {
    await browser.close();
    for (const { server } of servers.values()) server.close();
  }
  return results;
};

/** Elements whose computed styles differ from the reference lane's. */
export const fingerprintDiff = (reference: string[], other: string[]): { differing: number; examples: string[] } => {
  if (reference.length !== other.length) {
    return { differing: Math.abs(reference.length - other.length), examples: [`element count ${other.length} vs ${reference.length}`] };
  }
  const examples: string[] = [];
  let differing = 0;
  for (let i = 0; i < reference.length; i += 1) {
    if (reference[i] !== other[i]) {
      differing += 1;
      if (examples.length < 5) examples.push(`#${i}: ${other[i]}  ≠  ${reference[i]}`);
    }
  }
  return { differing, examples };
};
