// node:test for Cells — the `mock` surface only.
//
// Injected lazily into the generated stub module, so an isolate that never
// imports it pays nothing.
//
// The runner entry points (`test`, `describe`, `it`) deliberately throw
// rather than no-op: a silently-skipped test reports success while asserting
// nothing, which is the failure mode this module exists to avoid.
(() => {
  const tracked = [];

  const makeMock = (original, implementation) => {
    const calls = [];
    let impl = implementation || original || (() => {});
    const state = {
      calls,
      callCount: () => calls.length,
      resetCalls: () => {
        calls.length = 0;
      },
      mockImplementation: (next) => {
        impl = next;
      },
      mockImplementationOnce: (next) => {
        const previous = impl;
        impl = function (...args) {
          impl = previous;
          return next.apply(this, args);
        };
      },
      restore: () => {
        impl = original || (() => {});
      },
    };

    function mocked(...args) {
      const record = { arguments: args, this: this, result: undefined,
        error: undefined };
      calls.push(record);
      try {
        record.result = impl.apply(this, args);
        return record.result;
      } catch (error) {
        record.error = error;
        throw error;
      }
    }
    Object.defineProperty(mocked, "mock", { value: state, enumerable: false });
    tracked.push(state);
    return mocked;
  };

  const notImplemented = (name) => () => {
    throw new Error(
      `node:test ${name}() is not implemented in Cells. Tests that rely on ` +
      `it would report success without asserting anything.`,
    );
  };

  const mock = {
    fn: (original, implementation) => makeMock(original, implementation),
    reset: () => {
      for (const state of tracked) state.resetCalls();
      tracked.length = 0;
    },
    restoreAll: () => {
      for (const state of tracked) state.restore();
    },
    method: () => {
      throw new Error("node:test mock.method() is not implemented in Cells.");
    },
  };

  const test = notImplemented("test");
  globalThis.__nodeTest = {
    mock,
    test,
    default: test,
    describe: notImplemented("describe"),
    it: notImplemented("it"),
    before: notImplemented("before"),
    after: notImplemented("after"),
    beforeEach: notImplemented("beforeEach"),
    afterEach: notImplemented("afterEach"),
  };
})();
