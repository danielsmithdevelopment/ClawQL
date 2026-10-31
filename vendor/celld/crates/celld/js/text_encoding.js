// TextEncoder + TextDecoder (WHATWG Encoding).
// Extracted module from the bootstrap.js IIFE.
//
// TextEncoder always emits UTF-8 (per spec). TextDecoder
// decodes nothing itself: every label, utf-8 and utf-16
// included, goes to encoding_rs on the host via the
// $$textDecoder* ops, one call per decode() with native
// streaming state per decoder. This file resolves the
// label and owns the decoder's lifetime.
//
// Previous utf-8 and utf-16 hand-written JS decoders kept a
// host call off a small `request.text()`, but measurement did
// not support that design: the host was faster at every size
// down to 16 bytes,
// and what a JS decode cost depended on the decodes that
// ran before it. A cell that decoded a few hundred small
// or malformed bodies first spent 48ms per MiB on a bulk
// decode, against 5ms for the same binary that decoded
// one large body first. The order was the only
// difference, the effect was sticky, and the ratio was
// the ratio between V8's interpreter and its optimizing
// tier. The mechanism was not traced further, so no claim
// is made about which feedback caused it — but the
// traffic that provoked it was ordinary, and no shape of
// the JS decoder resisted it. Two decoders for one
// encoding also owe a byte-for-byte equivalence proof,
// and that debt had already shipped one bug: a utf-16
// buffer ending in an unpaired lead surrogate and an odd
// byte yielded two U+FFFD in JS and one on the host.
(function () {
    const _tdLabel = $$textDecoderLabel;
    const _tdNew = $$textDecoderNew;
    const _tdDecode = $$textDecoderDecode;
    const _tdDecodeOnce = $$textDecoderDecodeOnce;
    const _tdFree = $$textDecoderFree;
    // Frees native decoders abandoned mid-stream. Ids
    // are never reused, so a late free is a no-op.
    // Created on the first stream, not at boot.
    let _tdRegistry;
    const _tdTrack = (target, id) => {
        if (_tdRegistry === undefined) {
            _tdRegistry =
                typeof FinalizationRegistry === 'function'
                    ? new FinalizationRegistry(_tdFree)
                    : null;
        }
        _tdRegistry?.register(target, id);
    };
    globalThis.TextEncoder = class TextEncoder {
        get encoding() { return 'utf-8'; }
        encode(s = '') {
            s = String(s);
            const buf = new Uint8Array(s.length * 4);
            let w = 0;
            for (let i = 0; i < s.length; ) {
                let c = s.charCodeAt(i);
                if (c >= 0xD800 && c <= 0xDBFF &&
                    i + 1 < s.length) {
                    const trail = s.charCodeAt(i + 1);
                    if (trail >= 0xDC00 &&
                        trail <= 0xDFFF) {
                        c = ((c - 0xD800) << 10) +
                            (trail - 0xDC00) + 0x10000;
                    } else { c = 0xFFFD; }
                } else if (c >= 0xD800 && c <= 0xDFFF) {
                    c = 0xFFFD;
                }
                if (c < 0x80) {
                    buf[w++] = c;
                } else if (c < 0x800) {
                    buf[w++] = 0xc0 | (c >> 6);
                    buf[w++] = 0x80 | (c & 0x3f);
                } else if (c < 0x10000) {
                    buf[w++] = 0xe0 | (c >> 12);
                    buf[w++] = 0x80 | ((c>>6) & 0x3f);
                    buf[w++] = 0x80 | (c & 0x3f);
                } else {
                    buf[w++] = 0xf0 | (c >> 18);
                    buf[w++] = 0x80|((c>>12) & 0x3f);
                    buf[w++] = 0x80|((c>>6) & 0x3f);
                    buf[w++] = 0x80 | (c & 0x3f);
                }
                i += c > 0xffff ? 2 : 1;
            }
            // `slice`, not `subarray`: the scratch buffer is 4x the input
            // length, and a subarray would hand the caller a view onto it.
            // `encode(s).buffer` is a common idiom -- into crypto.subtle,
            // into a Blob -- and with a shared buffer it carries up to 3x
            // the bytes of trailing garbage.
            return buf.slice(0, w);
        }
        encodeInto(source, destination) {
            if (!(destination instanceof Uint8Array))
                throw new TypeError(
                    'encodeInto requires Uint8Array');
            source = String(source);
            let read = 0, written = 0;
            for (let i = 0; i < source.length; ) {
                let c = source.charCodeAt(i);
                // Handle surrogates
                if (c >= 0xD800 && c <= 0xDBFF &&
                    i + 1 < source.length) {
                    const trail =
                        source.charCodeAt(i + 1);
                    if (trail >= 0xDC00 &&
                        trail <= 0xDFFF) {
                        c = ((c - 0xD800) << 10) +
                            (trail - 0xDC00) + 0x10000;
                    } else {
                        c = 0xFFFD; // lone surrogate
                    }
                } else if (c >= 0xD800 && c <= 0xDFFF) {
                    c = 0xFFFD; // lone surrogate
                }
                let bytes;
                if (c < 0x80) bytes = 1;
                else if (c < 0x800) bytes = 2;
                else if (c < 0x10000) bytes = 3;
                else bytes = 4;
                if (written + bytes > destination.length)
                    break;
                if (bytes === 1) {
                    destination[written++] = c;
                } else if (bytes === 2) {
                    destination[written++] =
                        0xc0 | (c >> 6);
                    destination[written++] =
                        0x80 | (c & 0x3f);
                } else if (bytes === 3) {
                    destination[written++] =
                        0xe0 | (c >> 12);
                    destination[written++] =
                        0x80 | ((c >> 6) & 0x3f);
                    destination[written++] =
                        0x80 | (c & 0x3f);
                } else {
                    destination[written++] =
                        0xf0 | (c >> 18);
                    destination[written++] =
                        0x80 | ((c >> 12) & 0x3f);
                    destination[written++] =
                        0x80 | ((c >> 6) & 0x3f);
                    destination[written++] =
                        0x80 | (c & 0x3f);
                }
                i += c > 0xffff ? 2 : 1;
                read = i;
            }
            return { read, written };
        }
    };
    globalThis.TextDecoder = class TextDecoder {
        #encoding;
        #fatal;
        #ignoreBOM;
        // Live native decoder id while a stream is in
        // flight; undefined otherwise.
        #nativeId;
        constructor(label = 'utf-8', options = {}) {
            // Per WHATWG encoding: strip ASCII whitespace
            // only (not Unicode — \v, NBSP, etc. stay).
            label = String(label)
                .replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '')
                .toLowerCase();
            // The WHATWG label set for utf-8 and utf-16, resolved here to
            // keep a host call out of `new TextDecoder()` — which every
            // `request.text()` makes. A miss (e.g. 'ansi_x3.4-1968',
            // which the standard maps to windows-1252 rather than utf-8)
            // resolves through the host's encoding_rs label table
            // instead. Both answers are encoding_rs labels, so the
            // decode itself does not care which way the name arrived.
            const aliases = {
                'utf-8': 'utf-8', 'utf8': 'utf-8',
                'unicode-1-1-utf-8': 'utf-8',
                'unicode11utf8': 'utf-8',
                'unicode20utf8': 'utf-8',
                'x-unicode20utf8': 'utf-8',
                'utf-16le': 'utf-16le',
                'utf-16': 'utf-16le',
                'ucs-2': 'utf-16le',
                'unicode': 'utf-16le',
                'unicodefeff': 'utf-16le',
                'iso-10646-ucs-2': 'utf-16le',
                'csunicode': 'utf-16le',
                'utf-16be': 'utf-16be',
                'unicodefffe': 'utf-16be',
            };
            let enc = aliases[label];
            if (!enc) {
                // undefined covers unknown labels and the replacement
                // encoding — both RangeError per spec. A resolved name
                // is canonical lowercase, and the alias lookup then
                // normalizes the utf names to the spelling above.
                const name = _tdLabel(label);
                if (name === undefined) throw new RangeError(
                    `The encoding label` +
                    ` '${label}' is invalid.`
                );
                enc = aliases[name] ?? name;
            }
            this.#encoding = enc;
            this.#fatal = !!options.fatal;
            this.#ignoreBOM = !!options.ignoreBOM;
        }
        get encoding() { return this.#encoding; }
        get fatal() { return this.#fatal; }
        get ignoreBOM() { return this.#ignoreBOM; }
        decode(input, options = {}) {
            const stream = !!options.stream;
            let b;
            if (input == null) {
                b = new Uint8Array(0);
            } else if (input instanceof ArrayBuffer) {
                b = new Uint8Array(input);
            } else if (ArrayBuffer.isView(input)) {
                // BufferSource (TypedArray / DataView).
                // Slice the underlying buffer at the
                // view's offset / length so we honour
                // sub-views.
                b = new Uint8Array(
                    input.buffer,
                    input.byteOffset,
                    input.byteLength,
                );
            } else {
                // Per Web IDL: `decode(input)` accepts
                // [AllowShared] BufferSource. Anything
                // else is a type-coercion error. Pre-fix
                // the fallback `new Uint8Array(input, 0,
                // input.length)` interpreted a number as
                // a length-N allocation of zero bytes —
                // `.decode(42)` returned 42 NUL chars,
                // `.decode("hello")` returned "" (no
                // .length on a string maps to a 0-length
                // buffer view), both spec-violating.
                throw new TypeError(
                    "TextDecoder.decode: input must be"
                    + " a BufferSource",
                );
            }
            return this._decodeNative(b, stream);
        }
        // One op per decode(), for every label. Streaming state (a split
        // multibyte sequence, a BOM, ISO-2022-JP mode) lives in the
        // native decoder; a fatal error frees it, matching Workerd — the
        // next decode starts clean.
        _decodeNative(b, stream) {
            let id = this.#nativeId;
            // A complete buffer with no stream around it
            // needs no decoder that outlives the call, so
            // it takes the one-shot op and never reaches
            // the host's decoder table.
            if (id === undefined && !stream) {
                return _tdDecodeOnce(
                    this.#encoding, b, this.#fatal,
                    this.#ignoreBOM);
            }
            if (id === undefined) {
                id = _tdNew(this.#encoding, this.#ignoreBOM);
                this.#nativeId = id;
                _tdTrack(this, id);
            } else if (!stream) {
                this.#nativeId = undefined;
            }
            try {
                return _tdDecode(id, b, this.#fatal, !stream);
            } catch (e) {
                this.#nativeId = undefined;
                throw e;
            }
        }
    };
    // Web IDL toStringTag.
    Object.defineProperty(globalThis.TextEncoder.prototype,
      Symbol.toStringTag,
      { value: 'TextEncoder', configurable: true });
    Object.defineProperty(globalThis.TextDecoder.prototype,
      Symbol.toStringTag,
      { value: 'TextDecoder', configurable: true });
})();
