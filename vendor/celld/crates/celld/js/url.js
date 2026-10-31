// URL polyfill.
// Extracted module from the bootstrap.js IIFE. Captures one
// host op ($$urlParse) and exposes `globalThis.URL` —
// constructor, accessors, searchParams (lazy
// URLSearchParams binding), canParse / parse statics.
//
// Off the per-HTTP-request hot path on the std/http
// serve binding (which passes `_skipValidate: true`
// to skip the URL parse — see
// doc/runtime_invariants.md rule 4 + the `_skipValidate`
// machinery in src/js/request_response.js). User-side
// `new URL(...)` and the fetch redirect loop both
// depend on this class.
//
// The `searchParams` getter constructs a
// `URLSearchParams` lazily — that class is defined
// later in the concat (`src/js/url_search_params.js`),
// which is fine because the getter is only triggered
// at call time, after the whole snapshot has booted.
//
// Each component is a private field with a paired
// getter+setter; every setter calls `_rebuildHref()`
// so writes to `pathname` / `hash` / `host` / etc.
// actually update the serialized href. The previous
// shape stored these as plain instance properties,
// which broke any user code that mutates the URL
// after construction (the search setter happened to
// be wired correctly because it's used by the
// internal `_updateSearch` plumbing — the rest were
// silent no-ops on href).
(function () {
    const _urlParse = $$urlParse;

    // WHATWG special schemes and their default ports. A port equal to its
    // scheme's default is not serialized, so both the `protocol` and `port`
    // setters clear it.
    const _DEFAULT_PORTS = {
        'ftp:': '21',
        'http:': '80',
        'https:': '443',
        'ws:': '80',
        'wss:': '443',
    };

    // The WHATWG query percent-encode set: C0 controls, space, " # < >,
    // DEL, and anything above ASCII (as UTF-8). `%` is deliberately left
    // alone so already-encoded input is not double-encoded.
    const _encodeQuery = (s) => {
        let out = '';
        for (const ch of s) {
            const c = ch.codePointAt(0);
            if (c <= 0x20 || c === 0x22 || c === 0x23 ||
                c === 0x3C || c === 0x3E || c === 0x7F) {
                out += '%' +
                    c.toString(16).toUpperCase().padStart(2, '0');
            } else if (c > 0x7E) {
                out += encodeURIComponent(ch);
            } else {
                out += ch;
            }
        }
        return out;
    };

    globalThis.URL = class URL {
        #protocol = '';
        #username = '';
        #password = '';
        #hostname = '';
        #port = '';
        #pathname = '';
        #search = '';
        #hash = '';
        #href = '';
        #searchParams = null;

        constructor(input, base) {
            const p = _urlParse(
                String(input),
                base !== undefined ? String(base)
                    : undefined,
            );
            this._apply(p);
        }

        _apply(p) {
            this.#protocol = p.protocol + ':';
            this.#username = p.username || '';
            this.#password = p.password || '';
            this.#hostname = p.host;
            this.#port = p.port || '';
            this.#pathname = p.pathname;
            this.#search = p.search ? '?' + p.search : '';
            this.#hash = p.hash ? '#' + p.hash : '';
            this.#href = p.href;
            if (this.#searchParams) {
                this.#searchParams._initFromSearch(
                    this.#search);
            }
        }

        get protocol() { return this.#protocol; }
        set protocol(v) {
            v = String(v);
            // Spec: trailing ':' is part of the property.
            if (!v.endsWith(':')) v += ':';
            this.#protocol = v;
            // A port that is the new scheme's default is dropped.
            if (this.#port && _DEFAULT_PORTS[v] === this.#port)
                this.#port = '';
            this._rebuildHref();
        }

        get username() { return this.#username; }
        set username(v) {
            this.#username = String(v);
            this._rebuildHref();
        }

        get password() { return this.#password; }
        set password(v) {
            this.#password = String(v);
            this._rebuildHref();
        }

        get host() {
            return this.#port
                ? this.#hostname + ':' + this.#port
                : this.#hostname;
        }
        set host(v) {
            v = String(v);
            const colon = v.indexOf(':');
            if (colon === -1) {
                this.#hostname = v;
                this.#port = '';
            } else {
                this.#hostname = v.slice(0, colon);
                const port = v.slice(colon + 1);
                // As in the port setter, a scheme-default port is dropped.
                this.#port =
                    _DEFAULT_PORTS[this.#protocol] === port ? '' : port;
            }
            this._rebuildHref();
        }

        get hostname() { return this.#hostname; }
        set hostname(v) {
            this.#hostname = String(v);
            this._rebuildHref();
        }

        get port() { return this.#port; }
        set port(v) {
            // Spec accepts numeric strings; empty string
            // clears the port. Bad input is silently
            // ignored (matches browser behaviour).
            v = String(v);
            if (v === '') this.#port = '';
            else if (/^\d+$/.test(v))
                this.#port =
                    _DEFAULT_PORTS[this.#protocol] === v ? '' : v;
            this._rebuildHref();
        }

        get pathname() { return this.#pathname; }
        set pathname(v) {
            v = String(v).replace(/[\t\n\r]/g, '');
            // Spec: special-scheme URLs always have an
            // absolute path — prepend '/' if missing.
            if (v && !v.startsWith('/')) v = '/' + v;
            this.#pathname = v;
            this._rebuildHref();
        }

        get search() { return this.#search; }
        set search(v) {
            v = String(v).replace(/[\t\n\r]/g, '');
            if (v.startsWith('?')) v = v.slice(1);
            this.#search = v === '' ? '' : '?' + _encodeQuery(v);
            if (this.#searchParams) {
                this.#searchParams._initFromSearch(
                    this.#search);
            }
            this._rebuildHref();
        }

        get hash() { return this.#hash; }
        set hash(v) {
            v = String(v).replace(/[\t\n\r]/g, '');
            if (v === '') this.#hash = '';
            else if (!v.startsWith('#')) this.#hash = '#' + v;
            else this.#hash = v;
            this._rebuildHref();
        }

        // Origin is a derived value (protocol + host) and
        // read-only per spec. Recompute on read so writes
        // to protocol / hostname / port flow through.
        get origin() {
            // Opaque-origin schemes (data:, blob:, file:,
            // ...) yield the literal string "null" per
            // the WHATWG URL "origin" algorithm. We don't
            // reproduce the full table here; the parser
            // handed us a precomputed origin via _apply,
            // but it can drift after setter writes.
            // Pragmatic: rebuild for special schemes,
            // fall back to "null" otherwise.
            const p = this.#protocol;
            if (
                p === 'http:' || p === 'https:' ||
                p === 'ws:'   || p === 'wss:'   ||
                p === 'ftp:'
            ) {
                let o = p + '//' + this.#hostname;
                if (this.#port) o += ':' + this.#port;
                return o;
            }
            // A blob: URL inherits the origin of its path parsed as a URL, so
            // `blob:https://example.com:443/` is same-origin with
            // `https://example.com`. A path that is not a URL (the common
            // `blob:<uuid>` form) has no origin to inherit.
            if (p === 'blob:') {
                try { return new URL(this.#pathname).origin; }
                catch { return 'null'; }
            }
            return 'null';
        }

        get href() { return this.#href; }
        set href(v) {
            this._apply(_urlParse(String(v)));
        }

        _rebuildHref() {
            let h = this.#protocol + '//';
            if (this.#username) {
                h += this.#username;
                if (this.#password)
                    h += ':' + this.#password;
                h += '@';
            }
            h += this.#hostname;
            if (this.#port) h += ':' + this.#port;
            h += this.#pathname + this.#search +
                this.#hash;
            this.#href = h;
        }

        _updateSearch(sp) {
            const s = sp.toString();
            this.#search = s ? '?' + s : '';
            this._rebuildHref();
        }

        get searchParams() {
            if (!this.#searchParams) {
                this.#searchParams =
                    new URLSearchParams(this.#search);
                this.#searchParams._url = this;
            }
            return this.#searchParams;
        }

        toString() { return this.#href; }
        toJSON() { return this.#href; }

        static canParse(url, base) {
            try {
                new URL(
                    url,
                    base !== undefined ? base
                        : undefined,
                );
                return true;
            } catch { return false; }
        }
        static parse(url, base) {
            try {
                return new URL(
                    url,
                    base !== undefined ? base
                        : undefined,
                );
            } catch { return null; }
        }
    };
    // Per WHATWG / Web IDL, every interface gets a
    // Symbol.toStringTag matching its class name so
    // `Object.prototype.toString.call(url)` returns
    // "[object URL]" instead of "[object Object]".
    Object.defineProperty(globalThis.URL.prototype,
        Symbol.toStringTag, {
            value: 'URL', configurable: true,
        });
})();
