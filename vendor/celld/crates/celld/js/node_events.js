// node:events for Cells.
//
// Injected lazily into the generated stub module, so an isolate that never
// imports it pays nothing. Bundles reach for EventEmitter at module scope, so
// a pass-through proxy silently breaks them: `on()` would appear to register
// a handler that never fires.
//
// Ported from Workerd's `src/node/internal/events.ts` (Apache-2.0), itself
// adapted from Node.js (Joyent/Node contributors, MIT) — including the
// Node-compatible `_events` / `_eventsCount` / `_maxListeners` internals and
// the single-listener (bare function, no array) representation, which real
// bundles poke at.
(() => {
  const kRejection = Symbol.for("nodejs.rejection");
  const kCapture = Symbol("kCapture");
  const kErrorMonitor = Symbol("events.errorMonitor");
  const kMaxEventTargetListeners = Symbol("events.maxEventTargetListeners");

  // -- Node-style error factories -------------------------------------------

  const received = (v) => {
    if (v === null) return "null";
    if (v === undefined) return "undefined";
    if (typeof v === "object")
      return `an instance of ${v.constructor?.name ?? "Object"}`;
    return `type ${typeof v} (${inspect(v)})`;
  };
  const errInvalidArgType = (name, expected, actual) => {
    const e = new TypeError(
      `The "${name}" argument must be of type ${expected}. ` +
      `Received ${received(actual)}`);
    e.code = "ERR_INVALID_ARG_TYPE";
    return e;
  };
  const errOutOfRange = (name, range, actual) => {
    const e = new RangeError(
      `The value of "${name}" is out of range. It must be ${range}. ` +
      `Received ${actual}`);
    e.code = "ERR_OUT_OF_RANGE";
    return e;
  };
  const abortError = (cause) => {
    const e = new Error("The operation was aborted");
    e.name = "AbortError";
    e.code = "ABORT_ERR";
    if (cause !== undefined) e.cause = cause;
    return e;
  };

  const validateFunction = (value, name) => {
    if (typeof value !== "function")
      throw errInvalidArgType(name, "function", value);
  };
  const validateSignal = (signal, name) => {
    if (signal !== undefined && !(signal instanceof AbortSignal))
      throw errInvalidArgType(name, "AbortSignal", signal);
  };
  const validateNumber = (n, name) => {
    if (typeof n !== "number" || n < 0 || Number.isNaN(n))
      throw errOutOfRange(name, "a non-negative number", n);
  };

  // Minimal inspect for the unhandled-'error' message and common error values.
  const inspect = (v, depth = 0) => {
    if (typeof v === "string")
      return depth === 0 ? `'${v}'` : `'${v.replace(/'/g, "\\'")}'`;
    if (typeof v === "bigint") return `${v}n`;
    if (typeof v === "function") return `[Function: ${v.name || "anonymous"}]`;
    if (v === null || typeof v !== "object") return String(v);
    const custom = v[Symbol.for("nodejs.util.inspect.custom")];
    if (typeof custom === "function") return String(custom.call(v));
    if (depth > 2) return Array.isArray(v) ? "[Array]" : "[Object]";
    if (Array.isArray(v))
      return `[ ${v.map((x) => inspect(x, depth + 1)).join(", ")} ]`;
    const parts = Object.keys(v).map(
      (k) => `${k}: ${inspect(v[k], depth + 1)}`);
    return parts.length === 0 ? "{}" : `{ ${parts.join(", ")} }`;
  };

  // -- EventEmitter ---------------------------------------------------------

  // Function-style like Node, so `EventEmitter.call(this)` and
  // `Object.setPrototypeOf(Sub, EventEmitter)` inheritance both work.
  function EventEmitter(opts) {
    EventEmitter.init.call(this, opts);
    return this;
  }

  let defaultMaxListeners = 10;

  EventEmitter.init = function (opts) {
    if (this._events === undefined ||
        this._events === Object.getPrototypeOf(this)._events) {
      this._events = Object.create(null);
      this._eventsCount = 0;
    }
    this._maxListeners ??= undefined;
    this[kCapture] = opts?.captureRejections
      ? true : EventEmitter.prototype[kCapture];
  };

  EventEmitter.prototype._events = undefined;
  EventEmitter.prototype._eventsCount = 0;
  EventEmitter.prototype._maxListeners = undefined;
  Object.defineProperty(EventEmitter.prototype, kCapture, {
    value: false, writable: true, enumerable: false,
  });

  const getMaxListeners_ = (that) =>
    that._maxListeners === undefined
      ? defaultMaxListeners : that._maxListeners;

  EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
    validateNumber(n, "n");
    this._maxListeners = n;
    return this;
  };

  EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
    return getMaxListeners_(this);
  };

  // A listener returned a promise while captureRejections is on: route a
  // rejection to [kRejection] or, failing that, an async 'error' emit.
  const addCatch = (that, promise, type, args) => {
    if (!that[kCapture]) return;
    try {
      const then = promise.then;
      if (typeof then === "function") {
        then.call(promise, undefined, (err) => {
          queueMicrotask(() => {
            if (typeof that[kRejection] === "function") {
              that[kRejection](err, type, ...args);
            } else {
              // Disable capture to avoid an infinite loop if the 'error'
              // listener itself misbehaves.
              const prev = that[kCapture];
              try {
                that[kCapture] = false;
                that.emit("error", err);
              } finally {
                that[kCapture] = prev;
              }
            }
          });
        });
      }
    } catch (err) {
      that.emit("error", err);
    }
  };

  EventEmitter.prototype.emit = function emit(type, ...args) {
    let doError = type === "error";
    const events = this._events;
    if (events !== undefined) {
      if (doError && events[kErrorMonitor] !== undefined)
        this.emit(kErrorMonitor, ...args);
      doError = doError && events.error === undefined;
    } else if (!doError) {
      return false;
    }

    if (doError) {
      const er = args.length > 0 ? args[0] : undefined;
      if (er instanceof Error) throw er; // Unhandled 'error' event
      let stringified;
      try {
        stringified = inspect(er);
      } catch {
        stringified = er;
      }
      const err = new Error(`Unhandled error. (${stringified})`);
      err.code = "ERR_UNHANDLED_ERROR";
      err.context = er;
      throw err; // Unhandled 'error' event
    }

    const handler = events?.[type];
    if (handler === undefined) return false;
    if (typeof handler === "function") {
      const result = handler.apply(this, args);
      if (result !== undefined && result !== null)
        addCatch(this, result, type, args);
    } else {
      // Copy: a listener may add or remove listeners while dispatching, and
      // neither affects the current emit.
      for (const listener of handler.slice()) {
        const result = listener.apply(this, args);
        if (result !== undefined && result !== null)
          addCatch(this, result, type, args);
      }
    }
    return true;
  };

  const addListener_ = (target, type, listener, prepend) => {
    validateFunction(listener, "listener");
    let events = target._events;
    let existing;
    if (events === undefined) {
      events = target._events = Object.create(null);
      target._eventsCount = 0;
    } else {
      // Emit 'newListener' *before* adding, so a newListener handler adding
      // a listener for the same event lands ahead of this one.
      if (events.newListener !== undefined) {
        target.emit("newListener", type, listener.listener ?? listener);
        events = target._events;
      }
      existing = events[type];
    }

    if (existing === undefined) {
      events[type] = listener;
      ++target._eventsCount;
    } else {
      if (typeof existing === "function") {
        existing = events[type] =
          prepend ? [listener, existing] : [existing, listener];
      } else if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }
      const m = getMaxListeners_(target);
      if (m > 0 && existing.length > m && !existing.warned) {
        existing.warned = true;
        console.log(
          "MaxListenersExceededWarning: Possible EventEmitter memory leak " +
          `detected. ${existing.length} ${String(type)} listeners added. ` +
          "Use emitter.setMaxListeners() to increase limit");
      }
    }
    return target;
  };

  EventEmitter.prototype.addListener = function addListener(type, listener) {
    return addListener_(this, type, listener, false);
  };
  EventEmitter.prototype.on = EventEmitter.prototype.addListener;
  EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return addListener_(this, type, listener, true);
    };

  function onceWrapper() {
    if (!this.fired) {
      this.target.removeListener(this.type, this.wrapFn);
      this.fired = true;
      return this.listener.apply(this.target, arguments);
    }
  }

  const onceWrap = (target, type, listener) => {
    const state = { fired: false, wrapFn: undefined, target, type, listener };
    const wrapped = onceWrapper.bind(state);
    wrapped.listener = listener;
    state.wrapFn = wrapped;
    return wrapped;
  };

  EventEmitter.prototype.once = function once(type, listener) {
    validateFunction(listener, "listener");
    this.on(type, onceWrap(this, type, listener));
    return this;
  };

  EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      validateFunction(listener, "listener");
      this.prependListener(type, onceWrap(this, type, listener));
      return this;
    };

  EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      validateFunction(listener, "listener");
      const events = this._events;
      if (events === undefined) return this;
      const list = events[type];
      if (list === undefined) return this;

      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0) {
          this._events = Object.create(null);
        } else {
          delete events[type];
        }
        if (events.removeListener !== undefined)
          this.emit("removeListener", type, list.listener ?? listener);
      } else if (typeof list !== "function") {
        // Remove the most recently added match, as Node does.
        let position = -1;
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            position = i;
            break;
          }
        }
        if (position < 0) return this;
        list.splice(position, 1);
        if (list.length === 1) events[type] = list[0];
        if (events.removeListener !== undefined)
          this.emit("removeListener", type, listener);
      }
      return this;
    };
  EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

  EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      const events = this._events;
      if (events === undefined) return this;

      // Not listening for 'removeListener': no need to emit.
      if (events.removeListener === undefined) {
        if (arguments.length === 0) {
          this._events = Object.create(null);
          this._eventsCount = 0;
        } else if (events[type] !== undefined) {
          if (--this._eventsCount === 0) this._events = Object.create(null);
          else delete events[type];
        }
        return this;
      }

      // Emit 'removeListener' for all listeners on all events, LIFO, with
      // 'removeListener' itself last.
      if (arguments.length === 0) {
        for (const key of Reflect.ownKeys(events)) {
          if (key === "removeListener") continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners("removeListener");
        this._events = Object.create(null);
        this._eventsCount = 0;
        return this;
      }

      const listeners = events[type];
      if (typeof listeners === "function") {
        this.removeListener(type, listeners);
      } else if (listeners !== undefined) {
        for (let i = listeners.length - 1; i >= 0; i--)
          this.removeListener(type, listeners[i]);
      }
      return this;
    };

  const listeners_ = (target, type, unwrap) => {
    const events = target._events;
    if (events === undefined) return [];
    const list = events[type];
    if (list === undefined) return [];
    if (typeof list === "function")
      return unwrap ? [list.listener ?? list] : [list];
    return unwrap ? list.map((l) => l.listener ?? l) : list.slice();
  };

  EventEmitter.prototype.listeners = function listeners(type) {
    return listeners_(this, type, true);
  };
  EventEmitter.prototype.rawListeners = function rawListeners(type) {
    return listeners_(this, type, false);
  };

  function listenerCount(type) {
    const events = this._events;
    if (events !== undefined) {
      const list = events[type];
      if (typeof list === "function") return 1;
      if (list !== undefined) return list.length;
    }
    return 0;
  }
  EventEmitter.prototype.listenerCount = listenerCount;

  EventEmitter.prototype.eventNames = function eventNames() {
    return this._eventsCount > 0 ? Reflect.ownKeys(this._events ?? {}) : [];
  };

  // -- The module's static surface ------------------------------------------

  const addWithFlags = (emitter, name, listener, flags) => {
    if (typeof emitter.on === "function") {
      if (flags?.once) emitter.once(name, listener);
      else emitter.on(name, listener);
    } else if (typeof emitter.addEventListener === "function") {
      emitter.addEventListener(name, (arg) => listener(arg), flags);
    } else {
      throw errInvalidArgType("emitter", "EventEmitter", emitter);
    }
  };
  const removeAgnostic = (emitter, name, listener, flags) => {
    if (typeof emitter.removeListener === "function")
      emitter.removeListener(name, listener);
    else if (typeof emitter.removeEventListener === "function")
      emitter.removeEventListener(name, listener, flags);
    else throw errInvalidArgType("emitter", "EventEmitter", emitter);
  };

  async function once(emitter, name, options = {}) {
    if (options === null || typeof options !== "object")
      throw errInvalidArgType("options", "Object", options);
    const { signal } = options;
    validateSignal(signal, "options.signal");
    if (signal?.aborted) throw abortError(signal.reason);
    return new Promise((resolve, reject) => {
      const errorListener = (err) => {
        emitter.removeListener(name, resolver);
        if (signal != null) removeAgnostic(signal, "abort", abortListener);
        reject(err);
      };
      const resolver = (...args) => {
        if (typeof emitter.removeListener === "function")
          emitter.removeListener("error", errorListener);
        if (signal != null) removeAgnostic(signal, "abort", abortListener);
        resolve(args);
      };
      addWithFlags(emitter, name, resolver, { once: true });
      // EventTargets have no Node 'error' semantics; only EventEmitters do.
      if (name !== "error" && typeof emitter.once === "function")
        emitter.once("error", errorListener);
      function abortListener() {
        removeAgnostic(emitter, name, resolver);
        removeAgnostic(emitter, "error", errorListener);
        reject(abortError(signal.reason));
      }
      if (signal != null)
        addWithFlags(signal, "abort", abortListener, { once: true });
    });
  }

  const AsyncIteratorPrototype = Object.getPrototypeOf(
    Object.getPrototypeOf(async function* () {}).prototype);

  function on(emitter, event, options = {}) {
    const signal = options?.signal;
    validateSignal(signal, "options.signal");
    if (signal?.aborted) throw abortError(signal.reason);

    const unconsumedEvents = [];
    const unconsumedPromises = [];
    let error = null;
    let finished = false;

    const iterator = Object.setPrototypeOf({
      next() {
        const value = unconsumedEvents.shift();
        if (value) return Promise.resolve({ value, done: false });
        if (error) {
          const p = Promise.reject(error);
          error = null;
          return p;
        }
        if (finished)
          return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve, reject) => {
          unconsumedPromises.push({ resolve, reject });
        });
      },
      return() {
        removeAgnostic(emitter, event, eventHandler);
        removeAgnostic(emitter, "error", errorHandler);
        if (signal)
          removeAgnostic(signal, "abort", abortListener, { once: true });
        finished = true;
        for (const promise of unconsumedPromises)
          promise.resolve({ value: undefined, done: true });
        return Promise.resolve({ value: undefined, done: true });
      },
      throw(err) {
        if (!err || !(err instanceof Error))
          throw errInvalidArgType("EventEmitter.AsyncIterator", "Error", err);
        error = err;
        removeAgnostic(emitter, event, eventHandler);
        removeAgnostic(emitter, "error", errorHandler);
      },
      [Symbol.asyncIterator]() { return this; },
    }, AsyncIteratorPrototype);

    addWithFlags(emitter, event, eventHandler);
    if (event !== "error" && typeof emitter.on === "function")
      emitter.on("error", errorHandler);
    if (signal)
      addWithFlags(signal, "abort", abortListener, { once: true });
    return iterator;

    function abortListener() { errorHandler(abortError(signal.reason)); }
    function eventHandler(...args) {
      const promise = unconsumedPromises.shift();
      if (promise) promise.resolve({ value: args, done: false });
      else unconsumedEvents.push(args);
    }
    function errorHandler(err) {
      finished = true;
      const toError = unconsumedPromises.shift();
      if (toError) toError.reject(err);
      else error = err;
      iterator.return();
    }
  }

  function getEventListeners(emitterOrTarget, type) {
    if (typeof emitterOrTarget?.listeners === "function")
      return emitterOrTarget.listeners(type);
    // Workerd does not expose an EventTarget's listeners; match it.
    if (emitterOrTarget instanceof EventTarget) return [];
    throw errInvalidArgType(
      "emitter", "EventEmitter or EventTarget", emitterOrTarget);
  }

  function setMaxListeners(n = defaultMaxListeners, ...targets) {
    validateNumber(n, "n");
    if (targets.length === 0) {
      defaultMaxListeners = n;
      return;
    }
    for (const target of targets) {
      if (target instanceof EventTarget)
        target[kMaxEventTargetListeners] = n;
      else if (typeof target?.setMaxListeners === "function")
        target.setMaxListeners(n);
      else
        throw errInvalidArgType(
          "eventTargets", "EventEmitter or EventTarget", target);
    }
  }

  function addAbortListener(signal, listener) {
    if (signal === undefined)
      throw errInvalidArgType("signal", "AbortSignal", signal);
    validateSignal(signal, "signal");
    validateFunction(listener, "listener");
    let remove;
    if (signal.aborted) {
      queueMicrotask(() => listener());
    } else {
      signal.addEventListener("abort", listener, { once: true });
      remove = () => signal.removeEventListener("abort", listener);
    }
    // Symbol.dispose needs V8's explicit-resource-management; fall back to
    // the registry symbol Node's own polyfill uses.
    return {
      __proto__: null,
      [Symbol.dispose ?? Symbol.for("nodejs.dispose")]() { remove?.(); },
    };
  }

  class EventEmitterAsyncResource extends EventEmitter {
    // Cells' async_hooks is a shim, so the resource is a stand-in that runs
    // the callback synchronously in the current scope.
    #asyncResource;
    constructor(options) {
      super(options);
      this.#asyncResource = {
        eventEmitter: this,
        runInAsyncScope: (fn, thisArg, ...args) => fn.apply(thisArg, args),
      };
    }
    get asyncResource() { return this.#asyncResource; }
    emit(event, ...args) {
      this.#asyncResource.runInAsyncScope(
        EventEmitter.prototype.emit, this, event, ...args);
      return true;
    }
  }

  Object.assign(EventEmitter, {
    EventEmitter,
    EventEmitterAsyncResource,
    once,
    on,
    getEventListeners,
    getMaxListeners: (that) => getMaxListeners_(that),
    setMaxListeners,
    addAbortListener,
    listenerCount: (emitter, type) =>
      typeof emitter.listenerCount === "function"
        ? emitter.listenerCount(type) : listenerCount.call(emitter, type),
    usingDomains: false,
    captureRejectionSymbol: kRejection,
    errorMonitor: kErrorMonitor,
  });
  Object.defineProperties(EventEmitter, {
    captureRejections: {
      enumerable: true,
      get: () => EventEmitter.prototype[kCapture],
      set: (value) => {
        if (typeof value !== "boolean")
          throw errInvalidArgType(
            "EventEmitter.captureRejections", "boolean", value);
        EventEmitter.prototype[kCapture] = value;
      },
    },
    defaultMaxListeners: {
      enumerable: true,
      get: () => defaultMaxListeners,
      set: (n) => {
        validateNumber(n, "defaultMaxListeners");
        defaultMaxListeners = n;
      },
    },
  });

  globalThis.__eventsModule = EventEmitter;
})();
