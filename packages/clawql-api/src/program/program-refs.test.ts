import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  collectProposalRefSitesEffect,
  isProposalRefIssue,
  parseProposalRefEffect,
  PROPOSAL_REF_MAX_DEPTH,
  PROPOSAL_REF_MAX_LENGTH,
  PROPOSAL_REF_MAX_VALUE_LENGTH,
  PROPOSAL_REFS_MAX_PER_PROPOSAL,
  readProposalRefPathEffect,
  substituteProposalRefsEffect,
} from "./program-refs.js";

const run = <A>(effect: Effect.Effect<A>): A => Effect.runSync(effect);

function issueText(value: unknown): string {
  expect(isProposalRefIssue(value)).toBe(true);
  return (value as { error: string }).error;
}

describe("parseProposalRefEffect", () => {
  it("splits id, root, and path", () => {
    expect(run(parseProposalRefEffect("W1.result.items.0.id"))).toEqual({
      raw: "W1.result.items.0.id",
      target: "W1",
      root: "result",
      path: ["items", "0", "id"],
    });
    expect(run(parseProposalRefEffect("A.args"))).toEqual({
      raw: "A.args",
      target: "A",
      root: "args",
      path: [],
    });
  });

  it.each([
    ["", "non-empty string"],
    [42, "non-empty string"],
    ["W1", "continue with .result or .args"],
    ["W1.body.title", "continue with .result or .args"],
    ["1W.result", "must start with a call or proposal id"],
    ["W1.result..id", "empty path segment"],
  ])("fails closed on %j", (raw, fragment) => {
    expect(issueText(run(parseProposalRefEffect(raw)))).toContain(fragment);
  });

  it(`caps path depth at ${PROPOSAL_REF_MAX_DEPTH}`, () => {
    const segments = (n: number) => Array.from({ length: n }, (_, i) => `k${i}`).join(".");
    expect(
      isProposalRefIssue(
        run(parseProposalRefEffect(`A.result.${segments(PROPOSAL_REF_MAX_DEPTH)}`))
      )
    ).toBe(false);
    expect(
      issueText(run(parseProposalRefEffect(`A.result.${segments(PROPOSAL_REF_MAX_DEPTH + 1)}`)))
    ).toContain(`exceeds ${PROPOSAL_REF_MAX_DEPTH}`);
  });

  it(`caps ref length at ${PROPOSAL_REF_MAX_LENGTH}`, () => {
    const raw = `A.result.${"x".repeat(PROPOSAL_REF_MAX_LENGTH)}`;
    expect(issueText(run(parseProposalRefEffect(raw)))).toContain("longer than");
  });
});

describe("collectProposalRefSitesEffect", () => {
  it("returns every placeholder with its JSON Pointer", () => {
    const sites = run(
      collectProposalRefSitesEffect({
        title: "literal",
        "a/b~c": { $ref: "A.result.id" },
        list: [1, { nested: { $ref: "W1.args.title" } }],
      })
    );
    expect(isProposalRefIssue(sites)).toBe(false);
    expect(sites).toEqual([
      {
        at: "/a~1b~0c",
        ref: { raw: "A.result.id", target: "A", root: "result", path: ["id"] },
      },
      {
        at: "/list/1/nested",
        ref: { raw: "W1.args.title", target: "W1", root: "args", path: ["title"] },
      },
    ]);
  });

  it("requires a placeholder to be the only key in its object", () => {
    expect(
      issueText(run(collectProposalRefSitesEffect({ x: { $ref: "A.result.id", extra: 1 } })))
    ).toContain("only key");
  });

  it("rejects args that are themselves a placeholder", () => {
    expect(issueText(run(collectProposalRefSitesEffect({ $ref: "A.result.id" })))).toContain(
      "args itself"
    );
  });

  it("reports malformed refs with their location", () => {
    expect(issueText(run(collectProposalRefSitesEffect({ x: [{ $ref: "nope" }] })))).toContain(
      "/x/0:"
    );
  });

  it(`caps placeholders per proposal at ${PROPOSAL_REFS_MAX_PER_PROPOSAL}`, () => {
    const args = Object.fromEntries(
      Array.from({ length: PROPOSAL_REFS_MAX_PER_PROPOSAL + 1 }, (_, i) => [
        `f${i}`,
        { $ref: "A.result.id" },
      ])
    );
    expect(issueText(run(collectProposalRefSitesEffect(args)))).toContain("more than");
  });

  it("caps nesting depth", () => {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 40; i++) deep = { d: deep };
    expect(issueText(run(collectProposalRefSitesEffect(deep)))).toContain("nest deeper");
  });
});

describe("readProposalRefPathEffect", () => {
  const value = { items: [{ id: 7, name: "a" }], ok: true, none: null, n: 1.5 };

  it("reads JSON scalars through objects and arrays", () => {
    expect(run(readProposalRefPathEffect(value, ["items", "0", "id"]))).toEqual({
      ok: true,
      value: 7,
    });
    expect(run(readProposalRefPathEffect(value, ["ok"]))).toEqual({ ok: true, value: true });
    expect(run(readProposalRefPathEffect(value, ["none"]))).toEqual({ ok: true, value: null });
    expect(run(readProposalRefPathEffect("plain", []))).toEqual({ ok: true, value: "plain" });
  });

  it.each([
    [["items"], "an array"],
    [["items", "0"], "an object"],
    [[], "an object"],
    [["missing"], 'key "missing" not found'],
    [["items", "01"], "not an array index"],
    [["items", "5"], "out of range"],
    [["toString"], 'key "toString" not found'],
    [["n", "x"], 'cannot read "x" of number'],
  ])("fails closed on path %j", (path, fragment) => {
    const out = run(readProposalRefPathEffect(value, path));
    expect(out.ok).toBe(false);
    expect(out.ok ? "" : out.error).toContain(fragment);
  });

  it("rejects non-finite numbers and oversized strings", () => {
    expect(run(readProposalRefPathEffect({ x: Number.NaN }, ["x"])).ok).toBe(false);
    const long = { s: "x".repeat(PROPOSAL_REF_MAX_VALUE_LENGTH + 1) };
    const out = run(readProposalRefPathEffect(long, ["s"]));
    expect(out.ok ? "" : out.error).toContain("longer than");
  });
});

describe("substituteProposalRefsEffect", () => {
  it("returns a copy with placeholders replaced and the template untouched", () => {
    const template = { title: { $ref: "A.result.title" }, tags: ["x", { $ref: "A.result.n" }] };
    const out = run(
      substituteProposalRefsEffect(
        template,
        new Map<string, string | number>([
          ["/title", "Hello"],
          ["/tags/1", 3],
        ])
      )
    );
    expect(out).toEqual({ title: "Hello", tags: ["x", 3] });
    expect(template.title).toEqual({ $ref: "A.result.title" });
  });

  it("keeps an own __proto__ key as plain data", () => {
    const template = JSON.parse('{"__proto__": {"$ref": "A.result.x"}, "y": 1}') as Record<
      string,
      unknown
    >;
    const out = run(substituteProposalRefsEffect(template, new Map([["/__proto__", "v"]])));
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(out, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(out, "__proto__")?.value).toBe("v");
    expect(out.y).toBe(1);
  });
});
