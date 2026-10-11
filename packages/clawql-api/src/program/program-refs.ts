/**
 * Proposal `$ref` placeholders (ADR 0015 § Dependent writes via proposal references).
 *
 * A placeholder is an object whose only key is `$ref`:
 * `{ "$ref": "<id>.<root>(.<segment>)*" }`
 *
 * - `<call>.result…` — a read call's result; resolved by `execute_program`.
 * - `<proposal>.args…` — an earlier proposal's resolved args; resolved by `execute_program`.
 * - `<proposal>.result…` — an earlier proposal's execute result; deferred until
 *   `submit_program_proposals` has run that proposal.
 *
 * A ref resolves to one JSON scalar (string, number, boolean, null). Objects, arrays,
 * missing paths, and anything over the caps below fail closed.
 */

import { Effect } from "effect";

export const PROPOSAL_REF_KEY = "$ref";

/** Max path segments after `<id>.<root>`. */
export const PROPOSAL_REF_MAX_DEPTH = 8;

/** Max length of one `$ref` string. */
export const PROPOSAL_REF_MAX_LENGTH = 256;

/** Max length of a string a `$ref` may resolve to. */
export const PROPOSAL_REF_MAX_VALUE_LENGTH = 4096;

/** Max `$ref` placeholders inside one proposal's args. */
export const PROPOSAL_REFS_MAX_PER_PROPOSAL = 32;

/** Max object/array nesting scanned inside proposal or call args. */
export const PROPOSAL_ARGS_MAX_NESTING = 32;

/** Call / proposal ids that refs can target (no dots — dots separate path segments). */
export const PROGRAM_REF_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

export type ProposalRefRoot = "result" | "args";

export type ProposalRef = {
  readonly raw: string;
  readonly target: string;
  readonly root: ProposalRefRoot;
  readonly path: readonly string[];
};

/** One placeholder inside args: JSON Pointer of the placeholder plus its parsed ref. */
export type ProposalRefSite = {
  readonly at: string;
  readonly ref: ProposalRef;
};

export type ProposalRefScalar = string | number | boolean | null;

export type ProposalRefIssue = {
  readonly ok: false;
  readonly error: string;
  readonly fixHint: string;
};

export type ProposalRefRead =
  | { readonly ok: true; readonly value: ProposalRefScalar }
  | { readonly ok: false; readonly error: string };

const REF_FIX_HINT =
  'Use { "$ref": "<id>.result.<path>" } (read call or earlier proposal) or { "$ref": "<proposalId>.args.<path>" }.';

const ARRAY_INDEX = /^(0|[1-9][0-9]*)$/;

function issue(error: string, fixHint = REF_FIX_HINT): ProposalRefIssue {
  return { ok: false, error, fixHint };
}

function isIssue(v: unknown): v is ProposalRefIssue {
  return typeof v === "object" && v !== null && (v as { ok?: unknown }).ok === false;
}

function escapePointerToken(key: string): string {
  return key.replace(/~/g, "~0").replace(/\//g, "~1");
}

function pointerLabel(pointer: string): string {
  return pointer === "" ? "/" : pointer;
}

function parseRef(raw: unknown): ProposalRef | ProposalRefIssue {
  if (typeof raw !== "string" || raw.length === 0) {
    return issue("$ref must be a non-empty string");
  }
  if (raw.length > PROPOSAL_REF_MAX_LENGTH) {
    return issue(`$ref is longer than ${PROPOSAL_REF_MAX_LENGTH} characters`);
  }
  const [target, root, ...path] = raw.split(".");
  if (!target || !PROGRAM_REF_ID_PATTERN.test(target)) {
    return issue(`$ref "${raw}" must start with a call or proposal id`);
  }
  if (root !== "result" && root !== "args") {
    return issue(`$ref "${raw}" must continue with .result or .args after the id`);
  }
  if (path.length > PROPOSAL_REF_MAX_DEPTH) {
    return issue(
      `$ref "${raw}" path depth ${path.length} exceeds ${PROPOSAL_REF_MAX_DEPTH}`,
      "Reference a shallower field, or split the work into two programs."
    );
  }
  if (path.some((segment) => segment.length === 0)) {
    return issue(`$ref "${raw}" has an empty path segment`);
  }
  return { raw, target, root, path };
}

function collectSites(
  args: Record<string, unknown>
): readonly ProposalRefSite[] | ProposalRefIssue {
  const sites: ProposalRefSite[] = [];
  const walk = (node: unknown, pointer: string, depth: number): ProposalRefIssue | undefined => {
    if (node === null || typeof node !== "object") return undefined;
    if (depth > PROPOSAL_ARGS_MAX_NESTING) {
      return issue(
        `args nest deeper than ${PROPOSAL_ARGS_MAX_NESTING} levels at ${pointerLabel(pointer)}`,
        "Flatten the arguments."
      );
    }
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const err = walk(node[i], `${pointer}/${i}`, depth + 1);
        if (err) return err;
      }
      return undefined;
    }
    const obj = node as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(obj, PROPOSAL_REF_KEY)) {
      if (Object.keys(obj).length !== 1) {
        return issue(
          `${pointerLabel(pointer)}: a $ref placeholder must be the only key in its object`
        );
      }
      if (pointer === "") {
        return issue("args itself cannot be a $ref placeholder; put refs on individual fields");
      }
      const ref = parseRef(obj[PROPOSAL_REF_KEY]);
      if (isIssue(ref)) {
        return { ...ref, error: `${pointerLabel(pointer)}: ${ref.error}` };
      }
      sites.push({ at: pointer, ref });
      if (sites.length > PROPOSAL_REFS_MAX_PER_PROPOSAL) {
        return issue(
          `more than ${PROPOSAL_REFS_MAX_PER_PROPOSAL} $ref placeholders in one proposal`,
          "Split the work into more proposals or two programs."
        );
      }
      return undefined;
    }
    for (const key of Object.keys(obj)) {
      const err = walk(obj[key], `${pointer}/${escapePointerToken(key)}`, depth + 1);
      if (err) return err;
    }
    return undefined;
  };
  const err = walk(args, "", 0);
  return err ?? sites;
}

function describeValue(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "an array";
  return typeof v === "object" ? "an object" : typeof v;
}

function readPath(value: unknown, path: readonly string[]): ProposalRefRead {
  let cur: unknown = value;
  for (const segment of path) {
    if (Array.isArray(cur)) {
      if (!ARRAY_INDEX.test(segment)) {
        return { ok: false, error: `segment "${segment}" is not an array index` };
      }
      const index = Number(segment);
      if (index >= cur.length) {
        return { ok: false, error: `index ${index} is out of range (length ${cur.length})` };
      }
      cur = cur[index];
    } else if (cur !== null && typeof cur === "object") {
      if (!Object.prototype.hasOwnProperty.call(cur, segment)) {
        return { ok: false, error: `key "${segment}" not found` };
      }
      cur = (cur as Record<string, unknown>)[segment];
    } else {
      return { ok: false, error: `cannot read "${segment}" of ${describeValue(cur)}` };
    }
  }
  if (typeof cur === "string" && cur.length > PROPOSAL_REF_MAX_VALUE_LENGTH) {
    return {
      ok: false,
      error: `resolves to a string longer than ${PROPOSAL_REF_MAX_VALUE_LENGTH} characters`,
    };
  }
  if (
    cur === null ||
    typeof cur === "string" ||
    typeof cur === "boolean" ||
    (typeof cur === "number" && Number.isFinite(cur))
  ) {
    return { ok: true, value: cur };
  }
  return {
    ok: false,
    error: `resolves to ${describeValue(cur)}, not a single JSON value (string, number, boolean, or null)`,
  };
}

function substitute(
  args: Record<string, unknown>,
  values: ReadonlyMap<string, ProposalRefScalar>
): Record<string, unknown> {
  const walk = (node: unknown, pointer: string): unknown => {
    if (values.has(pointer)) return values.get(pointer);
    if (Array.isArray(node)) return node.map((v, i) => walk(v, `${pointer}/${i}`));
    if (node !== null && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(node)) {
        // defineProperty keeps an own `__proto__` key from JSON.parse instead of re-parenting `out`.
        Object.defineProperty(out, key, {
          value: walk(
            (node as Record<string, unknown>)[key],
            `${pointer}/${escapePointerToken(key)}`
          ),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return out;
    }
    return node;
  };
  return walk(args, "") as Record<string, unknown>;
}

/** Parse one `$ref` string (`<id>.<root>(.<segment>)*`); issues fail closed. */
export const parseProposalRefEffect = (
  raw: unknown
): Effect.Effect<ProposalRef | ProposalRefIssue> => Effect.sync(() => parseRef(raw));

/**
 * Find every `$ref` placeholder in `args`. Any object carrying a `$ref` key must be a
 * well-formed single-key placeholder; anything else is an issue.
 */
export const collectProposalRefSitesEffect = (
  args: Record<string, unknown>
): Effect.Effect<readonly ProposalRefSite[] | ProposalRefIssue> =>
  Effect.sync(() => collectSites(args));

/** Follow `path` into `value`; succeeds only on a JSON scalar. */
export const readProposalRefPathEffect = (
  value: unknown,
  path: readonly string[]
): Effect.Effect<ProposalRefRead> => Effect.sync(() => readPath(value, path));

/** Copy `args`, replacing placeholders at the given JSON Pointers with resolved scalars. */
export const substituteProposalRefsEffect = (
  args: Record<string, unknown>,
  values: ReadonlyMap<string, ProposalRefScalar>
): Effect.Effect<Record<string, unknown>> => Effect.sync(() => substitute(args, values));

export const isProposalRefIssue = (v: unknown): v is ProposalRefIssue => isIssue(v);
