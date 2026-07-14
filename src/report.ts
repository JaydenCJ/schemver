/**
 * Rendering: the human text report and the machine JSON document.
 * Both are pure functions of the diff result — no clocks, no locale,
 * byte-identical output for identical inputs.
 */
import type { Bump, Change, DiffReport, Json, Severity } from "./types.js";
import { VERSION } from "./version.js";

/** What the CLI knows about each input file. */
export interface SourceInfo {
  source: string;
  dialect: string;
}

/** The `--fail-on` gate values. */
export type FailOn = "breaking" | "risky" | "any" | "none";

/** Does the gate trip for this report? */
export function gateTrips(report: DiffReport, failOn: FailOn): boolean {
  switch (failOn) {
    case "none":
      return false;
    case "any":
      return report.changes.length > 0;
    case "risky":
      return report.summary.breaking > 0 || report.summary.risky > 0;
    case "breaking":
      return report.summary.breaking > 0;
  }
}

const SECTION: Record<Severity, string> = {
  breaking: "BREAKING",
  risky: "RISKY",
  additive: "ADDITIVE",
};

const MARK: Record<Severity, string> = { breaking: "!", risky: "?", additive: "+" };

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function displayPath(path: string): string {
  return path === "" ? "(root)" : path;
}

function verdictWord(bump: Bump): string {
  return bump.toUpperCase();
}

function verdictLine(report: DiffReport): string {
  const { summary } = report;
  if (report.changes.length === 0) {
    return `verdict: NONE — the schemas accept the same instances (mode: ${report.mode})`;
  }
  const parts = [
    `${summary.breaking} breaking`,
    `${summary.risky} risky`,
    `${summary.additive} additive`,
  ];
  return `verdict: ${verdictWord(report.bump)} — ${parts.join(", ")} (mode: ${report.mode}${report.strict ? ", strict" : ""})`;
}

/** Render the human diff report. */
export function renderDiffText(
  report: DiffReport,
  oldInfo: SourceInfo,
  newInfo: SourceInfo,
): string {
  const lines: string[] = [];
  lines.push(`schemver ${VERSION} — schema compatibility diff (mode: ${report.mode}${report.strict ? ", strict" : ""})`);
  lines.push("");
  lines.push(`old  ${oldInfo.source} · ${oldInfo.dialect}`);
  lines.push(`new  ${newInfo.source} · ${newInfo.dialect} · ${report.comparedNodes} node pair${report.comparedNodes === 1 ? "" : "s"} compared`);
  lines.push("");

  const pathWidth = Math.max(
    12,
    ...report.changes.map((change) => displayPath(change.path).length),
  );
  const codeWidth = Math.max(4, ...report.changes.map((change) => change.code.length));

  for (const severity of ["breaking", "risky", "additive"] as const) {
    const bucket = report.changes.filter((change) => change.severity === severity);
    lines.push(`${SECTION[severity]} (${bucket.length})`);
    if (bucket.length === 0) {
      lines.push("  none");
    }
    for (const change of bucket) {
      lines.push(
        `  ${MARK[severity]} ${pad(displayPath(change.path), pathWidth)}  ${pad(change.code, codeWidth)}  ${change.reason}`,
      );
    }
    lines.push("");
  }

  lines.push(verdictLine(report));
  return lines.join("\n");
}

/** Render the human report for the `bump` command. */
export function renderBumpText(
  report: DiffReport,
  oldInfo: SourceInfo,
  newInfo: SourceInfo,
  current: string,
  next: string,
  check?: { proposed: string; satisfies: boolean; delivered: Bump | undefined },
): string {
  const lines: string[] = [];
  lines.push(`schemver ${VERSION} — semver verdict (mode: ${report.mode}${report.strict ? ", strict" : ""})`);
  lines.push("");
  lines.push(`old  ${oldInfo.source} · ${oldInfo.dialect}`);
  lines.push(`new  ${newInfo.source} · ${newInfo.dialect}`);
  lines.push("");
  lines.push(
    `changes        ${report.summary.breaking} breaking · ${report.summary.risky} risky · ${report.summary.additive} additive`,
  );
  lines.push(`required bump  ${report.bump}`);
  lines.push(`current        ${current}`);
  lines.push(`next           ${next}`);
  if (check !== undefined) {
    const delivered = check.delivered === undefined ? "a downgrade or no change" : `a ${check.delivered} bump`;
    lines.push(
      check.satisfies
        ? `proposed       ${check.proposed} — OK (delivers ${delivered}, ${report.bump} required)`
        : `proposed       ${check.proposed} — INSUFFICIENT (delivers ${delivered}, ${report.bump} required)`,
    );
  }
  return lines.join("\n");
}

function changeJson(change: Change): { [key: string]: Json } {
  const out: { [key: string]: Json } = {
    code: change.code,
    path: change.path,
    schemaPath: change.schemaPath,
    keyword: change.keyword,
    effect: change.effect,
    severity: change.severity,
    reason: change.reason,
  };
  if (change.before !== undefined) out.before = change.before;
  if (change.after !== undefined) out.after = change.after;
  return out;
}

/** The machine document shared by `diff --json` and `bump --json`. */
export function renderJson(
  report: DiffReport,
  oldInfo: SourceInfo,
  newInfo: SourceInfo,
  extra: { [key: string]: Json } = {},
): string {
  const doc: { [key: string]: Json } = {
    tool: "schemver",
    version: VERSION,
    mode: report.mode,
    strict: report.strict,
    old: { source: oldInfo.source, dialect: oldInfo.dialect },
    new: { source: newInfo.source, dialect: newInfo.dialect },
    comparedNodes: report.comparedNodes,
    summary: { ...report.summary },
    bump: report.bump,
    changes: report.changes.map(changeJson),
    ...extra,
  };
  return JSON.stringify(doc, null, 2);
}
