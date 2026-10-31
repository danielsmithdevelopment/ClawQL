// URLSearchParams (WHATWG spec subset)
{
// Decode application/x-www-form-urlencoded per spec:
// + → space, percent-decode to bytes (only strict 2-hex
// sequences — stray % is literal), UTF-8 decode with
// replacement. ignoreBOM so a leading U+FEFF survives
// round-trip through percent-encoding.
const _hexRe = /^[0-9A-Fa-f]{2}$/;
const _uspDecode = (s) => {
  s = s.replace(/\+/g, ' ');
  const bytes = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === '%' && i + 2 < s.length
        && _hexRe.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 3;
      continue;
    }
    const c = s.charCodeAt(i);
    if (c < 0x80) { bytes.push(c); i++; continue; }
    // Handle astral chars: consume the surrogate pair
    // (or lone surrogate, which encodes as U+FFFD).
    const consumed = c >= 0xD800 && c <= 0xDBFF
      && i + 1 < s.length
      && s.charCodeAt(i + 1) >= 0xDC00
      && s.charCodeAt(i + 1) <= 0xDFFF ? 2 : 1;
    for (const b of new TextEncoder()
        .encode(s.slice(i, i + consumed)))
      bytes.push(b);
    i += consumed;
  }
  return new TextDecoder(
    'utf-8', { ignoreBOM: true }
  ).decode(new Uint8Array(bytes));
};

// Convert a DOMString to a USVString: replace each lone
// surrogate (unpaired high/low) with U+FFFD.
const _toUSVString = (s) => {
  s = String(s);
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF) {
      if (i + 1 < s.length) {
        const n = s.charCodeAt(i + 1);
        if (n >= 0xDC00 && n <= 0xDFFF) {
          out += s[i] + s[i + 1];
          i += 2;
          continue;
        }
      }
      out += '�';
    } else if (c >= 0xDC00 && c <= 0xDFFF) {
      out += '�';
    } else {
      out += s[i];
    }
    i++;
  }
  return out;
};

// Encode per application/x-www-form-urlencoded: the only unescaped bytes are
// ASCII alphanumerics and * - . _ (space becomes +). encodeURIComponent also
// leaves ! ' ( ) ~ alone, so those are escaped explicitly.
const _uspEncode = (s) =>
  encodeURIComponent(s)
    .replace(/%20/g, '+')
    .replace(/[!'()~]/g, (c) =>
      '%' + c.charCodeAt(0).toString(16).toUpperCase());

const _parseString = (s) => {
  const params = [];
  if (!s) return params;
  for (const pair of s.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq === -1) {
      params.push([_uspDecode(pair), '']);
    } else {
      params.push([
        _uspDecode(pair.slice(0, eq)),
        _uspDecode(pair.slice(eq + 1)),
      ]);
    }
  }
  return params;
};

class URLSearchParams {
  #params = [];
  _url = null; // live-bound URL, if any

  constructor(init) {
    if (init === undefined || init === null) return;
    if (typeof init === 'string') {
      const s = init.startsWith('?')
        ? init.slice(1) : init;
      this.#params = _parseString(s);
      // WebIDL `object` includes callables, so a class or function is a
      // valid record init (e.g. `new URLSearchParams(DOMException)`
      // enumerates its constants).
    } else if (typeof init === 'object' ||
               typeof init === 'function') {
      // Check for iterable (Symbol.iterator) first.
      if (typeof init[Symbol.iterator]
            === 'function') {
        for (const pair of init) {
          if (typeof pair !== 'object' &&
              typeof pair !== 'string')
            throw new TypeError('Invalid pair');
          const arr = [...pair];
          if (arr.length !== 2)
            throw new TypeError(
              'Each pair must have exactly ' +
              'two elements');
          this.#params.push([
            _toUSVString(arr[0]),
            _toUSVString(arr[1]),
          ]);
        }
      } else {
        // Record conversion: USVString-normalize keys
        // and dedupe (last value wins, first position
        // kept — matches WebIDL ordered-map semantics).
        const byKey = new Map();
        const order = [];
        for (const [k, v] of Object.entries(init)) {
          const nk = _toUSVString(k);
          if (!byKey.has(nk)) order.push(nk);
          byKey.set(nk, _toUSVString(v));
        }
        for (const nk of order)
          this.#params.push([nk, byKey.get(nk)]);
      }
    }
  }

  #sync() {
    if (this._url) this._url._updateSearch(this);
  }

  _initFromSearch(search) {
    const s = search.startsWith('?')
      ? search.slice(1) : search;
    this.#params = _parseString(s);
  }

  get(name) {
    name = String(name);
    const p = this.#params.find(
      ([k]) => k === name);
    return p ? p[1] : null;
  }

  getAll(name) {
    name = String(name);
    return this.#params.filter(
      ([k]) => k === name).map(([, v]) => v);
  }

  has(name, value) {
    name = String(name);
    if (value !== undefined) {
      value = String(value);
      return this.#params.some(
        ([k, v]) => k === name && v === value);
    }
    return this.#params.some(([k]) => k === name);
  }

  set(name, value) {
    name = String(name);
    value = String(value);
    let found = false;
    this.#params = this.#params.filter(([k]) => {
      if (k === name && !found) {
        found = true; return true;
      }
      return k !== name;
    });
    if (found) {
      const i = this.#params.findIndex(
        ([k]) => k === name);
      this.#params[i][1] = value;
    } else {
      this.#params.push([name, value]);
    }
    this.#sync();
  }

  append(name, value) {
    this.#params.push(
      [String(name), String(value)]);
    this.#sync();
  }

  delete(name, value) {
    name = String(name);
    if (value !== undefined) {
      value = String(value);
      this.#params = this.#params.filter(
        ([k, v]) => !(k === name && v === value));
    } else {
      this.#params = this.#params.filter(
        ([k]) => k !== name);
    }
    this.#sync();
  }

  sort() {
    this.#params.sort((a, b) =>
      a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    this.#sync();
  }

  toString() {
    return this.#params
      .map(([k, v]) =>
        `${_uspEncode(k)}=${_uspEncode(v)}`)
      .join('&');
  }

  *entries() {
    for (let i = 0; i < this.#params.length; i++)
      yield this.#params[i];
  }
  *keys() {
    for (let i = 0; i < this.#params.length; i++)
      yield this.#params[i][0];
  }
  *values() {
    for (let i = 0; i < this.#params.length; i++)
      yield this.#params[i][1];
  }
  [Symbol.iterator]() { return this.entries(); }

  forEach(callback, thisArg) {
    for (let i = 0; i < this.#params.length; i++) {
      callback.call(
        thisArg, this.#params[i][1],
        this.#params[i][0], this);
    }
  }

  get size() { return this.#params.length; }
}

globalThis.URLSearchParams = URLSearchParams;
Object.defineProperty(URLSearchParams.prototype,
  Symbol.toStringTag, {
    value: 'URLSearchParams', configurable: true,
  });
} // end block scope
