// setImmediate/clearImmediate for Cells, over the timer queue. Node runs
// immediates in their own macrotask phase; a zero-delay timeout matches the
// observable ordering Workers code relies on (after microtasks, before later
// timers). Compiled lazily the first time a bundle reads either name.
(() => {
  const setImmediate = (callback, ...args) => {
    if (typeof callback !== "function") {
      const e = new TypeError(
        'The "callback" argument must be of type function');
      e.code = "ERR_INVALID_ARG_TYPE";
      throw e;
    }
    return setTimeout(() => callback(...args), 0);
  };
  return { setImmediate, clearImmediate: (handle) => clearTimeout(handle) };
})()
