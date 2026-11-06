import { spawn } from "node:child_process";
import { loadavg } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  ms: number;
}

/** Run a command; reject on a non-zero exit unless `allowFail`. */
export const run = (
  cmd: string,
  args: string[],
  opts: { cwd: string; env?: Record<string, string>; allowFail?: boolean },
): Promise<RunResult> =>
  new Promise((resolve, reject) => {
    const start = performance.now();
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { code: code ?? -1, stdout, stderr, ms: performance.now() - start };
      if (result.code !== 0 && !opts.allowFail) {
        reject(new Error(`${cmd} ${args.join(" ")} (in ${opts.cwd}) exited ${result.code}:\n${stderr || stdout}`));
      } else {
        resolve(result);
      }
    });
  });

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export const load1 = (): number => Math.round((loadavg()[0] ?? 0) * 10) / 10;

export const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

export const min = (values: number[]): number => Math.min(...values);

export const log = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
