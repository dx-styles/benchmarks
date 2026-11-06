/**
 * node harness/release-age.ts — check every package of every lockfile in locks/ (and
 * the harness's own package-lock.json) against the release-age rule: published at least
 * 7 days before the lanes were pinned, except the measured engine and its products
 * (dx-styles, @wyw-in-js/*, @linaria/*) and the browser-data packages caniuse-lite and
 * electron-to-chromium. Exits 1 and lists the offenders otherwise.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { PINNED_ON } from "./lanes.ts";
import { log, ROOT } from "./util.ts";

const CUTOFF = Date.parse(`${PINNED_ON}T00:00:00Z`) - 7 * 24 * 3600 * 1000;
// The measured engine and its products, and the browser-data packages that browserslist
// users are expected to keep current (they publish almost daily).
const EXEMPT = (name: string): boolean =>
  name === "dx-styles" ||
  name.startsWith("@wyw-in-js/") ||
  name.startsWith("@linaria/") ||
  name === "caniuse-lite" ||
  name === "electron-to-chromium";

const lockfiles = [join(ROOT, "package-lock.json"), ...(await readdir(join(ROOT, "locks"))).map((f) => join(ROOT, "locks", f))];
const wanted = new Map<string, Set<string>>();
for (const file of lockfiles) {
  const lock = JSON.parse(await readFile(file, "utf8")) as { packages: Record<string, { version?: string }> };
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path || !entry.version) continue;
    const name = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    const versions = wanted.get(name) ?? new Set<string>();
    versions.add(entry.version);
    wanted.set(name, versions);
  }
}

const offenders: string[] = [];
const names = [...wanted.keys()];
const fetchTimes = async (name: string): Promise<Record<string, string>> => {
  const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return ((await res.json()) as { time: Record<string, string> }).time;
};
for (let i = 0; i < names.length; i += 12) {
  await Promise.all(
    names.slice(i, i + 12).map(async (name) => {
      const times = await fetchTimes(name);
      for (const version of wanted.get(name)!) {
        const published = Date.parse(times[version] ?? "");
        if (!(published <= CUTOFF) && !EXEMPT(name)) offenders.push(`${name}@${version} (${times[version] ?? "unknown"})`);
      }
    }),
  );
}
log(`[release-age] ${names.length} packages in ${lockfiles.length} lockfiles, cutoff ${new Date(CUTOFF).toISOString().slice(0, 10)}`);
if (offenders.length > 0) {
  log(`[release-age] younger than the cutoff:\n  ${offenders.sort().join("\n  ")}`);
  process.exitCode = 1;
} else {
  log("[release-age] ok");
}
