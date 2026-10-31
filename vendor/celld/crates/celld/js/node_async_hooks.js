// node:async_hooks for Cells — real AsyncLocalStorage/AsyncResource over
// V8 continuation-preserved embedder data, the same primitive Workerd's
// jsg::AsyncContextFrame rides (src/workerd/jsg/async-context.c++). The
// CPED value is the current async-context frame: a Map from
// AsyncLocalStorage instance to its store, or undefined for the root
// frame. V8 captures the value when a promise reaction (or thenable job)
// is created and restores it while the reaction runs, so context flows
// through await, .then, and custom thenables with no promise hooks and
// no per-promise JS. An isolate that never runs this script never sets
// the value, so a bundle that does not import async_hooks pays nothing.
//
// Injected lazily into the generated stub module, so an isolate that
// never imports it pays nothing.
(() => {
  const getFrame = globalThis.__als_get;
  const setFrame = globalThis.__als_set;

  // Enter `frame`, call, restore — Workerd's AsyncContextFrame::Scope.
  const call = (frame, fn, thisArg, args) => {
    const prior = getFrame();
    setFrame(frame);
    try {
      return Reflect.apply(fn, thisArg, args);
    } finally {
      setFrame(prior);
    }
  };

  class AsyncLocalStorage {
    #name;
    #defaultValue;
    constructor(options) {
      if (options !== undefined && options !== null) {
        this.#defaultValue = options.defaultValue;
        if (options.name !== undefined) this.#name = `${options.name}`;
      }
    }
    get name() {
      return this.#name ?? "";
    }
    getStore() {
      const frame = getFrame();
      if (frame !== undefined && frame.has(this)) return frame.get(this);
      return this.#defaultValue;
    }
    run(store, callback, ...args) {
      // A new frame clones the current storage context and adds this
      // cell, exactly as Workerd's AsyncContextFrame constructor does.
      const frame = new Map(getFrame());
      frame.set(this, store);
      return call(frame, callback, globalThis, args);
    }
    // Workerd models exit() as run(undefined): the store is unset for
    // the callback and for everything it schedules.
    exit(callback, ...args) {
      return this.run(undefined, callback, ...args);
    }
    enterWith() {
      throw new Error("asyncLocalStorage.enterWith() is not implemented");
    }
    disable() {
      throw new Error("asyncLocalStorage.disable() is not implemented");
    }
    static bind(fn) {
      const frame = getFrame();
      return (...args) => call(frame, fn, globalThis, args);
    }
    static snapshot() {
      const frame = getFrame();
      return (fn, ...args) => {
        if (typeof fn !== "function")
          throw new TypeError("The first argument must be a function");
        return call(frame, fn, globalThis, args);
      };
    }
  }

  class AsyncResource {
    #frame;
    // Workerd ignores `type` (validating only its shape) and rejects the
    // Node-only triggerAsyncId option.
    constructor(_type, options) {
      if (options && options.triggerAsyncId !== undefined)
        throw new Error("The triggerAsyncId option is not implemented");
      this.#frame = getFrame();
    }
    runInAsyncScope(fn, thisArg, ...args) {
      return call(this.#frame, fn, thisArg ?? globalThis, args);
    }
    bind(fn, thisArg) {
      const frame = this.#frame;
      const bound = (...args) => call(frame, fn, thisArg ?? globalThis, args);
      bound.asyncResource = this;
      return bound;
    }
    static bind(fn, type, thisArg) {
      return new AsyncResource(type ?? "AsyncResource").bind(fn, thisArg);
    }
    asyncId() {
      return 0;
    }
    triggerAsyncId() {
      return 0;
    }
    emitDestroy() {}
  }

  class AsyncHook {
    enable() {
      return this;
    }
    disable() {
      return this;
    }
  }

  // Node's async_wrap ProviderType names, all 0, as Workerd exports them.
  const asyncWrapProviders = Object.fromEntries(
    ("NONE DIRHANDLE DNSCHANNEL ELDHISTOGRAM FILEHANDLE " +
      "FILEHANDLECLOSEREQ BLOBREADER FSEVENTWRAP FSREQCALLBACK " +
      "FSREQPROMISE GETADDRINFOREQWRAP GETNAMEINFOREQWRAP HEAPSNAPSHOT " +
      "HTTP2SESSION HTTP2STREAM HTTP2PING HTTP2SETTINGS " +
      "HTTPINCOMINGMESSAGE HTTPCLIENTREQUEST LOCKS JSSTREAM JSUDPWRAP " +
      "MESSAGEPORT PIPECONNECTWRAP PIPESERVERWRAP PIPEWRAP PROCESSWRAP " +
      "PROMISE QUERYWRAP QUIC_ENDPOINT QUIC_LOGSTREAM QUIC_SESSION " +
      "QUIC_STREAM QUIC_UDP SHUTDOWNWRAP SIGNALWRAP STATWATCHER " +
      "STREAMPIPE TCPCONNECTWRAP TCPSERVERWRAP TCPWRAP TTYWRAP " +
      "UDPSENDWRAP UDPWRAP SIGINTWATCHDOG WORKER WORKERCPUPROFILE " +
      "WORKERCPUUSAGE WORKERHEAPPROFILE WORKERHEAPSNAPSHOT " +
      "WORKERHEAPSTATISTICS WRITEWRAP ZLIB CHECKPRIMEREQUEST " +
      "PBKDF2REQUEST KEYPAIRGENREQUEST KEYGENREQUEST KEYEXPORTREQUEST " +
      "ARGON2REQUEST CIPHERREQUEST DERIVEBITSREQUEST HASHREQUEST " +
      "RANDOMBYTESREQUEST RANDOMPRIMEREQUEST SCRYPTREQUEST SIGNREQUEST " +
      "TLSWRAP VERIFYREQUEST QUIC_PACKET")
      .split(" ")
      .map((name) => [name, 0]),
  );

  globalThis.__asyncHooksModule = {
    AsyncLocalStorage,
    AsyncResource,
    asyncWrapProviders,
    createHook: () => new AsyncHook(),
    executionAsyncId: () => 0,
    triggerAsyncId: () => 0,
    executionAsyncResource: () => Object.create(null),
  };
})();
