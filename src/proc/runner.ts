import { execFile } from 'node:child_process';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}
export type Run = (cmd: string, args: string[], opts?: { timeoutMs?: number }) => Promise<RunResult>;

/** Runs a command; never rejects on non-zero exit (code -1 if it could not start or timed out). */
export const realRun: Run = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout: opts.timeoutMs ?? 0, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      const exit = (err as { code?: unknown } | null)?.code;
      const code = !err ? 0 : typeof exit === 'number' ? exit : -1;
      resolve({ code, stdout: String(stdout), stderr: String(stderr || (err && !stderr ? err.message : '')) });
    });
  });
