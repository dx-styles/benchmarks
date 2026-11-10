import assert from "node:assert/strict";
import { test } from "node:test";

import { generate } from "../generators/panda.ts";
import { laneById } from "./lanes.ts";

// Without a preset Panda 2.4.0 defines no conditions: every `_hover`, `_active`, `_focusVisible`
// and `_disabled` block of the lane's styles is dropped without a warning.
test("panda: the config loads the preset that defines its conditions, and the lane installs it", () => {
  const { files } = generate();
  assert.ok(Object.values(files).some((text) => /\b_(hover|active|focusVisible|disabled): \{/.test(text)), "the styles use conditions");
  const presets = JSON.parse(files["panda.config.ts"]!.match(/^  presets: (\[.*\]),$/m)?.[1] ?? "[]") as string[];
  assert.deepEqual(presets, ["@pandacss/preset-base"]);
  const { deps } = laneById("market-panda");
  for (const preset of presets) assert.equal(deps[preset], deps["@pandacss/dev"], `market-panda installs ${preset} of its Panda version`);
});
