// IdentityTransformStream / FixedLengthStream — Cloudflare's byte
// pass-through streams. Not spec TransformStreams: in Workerd these are
// "internal" (native) byte streams, and celld matches that
// contract. The readable supports one pending read at a time (a second
// concurrent read rejects), BYOB readers with the readAtLeast()
// extension, per-reader closed promises that reject on releaseLock, and
// reader-cancel reasons converted to Errors and propagated to the
// writer's pending write and close. A write resolves only once its
// bytes have been read, so the pump buffers nothing and the default
// read path copies nothing.
//
// Compiled on first access (see LAZY_GLOBALS); a bundle that never names
// either global never pays for this file.
(() => {

const NOT_BYTES =
  'This TransformStream is being used as a byte stream, but received ' +
  'an object of non-ArrayBuffer/ArrayBufferView type on its writable ' +
  'side.';
const RELEASED =
  'This ReadableStream reader has been released.';
const ONE_READ =
  'This ReadableStream only supports a single pending read request ' +
  'at a time.';

// No copy: a write is only observable once it has been read, so the
// writer cannot safely reuse the buffer before then either.
function bytes(chunk) {
  if (ArrayBuffer.isView(chunk))
    return new Uint8Array(chunk.buffer, chunk.byteOffset,
                          chunk.byteLength);
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  throw new TypeError(NOT_BYTES);
}

// Workerd converts a cancel reason into a real Error before handing it
// to the other side (cancelErrorTypePropagation).
function toError(reason) {
  if (reason instanceof Error) return reason;
  return new Error(
    reason === undefined ? 'Stream was cancelled.' : String(reason));
}

// Same shape streams.js returns from reads: shadow `then` so a user
// override of Object.prototype.then cannot intercept the result.
function _readResult(value, done) {
  const r = { value, done };
  Object.defineProperty(r, 'then', {
    value: undefined,
    enumerable: false,
    writable: true,
    configurable: true,
  });
  return r;
}

// The pipe itself: at most one unconsumed write and one pending read.
// Implements the `_pullInto` surface ReadableStreamBYOBReader drives
// (see byte_streams.js), so the global BYOB reader works on the
// readable unchanged.
class InternalController {
  _chunk = null;     // unread remainder of the in-flight write
  _consumed = null;  // settles the sink write once _chunk drains
  _readReq = null;   // parked default read
  _pendingPullIntos = [];  // parked BYOB descriptor (at most one)
  _reader = null;    // current InternalDefaultReader, for closed
  _stream = null;
  _writable = null;

  _invalidate() {}   // no BYOB-request surface on internal streams

  _hasPending() {
    return this._readReq !== null ||
      this._pendingPullIntos.length > 0;
  }

  _doneChunk() {
    const c = this._consumed;
    this._chunk = null;
    this._consumed = null;
    if (c) c.resolve();
  }

  // Copy from the pending chunk into a BYOB descriptor.
  _fill(d) {
    const c = this._chunk;
    const n = Math.min(c.byteLength, d.byteLength - d.filled);
    new Uint8Array(d.buffer, d.byteOffset + d.filled, n)
      .set(n === c.byteLength ? c : c.subarray(0, n));
    d.filled += n;
    if (n === c.byteLength) this._doneChunk();
    else this._chunk = c.subarray(n);
  }

  _view(d) {
    return new d.ctor(d.buffer, d.byteOffset,
                      (d.filled / d.elementSize) | 0);
  }

  // sink.write: deliver a chunk, resolving once it is fully read.
  _deliver(view) {
    return new Promise((resolve, reject) => {
      this._chunk = view;
      this._consumed = { resolve, reject };
      const r = this._readReq;
      if (r !== null) {
        this._readReq = null;
        const v = this._chunk;
        this._doneChunk();
        r.resolve(_readResult(v, false));
        return;
      }
      const d = this._pendingPullIntos[0];
      if (d !== undefined) {
        this._fill(d);
        if (d.filled >= d.minFill) {
          this._pendingPullIntos.shift();
          d.req.resolve(_readResult(this._view(d), false));
        }
      }
    });
  }

  _read() {
    const s = this._stream;
    if (s._errored) return Promise.reject(s._error);
    if (this._chunk !== null) {
      const v = this._chunk;
      this._doneChunk();
      return Promise.resolve(_readResult(v, false));
    }
    if (s._closed)
      return Promise.resolve(_readResult(undefined, true));
    if (this._hasPending())
      return Promise.reject(new TypeError(ONE_READ));
    return new Promise((resolve, reject) => {
      this._readReq = { resolve, reject };
    });
  }

  _pullInto(view, min) {
    const s = this._stream;
    if (s._errored) return Promise.reject(s._error);
    if (this._hasPending())
      return Promise.reject(new TypeError(ONE_READ));
    const elementSize = view.BYTES_PER_ELEMENT ?? 1; // DataView: 1
    const d = {
      buffer: null,
      byteOffset: view.byteOffset,
      byteLength: view.byteLength,
      filled: 0,
      elementSize,
      minFill: min * elementSize,
      ctor: view.constructor,
      req: null,
    };
    try { d.buffer = view.buffer.transfer(); }
    catch (e) { return Promise.reject(e); }
    if (this._chunk !== null) {
      this._fill(d);
      if (d.filled >= d.minFill)
        return Promise.resolve(_readResult(this._view(d), false));
    }
    if (s._closed)
      // A post-close BYOB read hands the (transferred) buffer back as
      // a zero-length view; a readAtLeast cut short by close returns
      // what it got with done still false.
      return Promise.resolve(
        _readResult(this._view(d), d.filled === 0));
    return new Promise((resolve, reject) => {
      d.req = { resolve, reject };
      this._pendingPullIntos.push(d);
    });
  }

  // sink.close — only reachable with no write in flight.
  _close() {
    const s = this._stream;
    s._finishClose();
    const r = this._readReq;
    if (r !== null) {
      this._readReq = null;
      r.resolve(_readResult(undefined, true));
    }
    const pending = this._pendingPullIntos;
    this._pendingPullIntos = [];
    for (const d of pending)
      d.req.resolve(_readResult(this._view(d), d.filled === 0));
    if (this._reader) this._reader._settleClosed(null);
  }

  // Error the readable side (writer abort, bad write, length
  // violation).
  _errorRd(e) {
    const s = this._stream;
    if (s._closed || s._errored) return;
    s._errored = true;
    s._error = e;
    s._rejectClosed(e);
    const r = this._readReq;
    if (r !== null) { this._readReq = null; r.reject(e); }
    const pending = this._pendingPullIntos;
    this._pendingPullIntos = [];
    for (const d of pending) d.req.reject(e);
    if (this._reader) this._reader._settleClosed(e);
    if (this._consumed !== null) {
      const c = this._consumed;
      this._chunk = null;
      this._consumed = null;
      c.reject(e);
    }
  }

  // reader.cancel / readable.cancel: close the read side, convert the
  // reason, and reject the writer's pending write and close with it.
  _cancel(reason) {
    const s = this._stream;
    if (s._errored) return Promise.reject(s._error);
    if (!s._closed) {
      const e = toError(reason);
      s._disturbed = true;
      s._finishClose();
      const r = this._readReq;
      if (r !== null) {
        this._readReq = null;
        r.resolve(_readResult(undefined, true));
      }
      const pending = this._pendingPullIntos;
      this._pendingPullIntos = [];
      for (const d of pending)
        d.req.resolve(_readResult(undefined, true));
      if (this._reader) this._reader._settleClosed(null);
      this._writable._errorStream(e);
      if (this._consumed !== null) {
        const c = this._consumed;
        this._chunk = null;
        this._consumed = null;
        c.reject(e);
      }
    }
    return Promise.resolve();
  }
}

// Default reader over an internal stream: a per-reader closed promise
// (rejected by releaseLock) and single-pending-read reads. Subclassing
// keeps the shared reader prototype free of internal-stream branches.
class InternalDefaultReader extends ReadableStreamDefaultReader {
  _released = false;
  _closedRes = null;
  _closedRej = null;

  constructor(stream) {
    super(stream);
    this._s = stream;
    this._c = stream._ictl;
    this._closedP = new Promise((res, rej) => {
      this._closedRes = res;
      this._closedRej = rej;
    });
    this._closedP.catch(() => {});
    if (stream._closed) this._settleClosed(null);
    else if (stream._errored) this._settleClosed(stream._error);
    else this._c._reader = this;
  }

  _settleClosed(e) {
    if (this._closedRes === null) return;
    if (e === null) this._closedRes();
    else this._closedRej(e);
    this._closedRes = null;
    this._closedRej = null;
  }

  read() {
    if (this._released)
      return Promise.reject(new TypeError(RELEASED));
    this._s._disturbed = true;
    return this._c._read();
  }

  cancel(reason) {
    if (this._released)
      return Promise.reject(new TypeError(RELEASED));
    return this._c._cancel(reason);
  }

  get closed() {
    if (this._released)
      return Promise.reject(new TypeError(RELEASED));
    return this._closedP;
  }

  releaseLock() {
    if (this._released) return;
    const c = this._c;
    const err = new TypeError(RELEASED);
    if (c._readReq !== null) {
      c._readReq.reject(err);
      c._readReq = null;
    }
    if (c._reader === this) c._reader = null;
    this._settleClosed(err);
    this._s._locked = false;
    this._s._reader = null;
    this._released = true;
  }
}

// Instance overrides so shared prototype paths stay unbranched.
function internalGetReader(options) {
  if (options !== undefined && options !== null &&
      options.mode !== undefined) {
    if (String(options.mode) !== 'byob')
      throw new TypeError(`Invalid reader mode '${options.mode}'`);
    return new ReadableStreamBYOBReader(this);
  }
  return new InternalDefaultReader(this);
}

function internalCancel(reason) {
  return this._ictl._cancel(reason);
}

// FixedLengthStream's expected length, handed to the base constructor
// across super(). A field would arrive too late — super() builds the
// sink that enforces it.
let expected;

class IdentityTransformStream {
  constructor(_queuingStrategy) {
    const limit = expected;
    expected = undefined;
    const ctl = new InternalController();
    const readable = new ReadableStream();
    ctl._stream = readable;
    readable._ictl = ctl;
    Object.defineProperties(readable, {
      getReader: { value: internalGetReader, writable: true,
                   configurable: true },
      _cancel: { value: internalCancel, writable: true,
                 configurable: true },
    });
    // FixedLengthStream implies Content-Length when its readable is a
    // fetch body.
    if (limit !== undefined) readable._expectedLength = limit;
    let seen = 0;
    const writable = new WritableStream({
      write(chunk) {
        let view;
        try {
          view = bytes(chunk);
          if (limit !== undefined &&
              (seen += view.byteLength) > limit)
            throw new TypeError(
              'Attempt to write too many bytes through a ' +
              'FixedLengthStream.');
        } catch (e) {
          ctl._errorRd(e);
          throw e;
        }
        if (view.byteLength === 0) return;
        return ctl._deliver(view);
      },
      close() {
        if (limit !== undefined && seen < limit) {
          const e = new TypeError(
            'FixedLengthStream did not see all expected bytes ' +
            'before close().');
          ctl._errorRd(e);
          throw e;
        }
        ctl._close();
      },
      abort(reason) { ctl._errorRd(toError(reason)); },
    });
    ctl._writable = writable;
    // abort() must not deadlock behind a write parked in _deliver: the
    // writable machinery waits for the in-flight write before running
    // the sink abort, so unpark it with the abort reason.
    const abort_ = writable._abort.bind(writable);
    writable._abort = (reason) => {
      const p = abort_(reason);
      if (writable._state === 'erroring' && ctl._consumed !== null) {
        const c = ctl._consumed;
        ctl._chunk = null;
        ctl._consumed = null;
        c.reject(reason);
      }
      return p;
    };
    this.readable = readable;
    this.writable = writable;
  }
}

// Workerd's IdentityTransformStream is a TransformStream subclass; the
// base constructor must never run, so the chains are wired directly.
Object.setPrototypeOf(IdentityTransformStream.prototype,
                      TransformStream.prototype);
Object.setPrototypeOf(IdentityTransformStream, TransformStream);

class FixedLengthStream extends IdentityTransformStream {
  constructor(expectedLength, queuingStrategy) {
    // Workerd coerces through jsg's integer conversion, so
    // a fraction truncates (0.00001 → 0) and -0 is 0.
    const length = Math.trunc(Number(expectedLength));
    if (!Number.isInteger(length) || length < 0 ||
        length > Number.MAX_SAFE_INTEGER)
      throw new TypeError(
        'FixedLengthStream requires an integer expected length less ' +
        'than 2^53.');
    expected = length;
    super(queuingStrategy);
  }
}

for (const [cls, name] of [
  [IdentityTransformStream, 'IdentityTransformStream'],
  [FixedLengthStream, 'FixedLengthStream'],
])
  Object.defineProperty(cls.prototype, Symbol.toStringTag,
                        { value: name, configurable: true });

return { IdentityTransformStream, FixedLengthStream };
})()
