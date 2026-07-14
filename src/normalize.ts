/**
 * Schema normalization: the small, loss-free rewrites that let the diff
 * engine compare drafts on equal footing, plus local `$ref` resolution
 * and the JSON utility helpers (deep-equal, stable stringify) the rest
 * of the engine leans on. Everything here is pure.
 */
import type { Json, Schema, SchemaObject } from "./types.js";

/** True when `value` is a plain object (not null, not an array). */
export function isObject(value: unknown): value is { [k: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deep structural equality over JSON values. Order-sensitive for arrays. */
export function deepEqual(a: Json | undefined, b: Json | undefined): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isObject(a)) {
    if (!isObject(b)) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

/** JSON.stringify with object keys sorted — a stable identity for values. */
export function stableStringify(value: Json | undefined): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  if (isObject(value)) {
    const parts = Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`);
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Render a value for a human-facing reason string, truncated politely. */
export function displayValue(value: Json | undefined, max = 60): string {
  const s = stableStringify(value);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Decode one JSON Pointer token (`~1` → `/`, `~0` → `~`). */
function decodePointerToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Resolve a document-local JSON Pointer `$ref` (e.g. `#/$defs/User`)
 * against `root`. Returns `undefined` for external refs, anchors, or
 * dangling pointers — the caller decides how honest to be about that.
 */
export function resolveRef(root: Schema, ref: string): Schema | undefined {
  if (!ref.startsWith("#")) return undefined;
  const pointer = ref.slice(1);
  if (pointer === "") return root;
  if (!pointer.startsWith("/")) return undefined; // `#anchor` — unsupported
  let node: Json | undefined = root as Json;
  for (const raw of pointer.slice(1).split("/")) {
    const token = decodePointerToken(raw);
    if (Array.isArray(node)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= node.length) {
        return undefined;
      }
      node = node[index];
    } else if (isObject(node)) {
      if (!(token in node)) return undefined;
      node = node[token];
    } else {
      return undefined;
    }
  }
  if (typeof node === "boolean" || isObject(node)) return node as Schema;
  return undefined;
}

/**
 * Normalize one schema node so the comparator sees a single dialect:
 *
 * - boolean schemas: `true` → `{}`, `false` → `{ not: {} }`;
 * - draft-04 boolean `exclusiveMinimum`/`exclusiveMaximum` → the
 *   numeric draft-06+ form (or dropped when `false`);
 * - array-form `items` (old tuple syntax) → `prefixItems`, with the
 *   accompanying `additionalItems` → `items`;
 * - draft-07 `dependencies` → `dependentRequired` + `dependentSchemas`;
 * - single-value `enum` → `const`;
 * - `type` as a one-element array → the bare string.
 *
 * Only the touched keywords are rewritten; everything else is shared
 * by reference (the engine never mutates schema nodes).
 */
export function normalizeNode(schema: Schema): SchemaObject {
  if (schema === true) return {};
  if (schema === false) return { not: {} };
  const node = schema;
  let out: SchemaObject | null = null;
  const patch = (updates: SchemaObject, drop: string[] = []): void => {
    if (out === null) out = { ...node };
    for (const key of drop) delete out[key];
    Object.assign(out, updates);
  };

  // draft-04 boolean exclusive bounds.
  if (typeof node.exclusiveMinimum === "boolean") {
    if (node.exclusiveMinimum && typeof node.minimum === "number") {
      patch({ exclusiveMinimum: node.minimum }, ["minimum"]);
    } else {
      patch({}, ["exclusiveMinimum"]);
    }
  }
  if (typeof node.exclusiveMaximum === "boolean") {
    if (node.exclusiveMaximum && typeof node.maximum === "number") {
      patch({ exclusiveMaximum: node.maximum }, ["maximum"]);
    } else {
      patch({}, ["exclusiveMaximum"]);
    }
  }

  // Old tuple syntax: items: [...] (+ additionalItems).
  if (Array.isArray(node.items)) {
    const updates: SchemaObject = { prefixItems: node.items };
    const drop = ["items"];
    if (node.additionalItems !== undefined) {
      updates.items = node.additionalItems;
      drop.push("additionalItems");
    }
    patch(updates, drop);
  }

  // draft-07 dependencies → dependentRequired / dependentSchemas.
  if (isObject(node.dependencies)) {
    const required: { [k: string]: Json } = isObject(node.dependentRequired)
      ? { ...node.dependentRequired }
      : {};
    const schemas: { [k: string]: Json } = isObject(node.dependentSchemas)
      ? { ...node.dependentSchemas }
      : {};
    for (const [key, value] of Object.entries(node.dependencies)) {
      if (Array.isArray(value)) required[key] = value;
      else schemas[key] = value as Json;
    }
    const updates: SchemaObject = {};
    if (Object.keys(required).length > 0) updates.dependentRequired = required;
    if (Object.keys(schemas).length > 0) updates.dependentSchemas = schemas;
    patch(updates, ["dependencies"]);
  }

  // enum with one value is a const.
  if (Array.isArray(node.enum) && node.enum.length === 1 && node.const === undefined) {
    patch({ const: node.enum[0] }, ["enum"]);
  }

  // type: ["string"] → type: "string".
  if (Array.isArray(node.type) && node.type.length === 1 && typeof node.type[0] === "string") {
    patch({ type: node.type[0] });
  }

  return out ?? node;
}

/** The seven JSON type names an instance can be. */
export const JSON_TYPES = [
  "null",
  "boolean",
  "object",
  "array",
  "string",
  "number",
  "integer",
] as const;

export type JsonTypeName = (typeof JSON_TYPES)[number];

/**
 * The set of instance types a `type` keyword accepts. An absent or
 * malformed keyword accepts everything. `number` covers `integer`
 * (every integer instance is a number), so the returned set is closed
 * under that subtyping rule.
 */
export function acceptedTypes(type: Json | undefined): Set<JsonTypeName> {
  if (type === undefined) return new Set(JSON_TYPES);
  const names = Array.isArray(type) ? type : [type];
  const set = new Set<JsonTypeName>();
  for (const name of names) {
    if (typeof name !== "string") continue;
    if ((JSON_TYPES as readonly string[]).includes(name)) {
      set.add(name as JsonTypeName);
      if (name === "number") set.add("integer");
    }
  }
  // A `type` that names no known type accepts nothing we can reason
  // about; treat it as the universe rather than invent a rejection.
  return set.size > 0 ? set : new Set(JSON_TYPES);
}

/** Short label for the dialect a schema declares, for report headers. */
export function dialectLabel(schema: Schema): string {
  if (typeof schema === "boolean" || typeof schema.$schema !== "string") {
    return "no $schema";
  }
  const url = schema.$schema;
  const named = url.match(/draft[/-](20\d\d-\d\d|0?\d+)/i);
  if (named?.[1]) {
    const tag = named[1];
    return /^\d{4}-\d{2}$/.test(tag) ? tag : `draft-${tag.padStart(2, "0")}`;
  }
  return url;
}
