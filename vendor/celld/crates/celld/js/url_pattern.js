// URLPattern — WHATWG URLPattern over the Rust `urlpattern` crate, split
// the way Deno splits it: the host ops ($$urlPatternParse /
// $$urlPatternMatchInput) do pattern parsing and match-input
// canonicalization; the compiled component regexes execute here as plain
// JS RegExp. Compiled on first access (see LAZY_GLOBALS); a bundle that
// never names URLPattern never pays for this file.
(() => {

const KEYS = ['protocol', 'username', 'password', 'hostname', 'port',
              'pathname', 'search', 'hash'];

// USVString: lone surrogates become U+FFFD so the value survives
// JSON.stringify into the host op.
const usv = (v) => String(v).toWellFormed();

// (URLPatternInit or USVString): null/undefined and objects convert as a
// dictionary of USVString members (baseURL included), anything else as a
// string.
function toInput(v) {
  if (v === undefined || v === null) return {};
  if (typeof v !== 'object') return usv(v);
  const init = {};
  for (const k of [...KEYS, 'baseURL'])
    if (v[k] !== undefined) init[k] = usv(v[k]);
  return init;
}

// Canonicalized 8-component values for a match input, or null when the
// input does not parse as a URL (per spec, a non-match).
function matchValues(input, baseURL) {
  const json = $$urlPatternMatchInput(JSON.stringify(input), baseURL);
  return json === null ? null : JSON.parse(json);
}

const components = Symbol('components');

class URLPattern {
  constructor(input, baseURLOrOptions, maybeOptions) {
    let baseURL, options;
    if (typeof baseURLOrOptions === 'string') {
      baseURL = usv(baseURLOrOptions);
      options = maybeOptions;
    } else {
      options = baseURLOrOptions;
    }
    const ignoreCase = !!(options && options.ignoreCase);
    const parsed = JSON.parse($$urlPatternParse(
      JSON.stringify(toInput(input)), baseURL, ignoreCase));
    const flags = ignoreCase ? 'ui' : 'u';
    for (const k of KEYS) {
      const c = parsed[k];
      try {
        c.regexp = new RegExp(c.regexpString, flags);
      } catch (e) {
        throw new TypeError(`Invalid ${k} pattern: ${e.message}`);
      }
    }
    this[components] = parsed;
  }

  get protocol() { return this[components].protocol.patternString; }
  get username() { return this[components].username.patternString; }
  get password() { return this[components].password.patternString; }
  get hostname() { return this[components].hostname.patternString; }
  get port() { return this[components].port.patternString; }
  get pathname() { return this[components].pathname.patternString; }
  get search() { return this[components].search.patternString; }
  get hash() { return this[components].hash.patternString; }
  get hasRegExpGroups() { return this[components].hasRegexpGroups; }

  test(input, baseURL) {
    if (baseURL !== undefined) baseURL = usv(baseURL);
    const values = matchValues(toInput(input), baseURL);
    if (values === null) return false;
    const c = this[components];
    return KEYS.every((k, i) => c[k].regexp.test(values[i]));
  }

  exec(input, baseURL) {
    input = toInput(input);
    if (baseURL !== undefined) baseURL = usv(baseURL);
    const values = matchValues(input, baseURL);
    if (values === null) return null;
    const inputs = [input];
    if (baseURL !== undefined) inputs.push(baseURL);
    const result = { inputs };
    const c = this[components];
    for (let i = 0; i < 8; i++) {
      const k = KEYS[i];
      const m = c[k].regexp.exec(values[i]);
      if (m === null) return null;
      const groups = {};
      const names = c[k].groupNameList;
      for (let j = 0; j < names.length; j++) groups[names[j]] = m[j + 1];
      result[k] = { input: values[i], groups };
    }
    return result;
  }
}

Object.defineProperty(URLPattern.prototype, Symbol.toStringTag,
                      { value: 'URLPattern', configurable: true });

return { URLPattern };
})()
