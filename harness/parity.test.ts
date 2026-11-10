import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { chromium, type Browser } from "playwright";

import { fingerprintDiff, fingerprintPage } from "./browser.ts";
import { STATE_SELECTOR, STATES, type State } from "../scene/ir.ts";

let browser: Browser;
before(async () => {
  browser = await chromium.launch({ channel: "chromium" });
});
after(() => browser.close());

const HTML = '<div id="root"><button class="a [&:hover]:bg">x</button><p class="b">y</p></div>';

/** The fingerprint of the test page with this CSS, after `script` has run in it. */
const fingerprint = async (css: string, script = ""): Promise<string[]> => {
  const page = await browser.newPage();
  try {
    await page.setContent(`<style>${css}</style>${HTML}<script>${script}</script>`);
    return await fingerprintPage(page);
  } finally {
    await page.close();
  }
};

const differing = (a: string[], b: string[]): number => fingerprintDiff(a, b).differing;

const HOVER = "background-color: rgb(1, 2, 3)";

test("resting styles: one line per element under #root", async () => {
  const plain = await fingerprint("");
  assert.equal(plain.length, 2);
  assert.equal(differing(plain, await fingerprint("")), 0);
  assert.equal(differing(plain, await fingerprint(".b { color: rgb(1, 2, 3) }")), 1);
});

// one declaration per state, of the kind the scene's rules set in that state
const IN_STATE: Record<State, { css: string; line: RegExp }> = {
  hover: { css: HOVER, line: / :hover\{backgroundColor:rgb\(1, 2, 3\)\}$/ },
  active: { css: "border-top-color: rgb(1, 2, 3)", line: / :active\{borderTopColor:rgb\(1, 2, 3\)\}$/ },
  focusVisible: {
    css: "outline: 2px solid rgb(1, 2, 3); outline-offset: 3px",
    line: / :focus-visible\{outlineStyle:solid;outlineWidth:2px;outlineColor:rgb\(1, 2, 3\);outlineOffset:3px\}$/,
  },
  disabled: { css: "opacity: 0.5", line: / :disabled\{opacity:0\.5\}$/ },
};

for (const state of STATES) {
  test(`a rule that applies only on ${STATE_SELECTOR[state]} is part of the fingerprint`, async () => {
    const without = await fingerprint("");
    const withRule = await fingerprint(`.a${STATE_SELECTOR[state]} { ${IN_STATE[state].css} }`);
    assert.equal(differing(without, withRule), 1);
    assert.match(withRule[0]!, IN_STATE[state].line);
    assert.equal(withRule[1], without[1]);
  });
}

test("a state rule reads the same however a library writes it", async () => {
  const plain = await fingerprint(`.a:hover { ${HOVER} }`);
  assert.equal(differing(plain, await fingerprint(".a:hover { background-color: rgb(3, 2, 1) }")), 1);
  const written: Record<string, [css: string, script?: string]> = {
    "in a layer, on a class that spells the state, with :is()": [`@layer utilities { .\\[\\&\\:hover\\]\\:bg:is(:hover, [data-hover]) { ${HOVER} } }`],
    nested: [`.a { &:hover { ${HOVER} } }`],
    "in a media query": [`@media (min-width: 1px) { .a:hover { ${HOVER} } }`],
    "inserted at run time": ["", `const s = document.createElement("style"); document.head.append(s); s.sheet.insertRule(".a:hover { ${HOVER} }");`],
    "kept off while disabled": [`.a:hover:not(:disabled) { ${HOVER} }`],
  };
  for (const [name, [css, script]] of Object.entries(written)) {
    assert.deepEqual(await fingerprint(css, script), plain, name);
  }
});

test("a state's styles are read past a transition", async () => {
  const slow = ".a { transition: background-color 10s; }";
  const one = await fingerprint(`${slow} .a:hover { ${HOVER} }`);
  assert.equal(differing(one, await fingerprint(`${slow} .a:hover { background-color: rgb(3, 2, 1) }`)), 1);
  assert.match(one[0]!, / :hover\{backgroundColor:rgb\(1, 2, 3\)\}$/);
});

test("the fingerprint leaves the page as it found it", async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(`<style>.a:hover { ${HOVER} } .a:disabled { opacity: 0.5 } .a { transition: opacity 10s, background-color 10s }</style>${HTML}`);
    const first = await fingerprintPage(page);
    assert.deepEqual(await fingerprintPage(page), first);
    assert.equal(await page.evaluate("document.head.querySelectorAll('style').length"), 1);
    assert.equal(await page.evaluate("document.styleSheets[0].cssRules[0].selectorText"), ".a:hover");
  } finally {
    await page.close();
  }
});
