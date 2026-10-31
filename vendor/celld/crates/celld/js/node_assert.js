// node:assert for celld.
//
// A real implementation matters more than most shims: a pass-through
// proxy would return truthy from every assertion, so any test that
// imported `node:assert` would pass vacuously.
(() => {
  const toStr = Object.prototype.toString;
  const isObj = (v) => v !== null && typeof v === "object";

  const inspect = (v, depth = 0) => {
    if (typeof v === "string") return depth ? JSON.stringify(v) : v;
    if (typeof v === "bigint") return `${v}n`;
    if (typeof v === "symbol" || typeof v === "function") return String(v);
    if (!isObj(v)) return String(v);
    if (depth > 2) return Array.isArray(v) ? "[Array]" : "[Object]";
    const next = depth + 1;
    if (Array.isArray(v))
      return `[ ${v.map((x) => inspect(x, next)).join(", ")} ]`;
    if (v instanceof Date) return v.toISOString();
    if (v instanceof RegExp) return String(v);
    if (v instanceof Error) return `${v.name}: ${v.message}`;
    if (v instanceof Map)
      return `Map { ${[...v].map(([k, x]) =>
        `${inspect(k, next)} => ${inspect(x, next)}`).join(", ")} }`;
    if (v instanceof Set)
      return `Set { ${[...v].map((x) => inspect(x, next)).join(", ")} }`;
    if (ArrayBuffer.isView(v)) return `${v.constructor.name}(${v.length})`;
    const body = Object.keys(v)
      .map((k) => `${k}: ${inspect(v[k], next)}`).join(", ");
    return body ? `{ ${body} }` : "{}";
  };

  class AssertionError extends Error {
    constructor(options = {}) {
      const { actual, expected, operator, stackStartFn } = options;
      const message = options.message ||
        `${inspect(actual)} ${operator} ${inspect(expected)}`;
      super(message);
      this.name = "AssertionError";
      this.code = "ERR_ASSERTION";
      this.actual = actual;
      this.expected = expected;
      this.operator = operator;
      this.generatedMessage = !options.message;
      if (stackStartFn && Error.captureStackTrace)
        Error.captureStackTrace(this, stackStartFn);
    }
  }

  const fail_ = (actual, expected, message, operator, fn) => {
    if (message instanceof Error) throw message;
    throw new AssertionError({
      actual, expected, message, operator, stackStartFn: fn,
    });
  };

  // Node treats NaN as equal to NaN even in the loose comparisons.
  const looseEq = (a, b) =>
    (typeof a === "number" && typeof b === "number" &&
      Number.isNaN(a) && Number.isNaN(b)) || a == b;

  const enumKeys = (o) => [
    ...Object.keys(o),
    ...Object.getOwnPropertySymbols(o).filter((s) =>
      Object.getOwnPropertyDescriptor(o, s).enumerable),
  ];

  const bytesEq = (a, b) => {
    if (a.byteLength !== b.byteLength) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };
  const viewOf = (v) => v instanceof ArrayBuffer
    ? new Uint8Array(v)
    : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);

  // Unordered structural match for Map/Set: exact hit first, then a deep
  // scan over the not-yet-consumed entries.
  const unorderedEq = (as, bs, strict, seen, cmp) => {
    const rest = [...bs];
    outer: for (const a of as) {
      for (let i = 0; i < rest.length; i++) {
        if (cmp(a, rest[i], strict, seen)) { rest.splice(i, 1); continue outer; }
      }
      return false;
    }
    return true;
  };

  const deepEq = (a, b, strict, seen) => {
    if (strict ? Object.is(a, b) : a === b) return true;
    if (!isObj(a) || !isObj(b))
      return strict ? Object.is(a, b) : looseEq(a, b);
    if (toStr.call(a) !== toStr.call(b)) return false;
    if (strict && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b))
      return false;

    seen = seen || new Map();
    const pairs = seen.get(a);
    if (pairs) {
      if (pairs.has(b)) return true; // already comparing this cycle
      pairs.add(b);
    } else seen.set(a, new Set([b]));

    if (a instanceof Date) return a.getTime() === b.getTime();
    if (a instanceof RegExp)
      return a.source === b.source && a.flags === b.flags;
    if (a instanceof Error)
      return a.name === b.name && a.message === b.message;
    if (a instanceof ArrayBuffer || ArrayBuffer.isView(a)) {
      if (a instanceof DataView && a.byteLength !== b.byteLength) return false;
      if (!bytesEq(viewOf(a), viewOf(b))) return false;
      // typed arrays may still carry expando properties; fall through
    }
    if (a instanceof Map) {
      if (a.size !== b.size) return false;
      const entryEq = (x, y, s, m) =>
        deepEq(x[0], y[0], s, m) && deepEq(x[1], y[1], s, m);
      if (!unorderedEq(a, b, strict, seen, entryEq)) return false;
    }
    if (a instanceof Set) {
      if (a.size !== b.size) return false;
      if (!unorderedEq(a, b, strict, seen, deepEq)) return false;
    }
    // Boxed primitives.
    if (a instanceof Number || a instanceof String || a instanceof Boolean) {
      if (!Object.is(a.valueOf(), b.valueOf())) return false;
    }
    if (Array.isArray(a) && a.length !== b.length) return false;

    const ka = enumKeys(a);
    const kb = enumKeys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!deepEq(a[k], b[k], strict, seen)) return false;
    }
    return true;
  };

  // Does a thrown value satisfy `expected` (constructor, RegExp, validation
  // function, or a subset object of properties)?
  const matches = (error, expected) => {
    if (expected === undefined) return true;
    if (typeof expected === "function") {
      if (expected.prototype !== undefined && error instanceof expected)
        return true;
      if (Object.getPrototypeOf(expected) === Function.prototype ||
          expected.prototype === undefined)
        return expected(error) === true;
      return false;
    }
    if (expected instanceof RegExp) return expected.test(String(error));
    if (isObj(expected)) {
      for (const k of enumKeys(expected)) {
        const want = expected[k];
        const got = error == null ? undefined : error[k];
        if (want instanceof RegExp) {
          if (!want.test(String(got))) return false;
        } else if (!deepEq(got, want, true)) return false;
      }
      return true;
    }
    return false;
  };

  const assert = function assert(value, message) {
    if (!value)
      fail_(value, true, message, "==", assert);
  };

  assert.AssertionError = AssertionError;
  assert.ok = function ok(value, message) {
    if (!value) fail_(value, true, message, "==", ok);
  };
  assert.fail = function fail(message) {
    if (message instanceof Error) throw message;
    throw new AssertionError({
      message: message === undefined ? "Failed" : message,
      actual: undefined, expected: undefined, operator: "fail",
      stackStartFn: fail,
    });
  };
  assert.equal = function equal(a, b, message) {
    if (!looseEq(a, b)) fail_(a, b, message, "==", equal);
  };
  assert.notEqual = function notEqual(a, b, message) {
    if (looseEq(a, b)) fail_(a, b, message, "!=", notEqual);
  };
  assert.strictEqual = function strictEqual(a, b, message) {
    if (!Object.is(a, b)) fail_(a, b, message, "strictEqual", strictEqual);
  };
  assert.notStrictEqual = function notStrictEqual(a, b, message) {
    if (Object.is(a, b))
      fail_(a, b, message, "notStrictEqual", notStrictEqual);
  };
  assert.deepEqual = function deepEqual(a, b, message) {
    if (!deepEq(a, b, false)) fail_(a, b, message, "deepEqual", deepEqual);
  };
  assert.notDeepEqual = function notDeepEqual(a, b, message) {
    if (deepEq(a, b, false))
      fail_(a, b, message, "notDeepEqual", notDeepEqual);
  };
  assert.deepStrictEqual = function deepStrictEqual(a, b, message) {
    if (!deepEq(a, b, true))
      fail_(a, b, message, "deepStrictEqual", deepStrictEqual);
  };
  assert.notDeepStrictEqual = function notDeepStrictEqual(a, b, message) {
    if (deepEq(a, b, true))
      fail_(a, b, message, "notDeepStrictEqual", notDeepStrictEqual);
  };
  assert.match = function match(string, regexp, message) {
    if (!regexp.test(string)) fail_(string, regexp, message, "match", match);
  };
  assert.doesNotMatch = function doesNotMatch(string, regexp, message) {
    if (regexp.test(string))
      fail_(string, regexp, message, "doesNotMatch", doesNotMatch);
  };

  assert.throws = function throws(fn, expected, message) {
    if (typeof expected === "string" && message === undefined) {
      message = expected;
      expected = undefined;
    }
    let threw = false;
    let error;
    try { fn(); } catch (e) { threw = true; error = e; }
    if (!threw)
      fail_(undefined, expected, message ?? "Missing expected exception.",
        "throws", throws);
    if (!matches(error, expected)) throw error;
  };

  assert.doesNotThrow = function doesNotThrow(fn, expected, message) {
    try { fn(); } catch (e) {
      if (typeof expected === "string") { message = expected; }
      throw new AssertionError({
        message: `Got unwanted exception${message ? `: ${message}` : ""}\n` +
          `Actual message: "${e && e.message}"`,
        actual: e, expected: undefined, operator: "doesNotThrow",
        stackStartFn: doesNotThrow,
      });
    }
  };

  assert.rejects = async function rejects(fn, expected, message) {
    if (typeof expected === "string" && message === undefined) {
      message = expected;
      expected = undefined;
    }
    let threw = false;
    let error;
    try {
      await (typeof fn === "function" ? fn() : fn);
    } catch (e) { threw = true; error = e; }
    if (!threw)
      fail_(undefined, expected, message ?? "Missing expected rejection.",
        "rejects", rejects);
    if (!matches(error, expected)) throw error;
  };

  assert.doesNotReject = async function doesNotReject(fn, expected, message) {
    try {
      await (typeof fn === "function" ? fn() : fn);
    } catch (e) {
      if (typeof expected === "string") { message = expected; }
      throw new AssertionError({
        message: `Got unwanted rejection${message ? `: ${message}` : ""}\n` +
          `Actual message: "${e && e.message}"`,
        actual: e, expected: undefined, operator: "doesNotReject",
        stackStartFn: doesNotReject,
      });
    }
  };

  assert.ifError = function ifError(value) {
    if (value === null || value === undefined) return;
    throw new AssertionError({
      message: `ifError got unwanted exception: ${
        value && value.message ? value.message : inspect(value)}`,
      actual: value, expected: null, operator: "ifError",
      stackStartFn: ifError,
    });
  };

  // `node:assert/strict` — the loose forms alias the strict ones.
  const strict = Object.assign(
    function strict(value, message) { assert.ok(value, message); },
    assert,
    {
      equal: assert.strictEqual,
      notEqual: assert.notStrictEqual,
      deepEqual: assert.deepStrictEqual,
      notDeepEqual: assert.notDeepStrictEqual,
    },
  );
  strict.strict = strict;
  assert.strict = strict;

  globalThis.__assertModule = assert;
  globalThis.__assertStrictModule = strict;
})();
