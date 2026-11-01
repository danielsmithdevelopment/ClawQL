// The fatal-error gate of a Python Worker bundle.
//
// After a fatal interpreter error, Python futures can no longer settle, so
// every call that waits on one must fail instead of hanging. The gate keeps
// one reject callback for each waiting call and removes it when that call
// settles. A single never-settling promise raced by every call is the
// obvious alternative, and it is wrong: each race adds a reaction to that
// promise, and the reaction holds the call's result for the life of the
// isolate, so a healthy Worker leaks every response it returns.
export function fatalGate() {
  let error = null;
  const waiting = new Set();
  return {
    get error() {
      return error;
    },
    fail(reason) {
      if (error !== null) return;
      error = reason;
      for (const reject of waiting) reject(reason);
      waiting.clear();
    },
    // Settle as `awaitable` does, or reject when the interpreter fails first.
    guard(awaitable) {
      if (error !== null) return Promise.reject(error);
      return new Promise((resolve, reject) => {
        waiting.add(reject);
        Promise.resolve(awaitable)
          .then(resolve, reject)
          .finally(() => waiting.delete(reject));
      });
    },
  };
}
