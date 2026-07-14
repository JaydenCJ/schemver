/**
 * Minimal ambient declarations for the handful of Node.js built-ins this
 * project uses. Declaring them in-repo keeps `typescript` the only
 * devDependency (no `@types/node`); the surface below is intentionally
 * restricted to exactly what `src/` calls, so a typo against a real Node
 * API still fails to compile.
 */

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
}

interface NodeWritableStream {
  write(chunk: string): boolean;
  on(event: "error", listener: (error: Error & { code?: string }) => void): void;
}

declare var process: {
  argv: string[];
  exitCode: number | undefined;
  exit(code?: number): never;
  stdout: NodeWritableStream;
  stderr: NodeWritableStream;
};
