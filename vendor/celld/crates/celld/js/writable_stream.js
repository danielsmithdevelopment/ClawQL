// WritableStream (WHATWG subset)
//
// The stream follows the spec state machine: 'writable' | 'erroring' |
// 'errored' | 'closed'. An abort or controller error while a sink
// write/close is in flight (or before start settles) parks the stream in
// 'erroring'; the in-flight operation completes normally, then
// _finishErroring rejects the queued writes in order, runs the sink
// abort, and rejects close/closed. Two deliberate Workerd deviations
// from the current spec text: abort() on an errored stream rejects with
// the stored error (spec resolves), and repeated abort() calls return
// the same promise even after it settles.

// Brand-check sentinel for internal construction.
const _wsc_brand = Symbol("WritableStreamController");

class WritableStreamDefaultController {
  #stream;
  #abortController;

  constructor(brand, stream) {
    if (brand !== _wsc_brand)
      throw new TypeError(
        "WritableStreamDefaultController cannot be " +
        "constructed directly");
    this.#stream = stream;
    // Spec: [[signal]] is an AbortSignal that fires
    // when the stream is aborted, letting sinks cancel
    // in-flight work. Lazily pair with an internal
    // AbortController so the signal survives the full
    // lifetime of the controller.
    this.#abortController = new AbortController();
    stream._signalAbort = (reason) => {
      if (!this.#abortController.signal.aborted) {
        this.#abortController.abort(reason);
      }
    };
  }

  error(e) {
    this.#stream._errorStream(e);
  }

  get signal() {
    return this.#abortController.signal;
  }
}

class WritableStreamDefaultWriter {
  #stream;
  #released = false;
  #closedPromise;
  #closedResolve;
  #closedReject;
  #readyPromise;
  #readyResolve;
  #readyReject;

  constructor(stream) {
    if (!(stream instanceof WritableStream))
      throw new TypeError(
        "WritableStreamDefaultWriter requires a " +
        "WritableStream argument");
    if (stream._locked)
      throw new TypeError("WritableStream is locked");
    this.#stream = stream;
    stream._locked = true;
    stream._writer = this;

    // Closed promise. Same pattern as ReadableStream
    // (#105): attach a no-op sink so V8 doesn't fire
    // unhandled-rejection when the writer is aborted
    // and the user never touched writer.closed. User
    // `await writer.closed` still sees the rejection
    // because the promise is shared.
    this.#closedPromise = new Promise((res, rej) => {
      this.#closedResolve = res;
      this.#closedReject = rej;
    });
    this.#closedPromise.catch(() => {});

    this._resetReady();
    const state = stream._state;
    if (state === 'writable') {
      if (stream._closing() || !stream._backpressure)
        this.#readyResolve();
    } else if (state === 'closed') {
      this.#readyResolve();
      this._resolveClosed();
    } else if (state === 'erroring') {
      this._rejectReady(stream._storedError);
    } else { // errored
      this._rejectReady(stream._storedError);
      this._rejectClosed(stream._storedError);
    }
  }

  _resetReady() {
    this.#readyPromise = new Promise((res, rej) => {
      this.#readyResolve = res;
      this.#readyReject = rej;
    });
    // Same pattern the constructor uses for the
    // closed promise: attach a no-op rejection sink
    // so V8 doesn't report an unhandled rejection
    // when ready is rejected by the erroring path and
    // the user never touched `writer.ready`. The
    // user awaiting writer.ready still sees the
    // rejection — the promise is shared. Without
    // this, a writable whose sink throws on the
    // first write produced both the user-visible
    // `await writer.write(…)` rejection AND a
    // ghost "Uncaught (in promise)" reported on
    // the freshly-reset ready promise (the
    // queueSize-just-hit-hwm case).
    this.#readyPromise.catch(() => {});
  }

  _resolveReady() {
    if (this.#readyResolve) this.#readyResolve();
  }

  _rejectReady(e) {
    if (this.#readyReject) {
      this.#readyReject(e);
      // Replace with a rejected promise so subsequent
      // reads of writer.ready get the error.
      this.#readyPromise = Promise.reject(e);
      // Prevent unhandled rejection.
      this.#readyPromise.catch(() => {});
      this.#readyResolve = null;
      this.#readyReject = null;
    }
  }

  _resolveClosed() {
    if (this.#closedResolve) this.#closedResolve();
  }

  _rejectClosed(e) {
    if (this.#closedReject) {
      this.#closedReject(e);
      this.#closedResolve = null;
      this.#closedReject = null;
    }
  }

  write(chunk) {
    if (this.#released)
      return Promise.reject(
        new TypeError("This WritableStream writer has been released."));
    return this.#stream._write(chunk);
  }

  close() {
    if (this.#released)
      return Promise.reject(
        new TypeError("This WritableStream writer has been released."));
    return this.#stream._close();
  }

  abort(reason) {
    if (this.#released)
      return Promise.reject(
        new TypeError("This WritableStream writer has been released."));
    return this.#stream._abort(reason);
  }

  releaseLock() {
    if (this.#released) return;
    const s = this.#stream;
    // Spec §4.6.9: releasing rejects the writer's ready
    // and (still-pending) closed promises with a fresh
    // TypeError, even while an abort is in flight.
    const err = new TypeError(
      "This WritableStream writer has been released.");
    this._rejectReady(err);
    this._rejectClosed(err);
    // Workerd also rejects queued (not in-flight) writes
    // with the same error; the chunks are dropped.
    for (const entry of s._queue) entry.reject(err);
    s._queue = [];
    s._queueSize = 0;
    s._locked = false;
    s._writer = null;
    this.#released = true;
  }

  get desiredSize() {
    const s = this.#stream;
    if (s._state === 'errored' ||
        s._state === 'erroring') return null;
    if (s._state === 'closed') return 0;
    return s._hwm - s._queueSize;
  }

  get ready() { return this.#readyPromise; }
  get closed() { return this.#closedPromise; }
}

class WritableStream {
  _sink = null;
  _locked = false;
  _state = 'writable'; // writable|erroring|errored|closed
  _storedError = undefined;
  _controller = null;
  _writer = null;
  _queue = []; // of {chunk, size, resolve, reject}
  _queueSize = 0;
  _inFlightWrite = null;
  _inFlightClose = null;
  _closeRequest = null;
  _pendingAbort = null;
  _abortPromise = null;
  _backpressure = false;
  _hwm = 1;
  _started = false;

  constructor(underlyingSink, queuingStrategy) {
    // Per spec: extract strategy fields first. Size is
    // read and validated before highWaterMark; invalid
    // size must beat invalid highWaterMark.
    if (queuingStrategy !== undefined) {
      const size = queuingStrategy.size;
      if (size !== undefined
          && typeof size !== 'function')
        throw new TypeError(
          'strategy.size must be a function');
      this._sizeFn = size;
      const hwm = queuingStrategy.highWaterMark;
      if (hwm !== undefined) {
        const n = Number(hwm);
        // Workerd throws TypeError here, not the spec's
        // RangeError.
        if (Number.isNaN(n) || n < 0)
          throw new TypeError(
            'highWaterMark must be non-negative');
        this._hwm = n;
      }
    }
    const sink = underlyingSink || {};
    if (sink.type !== undefined)
      throw new RangeError("Invalid type");
    this._sink = sink;
    // Cache sink algorithms once per spec + bind this.
    this._startFn = sink.start;
    this._writeFn = sink.write;
    this._closeFn = sink.close;
    this._abortFn = sink.abort;
    this._controller = new WritableStreamDefaultController(
      _wsc_brand, this);
    this._backpressure = this._queueSize >= this._hwm;
    if (this._startFn) {
      // A sync start throw becomes a rejection rather
      // than escaping the constructor; per spec it
      // errors the stream once started is recorded.
      let result;
      try {
        result = this._startFn.call(sink, this._controller);
      } catch (e) { result = Promise.reject(e); }
      Promise.resolve(result).then(
        () => { this._started = true; this._advanceQueue(); },
        (e) => { this._started = true; this._dealWithRejection(e); },
      );
    } else {
      // Workerd starts a sink with no start() synchronously:
      // a write dispatched before the next microtask is
      // already in flight when an abort arrives, so it
      // completes instead of being rejected with the queue.
      this._started = true;
    }
  }

  _closing() {
    return this._closeRequest !== null ||
           this._inFlightClose !== null;
  }

  // Backpressure flips only on a threshold crossing, so
  // ready is reset (or resolved) once per transition
  // rather than on every write.
  _updateBackpressure() {
    const bp = this._queueSize >= this._hwm;
    if (bp === this._backpressure) return;
    this._backpressure = bp;
    const w = this._writer;
    if (!w) return;
    if (bp) w._resetReady();
    else w._resolveReady();
  }

  _write(chunk) {
    // Spec: the size algorithm runs before the state
    // checks; a throw or invalid size errors the stream
    // and the checks below then reject with it.
    let size = 1;
    if (this._sizeFn) {
      try {
        size = this._sizeFn(chunk);
        if (!Number.isFinite(size) || size < 0)
          throw new RangeError(
            "invalid strategy size: " + size);
      } catch (e) {
        this._errorStream(e);
      }
    }
    if (this._state === 'errored')
      return Promise.reject(this._storedError);
    if (this._closing() || this._state === 'closed')
      return Promise.reject(new TypeError(
        "Cannot write to a closing/closed stream"));
    if (this._state === 'erroring')
      return Promise.reject(this._storedError);
    return new Promise((resolve, reject) => {
      this._queue.push({ chunk, size, resolve, reject });
      this._queueSize += size;
      this._updateBackpressure();
      this._advanceQueue();
    });
  }

  _close() {
    if (this._state === 'closed' ||
        this._state === 'errored')
      return Promise.reject(new TypeError(
        "Stream already closed/errored"));
    if (this._closing())
      return Promise.reject(new TypeError(
        "Stream already closing"));
    return new Promise((resolve, reject) => {
      this._closeRequest = { resolve, reject };
      if (this._backpressure &&
          this._state === 'writable' && this._writer)
        this._writer._resolveReady();
      this._advanceQueue();
    });
  }

  _abort(reason) {
    // Workerd: repeated abort() returns the same promise,
    // settled or not.
    if (this._abortPromise) return this._abortPromise;
    if (this._state === 'closed')
      return Promise.resolve();
    // Workerd deviation from the current spec: aborting an
    // errored stream rejects with the stored error.
    if (this._state === 'errored')
      return Promise.reject(this._storedError);
    // Fire the controller's AbortSignal so sinks watching
    // controller.signal can cancel in-flight work.
    if (this._signalAbort) this._signalAbort(reason);
    const wasErroring = this._state === 'erroring';
    if (wasErroring) reason = undefined;
    const p = new Promise((resolve, reject) => {
      this._pendingAbort =
        { resolve, reject, reason, wasErroring };
    });
    this._abortPromise = p;
    // No-op sink: a dropped abort() that ends up rejecting
    // must not fire the unhandled-rejection hook.
    p.catch(() => {});
    if (!wasErroring) this._startErroring(reason);
    return p;
  }

  // WritableStreamDefaultControllerErrorIfNeeded.
  _errorStream(e) {
    if (this._state === 'writable') this._startErroring(e);
  }

  _startErroring(reason) {
    this._storedError = reason;
    this._state = 'erroring';
    if (this._writer) this._writer._rejectReady(reason);
    if (this._started && !this._inFlightWrite &&
        !this._inFlightClose)
      this._finishErroring();
  }

  _finishErroring() {
    this._state = 'errored';
    const err = this._storedError;
    // Reject queued writes in order, then settle abort,
    // then reject close/closed — the spec's promise
    // resolution order.
    for (const entry of this._queue) entry.reject(err);
    this._queue = [];
    this._queueSize = 0;
    const abortReq = this._pendingAbort;
    this._pendingAbort = null;
    if (!abortReq) {
      this._rejectCloseAndClosed();
      return;
    }
    if (abortReq.wasErroring) {
      // The stream was already erroring when abort() was
      // called: the sink abort is not run.
      abortReq.reject(err);
      this._rejectCloseAndClosed();
      return;
    }
    let result;
    try {
      result = this._abortFn
        ? this._abortFn.call(this._sink, abortReq.reason)
        : undefined;
    } catch (e) { result = Promise.reject(e); }
    Promise.resolve(result).then(
      () => {
        abortReq.resolve();
        this._rejectCloseAndClosed();
      },
      (e) => {
        abortReq.reject(e);
        this._rejectCloseAndClosed();
      },
    );
  }

  _rejectCloseAndClosed() {
    if (this._closeRequest) {
      this._closeRequest.reject(this._storedError);
      this._closeRequest = null;
    }
    if (this._writer)
      this._writer._rejectClosed(this._storedError);
  }

  _dealWithRejection(e) {
    if (this._state === 'writable') {
      this._startErroring(e);
      return;
    }
    if (this._state === 'erroring') this._finishErroring();
  }

  _advanceQueue() {
    if (!this._started) return;
    if (this._inFlightWrite || this._inFlightClose) return;
    const state = this._state;
    if (state === 'errored' || state === 'closed') return;
    if (state === 'erroring') {
      this._finishErroring();
      return;
    }
    if (this._queue.length > 0)
      this._startWrite(this._queue.shift());
    else if (this._closeRequest)
      this._startClose();
  }

  _startWrite(entry) {
    this._inFlightWrite = entry;
    // A sync throw is deferred into a rejection so an
    // abort() issued between write() and the microtask
    // still sees the write as in flight (Workerd runs the
    // sink abort in that case; a sync error path would
    // reach the errored state first and skip it).
    let result;
    try {
      result = this._writeFn
        ? this._writeFn.call(
            this._sink, entry.chunk, this._controller)
        : undefined;
    } catch (e) { result = Promise.reject(e); }
    Promise.resolve(result).then(
      () => {
        this._inFlightWrite = null;
        entry.resolve(undefined);
        this._queueSize -= entry.size;
        if (this._queueSize < 0) this._queueSize = 0;
        if (this._state === 'writable' && !this._closing())
          this._updateBackpressure();
        this._advanceQueue();
      },
      (e) => {
        this._inFlightWrite = null;
        this._queueSize -= entry.size;
        if (this._queueSize < 0) this._queueSize = 0;
        entry.reject(e);
        this._dealWithRejection(e);
      },
    );
  }

  _startClose() {
    this._inFlightClose = this._closeRequest;
    this._closeRequest = null;
    let result;
    try {
      result = this._closeFn
        ? this._closeFn.call(this._sink)
        : undefined;
    } catch (e) { result = Promise.reject(e); }
    Promise.resolve(result).then(
      () => this._finishClose(),
      (e) => this._finishCloseWithError(e),
    );
  }

  _finishClose() {
    this._inFlightClose.resolve();
    this._inFlightClose = null;
    if (this._state === 'erroring') {
      // An abort raced the close and lost: the close wins,
      // the abort fulfills, the stream closes cleanly.
      this._storedError = undefined;
      const abortReq = this._pendingAbort;
      if (abortReq) {
        this._pendingAbort = null;
        abortReq.resolve();
      }
    }
    this._state = 'closed';
    if (this._writer) this._writer._resolveClosed();
  }

  _finishCloseWithError(e) {
    this._inFlightClose.reject(e);
    this._inFlightClose = null;
    // A pending abort is rejected with the close error;
    // the sink abort is not run.
    const abortReq = this._pendingAbort;
    if (abortReq) {
      this._pendingAbort = null;
      abortReq.reject(e);
    }
    this._dealWithRejection(e);
  }

  getWriter() {
    return new WritableStreamDefaultWriter(this);
  }

  get locked() { return this._locked; }

  close() {
    if (this._locked)
      return Promise.reject(new TypeError(
        "Cannot close a locked stream"));
    return this._close();
  }

  abort(reason) {
    if (this._locked)
      return Promise.reject(new TypeError(
        "Cannot abort a locked stream"));
    return this._abort(reason);
  }
}

// Spec'd controller surface passed to transformer.start /
// transform / flush. Methods forward into the readable
// side's controller; `error()` also captures the first
// error so writer.close() can replay it (see the close
// path below for why that matters).
class TransformStreamDefaultController {
  #rsc;
  #onError;
  constructor(rsc, onError) {
    this.#rsc = rsc;
    this.#onError = onError;
  }
  enqueue(chunk) { this.#rsc.enqueue(chunk); }
  terminate() { this.#rsc.close(); }
  error(e) {
    this.#onError(e);
    this.#rsc.error(e);
  }
  get desiredSize() { return this.#rsc.desiredSize; }
}

// TransformStream — pairs a readable + writable
class TransformStream {
  readable;
  writable;

  constructor(transformer = {}, writableStrategy,
              readableStrategy) {
    // Cache transformer methods once (may include proto
    // chain); call with .call(transformer, ...) so `this`
    // binds per spec.
    const startFn = transformer.start;
    const transformFn = transformer.transform;
    const flushFn = transformer.flush;
    const cancelFn = transformer.cancel;
    let rsc;
    // State for cross-side coordination. cancelled →
    // transformer.cancel already ran (or started). flushing
    // → writable.close triggered flush(). Whichever fires
    // first wins; the other side becomes a no-op.
    let cancelled = false;
    let flushing = false;
    let writable;
    const runCancel = (reason) => {
      if (cancelled) return Promise.resolve();
      cancelled = true;
      if (!cancelFn) return Promise.resolve();
      return Promise.resolve(
        cancelFn.call(transformer, reason));
    };
    this.readable = new ReadableStream({
      start(c) { rsc = c; },
      async cancel(reason) {
        if (flushing) return;
        try {
          await runCancel(reason);
          writable?._errorStream(reason);
        } catch (e) {
          writable?._errorStream(e);
          throw e;
        }
      },
    }, {
      // Spec: the readable side defaults to a highWaterMark of 0,
      // unlike a bare ReadableStream's 1.
      highWaterMark: readableStrategy?.highWaterMark ?? 0,
      size: readableStrategy?.size,
    });
    // Workerd extension: expectedLength on the
    // transformer feeds Content-Length when the
    // readable becomes a fetch body.
    if (transformer.expectedLength !== undefined)
      this.readable._expectedLength =
        Number(transformer.expectedLength);
    // Track the first controller.error() so that
    // transformer.flush()'s side effect can be replayed
    // on writer.close() (rsc's error state is private).
    let readableError = null;
    const ctrl = new TransformStreamDefaultController(rsc, (e) => {
      if (readableError === null) readableError = e;
    });
    // start runs once at construction per spec. A throw — sync or
    // async — must error both sides rather than escape the
    // constructor, so wrap it: the executor turns a sync throw into
    // a rejection, and handing that to the writable's own start gate
    // rejects every queued write and the close.
    const started = startFn
      ? new Promise((res) => res(startFn.call(transformer, ctrl)))
      : undefined;
    started?.catch((e) => rsc.error(e));
    writable = new WritableStream({
      start() { return started; },
      async write(chunk) {
        if (!transformFn) { rsc.enqueue(chunk); return; }
        try {
          await transformFn.call(transformer, chunk, ctrl);
        } catch (e) {
          // Transform failure errors both sides.
          rsc.error(e);
          throw e;
        }
      },
      close() {
        if (cancelled) return;
        flushing = true;
        if (!flushFn) {
          rsc.close();
          return;
        }
        // Important: the sync throw case. A flush that
        // throws synchronously skips .then(..., onRejected)
        // on a Promise.resolve()-wrapped return, so any
        // rsc.error() handler attached that way never
        // fires. Defer flushFn into a thenable so sync
        // throws become async rejections that reach the
        // error arm below.
        return Promise.resolve().then(
          () => flushFn.call(transformer, ctrl),
        ).then(() => {
          // flush may have called controller.error;
          // propagate that to writer.close() so it
          // rejects with the original error.
          if (readableError !== null) throw readableError;
          rsc.close();
        }, (e) => {
          rsc.error(e);
          throw e;
        });
      },
      async abort(reason) {
        try {
          await runCancel(reason);
          rsc.error(reason);
        } catch (e) {
          rsc.error(e);
          throw e;
        }
      },
    }, writableStrategy);
    this.writable = writable;
  }
}

globalThis.WritableStream = WritableStream;
globalThis.WritableStreamDefaultWriter =
  WritableStreamDefaultWriter;
globalThis.WritableStreamDefaultController =
  WritableStreamDefaultController;
globalThis.TransformStream = TransformStream;
globalThis.TransformStreamDefaultController =
  TransformStreamDefaultController;
// Web IDL toStringTag.
for (const [cls, name] of [
  [WritableStream, 'WritableStream'],
  [WritableStreamDefaultWriter,
    'WritableStreamDefaultWriter'],
  [WritableStreamDefaultController,
    'WritableStreamDefaultController'],
  [TransformStream, 'TransformStream'],
  [TransformStreamDefaultController,
    'TransformStreamDefaultController'],
]) {
  Object.defineProperty(cls.prototype,
    Symbol.toStringTag,
    { value: name, configurable: true });
}
