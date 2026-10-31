// node:timers/promises for Cells.
//
// Injected lazily into the generated stub module, so an isolate that never
// imports it pays nothing.
(() => {
  const withSignal = (ms, value, options, schedule) =>
    new Promise((resolve, reject) => {
      const signal = options && options.signal;
      if (signal && signal.aborted) {
        reject(signal.reason);
        return;
      }
      let onAbort;
      const id = schedule(() => {
        if (signal && onAbort) signal.removeEventListener("abort", onAbort);
        resolve(value);
      }, Number(ms) || 0);
      if (signal) {
        onAbort = () => {
          globalThis.clearTimeout(id);
          reject(signal.reason);
        };
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });

  const setTimeout_ = (ms, value, options) =>
    withSignal(ms, value, options, globalThis.setTimeout);

  const setImmediate_ = (value, options) =>
    withSignal(0, value, options, globalThis.setTimeout);

  // Yields once per interval until the caller stops iterating or aborts.
  async function* setInterval_(ms, value, options) {
    for (;;) {
      await setTimeout_(ms, undefined, options);
      yield value;
    }
  }

  globalThis.__timersPromises = {
    setTimeout: setTimeout_,
    setImmediate: setImmediate_,
    setInterval: setInterval_,
    scheduler: {
      wait: (ms, options) => setTimeout_(ms, undefined, options),
      yield: () => setImmediate_(undefined),
    },
  };
})();
