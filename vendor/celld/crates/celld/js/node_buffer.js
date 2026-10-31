// node:buffer for Cells.
//
// Compiled lazily: as a LAZY_GLOBALS entry (first read of `Buffer`) and as
// the LAZY_MODULES source for `node:buffer`, so an isolate that never
// touches Buffer pays nothing at boot. The script is self-guarded on
// `__buffer` because both seams can run it; `globalThis.Buffer` itself is
// defined by the lazy-global machinery, never assigned here.
//
// Node's Buffer is part of Cloudflare's nodejs_compat contract and is
// used at module scope by undici/pi-agent. Keep it Uint8Array-backed so
// Web APIs accept it naturally. Encoding, validation, and error-code
// semantics follow Node's lib/buffer.js, with the argument dances
// adapted from Deno's ext/node/polyfills/internal/buffer.mjs (MIT).
if (!globalThis.__buffer) (() => {
  const __kMaxLength = 2147483647;
  const __kStringMaxLength = 536870888;
  const __bufErr = (E, code, msg) => {
    const e = new E(msg); e.code = code; return e;
  };
  // Node formats large received values with numeric separators.
  const __numSep = (s) => {
    let out = "", n = 0;
    for (let i = s.length - 1; i >= 0; i--, n++) {
      if (n && n % 3 === 0 && s[i] !== "-") out = "_" + out;
      out = s[i] + out;
    }
    return out;
  };
  const __bufRange = (name, range, value) => {
    let received = String(value);
    if (typeof value === "bigint") received = __numSep(received) + "n";
    else if (Number.isInteger(value) && Math.abs(value) > 2 ** 32)
      received = __numSep(received);
    return __bufErr(RangeError, "ERR_OUT_OF_RANGE",
      `The value of "${name}" is out of range. It must be ${range}. ` +
      `Received ${received}`);
  };
  const __bufType = (name, expected, value) => __bufErr(TypeError,
    "ERR_INVALID_ARG_TYPE",
    `The "${name}" argument must be ${expected}. Received ` +
    (value === null ? "null"
      : value === undefined ? "undefined"
      : typeof value === "object"
        ? `an instance of ${value.constructor?.name ?? "Object"}`
        : `type ${typeof value}`));
  const __checkNum = (name, value, min, max) => {
    if (typeof value !== "number")
      throw __bufType(name, "of type number", value);
    if (Number.isNaN(value) || value < min || value > max)
      throw __bufRange(name, `>= ${min} and <= ${max}`, value);
    return value;
  };
  const __badEnc = (enc) => __bufErr(TypeError,
    "ERR_UNKNOWN_ENCODING", `Unknown encoding: ${enc}`);
  const __normEnc = (enc) => {
    switch (String(enc).toLowerCase()) {
      case "utf8": case "utf-8": return "utf8";
      case "utf16le": case "utf-16le": case "ucs2": case "ucs-2":
        return "utf16le";
      case "latin1": case "binary": return "latin1";
      case "ascii": return "ascii";
      case "base64": return "base64";
      case "base64url": return "base64url";
      case "hex": return "hex";
      default: return undefined;
    }
  };
  const __b64lut = (() => {
    const lut = new Int8Array(128).fill(-1);
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
      "abcdefghijklmnopqrstuvwxyz0123456789+/";
    for (let i = 0; i < 64; i++) lut[abc.charCodeAt(i)] = i;
    lut[45] = 62; lut[95] = 63; // '-' '_'
    return lut;
  })();
  // Nibble value per code unit, -1 for anything else. Node's own table is
  // 256 wide and indexed with `& 0xff`, so it decodes 'Ł' (U+0141) as 'A';
  // a 128-entry table with the guard below rejects every non-ASCII code
  // unit instead, which is what the regex it replaces did.
  const __hexlut = (() => {
    const lut = new Int8Array(128).fill(-1);
    const lower = "0123456789abcdef", upper = "0123456789ABCDEF";
    for (let i = 0; i < 16; i++) {
      lut[lower.charCodeAt(i)] = i; lut[upper.charCodeAt(i)] = i;
    }
    return lut;
  })();
  // string -> bytes. Hex stops at the first invalid pair; base64 is
  // forgiving (skips invalid characters, '=' terminates), like Node.
  const __encodeStr = (string, enc) => {
    switch (enc) {
      case "utf8": return new TextEncoder().encode(string);
      case "latin1": case "ascii":
        return Uint8Array.from(string, (c) => c.charCodeAt(0) & 255);
      case "utf16le": {
        const out = new Uint8Array(string.length * 2);
        for (let i = 0; i < string.length; i++) {
          const c = string.charCodeAt(i);
          out[i * 2] = c & 255; out[i * 2 + 1] = c >>> 8;
        }
        return out;
      }
      case "hex": {
        const n = string.length >>> 1;
        const out = new Uint8Array(n);
        let i = 0;
        for (; i < n; i++) {
          const hi = string.charCodeAt(i * 2);
          const lo = string.charCodeAt(i * 2 + 1);
          const a = hi < 128 ? __hexlut[hi] : -1;
          const b = lo < 128 ? __hexlut[lo] : -1;
          if (a < 0 || b < 0) break;
          out[i] = (a << 4) | b;
        }
        return i === n ? out : out.subarray(0, i);
      }
      default: { // base64 / base64url
        // Four source characters carry at most three bytes, and a skipped
        // character or an interior '=' only shrinks that, so this is an
        // upper bound and the subarray below trims any slack. Sizing the
        // output up front replaces one push and one copy per byte.
        // Discounting the trailing padding matters: without it a padded
        // input, which is most base64, always overshoots and always pays
        // for the trim. `byteLength` computes the same bound.
        const pad = string.charCodeAt(string.length - 1) === 61
          ? (string.charCodeAt(string.length - 2) === 61 ? 2 : 1) : 0;
        const out = new Uint8Array(((string.length - pad) * 3) >>> 2);
        let n = 0, acc = 0, bits = 0;
        for (let i = 0; i < string.length; i++) {
          const c = string.charCodeAt(i);
          if (c === 61) break; // '='
          const v = c < 128 ? __b64lut[c] : -1;
          if (v < 0) continue;
          acc = (acc << 6) | v; bits += 6;
          if (bits >= 8) { bits -= 8; out[n++] = (acc >>> bits) & 255; }
        }
        return n === out.length ? out : out.subarray(0, n);
      }
    }
  };
  const __decodeStr = (bytes, enc) => {
    switch (enc) {
      case "utf8": return new TextDecoder().decode(bytes);
      case "latin1": {
        let s = "";
        for (let i = 0; i < bytes.length; i += 0x2000)
          s += String.fromCharCode(...bytes.subarray(i, i + 0x2000));
        return s;
      }
      case "ascii": {
        let s = "";
        for (let i = 0; i < bytes.length; i++)
          s += String.fromCharCode(bytes[i] & 0x7f);
        return s;
      }
      case "utf16le": {
        let s = "";
        for (let i = 0; i + 1 < bytes.length; i += 2)
          s += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
        return s;
      }
      case "hex": {
        let s = "";
        for (let i = 0; i < bytes.length; i++)
          s += bytes[i].toString(16).padStart(2, "0");
        return s;
      }
      default: { // base64 / base64url
        let raw = "";
        for (let i = 0; i < bytes.length; i += 0x2000)
          raw += String.fromCharCode(...bytes.subarray(i, i + 0x2000));
        const s = btoa(raw);
        return enc === "base64url"
          ? s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
          : s;
      }
    }
  };
  const __assertSize = (size) => {
    if (typeof size !== "number")
      throw __bufType("size", "of type number", size);
    if (!(size >= 0 && size <= __kMaxLength))
      throw __bufRange("size", `>= 0 && <= ${__kMaxLength}`, size);
    return Math.floor(size);
  };
  const __u8 = (v) =>
    v instanceof Uint8Array
      ? v
      : ArrayBuffer.isView(v) && !(v instanceof DataView)
        ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
        : undefined;
  const __rawCompare = (a, b) => {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++)
      if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
  };
  class NodeBuffer extends Uint8Array {
    static poolSize = 8192;
    static from(value, encodingOrOffset, length) {
      if (typeof value === "string") {
        const enc = __normEnc(encodingOrOffset ?? "utf8");
        if (!enc) throw __badEnc(encodingOrOffset);
        return new NodeBuffer(__encodeStr(value, enc));
      }
      if (value instanceof ArrayBuffer ||
          (typeof SharedArrayBuffer !== "undefined" &&
           value instanceof SharedArrayBuffer)) {
        // A view over the given buffer, not a copy, like Node. A
        // non-numeric byteOffset defaults to 0.
        let offset = Number(encodingOrOffset || 0);
        if (Number.isNaN(offset)) offset = 0;
        if (!(offset >= 0 && offset <= value.byteLength))
          throw __bufErr(RangeError, "ERR_BUFFER_OUT_OF_BOUNDS",
            '"offset" is outside of buffer bounds');
        let len = length === undefined
          ? value.byteLength - offset : Number(length);
        if (Number.isNaN(len)) len = 0;
        if (!(len >= 0 && offset + len <= value.byteLength))
          throw __bufErr(RangeError, "ERR_BUFFER_OUT_OF_BOUNDS",
            '"length" is outside of buffer bounds');
        return new NodeBuffer(value, offset, len);
      }
      if (ArrayBuffer.isView(value)) {
        if (value instanceof Uint8Array) {
          const copy = new NodeBuffer(value.byteLength);
          copy.set(value);
          return copy;
        }
        return new NodeBuffer(value); // element-wise copy, like Node
      }
      if (value === null || typeof value !== "object")
        throw __bufType("first",
          "of type string or an instance of Buffer, ArrayBuffer, or " +
          "Array or an Array-like Object", value);
      if (value.type === "Buffer" && Array.isArray(value.data))
        return new NodeBuffer(value.data);
      const vo = value.valueOf?.();
      if (vo != null && vo !== value &&
          (typeof vo === "string" || typeof vo === "object"))
        return NodeBuffer.from(vo, encodingOrOffset, length);
      if ("length" in value || Symbol.iterator in value ||
          value.buffer instanceof ArrayBuffer ||
          (typeof SharedArrayBuffer !== "undefined" &&
           value.buffer instanceof SharedArrayBuffer))
        return new NodeBuffer(value); // array-like / iterable
      const prim = value[Symbol.toPrimitive]?.("string");
      if (typeof prim === "string")
        return NodeBuffer.from(prim, encodingOrOffset, length);
      throw __bufType("first",
        "of type string or an instance of Buffer, ArrayBuffer, or " +
        "Array or an Array-like Object", value);
    }
    static alloc(size, fill, encoding) {
      const b = new NodeBuffer(__assertSize(size));
      return fill === undefined || fill === 0
        ? b : b.fill(fill, 0, b.length, encoding);
    }
    static allocUnsafe(size) {
      return new NodeBuffer(__assertSize(size));
    }
    static allocUnsafeSlow(size) {
      return new NodeBuffer(__assertSize(size));
    }
    static isBuffer(value) { return value instanceof NodeBuffer; }
    static isEncoding(enc) {
      return typeof enc === "string" && __normEnc(enc) !== undefined;
    }
    static byteLength(value, encoding) {
      if (typeof value !== "string") {
        if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer ||
            (typeof SharedArrayBuffer !== "undefined" &&
             value instanceof SharedArrayBuffer))
          return value.byteLength;
        throw __bufType("string",
          "of type string or an instance of Buffer or ArrayBuffer",
          value);
      }
      switch (__normEnc(encoding ?? "utf8") ?? "utf8") {
        case "latin1": case "ascii": return value.length;
        case "utf16le": return value.length * 2;
        case "hex": return value.length >>> 1;
        case "base64": case "base64url": {
          const pad = value.endsWith("==") ? 2
            : value.endsWith("=") ? 1 : 0;
          return Math.floor(((value.length - pad) * 3) / 4);
        }
        default: return new TextEncoder().encode(value).length;
      }
    }
    static compare(a, b) {
      const ab = __u8(a), bb = __u8(b);
      if (!ab) throw __bufType("buf1",
        "an instance of Buffer or Uint8Array", a);
      if (!bb) throw __bufType("buf2",
        "an instance of Buffer or Uint8Array", b);
      return __rawCompare(ab, bb);
    }
    static concat(list, totalLength) {
      if (!Array.isArray(list))
        throw __bufType("list",
          "an instance of Array", list);
      if (list.length === 0) return new NodeBuffer(0);
      const items = [];
      for (let i = 0; i < list.length; i++) {
        const item = __u8(list[i]);
        if (!item)
          throw __bufType(`list[${i}]`,
            "an instance of Buffer or Uint8Array", list[i]);
        items.push(item);
      }
      const total = totalLength === undefined
        ? items.reduce((sum, b) => sum + b.length, 0)
        : __assertSize(totalLength);
      const out = new NodeBuffer(total);
      let off = 0;
      for (const item of items) {
        // Re-read the live length: a getter above may have shrunk a
        // resizable ArrayBuffer out from under the view.
        const n = Math.min(item.length, total - off);
        out.set(item.subarray(0, n), off);
        off += n;
        if (off >= total) break;
      }
      return out;
    }
    // try/catch, not instanceof: the prototype itself must read as
    // undefined, and it *is* instanceof Uint8Array.
    get offset() {
      try { return this.byteOffset; } catch { return undefined; }
    }
    get parent() {
      try { return this.buffer; } catch { return undefined; }
    }
    toString(encoding, start, end) {
      const enc = encoding === undefined ? "utf8" : __normEnc(encoding);
      if (!enc) throw __badEnc(encoding);
      const len = this.length;
      let s = start === undefined ? 0 : Math.trunc(Number(start)) || 0;
      let e = end === undefined ? len : Math.trunc(Number(end)) || 0;
      s = Math.min(Math.max(s, 0), len);
      e = Math.min(Math.max(e, s), len);
      if (e <= s) return "";
      return __decodeStr(this.subarray(s, e), enc);
    }
    equals(other) {
      const ob = __u8(other);
      if (!ob) throw __bufType("otherBuffer",
        "an instance of Buffer or Uint8Array", other);
      return this === other || __rawCompare(this, ob) === 0;
    }
    compare(target, targetStart, targetEnd, sourceStart, sourceEnd) {
      const tb = __u8(target);
      if (!tb) throw __bufType("target",
        "an instance of Buffer or Uint8Array", target);
      const ts = targetStart === undefined ? 0
        : __checkNum("targetStart", targetStart, 0, __kMaxLength);
      const te = targetEnd === undefined ? tb.length
        : __checkNum("targetEnd", targetEnd, 0, tb.length);
      const ss = sourceStart === undefined ? 0
        : __checkNum("sourceStart", sourceStart, 0, __kMaxLength);
      const se = sourceEnd === undefined ? this.length
        : __checkNum("sourceEnd", sourceEnd, 0, this.length);
      if (ss >= se) return ts >= te ? 0 : -1;
      if (ts >= te) return 1;
      return __rawCompare(this.subarray(ss, se), tb.subarray(ts, te));
    }
    // Bounds semantics per Node, via Deno's buffer.mjs.
    copy(target, targetStart, sourceStart, sourceEnd) {
      if (!ArrayBuffer.isView(this))
        throw __bufType("source",
          "an instance of Buffer or Uint8Array", this);
      const tb = __u8(target);
      if (!tb) throw __bufType("target",
        "an instance of Buffer or Uint8Array", target);
      const toInt = (v) => {
        const n = Number(v);
        return Number.isNaN(n) ? 0 : Math.trunc(n);
      };
      targetStart = targetStart === undefined ? 0 : toInt(targetStart);
      if (targetStart < 0)
        throw __bufRange("targetStart", ">= 0", targetStart);
      sourceStart = sourceStart === undefined ? 0 : toInt(sourceStart);
      if (sourceStart < 0)
        throw __bufRange("sourceStart", ">= 0", sourceStart);
      if (sourceStart >= 4294967295)
        throw __bufRange("sourceStart", "< 4294967295", sourceStart);
      sourceEnd = sourceEnd === undefined ? this.length
        : toInt(sourceEnd);
      if (sourceEnd < 0)
        throw __bufRange("sourceEnd", ">= 0", sourceEnd);
      if (sourceEnd >= 4294967295)
        throw __bufRange("sourceEnd", "< 4294967295", sourceEnd);
      if (targetStart >= tb.length) return 0;
      sourceEnd = Math.min(sourceEnd, this.length);
      const n = Math.min(
        Math.max(sourceEnd - sourceStart, 0),
        tb.length - targetStart);
      if (n <= 0) return 0;
      tb.set(this.subarray(sourceStart, sourceStart + n), targetStart);
      return n;
    }
    // Argument dance and edge cases per Node, via Deno's buffer.mjs.
    fill(value, start, end, encoding) {
      if (typeof value === "string") {
        if (typeof start === "string") {
          encoding = start; start = 0; end = this.length;
        } else if (typeof end === "string") {
          encoding = end; end = undefined;
        }
        if (encoding !== undefined && typeof encoding !== "string")
          throw __bufType("encoding", "of type string", encoding);
        if (typeof encoding === "string" && !__normEnc(encoding))
          throw __badEnc(encoding);
      } else if (typeof start === "string") {
        encoding = start; start = undefined;
      }
      if (start !== undefined) {
        __checkNum("start", start, 0, __kMaxLength);
        if (end !== undefined)
          __checkNum("end", end, 0, this.length);
      }
      start = start === undefined ? 0 : start >>> 0;
      end = end === undefined ? this.length : end >>> 0;
      if (start > this.length || end > this.length)
        throw new RangeError("Out of range index");
      if (end <= start) return this;
      if (value === undefined || value === null || value === "" ||
          typeof value === "boolean")
        value = Number(value) || 0;
      if (typeof value === "number") {
        Uint8Array.prototype.fill.call(this, value & 255, start, end);
        return this;
      }
      let pattern;
      if (typeof value === "string") {
        pattern = __encodeStr(value, __normEnc(encoding ?? "utf8"));
      } else {
        pattern = __u8(value);
        if (!pattern) { // anything else coerces to a byte, like Node
          Uint8Array.prototype.fill.call(
            this, Number(value) & 255, start, end);
          return this;
        }
      }
      if (pattern.length === 0)
        throw __bufErr(TypeError, "ERR_INVALID_ARG_VALUE",
          `The argument 'value' is invalid. Received '${value}'`);
      for (let i = start; i < end; i++)
        this[i] = pattern[(i - start) % pattern.length];
      return this;
    }
    // Argument dance per Node lib/buffer.js (via Deno's buffer.mjs).
    write(string, offset, length, encoding) {
      if (typeof string !== "string")
        throw __bufType("argument", "of type string", string);
      if (offset === undefined) {
        encoding = "utf8"; length = this.length; offset = 0;
      } else if (length === undefined && typeof offset === "string") {
        encoding = offset; length = this.length; offset = 0;
      } else {
        if (typeof offset !== "number")
          throw __bufType("offset", "of type number", offset);
        if (!(offset >= 0 && offset <= this.length))
          throw __bufRange("offset",
            `>= 0 and <= ${this.length}`, offset);
        const remaining = this.length - offset;
        if (length === undefined) length = remaining;
        else if (typeof length === "string") {
          encoding = length; length = remaining;
        } else {
          if (typeof length !== "number")
            throw __bufType("length", "of type number", length);
          length = Math.min(Math.max(Math.trunc(length), 0), remaining);
        }
      }
      const enc = __normEnc(encoding ?? "utf8");
      if (!enc) throw __badEnc(encoding);
      const bytes = __encodeStr(string, enc);
      let n = Math.min(bytes.length, length);
      if (n < bytes.length) {
        if (enc === "utf8" && (bytes[n] & 0xc0) === 0x80) {
          // The cut lands inside a multi-byte character: drop it whole.
          while (n > 0 && (bytes[n - 1] & 0xc0) === 0x80) n--;
          if (n > 0) n--;
        } else if (enc === "utf16le") {
          n &= ~1;
        }
      }
      this.set(bytes.subarray(0, n), offset);
      return n;
    }
    slice(start, end) { return this.subarray(start, end); }
    indexOf(value, byteOffset, encoding) {
      return __bufSearch(this, value, byteOffset, encoding, false);
    }
    lastIndexOf(value, byteOffset, encoding) {
      return __bufSearch(this, value, byteOffset, encoding, true);
    }
    includes(value, byteOffset, encoding) {
      return this.indexOf(value, byteOffset, encoding) !== -1;
    }
    swap16() {
      if (this.length % 2 !== 0) throw __swapErr(16);
      for (let i = 0; i < this.length; i += 2) {
        const t = this[i]; this[i] = this[i + 1]; this[i + 1] = t;
      }
      return this;
    }
    swap32() {
      if (this.length % 4 !== 0) throw __swapErr(32);
      for (let i = 0; i < this.length; i += 4)
        this.subarray(i, i + 4).reverse();
      return this;
    }
    swap64() {
      if (this.length % 8 !== 0) throw __swapErr(64);
      for (let i = 0; i < this.length; i += 8)
        this.subarray(i, i + 8).reverse();
      return this;
    }
    toJSON() { return { type: "Buffer", data: Array.from(this) }; }
  }
  const __swapErr = (bits) => __bufErr(RangeError,
    "ERR_INVALID_BUFFER_SIZE",
    `Buffer size must be a multiple of ${bits}-bits`);
  // Byte search by delegating to V8's string search over latin1 strings
  // (one char per byte), which survives the suite's multi-megabyte
  // lastIndexOf stress. utf16le matches on 16-bit alignment, like Node.
  const __bufSearch = (buf, value, byteOffset, encoding, last) => {
    if (typeof byteOffset === "string") {
      encoding = byteOffset; byteOffset = undefined;
    }
    let needle;
    let enc = "utf8";
    if (encoding !== undefined) {
      enc = __normEnc(encoding);
      if (!enc) throw __badEnc(encoding);
    }
    if (typeof value === "number") {
      needle = String.fromCharCode(value & 255);
    } else if (typeof value === "string") {
      needle = __decodeStr(__encodeStr(value, enc), "latin1");
    } else {
      const nb = __u8(value);
      if (!nb) throw __bufType("value",
        "one of type number or string or an instance of Buffer or " +
        "Uint8Array", value);
      needle = __decodeStr(nb, "latin1");
    }
    const len = buf.length;
    let start = Number(byteOffset);
    if (Number.isNaN(start)) start = last ? len : 0;
    else if (start < 0) start = len + start;
    const hay = __decodeStr(buf, "latin1");
    const even = enc === "utf16le" && typeof value !== "number";
    if (!last) {
      if (start < 0) start = 0;
      let i = hay.indexOf(needle, start);
      while (even && i > 0 && i % 2 !== 0)
        i = hay.indexOf(needle, i + 1);
      return i;
    }
    if (start < 0) return -1;
    let i = hay.lastIndexOf(needle, start);
    while (even && i > 0 && i % 2 !== 0)
      i = i === 0 ? -1 : hay.lastIndexOf(needle, i - 1);
    return i;
  };
  // Numeric accessors, generated onto the prototype: DataView-backed,
  // with Node's offset/value validation. Both UInt and Uint spellings.
  {
    const proto = NodeBuffer.prototype;
    const dv = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
    const checkOffset = (b, offset, width) => {
      if (typeof offset !== "number")
        throw __bufType("offset", "of type number", offset);
      if (!Number.isInteger(offset))
        throw __bufRange("offset", "an integer", offset);
      if (b.length < width)
        throw __bufErr(RangeError, "ERR_BUFFER_OUT_OF_BOUNDS",
          "Attempt to access memory outside buffer bounds");
      if (offset < 0 || offset + width > b.length)
        throw __bufRange("offset",
          `>= 0 and <= ${b.length - width}`, offset);
    };
    const ranges = {
      UInt8: [0, 255], UInt16: [0, 65535], UInt32: [0, 4294967295],
      Int8: [-128, 127], Int16: [-32768, 32767],
      Int32: [-2147483648, 2147483647],
    };
    const checkValue = (name, value) => {
      if (name.startsWith("Big")) {
        if (typeof value !== "bigint")
          throw __bufType("value", "of type bigint", value);
        const [lo, hi, range] = name === "BigInt64"
          ? [-(2n ** 63n), 2n ** 63n - 1n,
             ">= -(2n ** 63n) and < 2n ** 63n"]
          : [0n, 2n ** 64n - 1n, ">= 0n and < 2n ** 64n"];
        if (value < lo || value > hi)
          throw __bufRange("value", range, value);
        return;
      }
      const r = ranges[name];
      if (!r) return; // floats are unchecked, like Node
      if (typeof value !== "number")
        throw __bufType("value", "of type number", value);
      if (!Number.isInteger(value))
        throw __bufRange("value", "an integer", value);
      if (value < r[0] || value > r[1])
        throw __bufRange("value", `>= ${r[0]} and <= ${r[1]}`, value);
    };
    const defs = {
      UInt8: [1, "getUint8", "setUint8"],
      UInt16: [2, "getUint16", "setUint16"],
      UInt32: [4, "getUint32", "setUint32"],
      Int8: [1, "getInt8", "setInt8"],
      Int16: [2, "getInt16", "setInt16"],
      Int32: [4, "getInt32", "setInt32"],
      Float: [4, "getFloat32", "setFloat32"],
      Double: [8, "getFloat64", "setFloat64"],
      BigInt64: [8, "getBigInt64", "setBigInt64"],
      BigUInt64: [8, "getBigUint64", "setBigUint64"],
    };
    for (const [name, [width, get, set]] of Object.entries(defs)) {
      const variants = width === 1 && !name.startsWith("Big")
        ? [["", undefined]] : [["LE", true], ["BE", false]];
      for (const [suffix, little] of variants) {
        proto[`read${name}${suffix}`] = function (offset = 0) {
          checkOffset(this, offset, width);
          return dv(this)[get](offset, little);
        };
        proto[`write${name}${suffix}`] = function (value, offset = 0) {
          checkOffset(this, offset, width);
          checkValue(name, value);
          dv(this)[set](offset, value, little);
          return offset + width;
        };
      }
    }
    // Variable-width forms: read/write(U)Int{LE,BE}(offset, byteLength).
    for (const signed of [false, true]) {
      const name = signed ? "Int" : "UInt";
      for (const [suffix, little] of [["LE", true], ["BE", false]]) {
        proto[`read${name}${suffix}`] = function (offset, byteLength) {
          const w = byteLength;
          if (typeof w !== "number" || !Number.isInteger(w) ||
              w < 1 || w > 6)
            throw __bufRange("byteLength", ">= 1 and <= 6", byteLength);
          checkOffset(this, offset, w);
          let value = 0;
          for (let i = 0; i < w; i++)
            value = value * 256 +
              this[offset + (little ? w - 1 - i : i)];
          if (signed && value >= 2 ** (8 * w - 1))
            value -= 2 ** (8 * w);
          return value;
        };
        proto[`write${name}${suffix}`] = function (value, offset,
            byteLength) {
          const w = byteLength;
          if (typeof w !== "number" || !Number.isInteger(w) ||
              w < 1 || w > 6)
            throw __bufRange("byteLength", ">= 1 and <= 6", byteLength);
          checkOffset(this, offset, w);
          const [lo, hi] = signed
            ? [-(2 ** (8 * w - 1)), 2 ** (8 * w - 1) - 1]
            : [0, 2 ** (8 * w) - 1];
          if (typeof value !== "number" || !Number.isInteger(value) ||
              value < lo || value > hi)
            throw __bufRange("value", `>= ${lo} and <= ${hi}`, value);
          let v = value < 0 ? value + 2 ** (8 * w) : value;
          for (let i = 0; i < w; i++) {
            this[offset + (little ? i : w - 1 - i)] =
              v % 256;
            v = Math.floor(v / 256);
          }
          return offset + w;
        };
      }
    }
    // Uint spellings alias UInt, like Node.
    for (const key of Object.getOwnPropertyNames(proto)) {
      const alias = key.replace("UInt", "Uint");
      if (alias !== key) proto[alias] = proto[key];
    }
    proto.toLocaleString = proto.toString;
    // Encoding-specific fast APIs: fooSlice(start, end) decodes a range,
    // fooWrite(string, offset, length) writes with that encoding.
    for (const [prefix, enc] of [["utf8", "utf8"], ["ascii", "ascii"],
        ["latin1", "latin1"], ["base64", "base64"],
        ["base64url", "base64url"], ["hex", "hex"],
        ["ucs2", "utf16le"], ["utf16le", "utf16le"]]) {
      proto[`${prefix}Slice`] = function (start, end) {
        return this.toString(enc, start ?? 0, end ?? this.length);
      };
      proto[`${prefix}Write`] = function (string, offset = 0, length) {
        return this.write(string, offset,
          length ?? this.length - offset, enc);
      };
    }
  }
  Object.defineProperty(NodeBuffer, Symbol.species, { value: NodeBuffer });
  // The public class name: inspect and error messages must say Buffer.
  Object.defineProperty(NodeBuffer, "name", { value: "Buffer" });
  // Node's Buffer is callable: Buffer(n) allocates, Buffer(x) is from().
  // A proxy keeps statics, prototype, and instanceof identical.
  const __bufferCallable = new Proxy(NodeBuffer, {
    apply(_target, _thisArg, args) {
      return typeof args[0] === "number"
        ? NodeBuffer.alloc(args[0])
        : NodeBuffer.from(args[0], args[1], args[2]);
    },
    construct(_target, args, newTarget) {
      if (newTarget !== __bufferCallable)
        return Reflect.construct(NodeBuffer, args, newTarget);
      return typeof args[0] === "number"
        ? NodeBuffer.alloc(args[0])
        : NodeBuffer.from(args[0], args[1], args[2]);
    },
  });
  // node:buffer module surface beyond the class itself (Node values).
  function SlowBuffer(size) { return NodeBuffer.alloc(size); }
  SlowBuffer.prototype = NodeBuffer.prototype;
  const __asBytes = (input) => {
    if (input instanceof ArrayBuffer || (typeof SharedArrayBuffer !==
        "undefined" && input instanceof SharedArrayBuffer))
      return new Uint8Array(input);
    if (ArrayBuffer.isView(input))
      return new Uint8Array(input.buffer, input.byteOffset,
                            input.byteLength);
    throw __bufType("input",
      "an instance of ArrayBuffer or ArrayBufferView", input);
  };
  globalThis.__buffer = {
    Buffer: __bufferCallable,
    SlowBuffer,
    INSPECT_MAX_BYTES: 50,
    kMaxLength: __kMaxLength,
    kStringMaxLength: __kStringMaxLength,
    constants: {
      MAX_LENGTH: __kMaxLength,
      MAX_STRING_LENGTH: __kStringMaxLength,
    },
    isAscii: (input) => __asBytes(input).every((b) => b < 0x80),
    isUtf8: (input) => {
      const bytes = __asBytes(input); // type errors must escape the try
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return true;
      } catch {
        return false;
      }
    },
    // ascii/latin1/utf16le/utf8 only; unrepresentable characters become
    // '?', like Node's ICU-backed transcode. The 128 MiB cap mirrors
    // Workerd's isolate external-memory limit.
    transcode(source, fromEnc, toEnc) {
      const src = __u8(source);
      if (!src) throw __bufType("source",
        "an instance of Buffer or Uint8Array", source);
      const from = __normEnc(fromEnc);
      const to = __normEnc(toEnc);
      const ok = ["ascii", "latin1", "utf8", "utf16le"];
      if (!from || !ok.includes(from)) throw __badEnc(fromEnc);
      if (!to || !ok.includes(to)) throw __badEnc(toEnc);
      if (src.length >= 134217728)
        throw new RangeError("Cannot transcode a buffer this large");
      if (from === "utf16le" && src.length % 2 !== 0)
        throw __bufErr(RangeError, "ERR_INVALID_ARG_VALUE",
          "Unable to transcode buffer");
      let s;
      if (from === "utf8" && to === "utf16le") {
        try {
          s = new TextDecoder("utf-8", { fatal: true }).decode(src);
        } catch {
          throw new TypeError("Unable to transcode buffer");
        }
      } else if (from === "utf8") {
        s = new TextDecoder().decode(src); // replacement characters
      } else {
        s = __decodeStr(src, from);
      }
      if (to === "ascii" || to === "latin1") {
        const max = to === "ascii" ? 0x7f : 0xff;
        s = Array.from(s,
          (c) => c.charCodeAt(0) > max ? "?" : c).join("");
      }
      return new NodeBuffer(__encodeStr(s, to));
    },
    Blob: globalThis.Blob,
    File: globalThis.File,
    atob: globalThis.atob,
    btoa: globalThis.btoa,
  };
})();
// Completion value for the lazy-global getter.
({ Buffer: globalThis.__buffer.Buffer });
