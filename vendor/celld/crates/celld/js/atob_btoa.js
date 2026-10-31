// atob / btoa.
// Own IIFE: captures the host ops it needs, attaches to
// globalThis, exits. The $$-prefixed host ops stay defined
// for the life of the isolate — non-enumerable (see the ops
// macro in js.rs), not removed. DOMException is installed
// later, by harness.js, and is only referenced at call time.
(function () {
    const _atob = $$atob;
    const _btoa = $$btoa;

    // WHATWG infra: atob strips ASCII whitespace
    // (U+0009 TAB, U+000A LF, U+000C FF, U+000D CR,
    // U+0020 SPACE) from input before decoding, and
    // throws DOMException("InvalidCharacterError") on
    // bad input (not a plain Error). The Rust op does
    // neither — preprocess and re-wrap here.
    globalThis.atob = (s) => {
        s = String(s).replace(/[\t\n\f\r ]/g, "");
        try {
            return _atob(s);
        } catch (e) {
            throw new DOMException(
                e && e.message
                    ? String(e.message)
                    : "atob: invalid base64",
                "InvalidCharacterError",
            );
        }
    };
    globalThis.btoa = (s) => {
        s = String(s);
        for (let i = 0; i < s.length; i++) {
            if (s.charCodeAt(i) > 0xff) {
                throw new DOMException(
                    "String contains a code point > U+00FF",
                    "InvalidCharacterError",
                );
            }
        }
        return _btoa(s);
    };
})();
