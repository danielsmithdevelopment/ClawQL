// node:util for Cells — a port of Workerd's implementation at commit
// 191a27f941300dd8956f2afeb66c10a651108c0b:
//
//   src/node/util.ts                      (module surface)
//   src/node/internal/internal_inspect.ts (util.inspect / util.format —
//                                          itself Workerd's port of Node's
//                                          lib/internal/util/inspect.js)
//   src/node/internal/internal_utils.ts   (callbackify, parseEnv,
//                                          getOwnNonIndexProperties)
//   src/node/internal/internal_comparisons.ts (isDeepStrictEqual)
//   src/node/internal/validators.ts, internal_errors.ts (subsets)
//   src/node/internal/debuglog.ts
//
// Types are stripped (tsc --target es2022); the `node-internal:*` imports
// are inlined below. Deviations from Workerd, all forced by the embedding:
//
// - Workerd's C++ `node-internal:util` builtin (type checks, proxy/promise
//   details, previewEntries, getConstructorName) maps onto the __util_*
//   host ops that js.rs registers.
// - Workerd's JSG layer generates per-resource-type inspect data from its
//   C++ class registrations; Cells' platform classes are plain JS, so the
//   equivalent declaration is the registry stamped near the end of this
//   file. Field order matches Workerd's inspect output byte-for-byte.
// - `isRpcWildcardType` is always false: Cells' RPC stubs are not resource
//   types and are never probed for entries().
// - MIMEType/MIMEParams (native in Workerd) are a compact JS equivalent.
// - getCallSites uses Error.prepareStackTrace instead of a C++ stack walk.
// - `types.isKeyObject` checks node:crypto's KeyObject class through the
//   `__nodeKeyObjectClass` hidden global (false until node:crypto loads —
//   no KeyObject can exist before that).
//
// Injected lazily into the generated stub module, so an isolate that never
// imports node:util (or node:util/types) pays nothing.
(() => {
  // ---- native type seam ----------------------------------------------------
  // Bit order must match op_util_type_flags in js.rs.
  const T = (() => {
    const names = [
      "external", "date", "argumentsObject", "bigIntObject", "booleanObject",
      "numberObject", "stringObject", "symbolObject", "nativeError",
      "regExp", "asyncFunction", "generatorFunction", "generatorObject",
      "promise", "map", "set", "mapIterator", "setIterator", "weakMap",
      "weakSet", "arrayBuffer", "dataView", "sharedArrayBuffer", "proxy",
      "moduleNamespaceObject", "typedArray", "arrayBufferView",
    ];
    const bits = { __proto__: null };
    names.forEach((n, i) => { bits[n] = 1 << i; });
    return bits;
  })();
  const flagsOf = (v) =>
    (v !== null && typeof v === "object") || typeof v === "function"
      ? __util_type_flags(v)
      : 0;
  const check = (bit) => (v) => (flagsOf(v) & bit) !== 0;

  const isExternal = check(T.external);
  const isDate = check(T.date);
  const isArgumentsObject = check(T.argumentsObject);
  const isBigIntObject = check(T.bigIntObject);
  const isBooleanObject = check(T.booleanObject);
  const isNumberObject = check(T.numberObject);
  const isStringObject = check(T.stringObject);
  const isSymbolObject = check(T.symbolObject);
  const isNativeError = check(T.nativeError);
  const isRegExp = check(T.regExp);
  const isAsyncFunction = check(T.asyncFunction);
  const isGeneratorFunction = check(T.generatorFunction);
  const isGeneratorObject = check(T.generatorObject);
  const isPromise = check(T.promise);
  const isMap = check(T.map);
  const isSet = check(T.set);
  const isMapIterator = check(T.mapIterator);
  const isSetIterator = check(T.setIterator);
  const isWeakMap = check(T.weakMap);
  const isWeakSet = check(T.weakSet);
  const isArrayBuffer = check(T.arrayBuffer);
  const isDataView = check(T.dataView);
  const isSharedArrayBuffer = check(T.sharedArrayBuffer);
  const isProxy = check(T.proxy);
  const isModuleNamespaceObject = check(T.moduleNamespaceObject);
  const isTypedArray = check(T.typedArray);
  const isAnyArrayBuffer =
    check(T.arrayBuffer | T.sharedArrayBuffer);
  const isBoxedPrimitive = check(
    T.bigIntObject | T.booleanObject | T.numberObject | T.stringObject |
    T.symbolObject);
  const isArrayBufferView = (v) => ArrayBuffer.isView(v);

  const __taTag = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(Uint8Array).prototype, Symbol.toStringTag).get;
  const tagIs = (name) => (v) =>
    isTypedArray(v) && __taTag.call(v) === name;
  const isUint8Array = tagIs("Uint8Array");
  const isUint8ClampedArray = tagIs("Uint8ClampedArray");
  const isUint16Array = tagIs("Uint16Array");
  const isUint32Array = tagIs("Uint32Array");
  const isInt8Array = tagIs("Int8Array");
  const isInt16Array = tagIs("Int16Array");
  const isInt32Array = tagIs("Int32Array");
  const isFloat16Array = tagIs("Float16Array");
  const isFloat32Array = tagIs("Float32Array");
  const isFloat64Array = tagIs("Float64Array");
  const isBigInt64Array = tagIs("BigInt64Array");
  const isBigUint64Array = tagIs("BigUint64Array");

  const isCryptoKey = (v) =>
    typeof CryptoKey === "function" && v instanceof CryptoKey;
  // node:crypto (lazy) publishes its KeyObject class on this hidden global.
  const isKeyObject = (v) =>
    typeof globalThis.__nodeKeyObjectClass === "function" &&
    v instanceof globalThis.__nodeKeyObjectClass;

  // Byte compare for internal_comparisons (Workerd imports Buffer.compare).
  const compare = (a, b) => globalThis.Buffer.compare(a, b);

  // Hex dump for formatArrayBuffer (Workerd uses Buffer.prototype.hexSlice).
  const hexSlice = (buf, start, end) => {
    let str = "";
    for (let i = start; i < end; i++) {
      str += buf[i].toString(16).padStart(2, "0");
    }
    return str;
  };

// Copyright (c) 2017-2022 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in Workerd's LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0
//
// Adapted from Deno and Node.js:
// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
//
// Adapted from Node.js. Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
function spliceOne(list, index) {
    for (; index + 1 < list.length; index++)
        list[index] = list[index + 1];
    list.pop();
}
const ALL_PROPERTIES = 0;
const ONLY_WRITABLE = 1;
const ONLY_ENUMERABLE = 2;
const ONLY_CONFIGURABLE = 4;
const ONLY_ENUM_WRITABLE = 6;
const SKIP_STRINGS = 8;
const SKIP_SYMBOLS = 16;
const isNumericLookup = {};
function isArrayIndex(value) {
    switch (typeof value) {
        case 'number':
            return value >= 0 && (value | 0) === value;
        case 'string': {
            const result = isNumericLookup[value];
            if (result !== void 0) {
                return result;
            }
            const length = value.length;
            if (length === 0) {
                return (isNumericLookup[value] = false);
            }
            let ch = 0;
            let i = 0;
            for (; i < length; ++i) {
                ch = value.charCodeAt(i);
                if ((i === 0 && ch === 0x30 && length > 1) /* must not start with 0 */ ||
                    ch < 0x30 /* 0 */ ||
                    ch > 0x39 /* 9 */) {
                    return (isNumericLookup[value] = false);
                }
            }
            // 2**32 - 1 is not a valid array index (upstream's JS helper
            // missed the bound; Workerd's native path enforces it).
            return (isNumericLookup[value] = Number(value) < 4294967295);
        }
        default:
            return false;
    }
}
function getOwnNonIndexProperties(
// deno-lint-ignore ban-types
obj, filter) {
    let allProperties = [
        ...Object.getOwnPropertyNames(obj),
        ...Object.getOwnPropertySymbols(obj),
    ];
    // Workerd's native version filters element indices for every kind of
    // indexed object; the upstream JS version only handled Array.
    if (Array.isArray(obj) || isTypedArray(obj)) {
        allProperties = allProperties.filter((k) => !isArrayIndex(k));
    }
    if (filter === ALL_PROPERTIES) {
        return allProperties;
    }
    const result = [];
    for (const key of allProperties) {
        const desc = Object.getOwnPropertyDescriptor(obj, key);
        if (desc === undefined) {
            continue;
        }
        if (filter & ONLY_WRITABLE && !desc.writable) {
            continue;
        }
        if (filter & ONLY_ENUMERABLE && !desc.enumerable) {
            continue;
        }
        if (filter & ONLY_CONFIGURABLE && !desc.configurable) {
            continue;
        }
        if (filter & SKIP_STRINGS && typeof key === 'string') {
            continue;
        }
        if (filter & SKIP_SYMBOLS && typeof key === 'symbol') {
            continue;
        }
        result.push(key);
    }
    return result;
}
function callbackifyOnRejected(reason, cb) {
    // `!reason` guard inspired by bluebird (https://github.com/petkaantonov/bluebird/blob/2207fae3572f03b089bc92d3a6cefdd278cff7ab/src/nodeify.js#L30-L43).
    // Because `null` is a special error value in callbacks which means "no error
    // occurred", we error-wrap so the callback consumer can distinguish between
    // "the promise rejected with null" or "the promise fulfilled with undefined".
    if (!reason) {
        reason = new ERR_FALSY_VALUE_REJECTION(reason);
    }
    cb(reason);
}
function callbackify(original) {
    validateFunction(original, 'original');
    function callbackified(...args) {
        const maybeCb = args.pop();
        validateFunction(maybeCb, 'last argument');
        const cb = maybeCb.bind(this);
        Reflect.apply(original, this, args).then((ret) => {
            queueMicrotask(() => cb(null, ret));
        }, (rej) => {
            queueMicrotask(() => {
                callbackifyOnRejected(rej, cb);
            });
        });
    }
    const descriptors = Object.getOwnPropertyDescriptors(original);
    if (typeof descriptors.length?.value === 'number') {
        descriptors.length.value++;
    }
    if (typeof descriptors.name?.value === 'string') {
        descriptors.name.value += 'Callbackified';
    }
    const propertiesValues = Object.values(descriptors);
    for (let i = 0; i < propertiesValues.length; i++) {
        Object.setPrototypeOf(propertiesValues[i], null);
    }
    Object.defineProperties(callbackified, descriptors);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    return callbackified;
}
function parseEnv(content) {
    validateString(content, 'content');
    const result = {};
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line === undefined)
            continue;
        if (!line.trim())
            continue;
        if (line.trimStart().startsWith('#'))
            continue;
        if (line.trimStart().startsWith('export '))
            line = line.substring(line.indexOf('export ') + 7);
        const equalIndex = line.indexOf('=');
        if (equalIndex === -1)
            continue;
        const key = line.substring(0, equalIndex).trim();
        if (!key)
            continue;
        let value = line.substring(equalIndex + 1).trimStart();
        if (value.length > 0) {
            const maybeQuote = value[0];
            if (maybeQuote === '"' || maybeQuote === "'" || maybeQuote === '`') {
                // Check if the closing quote is on the same line
                const closeIndex = value.indexOf(maybeQuote, 1);
                if (closeIndex !== -1) {
                    // Found closing quote on same line
                    value = value.substring(1, closeIndex);
                    // Only handle escape sequences for double quotes
                    if (maybeQuote === '"')
                        value = value.replace(/\\n/g, '\n');
                    // For single quotes and backticks, keep \n as literal
                }
                else {
                    // Check for multiline strings
                    let fullValue = value.substring(1); // Remove opening quote
                    let currentLine = i;
                    let foundClosingQuote = false;
                    // Look for closing quote in subsequent lines
                    while (currentLine < lines.length - 1) {
                        currentLine++;
                        const nextLine = lines[currentLine];
                        if (nextLine !== undefined) {
                            const closeInNextLine = nextLine.indexOf(maybeQuote);
                            if (closeInNextLine !== -1) {
                                // Found closing quote
                                fullValue += '\n' + nextLine.substring(0, closeInNextLine);
                                value = fullValue;
                                // Only handle escape sequences for double quotes
                                if (maybeQuote === '"') {
                                    value = value.replace(/\\n/g, '\n');
                                }
                                foundClosingQuote = true;
                                i = currentLine; // Update line counter
                                break;
                            }
                            else {
                                // Continue building multiline value
                                fullValue += '\n' + nextLine;
                            }
                        }
                    }
                    if (!foundClosingQuote) {
                        if (value.length === 1) {
                            // Just the quote character, return it as the value
                            value = maybeQuote;
                        }
                        else {
                            // Return content after the opening quote
                            value = value.substring(1);
                        }
                    }
                }
            }
            else {
                const hashIndex = value.indexOf('#');
                if (hashIndex !== -1)
                    value = value.substring(0, hashIndex);
                value = value.trimEnd();
            }
        }
        result[key] = value;
    }
    return result;
}

// Copyright (c) 2017-2022 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in Workerd's LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0
//
// Adapted from Deno and Node.js:
// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
//
// Adapted from Node.js. Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
// TODO(someday): Not current implementing parseFileMode
function isInt32(value) {
    if (typeof value !== 'number')
        return false;
    return value === (value | 0);
}
function isUint32(value) {
    // @ts-expect-error Due to value being unknown
    return value === value >>> 0;
}
function validateBuffer(buffer, name = 'buffer') {
    if (!isArrayBufferView(buffer)) {
        throw new ERR_INVALID_ARG_TYPE(name, ['Buffer', 'TypedArray', 'DataView'], buffer);
    }
}
function validateInteger(value, name, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
    if (typeof value !== 'number') {
        throw new ERR_INVALID_ARG_TYPE(name, 'number', value);
    }
    if (!Number.isInteger(value)) {
        throw new ERR_OUT_OF_RANGE(name, 'an integer', value);
    }
    if (value < min || value > max) {
        throw new ERR_OUT_OF_RANGE(name, `>= ${min} && <= ${max}`, value);
    }
}
function validateObject(value, name, options = kValidateObjectNone) {
    if (options === kValidateObjectNone) {
        if (value === null || Array.isArray(value)) {
            throw new ERR_INVALID_ARG_TYPE(name, 'Object', value);
        }
        if (typeof value !== 'object') {
            throw new ERR_INVALID_ARG_TYPE(name, 'Object', value);
        }
    }
    else {
        const throwOnNullable = (kValidateObjectAllowNullable & options) === 0;
        if (throwOnNullable && value === null) {
            throw new ERR_INVALID_ARG_TYPE(name, 'Object', value);
        }
        const throwOnArray = (kValidateObjectAllowArray & options) === 0;
        if (throwOnArray && Array.isArray(value)) {
            throw new ERR_INVALID_ARG_TYPE(name, 'Object', value);
        }
        const throwOnFunction = (kValidateObjectAllowFunction & options) === 0;
        const typeofValue = typeof value;
        if (typeofValue !== 'object' &&
            (throwOnFunction || typeofValue !== 'function')) {
            throw new ERR_INVALID_ARG_TYPE(name, 'Object', value);
        }
    }
}
function validateInt32(value, name, min = -2147483648, max = 2147483647) {
    if (!isInt32(value)) {
        if (typeof value !== 'number') {
            throw new ERR_INVALID_ARG_TYPE(name, 'number', value);
        }
        if (!Number.isInteger(value)) {
            throw new ERR_OUT_OF_RANGE(name, 'an integer', value);
        }
        throw new ERR_OUT_OF_RANGE(name, `>= ${min} && <= ${max}`, value);
    }
    if (value < min || value > max) {
        throw new ERR_OUT_OF_RANGE(name, `>= ${min} && <= ${max}`, value);
    }
}
function validateUint32(value, name, positive) {
    if (!isUint32(value)) {
        if (typeof value !== 'number') {
            throw new ERR_INVALID_ARG_TYPE(name, 'number', value);
        }
        if (!Number.isInteger(value)) {
            throw new ERR_OUT_OF_RANGE(name, 'an integer', value);
        }
        const min = positive ? 1 : 0;
        // 2 ** 32 === 4294967296
        throw new ERR_OUT_OF_RANGE(name, `>= ${min} && < 4294967296`, value);
    }
    if (positive && value === 0) {
        throw new ERR_OUT_OF_RANGE(name, '>= 1 && < 4294967296', value);
    }
}
function validateString(value, name) {
    if (typeof value !== 'string') {
        throw new ERR_INVALID_ARG_TYPE(name, 'string', value);
    }
}
function validateStringArray(value, name) {
    validateArray(value, name);
    for (let i = 0; i < value.length; ++i) {
        // Don't use validateString here for performance reasons, as
        // we would generate intermediate strings for the name.
        if (typeof value[i] !== 'string') {
            throw new ERR_INVALID_ARG_TYPE(`${name}[${i}]`, 'string', value[i]);
        }
    }
}
function validateNumber(value, name, min, max) {
    if (typeof value !== 'number') {
        throw new ERR_INVALID_ARG_TYPE(name, 'number', value);
    }
    if ((min != null && value < min) ||
        (max != null && value > max) ||
        ((min != null || max != null) && Number.isNaN(value))) {
        throw new ERR_OUT_OF_RANGE(name, `${min != null ? `>= ${min}` : ''}${min != null && max != null ? ' && ' : ''}${max != null ? `<= ${max}` : ''}`, value);
    }
}
function validateBoolean(value, name) {
    if (typeof value !== 'boolean') {
        throw new ERR_INVALID_ARG_TYPE(name, 'boolean', value);
    }
}
function validateOneOf(value, name, oneOf) {
    if (!Array.prototype.includes.call(oneOf, value)) {
        const allowed = Array.prototype.join.call(Array.prototype.map.call(oneOf, (v) => typeof v === 'string' ? `'${v}'` : String(v)), ', ');
        const reason = 'must be one of: ' + allowed;
        throw new ERR_INVALID_ARG_VALUE(name, value, reason);
    }
}
function validateAbortSignal(signal, name) {
    if (signal !== undefined &&
        (signal === null || typeof signal !== 'object' || !('aborted' in signal))) {
        throw new ERR_INVALID_ARG_TYPE(name, 'AbortSignal', signal);
    }
}
function validateFunction(value, name) {
    if (typeof value !== 'function') {
        throw new ERR_INVALID_ARG_TYPE(name, 'Function', value);
    }
}
function validateArray(value, name, minLength = 0) {
    if (!Array.isArray(value)) {
        throw new ERR_INVALID_ARG_TYPE(name, 'Array', value);
    }
    if (value.length < minLength) {
        const reason = `must be longer than ${minLength}`;
        throw new ERR_INVALID_ARG_VALUE(name, value, reason);
    }
}
// 1. Returns false for undefined and NaN
// 2. Returns true for finite numbers
// 3. Throws ERR_INVALID_ARG_TYPE for non-numbers
// 4. Throws ERR_OUT_OF_RANGE for infinite numbers
function checkFiniteNumber(number, name) {
    // Common case
    if (number === undefined) {
        return false;
    }
    if (Number.isFinite(number)) {
        return true; // Is a valid number
    }
    if (Number.isNaN(number)) {
        return false;
    }
    validateNumber(number, name);
    // Infinite numbers
    throw new ERR_OUT_OF_RANGE(name, 'a finite number', number);
}
function checkRangesOrGetDefault(number, name, lower, upper, def) {
    if (!checkFiniteNumber(number, name)) {
        return def;
    }
    if (number < lower || number > upper) {
        throw new ERR_OUT_OF_RANGE(name, `>= ${lower} and <= ${upper}`, number);
    }
    return number;
}
function validateThisInternalField(object, fieldKey, className) {
    if (typeof object !== 'object' ||
        object === null ||
        !Object.prototype.hasOwnProperty.call(object, fieldKey)) {
        throw new ERR_INVALID_THIS(className);
    }
}
const kValidateObjectNone = 0;
const kValidateObjectAllowNullable = 1 << 0;
const kValidateObjectAllowArray = 1 << 1;
const kValidateObjectAllowFunction = 1 << 2;
const kValidateObjectAllowObjects = kValidateObjectAllowArray | kValidateObjectAllowFunction;
const kValidateObjectAllowObjectsAndNull = kValidateObjectAllowNullable |
    kValidateObjectAllowArray |
    kValidateObjectAllowFunction;

const classErrRegExp = /^([A-Z][a-z0-9]*)+$/;
const kTypes = [
    'string',
    'function',
    'number',
    'object',
    'Function',
    'Object',
    'boolean',
    'bigint',
    'symbol',
];
class NodeErrorAbstraction extends Error {
    code;
    constructor(name, code, message) {
        super(message);
        this.code = code;
        this.name = name;
    }
    toString() {
        return `${this.name} [${this.code}]: ${this.message}`;
    }
}
class NodeError extends NodeErrorAbstraction {
    constructor(code, message) {
        super(Error.prototype.name, code, message);
    }
}
class NodeRangeError extends NodeErrorAbstraction {
    constructor(code, message) {
        super(RangeError.prototype.name, code, message);
        Object.setPrototypeOf(this, RangeError.prototype);
        this.toString = function () {
            return `${this.name} [${this.code}]: ${this.message}`;
        };
    }
}
class NodeTypeError extends NodeErrorAbstraction {
    constructor(code, message) {
        super(TypeError.prototype.name, code, message);
        Object.setPrototypeOf(this, TypeError.prototype);
        this.toString = function () {
            return `${this.name} [${this.code}]: ${this.message}`;
        };
    }
}
function createInvalidArgType(name, expected) {
    // https://github.com/nodejs/node/blob/f3eb224/lib/internal/errors.js#L1037-L1087
    expected = Array.isArray(expected) ? expected : [expected];
    let msg = 'The ';
    if (name.endsWith(' argument')) {
        // For cases like 'first argument'
        msg += `${name} `;
    }
    else {
        const type = name.includes('.') ? 'property' : 'argument';
        msg += `"${name}" ${type} `;
    }
    msg += 'must be ';
    const types = [];
    const instances = [];
    const other = [];
    for (const value of expected) {
        if (kTypes.includes(value)) {
            types.push(value.toLocaleLowerCase());
        }
        else if (classErrRegExp.test(value)) {
            instances.push(value);
        }
        else {
            other.push(value);
        }
    }
    // Special handle `object` in case other instances are allowed to outline
    // the differences between each other.
    if (instances.length > 0) {
        const pos = types.indexOf('object');
        if (pos !== -1) {
            types.splice(pos, 1);
            instances.push('Object');
        }
    }
    if (types.length > 0) {
        if (types.length > 2) {
            const last = types.pop();
            msg += `one of type ${types.join(', ')}, or ${last}`;
        }
        else if (types.length === 2) {
            msg += `one of type ${types[0]} or ${types[1]}`;
        }
        else {
            msg += `of type ${types[0]}`;
        }
        if (instances.length > 0 || other.length > 0) {
            msg += ' or ';
        }
    }
    if (instances.length > 0) {
        if (instances.length > 2) {
            const last = instances.pop();
            msg += `an instance of ${instances.join(', ')}, or ${last}`;
        }
        else {
            msg += `an instance of ${instances[0]}`;
            if (instances.length === 2) {
                msg += ` or ${instances[1]}`;
            }
        }
        if (other.length > 0) {
            msg += ' or ';
        }
    }
    if (other.length > 0) {
        if (other.length > 2) {
            const last = other.pop();
            msg += `one of ${other.join(', ')}, or ${last}`;
        }
        else if (other.length === 2) {
            msg += `one of ${other[0]} or ${other[1]}`;
        }
        else {
            if (other[0]?.toLowerCase() !== other[0]) {
                msg += 'an ';
            }
            msg += `${other[0]}`;
        }
    }
    return msg;
}
function invalidArgTypeHelper(input) {
    if (input == null) {
        return ` Received ${input}`;
    }
    if (typeof input === 'function' && input.name) {
        return ` Received function ${input.name}`;
    }
    if (typeof input === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (input.constructor?.name) {
            return ` Received an instance of ${input.constructor.name}`;
        }
        return ` Received ${inspect(input, { depth: -1 })}`;
    }
    let inspected = inspect(input, { colors: false });
    if (inspected.length > 25) {
        inspected = `${inspected.slice(0, 25)}...`;
    }
    return ` Received type ${typeof input} (${inspected})`;
}
function addNumericalSeparator(val) {
    let res = '';
    let i = val.length;
    const start = val[0] === '-' ? 1 : 0;
    for (; i >= start + 4; i -= 3) {
        res = `_${val.slice(i - 3, i)}${res}`;
    }
    return `${val.slice(0, i)}${res}`;
}
class ERR_INVALID_ARG_TYPE_RANGE extends NodeRangeError {
    constructor(name, expected, actual) {
        const msg = createInvalidArgType(name, expected);
        super('ERR_INVALID_ARG_TYPE', `${msg}.${invalidArgTypeHelper(actual)}`);
    }
}
class ERR_INVALID_ARG_TYPE extends NodeTypeError {
    constructor(name, expected, actual) {
        const msg = createInvalidArgType(name, expected);
        super('ERR_INVALID_ARG_TYPE', `${msg}.${invalidArgTypeHelper(actual)}`);
    }
    static RangeError = ERR_INVALID_ARG_TYPE_RANGE;
}
class ERR_INVALID_ARG_VALUE_RANGE extends NodeRangeError {
    constructor(name, value, reason = 'is invalid') {
        const type = name.includes('.') ? 'property' : 'argument';
        const inspected = inspect(value);
        super('ERR_INVALID_ARG_VALUE', `The ${type} '${name}' ${reason}. Received ${inspected}`);
    }
}
class ERR_INVALID_ARG_VALUE extends NodeTypeError {
    constructor(name, value, reason = 'is invalid') {
        const type = name.includes('.') ? 'property' : 'argument';
        const inspected = inspect(value);
        super('ERR_INVALID_ARG_VALUE', `The ${type} '${name}' ${reason}. Received ${inspected}`);
    }
    static RangeError = ERR_INVALID_ARG_VALUE_RANGE;
}
class ERR_OUT_OF_RANGE extends RangeError {
    code = 'ERR_OUT_OF_RANGE';
    constructor(str, range, input, replaceDefaultBoolean = false) {
        // TODO(later): Implement internal assert?
        // assert(range, 'Missing "range" argument');
        let msg = replaceDefaultBoolean
            ? str
            : `The value of "${str}" is out of range.`;
        let received;
        if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) {
            received = addNumericalSeparator(String(input));
        }
        else if (typeof input === 'bigint') {
            received = String(input);
            if (input > 2n ** 32n || input < -(2n ** 32n)) {
                received = addNumericalSeparator(received);
            }
            received += 'n';
        }
        else {
            received = inspect(input);
        }
        msg += ` It must be ${range}. Received ${received}`;
        super(msg);
        const { name } = this;
        // Add the error code to the name to include it in the stack trace.
        this.name = `${name} [${this.code}]`;
        // Access the stack to generate the error message including the error code from the name.
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        this.stack;
        // Reset the name to the actual name.
        this.name = name;
    }
}
class ERR_INVALID_THIS extends NodeTypeError {
    constructor(x) {
        super('ERR_INVALID_THIS', `Value of "this" must be of type ${x}`);
    }
}
function determineSpecificType(value) {
    if (value == null) {
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        return '' + value;
    }
    if (typeof value === 'function' && value.name) {
        return `function ${value.name}`;
    }
    if (typeof value === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (value.constructor?.name) {
            return `an instance of ${value.constructor.name}`;
        }
        return inspect(value, { depth: -1 });
    }
    let inspected = inspect(value, { colors: false });
    if (inspected.length > 28)
        inspected = `${inspected.slice(0, 25)}...`;
    return `type ${typeof value} (${inspected})`;
}
class ERR_FALSY_VALUE_REJECTION extends NodeError {
    reason;
    constructor(reason) {
        super('ERR_FALSY_VALUE_REJECTION', 'Promise was rejected with falsy value');
        this.reason = reason;
    }
}
class ERR_METHOD_NOT_IMPLEMENTED extends NodeError {
    constructor(name) {
        if (typeof name === 'symbol') {
            name = name.description;
        }
        super('ERR_METHOD_NOT_IMPLEMENTED', `The ${name} method is not implemented`);
    }
}

// ---- `node-internal:util` seam ---------------------------------------------
// Workerd's C++ builtin, mapped onto host ops. kResourceTypeInspect is the
// symbol the inspect registry stamps onto platform-class prototypes.
const internal = {
  kResourceTypeInspect: Symbol("cells.kResourceTypeInspect"),
  ALL_PROPERTIES,
  ONLY_ENUMERABLE,
  getOwnNonIndexProperties,
  getConstructorName: (v) => __util_constructor_name(v),
  getProxyDetails: (v) => {
    const d = __util_proxy_details(v);
    return d === undefined ? undefined : { target: d[0], handler: d[1] };
  },
  previewEntries: (v) => {
    const r = __util_preview_entries(v);
    return r === undefined
      ? { entries: [], isKeyValue: false }
      : { entries: r[0], isKeyValue: r[1] };
  },
  getPromiseDetails: (v) => {
    const d = __util_promise_details(v);
    return d === undefined ? undefined : { state: d[0], result: d[1] };
  },
  kPending: 0,
  kFulfilled: 1,
  kRejected: 2,
};
const Buffer = globalThis.Buffer;

// Copyright (c) 2017-2022 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in Workerd's LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0
//
// Adapted from Deno, Node.js and DefinitelyTyped:
// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
//
// Adapted from Node.js. Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
/* TODO: the following is adopted code, enabling linting one day */
/* eslint-disable */
// import { ALL_PROPERTIES, ONLY_ENUMERABLE, getOwnNonIndexProperties } from "node-internal:internal_utils";
// Simplified assertions to avoid `Assertions require every name in the call target to be
// declared with an explicit type` TypeScript error
function assert(value, message = 'Assertion failed') {
    if (!value)
        throw new Error(message);
}
assert.fail = function (message = 'Assertion failed') {
    throw new Error(message);
};
function isError(e) {
    // An error could be an instance of Error while not being a native error
    // or could be from a different realm and not be instance of Error but still
    // be a native error.
    return isNativeError(e) || e instanceof Error;
}
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array).prototype;
const typedArrayPrototypeLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length').get;
const typedArrayPrototypeToStringTag = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag).get;
const setPrototypeSize = Object.getOwnPropertyDescriptor(Set.prototype, 'size').get;
const mapPrototypeSize = Object.getOwnPropertyDescriptor(Map.prototype, 'size').get;
let maxStack_ErrorName;
let maxStack_ErrorMessage;
function isStackOverflowError(err) {
    if (maxStack_ErrorMessage === undefined) {
        try {
            function overflowStack() {
                overflowStack();
            }
            overflowStack();
        }
        catch (err) {
            assert(isError(err));
            maxStack_ErrorMessage = err.message;
            maxStack_ErrorName = err.name;
        }
    }
    return (err &&
        err.name === maxStack_ErrorName &&
        err.message === maxStack_ErrorMessage);
}
const customInspectSymbol = Symbol.for('nodejs.util.inspect.custom');
const colorRegExp = /\u001b\[\d\d?m/g;
function removeColors(str) {
    return str.replace(colorRegExp, '');
}
const builtInObjects = new Set(Object.getOwnPropertyNames(globalThis).filter((e) => /^[A-Z][a-zA-Z0-9]+$/.exec(e) !== null));
// https://tc39.es/ecma262/#sec-IsHTMLDDA-internal-slot
const isUndetectableObject = (v) => typeof v === 'undefined' && v !== undefined;
// These options must stay in sync with `getUserOptions`. So if any option will
// be added or removed, `getUserOptions` must also be updated accordingly.
const inspectDefaultOptions = Object.seal({
    showHidden: false,
    depth: 2,
    colors: false,
    customInspect: true,
    showProxy: false,
    maxArrayLength: 100,
    maxStringLength: 10000,
    breakLength: 80,
    compact: 3,
    sorted: false,
    getters: false,
    numericSeparator: false,
});
const kObjectType = 0;
const kArrayType = 1;
const kArrayExtrasType = 2;
const strEscapeSequencesRegExp = /[\x00-\x1f\x27\x5c\x7f-\x9f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const strEscapeSequencesReplacer = /[\x00-\x1f\x27\x5c\x7f-\x9f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
const strEscapeSequencesRegExpSingle = /[\x00-\x1f\x5c\x7f-\x9f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const strEscapeSequencesReplacerSingle = /[\x00-\x1f\x5c\x7f-\x9f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
const keyStrRegExp = /^[a-zA-Z_][a-zA-Z_0-9]*$/;
const numberRegExp = /^(0|[1-9][0-9]*)$/;
const nodeModulesRegExp = /[/\\]node_modules[/\\](.+?)(?=[/\\])/g;
const classRegExp = /^(\s+[^(]*?)\s*{/;
// eslint-disable-next-line node-core/no-unescaped-regexp-dot
const stripCommentsRegExp = /(\/\/.*?\n)|(\/\*(.|\n)*?\*\/)/g;
const kMinLineLength = 16;
// Constants to map the iterator state.
const kWeak = 0;
const kIterator = 1;
const kMapEntries = 2;
// Escaped control characters (plus the single quote and the backslash). Use
// empty strings to fill up unused entries.
const meta = [
    '\\x00',
    '\\x01',
    '\\x02',
    '\\x03',
    '\\x04',
    '\\x05',
    '\\x06',
    '\\x07', // x07
    '\\b',
    '\\t',
    '\\n',
    '\\x0B',
    '\\f',
    '\\r',
    '\\x0E',
    '\\x0F', // x0F
    '\\x10',
    '\\x11',
    '\\x12',
    '\\x13',
    '\\x14',
    '\\x15',
    '\\x16',
    '\\x17', // x17
    '\\x18',
    '\\x19',
    '\\x1A',
    '\\x1B',
    '\\x1C',
    '\\x1D',
    '\\x1E',
    '\\x1F', // x1F
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    "\\'",
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '', // x2F
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '', // x3F
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '', // x4F
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '\\\\',
    '',
    '',
    '', // x5F
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '', // x6F
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '\\x7F', // x7F
    '\\x80',
    '\\x81',
    '\\x82',
    '\\x83',
    '\\x84',
    '\\x85',
    '\\x86',
    '\\x87', // x87
    '\\x88',
    '\\x89',
    '\\x8A',
    '\\x8B',
    '\\x8C',
    '\\x8D',
    '\\x8E',
    '\\x8F', // x8F
    '\\x90',
    '\\x91',
    '\\x92',
    '\\x93',
    '\\x94',
    '\\x95',
    '\\x96',
    '\\x97', // x97
    '\\x98',
    '\\x99',
    '\\x9A',
    '\\x9B',
    '\\x9C',
    '\\x9D',
    '\\x9E',
    '\\x9F', // x9F
];
// Regex used for ansi escape code splitting
// Adopted from https://github.com/chalk/ansi-regex/blob/HEAD/index.js
// License: MIT, authors: @sindresorhus, Qix-, arjunmehta and LitoMore
// Matches all ansi escape code sequences in a string
const ansiPattern = new RegExp('[\\u001B\\u009B][[\\]()#;?]*' +
    '(?:(?:(?:(?:;[-a-zA-Z\\d\\/\\#&.:=?%@~_]+)*' +
    '|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/\\#&.:=?%@~_]*)*)?' +
    '(?:\\u0007|\\u001B\\u005C|\\u009C))' +
    '|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?' +
    '[\\dA-PR-TZcf-nq-uy=><~]))', 'g');
const ansi = new RegExp(ansiPattern, 'g');
function getUserOptions(ctx, isCrossContext) {
    const ret = {
        stylize: ctx.stylize,
        showHidden: ctx.showHidden,
        depth: ctx.depth,
        colors: ctx.colors,
        customInspect: ctx.customInspect,
        showProxy: ctx.showProxy,
        maxArrayLength: ctx.maxArrayLength,
        maxStringLength: ctx.maxStringLength,
        breakLength: ctx.breakLength,
        compact: ctx.compact,
        sorted: ctx.sorted,
        getters: ctx.getters,
        numericSeparator: ctx.numericSeparator,
        ...ctx.userOptions,
    };
    // Typically, the target value will be an instance of `Object`. If that is
    // *not* the case, the object may come from another vm.Context, and we want
    // to avoid passing it objects from this Context in that case, so we remove
    // the prototype from the returned object itself + the `stylize()` function,
    // and remove all other non-primitives, including non-primitive user options.
    if (isCrossContext) {
        Object.setPrototypeOf(ret, null);
        for (const key of Object.keys(ret)) {
            if ((typeof ret[key] === 'object' || typeof ret[key] === 'function') &&
                ret[key] !== null) {
                delete ret[key];
            }
        }
        ret.stylize = Object.setPrototypeOf((value, flavour) => {
            let stylized;
            try {
                stylized = `${ctx.stylize(value, flavour)}`;
            }
            catch {
                // Continue regardless of error.
            }
            if (typeof stylized !== 'string')
                return value;
            // `stylized` is a string as it should be, which is safe to pass along.
            return stylized;
        }, null);
    }
    return ret;
}
function inspect(value, opts) {
    // Default options
    const ctx = {
        budget: {},
        indentationLvl: 0,
        seen: [],
        currentDepth: 0,
        stylize: stylizeNoColor,
        showHidden: inspectDefaultOptions.showHidden,
        depth: inspectDefaultOptions.depth,
        colors: inspectDefaultOptions.colors,
        customInspect: inspectDefaultOptions.customInspect,
        showProxy: inspectDefaultOptions.showProxy,
        maxArrayLength: inspectDefaultOptions.maxArrayLength,
        maxStringLength: inspectDefaultOptions.maxStringLength,
        breakLength: inspectDefaultOptions.breakLength,
        compact: inspectDefaultOptions.compact,
        sorted: inspectDefaultOptions.sorted,
        getters: inspectDefaultOptions.getters,
        numericSeparator: inspectDefaultOptions.numericSeparator,
    };
    if (arguments.length > 1) {
        // Legacy...
        if (arguments.length > 2) {
            if (arguments[2] !== undefined) {
                ctx.depth = arguments[2];
            }
            if (arguments.length > 3 && arguments[3] !== undefined) {
                ctx.colors = arguments[3];
            }
        }
        // Set user-specified options
        if (typeof opts === 'boolean') {
            ctx.showHidden = opts;
        }
        else if (opts) {
            const optKeys = Object.keys(opts);
            for (let i = 0; i < optKeys.length; ++i) {
                const key = optKeys[i];
                // TODO(BridgeAR): Find a solution what to do about stylize. Either make
                // this function public or add a new API with a similar or better
                // functionality.
                if (Object.prototype.hasOwnProperty.call(inspectDefaultOptions, key) ||
                    key === 'stylize') {
                    ctx[key] =
                        opts[key];
                }
                else if (ctx.userOptions === undefined) {
                    // This is required to pass through the actual user input.
                    ctx.userOptions = opts;
                }
            }
        }
    }
    if (ctx.colors)
        ctx.stylize = stylizeWithColor;
    if (ctx.maxArrayLength === null)
        ctx.maxArrayLength = Infinity;
    if (ctx.maxStringLength === null)
        ctx.maxStringLength = Infinity;
    return formatValue(ctx, value, 0);
}
inspect.custom = customInspectSymbol;
Object.defineProperty(inspect, 'defaultOptions', {
    get() {
        return inspectDefaultOptions;
    },
    set(options) {
        validateObject(options, 'options');
        return Object.assign(inspectDefaultOptions, options);
    },
});
// Set Graphics Rendition https://en.wikipedia.org/wiki/ANSI_escape_code#graphics
// Each color consists of an array with the color code as first entry and the
// reset code as second entry.
const defaultFG = 39;
const defaultBG = 49;
const colors = {
    // @ts-ignore
    __proto__: null,
    reset: [0, 0],
    bold: [1, 22],
    dim: [2, 22], // Alias: faint
    italic: [3, 23],
    underline: [4, 24],
    blink: [5, 25],
    // Swap foreground and background colors
    inverse: [7, 27], // Alias: swapcolors, swapColors
    hidden: [8, 28], // Alias: conceal
    strikethrough: [9, 29], // Alias: strikeThrough, crossedout, crossedOut
    doubleunderline: [21, 24], // Alias: doubleUnderline
    black: [30, defaultFG],
    red: [31, defaultFG],
    green: [32, defaultFG],
    yellow: [33, defaultFG],
    blue: [34, defaultFG],
    magenta: [35, defaultFG],
    cyan: [36, defaultFG],
    white: [37, defaultFG],
    bgBlack: [40, defaultBG],
    bgRed: [41, defaultBG],
    bgGreen: [42, defaultBG],
    bgYellow: [43, defaultBG],
    bgBlue: [44, defaultBG],
    bgMagenta: [45, defaultBG],
    bgCyan: [46, defaultBG],
    bgWhite: [47, defaultBG],
    framed: [51, 54],
    overlined: [53, 55],
    gray: [90, defaultFG], // Alias: grey, blackBright
    redBright: [91, defaultFG],
    greenBright: [92, defaultFG],
    yellowBright: [93, defaultFG],
    blueBright: [94, defaultFG],
    magentaBright: [95, defaultFG],
    cyanBright: [96, defaultFG],
    whiteBright: [97, defaultFG],
    bgGray: [100, defaultBG], // Alias: bgGrey, bgBlackBright
    bgRedBright: [101, defaultBG],
    bgGreenBright: [102, defaultBG],
    bgYellowBright: [103, defaultBG],
    bgBlueBright: [104, defaultBG],
    bgMagentaBright: [105, defaultBG],
    bgCyanBright: [106, defaultBG],
    bgWhiteBright: [107, defaultBG],
};
inspect.colors = colors;
function defineColorAlias(target, alias) {
    Object.defineProperty(inspect.colors, alias, {
        get() {
            return this[target];
        },
        set(value) {
            this[target] = value;
        },
        configurable: true,
        enumerable: false,
    });
}
defineColorAlias('gray', 'grey');
defineColorAlias('gray', 'blackBright');
defineColorAlias('bgGray', 'bgGrey');
defineColorAlias('bgGray', 'bgBlackBright');
defineColorAlias('dim', 'faint');
defineColorAlias('strikethrough', 'crossedout');
defineColorAlias('strikethrough', 'strikeThrough');
defineColorAlias('strikethrough', 'crossedOut');
defineColorAlias('hidden', 'conceal');
defineColorAlias('inverse', 'swapColors');
defineColorAlias('inverse', 'swapcolors');
defineColorAlias('doubleunderline', 'doubleUnderline');
// TODO(BridgeAR): Add function style support for more complex styles.
// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
    __proto__: null,
    special: 'cyan',
    number: 'yellow',
    bigint: 'yellow',
    boolean: 'yellow',
    undefined: 'grey',
    null: 'bold',
    string: 'green',
    symbol: 'green',
    date: 'magenta',
    name: undefined,
    // TODO(BridgeAR): Highlight regular expressions properly.
    regexp: 'red',
    module: 'underline',
};
function addQuotes(str, quotes) {
    if (quotes === -1) {
        return `"${str}"`;
    }
    if (quotes === -2) {
        return `\`${str}\``;
    }
    return `'${str}'`;
}
function escapeFn(str) {
    const charCode = str.charCodeAt(0);
    return meta.length > charCode
        ? meta[charCode]
        : `\\u${charCode.toString(16)}`;
}
// Escape control characters, single quotes and the backslash.
// This is similar to JSON stringify escaping.
function strEscape(str) {
    let escapeTest = strEscapeSequencesRegExp;
    let escapeReplace = strEscapeSequencesReplacer;
    let singleQuote = 39;
    // Check for double quotes. If not present, do not escape single quotes and
    // instead wrap the text in double quotes. If double quotes exist, check for
    // backticks. If they do not exist, use those as fallback instead of the
    // double quotes.
    if (str.includes("'")) {
        // This invalidates the charCode and therefore can not be matched for
        // anymore.
        if (!str.includes('"')) {
            singleQuote = -1;
        }
        else if (!str.includes('`') && !str.includes('${')) {
            singleQuote = -2;
        }
        if (singleQuote !== 39) {
            escapeTest = strEscapeSequencesRegExpSingle;
            escapeReplace = strEscapeSequencesReplacerSingle;
        }
    }
    // Some magic numbers that worked out fine while benchmarking with v8 6.0
    if (str.length < 5000 && escapeTest.exec(str) === null)
        return addQuotes(str, singleQuote);
    if (str.length > 100) {
        str = str.replace(escapeReplace, escapeFn);
        return addQuotes(str, singleQuote);
    }
    let result = '';
    let last = 0;
    for (let i = 0; i < str.length; i++) {
        const point = str.charCodeAt(i);
        if (point === singleQuote ||
            point === 92 ||
            point < 32 ||
            (point > 126 && point < 160)) {
            if (last === i) {
                result += meta[point];
            }
            else {
                result += `${str.slice(last, i)}${meta[point]}`;
            }
            last = i + 1;
        }
        else if (point >= 0xd800 && point <= 0xdfff) {
            if (point <= 0xdbff && i + 1 < str.length) {
                const point = str.charCodeAt(i + 1);
                if (point >= 0xdc00 && point <= 0xdfff) {
                    i++;
                    continue;
                }
            }
            result += `${str.slice(last, i)}\\u${point.toString(16)}`;
            last = i + 1;
        }
    }
    if (last !== str.length) {
        result += str.slice(last);
    }
    return addQuotes(result, singleQuote);
}
function stylizeWithColor(str, styleType) {
    const style = inspect.styles[styleType];
    if (style !== undefined) {
        const color = inspect.colors[style];
        if (color !== undefined)
            return `\u001b[${color[0]}m${str}\u001b[${color[1]}m`;
    }
    return str;
}
function stylizeNoColor(str) {
    return str;
}
// Return a new empty array to push in the results of the default formatter.
function getEmptyFormatArray() {
    return [];
}
function isInstanceof(object, proto) {
    try {
        return object instanceof proto;
    }
    catch {
        return false;
    }
}
// Special-case for some builtin prototypes in case their `constructor` property has been tampered.
const wellKnownPrototypes = new Map()
    .set(Array.prototype, { name: 'Array', constructor: Array })
    .set(ArrayBuffer.prototype, { name: 'ArrayBuffer', constructor: ArrayBuffer })
    .set(Function.prototype, { name: 'Function', constructor: Function })
    .set(Map.prototype, { name: 'Map', constructor: Map })
    .set(Set.prototype, { name: 'Set', constructor: Set })
    .set(Object.prototype, { name: 'Object', constructor: Object })
    .set(Object.getPrototypeOf(Uint8Array).prototype, {
    name: 'TypedArray',
    constructor: Object.getPrototypeOf(Uint8Array),
})
    .set(RegExp.prototype, { name: 'RegExp', constructor: RegExp })
    .set(Date.prototype, { name: 'Date', constructor: Date })
    .set(DataView.prototype, { name: 'DataView', constructor: DataView })
    .set(Error.prototype, { name: 'Error', constructor: Error })
    .set(Boolean.prototype, { name: 'Boolean', constructor: Boolean })
    .set(Number.prototype, { name: 'Number', constructor: Number })
    .set(String.prototype, { name: 'String', constructor: String })
    .set(Promise.prototype, { name: 'Promise', constructor: Promise })
    .set(WeakMap.prototype, { name: 'WeakMap', constructor: WeakMap })
    .set(WeakSet.prototype, { name: 'WeakSet', constructor: WeakSet });
function getConstructorName(obj, ctx, recurseTimes, protoProps) {
    let firstProto;
    const tmp = obj;
    while (obj || isUndetectableObject(obj)) {
        const wellKnownPrototypeNameAndConstructor = wellKnownPrototypes.get(obj);
        if (wellKnownPrototypeNameAndConstructor !== undefined) {
            const { name, constructor } = wellKnownPrototypeNameAndConstructor;
            if (Function.prototype[Symbol.hasInstance].call(constructor, tmp)) {
                if (protoProps !== undefined && firstProto !== obj) {
                    addPrototypeProperties(ctx, tmp, firstProto || tmp, recurseTimes, protoProps);
                }
                return name;
            }
        }
        const descriptor = Object.getOwnPropertyDescriptor(obj, 'constructor');
        if (descriptor !== undefined &&
            typeof descriptor.value === 'function' &&
            descriptor.value.name !== '' &&
            isInstanceof(tmp, descriptor.value)) {
            if (protoProps !== undefined &&
                (firstProto !== obj || !builtInObjects.has(descriptor.value.name))) {
                addPrototypeProperties(ctx, tmp, firstProto || tmp, recurseTimes, protoProps);
            }
            return String(descriptor.value.name);
        }
        obj = Object.getPrototypeOf(obj);
        if (firstProto === undefined) {
            firstProto = obj;
        }
    }
    if (firstProto === null) {
        return null;
    }
    const res = internal.getConstructorName(tmp);
    if (ctx.depth !== null && recurseTimes > ctx.depth) {
        return `${res} <Complex prototype>`;
    }
    const protoConstr = getConstructorName(firstProto, ctx, recurseTimes + 1, protoProps);
    if (protoConstr === null) {
        return `${res} <${inspect(firstProto, {
            ...ctx,
            customInspect: false,
            depth: -1,
        })}>`;
    }
    return `${res} <${protoConstr}>`;
}
// This function has the side effect of adding prototype properties to the
// `output` argument (which is an array). This is intended to highlight user
// defined prototype properties.
function addPrototypeProperties(ctx, main, obj, recurseTimes, output) {
    let depth = 0;
    let keys;
    let keySet;
    do {
        if (depth !== 0 || main === obj) {
            obj = Object.getPrototypeOf(obj);
            // Stop as soon as a null prototype is encountered.
            if (obj === null) {
                return;
            }
            // Stop as soon as a built-in object type is detected.
            const descriptor = Object.getOwnPropertyDescriptor(obj, 'constructor');
            if (descriptor !== undefined &&
                typeof descriptor.value === 'function' &&
                builtInObjects.has(descriptor.value.name)) {
                return;
            }
        }
        if (depth === 0) {
            keySet = new Set();
        }
        else {
            keys.forEach((key) => keySet.add(key));
        }
        // Get all own property names and symbols.
        keys = Reflect.ownKeys(obj);
        ctx.seen.push(main);
        for (const key of keys) {
            // Ignore the `constructor` property and keys that exist on layers above.
            if (key === 'constructor' ||
                Object.prototype.hasOwnProperty.call(main, key) ||
                (depth !== 0 && keySet.has(key))) {
                continue;
            }
            const desc = Object.getOwnPropertyDescriptor(obj, key);
            if (typeof desc?.value === 'function') {
                continue;
            }
            const value = formatProperty(ctx, obj, recurseTimes, key, kObjectType, desc, main);
            if (ctx.colors) {
                // Faint!
                output.push(`\u001b[2m${value}\u001b[22m`);
            }
            else {
                output.push(value);
            }
        }
        ctx.seen.pop();
        // Limit the inspection to up to three prototype layers. Using `recurseTimes`
        // is not a good choice here, because it's as if the properties are declared
        // on the current object from the users perspective.
    } while (++depth !== 3);
}
function getPrefix(constructor, tag, fallback, size = '') {
    if (constructor === null) {
        if (tag !== '' && fallback !== tag) {
            return `[${fallback}${size}: null prototype] [${tag}] `;
        }
        return `[${fallback}${size}: null prototype] `;
    }
    if (tag !== '' && constructor !== tag) {
        return `${constructor}${size} [${tag}] `;
    }
    return `${constructor}${size} `;
}
// Look up the keys of the object.
function getKeys(value, showHidden) {
    let keys;
    const symbols = Object.getOwnPropertySymbols(value);
    if (showHidden) {
        keys = Object.getOwnPropertyNames(value);
        if (symbols.length !== 0)
            keys.push(...symbols);
    }
    else {
        // This might throw if `value` is a Module Namespace Object from an
        // unevaluated module, but we don't want to perform the actual type
        // check because it's expensive.
        // TODO(devsnek): track https://github.com/tc39/ecma262/issues/1209
        // and modify this logic as needed.
        try {
            keys = Object.keys(value);
        }
        catch (err) {
            assert(isNativeError(err) &&
                err.name === 'ReferenceError' &&
                isModuleNamespaceObject(value));
            keys = Object.getOwnPropertyNames(value);
        }
        if (symbols.length !== 0) {
            const filter = (key) => Object.prototype.propertyIsEnumerable.call(value, key);
            keys.push(...symbols.filter(filter));
        }
    }
    return keys;
}
function getCtxStyle(value, constructor, tag) {
    let fallback = '';
    if (constructor === null) {
        fallback = internal.getConstructorName(value);
        if (fallback === tag) {
            fallback = 'Object';
        }
    }
    return getPrefix(constructor, tag, fallback);
}
function formatProxy(ctx, proxy, recurseTimes) {
    if (ctx.depth !== null && recurseTimes > ctx.depth) {
        return ctx.stylize('Proxy [Array]', 'special');
    }
    recurseTimes += 1;
    ctx.indentationLvl += 2;
    const res = [
        formatValue(ctx, proxy.target, recurseTimes),
        formatValue(ctx, proxy.handler, recurseTimes),
    ];
    ctx.indentationLvl -= 2;
    return reduceToSingleString(ctx, res, '', ['Proxy [', ']'], kArrayExtrasType, recurseTimes);
}
// Note: using `formatValue` directly requires the indentation level to be
// corrected by setting `ctx.indentationLvL += diff` and then to decrease the
// value afterwards again.
function formatValue(ctx, value, recurseTimes, typedArray) {
    // Primitive types cannot have properties.
    if (typeof value !== 'object' &&
        typeof value !== 'function' &&
        !isUndetectableObject(value)) {
        return formatPrimitive(ctx.stylize, value, ctx);
    }
    if (value === null) {
        return ctx.stylize('null', 'null');
    }
    // Memorize the context for custom inspection on proxies.
    const context = value;
    let proxies = 0;
    // Always check for proxies to prevent side effects and to prevent triggering
    // any proxy handlers.
    let proxy = internal.getProxyDetails(value);
    if (proxy !== undefined) {
        if (proxy === null || proxy.target === null) {
            return ctx.stylize('<Revoked Proxy>', 'special');
        }
        if (ctx.showProxy) {
            return formatProxy(ctx, proxy, recurseTimes);
        }
        do {
            if (proxy === null || proxy.target === null) {
                let formatted = ctx.stylize('<Revoked Proxy>', 'special');
                for (let i = 0; i < proxies; i++) {
                    formatted = `${ctx.stylize('Proxy(', 'special')}${formatted}${ctx.stylize(')', 'special')}`;
                }
                return formatted;
            }
            value = proxy.target;
            proxy = internal.getProxyDetails(value);
            proxies += 1;
        } while (proxy !== undefined);
    }
    // Provide a hook for user-specified inspect functions.
    // Check that value is an object with an inspect function on it.
    if (ctx.customInspect) {
        let maybeCustom = value[customInspectSymbol];
        // WORKERD SPECIFIC PATCH: if `value` is a JSG resource type, use a well-known custom inspect
        const maybeResourceTypeInspect = value[internal.kResourceTypeInspect];
        if (typeof maybeResourceTypeInspect === 'object') {
            maybeCustom = formatJsgResourceType.bind(context, maybeResourceTypeInspect);
        }
        if (typeof maybeCustom === 'function' &&
            // Filter out the util module, its inspect function is special.
            maybeCustom !== inspect &&
            // Also filter out any prototype objects using the circular check.
            !(value.constructor &&
                value.constructor.prototype === value)) {
            // This makes sure the recurseTimes are reported as before while using
            // a counter internally.
            const depth = ctx.depth === null ? null : ctx.depth - recurseTimes;
            const isCrossContext = proxies !== 0 || !(context instanceof Object);
            const ret = Function.prototype.call.call(maybeCustom, context, depth, getUserOptions(ctx, isCrossContext), inspect);
            // If the custom inspection method returned `this`, don't go into
            // infinite recursion.
            if (ret !== context) {
                if (typeof ret !== 'string') {
                    return formatValue(ctx, ret, recurseTimes);
                }
                return ret.replaceAll('\n', `\n${' '.repeat(ctx.indentationLvl)}`);
            }
        }
    }
    // Using an array here is actually better for the average case than using
    // a Set. `seen` will only check for the depth and will never grow too large.
    if (ctx.seen.includes(value)) {
        let index = 1;
        if (ctx.circular === undefined) {
            ctx.circular = new Map();
            ctx.circular.set(value, index);
        }
        else {
            index = ctx.circular.get(value);
            if (index === undefined) {
                index = ctx.circular.size + 1;
                ctx.circular.set(value, index);
            }
        }
        return ctx.stylize(`[Circular *${index}]`, 'special');
    }
    let formatted = formatRaw(ctx, value, recurseTimes, typedArray);
    if (proxies !== 0) {
        for (let i = 0; i < proxies; i++) {
            formatted = `${ctx.stylize('Proxy(', 'special')}${formatted}${ctx.stylize(')', 'special')}`;
        }
    }
    return formatted;
}
function formatRaw(ctx, value, recurseTimes, typedArray) {
    let keys;
    let protoProps;
    if (ctx.showHidden && (ctx.depth === null || recurseTimes <= ctx.depth)) {
        protoProps = [];
    }
    const constructor = getConstructorName(value, ctx, recurseTimes, protoProps);
    // Reset the variable to check for this later on.
    if (protoProps !== undefined && protoProps.length === 0) {
        protoProps = undefined;
    }
    let tag = value[Symbol.toStringTag];
    // Only list the tag in case it's non-enumerable / not an own property.
    // Otherwise we'd print this twice.
    if (typeof tag !== 'string' ||
        (tag !== '' &&
            (ctx.showHidden
                ? Object.prototype.hasOwnProperty
                : Object.prototype.propertyIsEnumerable).call(value, Symbol.toStringTag))) {
        tag = '';
    }
    let base = '';
    let formatter = getEmptyFormatArray;
    let braces;
    let noIterator = true;
    let i = 0;
    const filter = ctx.showHidden
        ? internal.ALL_PROPERTIES
        : internal.ONLY_ENUMERABLE;
    let extrasType = kObjectType;
    // Iterators and the rest are split to reduce checks.
    // We have to check all values in case the constructor is set to null.
    // Otherwise it would not possible to identify all types properly.
    const isEntriesObject = hasEntries(value);
    if (Symbol.iterator in value ||
        constructor === null ||
        isEntriesObject) {
        noIterator = false;
        if (isEntriesObject) {
            // WORKERD SPECIFIC PATCH: if `value` is an object with entries, format them like a map
            const size = value[kEntries].length;
            const prefix = getPrefix(constructor, tag, 'Object', `(${size})`);
            keys = getKeys(value, ctx.showHidden);
            // Remove `kEntries` and `size` from keys
            keys.splice(keys.indexOf(kEntries), 1);
            const sizeIndex = keys.indexOf('size');
            if (sizeIndex !== -1)
                keys.splice(sizeIndex, 1);
            formatter = formatMap.bind(null, value[kEntries][Symbol.iterator]());
            if (size === 0 && keys.length === 0 && protoProps === undefined)
                return `${prefix}{}`;
            braces = [`${prefix}{`, '}'];
        }
        else if (Array.isArray(value)) {
            // Only set the constructor for non ordinary ("Array [...]") arrays.
            const prefix = constructor !== 'Array' || tag !== ''
                ? getPrefix(constructor, tag, 'Array', `(${value.length})`)
                : '';
            keys = internal.getOwnNonIndexProperties(value, filter);
            braces = [`${prefix}[`, ']'];
            if (value.length === 0 && keys.length === 0 && protoProps === undefined)
                return `${braces[0]}]`;
            extrasType = kArrayExtrasType;
            formatter = formatArray;
        }
        else if (isSet(value)) {
            const size = setPrototypeSize.call(value);
            const prefix = getPrefix(constructor, tag, 'Set', `(${size})`);
            keys = getKeys(value, ctx.showHidden);
            formatter =
                constructor !== null
                    ? formatSet.bind(null, value)
                    : formatSet.bind(null, Set.prototype.values.call(value));
            if (size === 0 && keys.length === 0 && protoProps === undefined)
                return `${prefix}{}`;
            braces = [`${prefix}{`, '}'];
        }
        else if (isMap(value)) {
            const size = mapPrototypeSize.call(value);
            const prefix = getPrefix(constructor, tag, 'Map', `(${size})`);
            keys = getKeys(value, ctx.showHidden);
            formatter =
                constructor !== null
                    ? formatMap.bind(null, value)
                    : formatMap.bind(null, Map.prototype.entries.call(value));
            if (size === 0 && keys.length === 0 && protoProps === undefined)
                return `${prefix}{}`;
            braces = [`${prefix}{`, '}'];
        }
        else if (isTypedArray(value)) {
            keys = internal.getOwnNonIndexProperties(value, filter);
            let bound = value;
            let fallback = '';
            if (constructor === null) {
                fallback = typedArrayPrototypeToStringTag.call(value);
                // Reconstruct the array information.
                bound = new globalThis[fallback](value);
            }
            const size = typedArrayPrototypeLength.call(value);
            const prefix = getPrefix(constructor, tag, fallback, `(${size})`);
            braces = [`${prefix}[`, ']'];
            if (value.length === 0 && keys.length === 0 && !ctx.showHidden)
                return `${braces[0]}]`;
            // Special handle the value. The original value is required below. The
            // bound function is required to reconstruct missing information.
            formatter = formatTypedArray.bind(null, bound, size);
            extrasType = kArrayExtrasType;
        }
        else if (isMapIterator(value)) {
            keys = getKeys(value, ctx.showHidden);
            braces = getIteratorBraces('Map', tag);
            // Add braces to the formatter parameters.
            formatter = formatIterator.bind(null, braces);
        }
        else if (isSetIterator(value)) {
            keys = getKeys(value, ctx.showHidden);
            braces = getIteratorBraces('Set', tag);
            // Add braces to the formatter parameters.
            formatter = formatIterator.bind(null, braces);
        }
        else {
            noIterator = true;
        }
    }
    if (noIterator) {
        keys = getKeys(value, ctx.showHidden);
        braces = ['{', '}'];
        if (constructor === 'Object') {
            if (isArgumentsObject(value)) {
                braces[0] = '[Arguments] {';
            }
            else if (tag !== '') {
                braces[0] = `${getPrefix(constructor, tag, 'Object')}{`;
            }
            if (keys.length === 0 && protoProps === undefined) {
                return `${braces[0]}}`;
            }
        }
        else if (typeof value === 'function') {
            base = getFunctionBase(ctx, value, constructor, tag);
            if (keys.length === 0 && protoProps === undefined)
                return ctx.stylize(base, 'special');
        }
        else if (isRegExp(value)) {
            // Make RegExps say that they are RegExps
            base = RegExp.prototype.toString.call(constructor !== null ? value : new RegExp(value));
            const prefix = getPrefix(constructor, tag, 'RegExp');
            if (prefix !== 'RegExp ')
                base = `${prefix}${base}`;
            if ((keys.length === 0 && protoProps === undefined) ||
                (ctx.depth !== null && recurseTimes > ctx.depth)) {
                return ctx.stylize(base, 'regexp');
            }
        }
        else if (isDate(value)) {
            // Make dates with properties first say the date
            base = Number.isNaN(Date.prototype.getTime.call(value))
                ? Date.prototype.toString.call(value)
                : Date.prototype.toISOString.call(value);
            const prefix = getPrefix(constructor, tag, 'Date');
            if (prefix !== 'Date ')
                base = `${prefix}${base}`;
            if (keys.length === 0 && protoProps === undefined) {
                return ctx.stylize(base, 'date');
            }
        }
        else if (isError(value)) {
            base = formatError(value, constructor, tag, ctx, keys);
            if (keys.length === 0 && protoProps === undefined)
                return base;
        }
        else if (isAnyArrayBuffer(value)) {
            // Fast path for ArrayBuffer and SharedArrayBuffer.
            // Can't do the same for DataView because it has a non-primitive
            // .buffer property that we need to recurse for.
            const arrayType = isArrayBuffer(value)
                ? 'ArrayBuffer'
                : 'SharedArrayBuffer';
            const prefix = getPrefix(constructor, tag, arrayType);
            if (typedArray === undefined) {
                formatter = formatArrayBuffer;
            }
            else if (keys.length === 0 && protoProps === undefined) {
                return (prefix +
                    `{ byteLength: ${formatNumber(ctx.stylize, value.byteLength, false)} }`);
            }
            braces[0] = `${prefix}{`;
            keys.unshift('byteLength');
        }
        else if (isDataView(value)) {
            braces[0] = `${getPrefix(constructor, tag, 'DataView')}{`;
            // .buffer goes last, it's not a primitive like the others.
            keys.unshift('byteLength', 'byteOffset', 'buffer');
        }
        else if (isPromise(value)) {
            braces[0] = `${getPrefix(constructor, tag, 'Promise')}{`;
            formatter = formatPromise;
        }
        else if (isWeakSet(value)) {
            braces[0] = `${getPrefix(constructor, tag, 'WeakSet')}{`;
            formatter = ctx.showHidden ? formatWeakSet : formatWeakCollection;
        }
        else if (isWeakMap(value)) {
            braces[0] = `${getPrefix(constructor, tag, 'WeakMap')}{`;
            formatter = ctx.showHidden ? formatWeakMap : formatWeakCollection;
        }
        else if (isModuleNamespaceObject(value)) {
            braces[0] = `${getPrefix(constructor, tag, 'Module')}{`;
            // Special handle keys for namespace objects.
            formatter = formatNamespaceObject.bind(null, keys);
        }
        else if (isBoxedPrimitive(value)) {
            base = getBoxedBase(value, ctx, keys, constructor, tag);
            if (keys.length === 0 && protoProps === undefined) {
                return base;
            }
        }
        else {
            if (keys.length === 0 && protoProps === undefined) {
                return `${getCtxStyle(value, constructor, tag)}{}`;
            }
            braces[0] = `${getCtxStyle(value, constructor, tag)}{`;
        }
    }
    if (ctx.depth !== null && recurseTimes > ctx.depth) {
        let constructorName = getCtxStyle(value, constructor, tag).slice(0, -1);
        if (constructor !== null)
            constructorName = `[${constructorName}]`;
        return ctx.stylize(constructorName, 'special');
    }
    recurseTimes += 1;
    ctx.seen.push(value);
    ctx.currentDepth = recurseTimes;
    let output;
    const indentationLvl = ctx.indentationLvl;
    try {
        output = formatter(ctx, value, recurseTimes);
        for (i = 0; i < keys.length; i++) {
            output.push(formatProperty(ctx, value, recurseTimes, keys[i], extrasType));
        }
        if (protoProps !== undefined) {
            output.push(...protoProps);
        }
    }
    catch (err) {
        const constructorName = getCtxStyle(value, constructor, tag).slice(0, -1);
        return handleMaxCallStackSize(ctx, err, constructorName, indentationLvl);
    }
    if (ctx.circular !== undefined) {
        const index = ctx.circular.get(value);
        if (index !== undefined) {
            const reference = ctx.stylize(`<ref *${index}>`, 'special');
            // Add reference always to the very beginning of the output.
            if (ctx.compact !== true) {
                base = base === '' ? reference : `${reference} ${base}`;
            }
            else {
                braces[0] = `${reference} ${braces[0]}`;
            }
        }
    }
    ctx.seen.pop();
    if (ctx.sorted) {
        const comparator = ctx.sorted === true ? undefined : ctx.sorted;
        if (extrasType === kObjectType) {
            output.sort(comparator);
        }
        else if (keys.length > 1) {
            const sorted = output
                .slice(output.length - keys.length)
                .sort(comparator);
            output.splice(output.length - keys.length, keys.length, ...sorted);
        }
    }
    const res = reduceToSingleString(ctx, output, base, braces, extrasType, recurseTimes, value);
    const budget = ctx.budget[ctx.indentationLvl] || 0;
    const newLength = budget + res.length;
    ctx.budget[ctx.indentationLvl] = newLength;
    // If any indentationLvl exceeds this limit, limit further inspecting to the
    // minimum. Otherwise the recursive algorithm might continue inspecting the
    // object even though the maximum string size (~2 ** 28 on 32 bit systems and
    // ~2 ** 30 on 64 bit systems) exceeded. The actual output is not limited at
    // exactly 2 ** 27 but a bit higher. This depends on the object shape.
    // This limit also makes sure that huge objects don't block the event loop
    // significantly.
    if (newLength > 2 ** 27) {
        ctx.depth = -1;
    }
    return res;
}
function getIteratorBraces(type, tag) {
    if (tag !== `${type} Iterator`) {
        if (tag !== '')
            tag += '] [';
        tag += `${type} Iterator`;
    }
    return [`[${tag}] {`, '}'];
}
function getBoxedBase(value, ctx, keys, constructor, tag) {
    let fn;
    let type;
    if (isNumberObject(value)) {
        fn = Number.prototype.valueOf;
        type = 'Number';
    }
    else if (isStringObject(value)) {
        fn = String.prototype.valueOf;
        type = 'String';
        // For boxed Strings, we have to remove the 0-n indexed entries,
        // since they just noisy up the output and are redundant
        // Make boxed primitive Strings look like such
        keys.splice(0, value.length);
    }
    else if (isBooleanObject(value)) {
        fn = Boolean.prototype.valueOf;
        type = 'Boolean';
    }
    else if (isBigIntObject(value)) {
        fn = BigInt.prototype.valueOf;
        type = 'BigInt';
    }
    else {
        fn = Symbol.prototype.valueOf;
        type = 'Symbol';
    }
    let base = `[${type}`;
    if (type !== constructor) {
        if (constructor === null) {
            base += ' (null prototype)';
        }
        else {
            base += ` (${constructor})`;
        }
    }
    base += `: ${formatPrimitive(stylizeNoColor, fn.call(value), ctx)}]`;
    if (tag !== '' && tag !== constructor) {
        base += ` [${tag}]`;
    }
    if (keys.length !== 0 || ctx.stylize === stylizeNoColor)
        return base;
    return ctx.stylize(base, type.toLowerCase());
}
function getClassBase(value, constructor, tag) {
    const hasName = Object.prototype.hasOwnProperty.call(value, 'name');
    const name = (hasName && value.name) || '(anonymous)';
    let base = `class ${name}`;
    if (constructor !== 'Function' && constructor !== null) {
        base += ` [${constructor}]`;
    }
    if (tag !== '' && constructor !== tag) {
        base += ` [${tag}]`;
    }
    if (constructor !== null) {
        const superName = Object.getPrototypeOf(value).name;
        if (superName) {
            base += ` extends ${superName}`;
        }
    }
    else {
        base += ' extends [null prototype]';
    }
    return `[${base}]`;
}
function getFunctionBase(ctx, value, constructor, tag) {
    const stringified = Function.prototype.toString.call(value);
    if (stringified.startsWith('class') && stringified.endsWith('}')) {
        const slice = stringified.slice(5, -1);
        const bracketIndex = slice.indexOf('{');
        if (bracketIndex !== -1 &&
            (!slice.slice(0, bracketIndex).includes('(') ||
                // Slow path to guarantee that it's indeed a class.
                classRegExp.exec(slice.replace(stripCommentsRegExp, '')) !== null)) {
            return getClassBase(value, constructor, tag);
        }
    }
    let type = 'Function';
    if (isGeneratorFunction(value)) {
        type = `Generator${type}`;
    }
    if (isAsyncFunction(value)) {
        type = `Async${type}`;
    }
    let base = `[${type}`;
    if (constructor === null) {
        base += ' (null prototype)';
    }
    if (value.name === '') {
        base += ' (anonymous)';
    }
    else {
        base += `: ${typeof value.name === 'string' ? value.name : formatValue(ctx, value.name, NaN)}`;
    }
    base += ']';
    if (constructor !== type && constructor !== null) {
        base += ` ${constructor}`;
    }
    if (tag !== '' && constructor !== tag) {
        base += ` [${tag}]`;
    }
    return base;
}
function identicalSequenceRange(a, b) {
    for (let i = 0; i < a.length - 3; i++) {
        // Find the first entry of b that matches the current entry of a.
        const pos = b.indexOf(a[i]);
        if (pos !== -1) {
            const rest = b.length - pos;
            if (rest > 3) {
                let len = 1;
                const maxLen = Math.min(a.length - i, rest);
                // Count the number of consecutive entries.
                while (maxLen > len && a[i + len] === b[pos + len]) {
                    len++;
                }
                if (len > 3) {
                    return { len, offset: i };
                }
            }
        }
    }
    return { len: 0, offset: 0 };
}
function getStackString(ctx, error) {
    if (error.stack) {
        if (typeof error.stack === 'string') {
            return error.stack;
        }
        // This 'NaN' is a very strange Nodeism, but is necessary for correct behaviour!
        return formatValue(ctx, error.stack, NaN);
    }
    return Error.prototype.toString.call(error);
}
function getStackFrames(ctx, err, stack) {
    const frames = stack.split('\n');
    let cause;
    try {
        ({ cause } = err);
    }
    catch {
        // If 'cause' is a getter that throws, ignore it.
    }
    // Remove stack frames identical to frames in cause.
    if (cause != null && isError(cause)) {
        const causeStack = getStackString(ctx, cause);
        const causeStackStart = causeStack.indexOf('\n    at');
        if (causeStackStart !== -1) {
            const causeFrames = causeStack.slice(causeStackStart + 1).split('\n');
            const { len, offset } = identicalSequenceRange(frames, causeFrames);
            if (len > 0) {
                const skipped = len - 2;
                const msg = `    ... ${skipped} lines matching cause stack trace ...`;
                frames.splice(offset + 1, skipped, ctx.stylize(msg, 'undefined'));
            }
        }
    }
    return frames;
}
function improveStack(stack, constructor, name, tag) {
    if (typeof name !== 'string') {
        stack = stack.replace(`${name}`, `${name} [${getPrefix(constructor, tag, 'Error').slice(0, -1)}]`);
    }
    // A stack trace may contain arbitrary data. Only manipulate the output
    // for "regular errors" (errors that "look normal") for now.
    let len = typeof name === 'string' ? name.length : undefined;
    if (constructor === null ||
        (typeof name === 'string' &&
            name.endsWith('Error') &&
            stack.startsWith(name) &&
            (stack.length === len ||
                stack[len] === ':' ||
                stack[len] === '\n'))) {
        let fallback = 'Error';
        if (constructor === null) {
            const start = /^([A-Z][a-z_ A-Z0-9[\]()-]+)(?::|\n {4}at)/.exec(stack) ||
                /^([a-z_A-Z0-9-]*Error)$/.exec(stack);
            fallback = (start && start[1]) || '';
            len = fallback.length;
            fallback = fallback || 'Error';
        }
        const prefix = getPrefix(constructor, tag, fallback).slice(0, -1);
        if (name !== prefix) {
            if (typeof name === 'string' && prefix.includes(name)) {
                if (len === 0) {
                    stack = `${prefix}: ${stack}`;
                }
                else {
                    stack = `${prefix}${stack.slice(len)}`;
                }
            }
            else {
                stack = `${prefix} [${name}]${stack.slice(len)}`;
            }
        }
    }
    return stack;
}
function removeDuplicateErrorKeys(ctx, keys, err, stack) {
    if (!ctx.showHidden && keys.length !== 0) {
        for (const name of ['name', 'message', 'stack']) {
            const index = keys.indexOf(name);
            // Only hide the property in case it's part of the original stack
            if (index !== -1 &&
                (typeof err[name] !== 'string' || stack.includes(err[name]))) {
                keys.splice(index, 1);
            }
        }
    }
}
function markNodeModules(ctx, line) {
    let tempLine = '';
    let nodeModule;
    let pos = 0;
    while ((nodeModule = nodeModulesRegExp.exec(line)) !== null) {
        // '/node_modules/'.length === 14
        tempLine += line.slice(pos, nodeModule.index + 14);
        tempLine += ctx.stylize(nodeModule[1], 'module');
        pos = nodeModule.index + nodeModule[0].length;
    }
    if (pos !== 0) {
        line = tempLine + line.slice(pos);
    }
    return line;
}
function formatError(err, constructor, tag, ctx, keys) {
    const name = err.name != null ? err.name : 'Error';
    let stack = getStackString(ctx, err);
    removeDuplicateErrorKeys(ctx, keys, err, stack);
    if ('cause' in err && (keys.length === 0 || !keys.includes('cause'))) {
        keys.push('cause');
    }
    // Print errors aggregated into AggregateError
    if (Array.isArray(err.errors) &&
        (keys.length === 0 || !keys.includes('errors'))) {
        keys.push('errors');
    }
    stack = improveStack(stack, constructor, name, tag);
    // Ignore the error message if it's contained in the stack.
    let pos = (err.message && stack.indexOf(err.message)) || -1;
    if (pos !== -1)
        pos += err.message.length;
    // Wrap the error in brackets in case it has no stack trace.
    const stackStart = stack.indexOf('\n    at', pos);
    if (stackStart === -1) {
        stack = `[${stack}]`;
    }
    else {
        let newStack = stack.slice(0, stackStart);
        const stackFramePart = stack.slice(stackStart + 1);
        const lines = getStackFrames(ctx, err, stackFramePart);
        if (ctx.colors) {
            // Highlight userland code and node modules.
            for (let line of lines) {
                newStack += '\n';
                line = markNodeModules(ctx, line);
                newStack += line;
            }
        }
        else {
            newStack += `\n${lines.join('\n')}`;
        }
        stack = newStack;
    }
    // The message and the stack have to be indented as well!
    if (ctx.indentationLvl !== 0) {
        const indentation = ' '.repeat(ctx.indentationLvl);
        stack = stack.replaceAll('\n', `\n${indentation}`);
    }
    return stack;
}
function groupArrayElements(ctx, output, value) {
    let totalLength = 0;
    let maxLength = 0;
    let i = 0;
    let outputLength = output.length;
    if (ctx.maxArrayLength !== null && ctx.maxArrayLength < output.length) {
        // This makes sure the "... n more items" part is not taken into account.
        outputLength--;
    }
    const separatorSpace = 2; // Add 1 for the space and 1 for the separator.
    const dataLen = Array.from({ length: outputLength });
    // Calculate the total length of all output entries and the individual max
    // entries length of all output entries. We have to remove colors first,
    // otherwise the length would not be calculated properly.
    for (; i < outputLength; i++) {
        const len = getStringWidth(output[i], ctx.colors);
        dataLen[i] = len;
        totalLength += len + separatorSpace;
        if (maxLength < len)
            maxLength = len;
    }
    // Add two to `maxLength` as we add a single whitespace character plus a comma
    // in-between two entries.
    const actualMax = maxLength + separatorSpace;
    // Check if at least three entries fit next to each other and prevent grouping
    // of arrays that contains entries of very different length (i.e., if a single
    // entry is longer than 1/5 of all other entries combined). Otherwise the
    // space in-between small entries would be enormous.
    if (actualMax * 3 + ctx.indentationLvl < ctx.breakLength &&
        (totalLength / actualMax > 5 || maxLength <= 6)) {
        const approxCharHeights = 2.5;
        const averageBias = Math.sqrt(actualMax - totalLength / output.length);
        const biasedMax = Math.max(actualMax - 3 - averageBias, 1);
        // Dynamically check how many columns seem possible.
        const columns = Math.min(
        // Ideally a square should be drawn. We expect a character to be about 2.5
        // times as high as wide. This is the area formula to calculate a square
        // which contains n rectangles of size `actualMax * approxCharHeights`.
        // Divide that by `actualMax` to receive the correct number of columns.
        // The added bias increases the columns for short entries.
        Math.round(Math.sqrt(approxCharHeights * biasedMax * outputLength) / biasedMax), 
        // Do not exceed the breakLength.
        Math.floor((ctx.breakLength - ctx.indentationLvl) / actualMax), 
        // Limit array grouping for small `compact` modes as the user requested
        // minimal grouping.
        (ctx.compact === false
            ? 0
            : ctx.compact === true
                ? inspectDefaultOptions.compact
                : ctx.compact) * 4, 
        // Limit the columns to a maximum of fifteen.
        15);
        // Return with the original output if no grouping should happen.
        if (columns <= 1) {
            return output;
        }
        const tmp = [];
        const maxLineLength = [];
        for (let i = 0; i < columns; i++) {
            let lineMaxLength = 0;
            for (let j = i; j < output.length; j += columns) {
                if (dataLen[j] > lineMaxLength) {
                    lineMaxLength = dataLen[j];
                }
            }
            lineMaxLength += separatorSpace;
            maxLineLength[i] = lineMaxLength;
        }
        let order = String.prototype.padStart;
        if (value !== undefined) {
            for (let i = 0; i < output.length; i++) {
                if (typeof value[i] !== 'number' && typeof value[i] !== 'bigint') {
                    order = String.prototype.padEnd;
                    break;
                }
            }
        }
        // Each iteration creates a single line of grouped entries.
        for (let i = 0; i < outputLength; i += columns) {
            // The last lines may contain less entries than columns.
            const max = Math.min(i + columns, outputLength);
            let str = '';
            let j = i;
            for (; j < max - 1; j++) {
                // Calculate extra color padding in case it's active. This has to be
                // done line by line as some lines might contain more colors than
                // others.
                const padding = maxLineLength[j - i] + output[j].length - dataLen[j];
                str += order.call(`${output[j]}, `, padding, ' ');
            }
            if (order === String.prototype.padStart) {
                const padding = maxLineLength[j - i] +
                    output[j].length -
                    dataLen[j] -
                    separatorSpace;
                str += output[j].padStart(padding, ' ');
            }
            else {
                str += output[j];
            }
            tmp.push(str);
        }
        if (ctx.maxArrayLength !== null && ctx.maxArrayLength < output.length) {
            tmp.push(output[outputLength]);
        }
        output = tmp;
    }
    return output;
}
function handleMaxCallStackSize(ctx, err, constructorName, indentationLvl) {
    if (isStackOverflowError(err)) {
        ctx.seen.pop();
        ctx.indentationLvl = indentationLvl;
        return ctx.stylize(`[${constructorName}: Inspection interrupted ` +
            'prematurely. Maximum call stack size exceeded.]', 'special');
    }
    /* c8 ignore next */
    assert.fail(err.stack);
}
function addNumericSeparator(integerString) {
    let result = '';
    let i = integerString.length;
    const start = integerString.startsWith('-') ? 1 : 0;
    for (; i >= start + 4; i -= 3) {
        result = `_${integerString.slice(i - 3, i)}${result}`;
    }
    return i === integerString.length
        ? integerString
        : `${integerString.slice(0, i)}${result}`;
}
function addNumericSeparatorEnd(integerString) {
    let result = '';
    let i = 0;
    for (; i < integerString.length - 3; i += 3) {
        result += `${integerString.slice(i, i + 3)}_`;
    }
    return i === 0 ? integerString : `${result}${integerString.slice(i)}`;
}
const remainingText = (remaining) => `... ${remaining} more item${remaining > 1 ? 's' : ''}`;
function formatNumber(fn, number, numericSeparator) {
    if (!numericSeparator) {
        // Format -0 as '-0'. Checking `number === -0` won't distinguish 0 from -0.
        if (Object.is(number, -0)) {
            return fn('-0', 'number');
        }
        return fn(`${number}`, 'number');
    }
    const integer = Math.trunc(number);
    const string = String(integer);
    if (integer === number) {
        if (!Number.isFinite(number) || string.includes('e')) {
            return fn(string, 'number');
        }
        return fn(`${addNumericSeparator(string)}`, 'number');
    }
    if (Number.isNaN(number)) {
        return fn(string, 'number');
    }
    return fn(`${addNumericSeparator(string)}.${addNumericSeparatorEnd(String(number).slice(string.length + 1))}`, 'number');
}
function formatBigInt(fn, bigint, numericSeparator) {
    const string = String(bigint);
    if (!numericSeparator) {
        return fn(`${string}n`, 'bigint');
    }
    return fn(`${addNumericSeparator(string)}n`, 'bigint');
}
function formatPrimitive(fn, value, ctx) {
    if (typeof value === 'string') {
        let trailer = '';
        if (ctx.maxStringLength !== null && value.length > ctx.maxStringLength) {
            const remaining = value.length - ctx.maxStringLength;
            value = value.slice(0, ctx.maxStringLength);
            trailer = `... ${remaining} more character${remaining > 1 ? 's' : ''}`;
        }
        if (ctx.compact !== true &&
            // We do not support handling Unicode characters width with
            // the readline getStringWidth function as there are
            // performance implications.
            value.length > kMinLineLength &&
            value.length > ctx.breakLength - ctx.indentationLvl - 4) {
            return (value
                .split(/(?<=\n)/)
                .map((line) => fn(strEscape(line), 'string'))
                .join(` +\n${' '.repeat(ctx.indentationLvl + 2)}`) + trailer);
        }
        return fn(strEscape(value), 'string') + trailer;
    }
    if (typeof value === 'number')
        return formatNumber(fn, value, ctx.numericSeparator);
    if (typeof value === 'bigint')
        return formatBigInt(fn, value, ctx.numericSeparator);
    if (typeof value === 'boolean')
        return fn(`${value}`, 'boolean');
    if (typeof value === 'undefined')
        return fn('undefined', 'undefined');
    // es6 symbol primitive
    return fn(Symbol.prototype.toString.call(value), 'symbol');
}
function formatNamespaceObject(keys, ctx, value, recurseTimes) {
    const output = new Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
        try {
            output[i] = formatProperty(ctx, value, recurseTimes, keys[i], kObjectType);
        }
        catch (err) {
            assert(isNativeError(err) && err.name === 'ReferenceError');
            // Use the existing functionality. This makes sure the indentation and
            // line breaks are always correct. Otherwise it is very difficult to keep
            // this aligned, even though this is a hacky way of dealing with this.
            const tmp = { [keys[i]]: '' };
            output[i] = formatProperty(ctx, tmp, recurseTimes, keys[i], kObjectType);
            const pos = output[i].lastIndexOf(' ');
            // We have to find the last whitespace and have to replace that value as
            // it will be visualized as a regular string.
            output[i] =
                output[i].slice(0, pos + 1) +
                    ctx.stylize('<uninitialized>', 'special');
        }
    }
    // Reset the keys to an empty array. This prevents duplicated inspection.
    keys.length = 0;
    return output;
}
// The array is sparse and/or has extra keys
function formatSpecialArray(ctx, value, recurseTimes, maxLength, output, i) {
    const keys = Object.keys(value);
    let index = i;
    for (; i < keys.length && output.length < maxLength; i++) {
        const key = keys[i];
        const tmp = +key;
        // Arrays can only have up to 2^32 - 1 entries
        if (tmp > 2 ** 32 - 2) {
            break;
        }
        if (`${index}` !== key) {
            if (numberRegExp.exec(key) === null) {
                break;
            }
            const emptyItems = tmp - index;
            const ending = emptyItems > 1 ? 's' : '';
            const message = `<${emptyItems} empty item${ending}>`;
            output.push(ctx.stylize(message, 'undefined'));
            index = tmp;
            if (output.length === maxLength) {
                break;
            }
        }
        output.push(formatProperty(ctx, value, recurseTimes, key, kArrayType));
        index++;
    }
    const remaining = value.length - index;
    if (output.length !== maxLength) {
        if (remaining > 0) {
            const ending = remaining > 1 ? 's' : '';
            const message = `<${remaining} empty item${ending}>`;
            output.push(ctx.stylize(message, 'undefined'));
        }
    }
    else if (remaining > 0) {
        output.push(remainingText(remaining));
    }
    return output;
}
function formatArrayBuffer(ctx, value) {
    let buffer;
    try {
        buffer = new Uint8Array(value);
    }
    catch {
        return [ctx.stylize('(detached)', 'special')];
    }
    const maxArrayLength = ctx.maxArrayLength;
    let str = hexSlice(buffer, 0, Math.min(maxArrayLength, buffer.length))
        .replace(/(.{2})/g, '$1 ')
        .trim();
    const remaining = buffer.length - maxArrayLength;
    if (remaining > 0)
        str += ` ... ${remaining} more byte${remaining > 1 ? 's' : ''}`;
    return [`${ctx.stylize('[Uint8Contents]', 'special')}: <${str}>`];
}
function formatArray(ctx, value, recurseTimes) {
    const valLen = value.length;
    const len = Math.min(Math.max(0, ctx.maxArrayLength), valLen);
    const remaining = valLen - len;
    const output = [];
    for (let i = 0; i < len; i++) {
        // Special handle sparse arrays.
        if (!Object.prototype.hasOwnProperty.call(value, i)) {
            return formatSpecialArray(ctx, value, recurseTimes, len, output, i);
        }
        output.push(formatProperty(ctx, value, recurseTimes, i, kArrayType));
    }
    if (remaining > 0) {
        output.push(remainingText(remaining));
    }
    return output;
}
function formatTypedArray(value, length, ctx, _ignored, recurseTimes) {
    const maxLength = Math.min(Math.max(0, ctx.maxArrayLength), length);
    const remaining = value.length - maxLength;
    const output = new Array(maxLength);
    const elementFormatter = value.length > 0 && typeof value[0] === 'number'
        ? formatNumber
        : formatBigInt;
    for (let i = 0; i < maxLength; ++i) {
        // @ts-expect-error `value[i]` assumed to be of correct numeric type
        output[i] = elementFormatter(ctx.stylize, value[i], ctx.numericSeparator);
    }
    if (remaining > 0) {
        output[maxLength] = remainingText(remaining);
    }
    if (ctx.showHidden) {
        // .buffer goes last, it's not a primitive like the others.
        // All besides `BYTES_PER_ELEMENT` are actually getters.
        ctx.indentationLvl += 2;
        for (const key of [
            'BYTES_PER_ELEMENT',
            'length',
            'byteLength',
            'byteOffset',
            'buffer',
        ]) {
            const str = formatValue(ctx, value[key], recurseTimes, true);
            output.push(`[${key}]: ${str}`);
        }
        ctx.indentationLvl -= 2;
    }
    return output;
}
function formatSet(value, ctx, _ignored, recurseTimes) {
    const length = isSet(value) ? value.size : NaN;
    const maxLength = Math.min(Math.max(0, ctx.maxArrayLength), length);
    const remaining = length - maxLength;
    const output = [];
    ctx.indentationLvl += 2;
    let i = 0;
    for (const v of value) {
        if (i >= maxLength)
            break;
        output.push(formatValue(ctx, v, recurseTimes));
        i++;
    }
    if (remaining > 0) {
        output.push(remainingText(remaining));
    }
    ctx.indentationLvl -= 2;
    return output;
}
function formatMap(value, ctx, _ignored, recurseTimes) {
    const length = isMap(value) ? value.size : NaN;
    const maxLength = Math.min(Math.max(0, ctx.maxArrayLength), length);
    const remaining = length - maxLength;
    const output = [];
    ctx.indentationLvl += 2;
    let i = 0;
    for (const { 0: k, 1: v } of value) {
        if (i >= maxLength)
            break;
        output.push(`${formatValue(ctx, k, recurseTimes)} => ${formatValue(ctx, v, recurseTimes)}`);
        i++;
    }
    if (remaining > 0) {
        output.push(remainingText(remaining));
    }
    ctx.indentationLvl -= 2;
    return output;
}
function formatSetIterInner(ctx, recurseTimes, entries, state) {
    const maxArrayLength = Math.max(ctx.maxArrayLength, 0);
    const maxLength = Math.min(maxArrayLength, entries.length);
    const output = new Array(maxLength);
    ctx.indentationLvl += 2;
    for (let i = 0; i < maxLength; i++) {
        output[i] = formatValue(ctx, entries[i], recurseTimes);
    }
    ctx.indentationLvl -= 2;
    if (state === kWeak && !ctx.sorted) {
        // Sort all entries to have a halfway reliable output (if more entries than
        // retrieved ones exist, we can not reliably return the same output) if the
        // output is not sorted anyway.
        output.sort();
    }
    const remaining = entries.length - maxLength;
    if (remaining > 0) {
        output.push(remainingText(remaining));
    }
    return output;
}
function formatMapIterInner(ctx, recurseTimes, entries, state) {
    const maxArrayLength = Math.max(ctx.maxArrayLength, 0);
    // Entries exist as [key1, val1, key2, val2, ...]
    const len = entries.length / 2;
    const remaining = len - maxArrayLength;
    const maxLength = Math.min(maxArrayLength, len);
    const output = new Array(maxLength);
    let i = 0;
    ctx.indentationLvl += 2;
    if (state === kWeak) {
        for (; i < maxLength; i++) {
            const pos = i * 2;
            output[i] =
                `${formatValue(ctx, entries[pos], recurseTimes)} => ${formatValue(ctx, entries[pos + 1], recurseTimes)}`;
        }
        // Sort all entries to have a halfway reliable output (if more entries than
        // retrieved ones exist, we can not reliably return the same output) if the
        // output is not sorted anyway.
        if (!ctx.sorted)
            output.sort();
    }
    else {
        for (; i < maxLength; i++) {
            const pos = i * 2;
            const res = [
                formatValue(ctx, entries[pos], recurseTimes),
                formatValue(ctx, entries[pos + 1], recurseTimes),
            ];
            output[i] = reduceToSingleString(ctx, res, '', ['[', ']'], kArrayExtrasType, recurseTimes);
        }
    }
    ctx.indentationLvl -= 2;
    if (remaining > 0) {
        output.push(remainingText(remaining));
    }
    return output;
}
function formatWeakCollection(ctx) {
    return [ctx.stylize('<items unknown>', 'special')];
}
function formatWeakSet(ctx, value, recurseTimes) {
    const { entries } = internal.previewEntries(value);
    return formatSetIterInner(ctx, recurseTimes, entries, kWeak);
}
function formatWeakMap(ctx, value, recurseTimes) {
    const { entries } = internal.previewEntries(value);
    return formatMapIterInner(ctx, recurseTimes, entries, kWeak);
}
function formatIterator(braces, ctx, value, recurseTimes) {
    const { entries, isKeyValue } = internal.previewEntries(value);
    if (isKeyValue) {
        // Mark entry iterators as such.
        braces[0] = braces[0].replace(/ Iterator] {$/, ' Entries] {');
        return formatMapIterInner(ctx, recurseTimes, entries, kMapEntries);
    }
    return formatSetIterInner(ctx, recurseTimes, entries, kIterator);
}
function formatPromise(ctx, value, recurseTimes) {
    let output;
    const { state, result } = internal.getPromiseDetails(value);
    if (state === internal.kPending) {
        output = [ctx.stylize('<pending>', 'special')];
    }
    else {
        ctx.indentationLvl += 2;
        const str = formatValue(ctx, result, recurseTimes);
        ctx.indentationLvl -= 2;
        output = [
            state === internal.kRejected
                ? `${ctx.stylize('<rejected>', 'special')} ${str}`
                : str,
        ];
    }
    return output;
}
function formatProperty(ctx, value, recurseTimes, key, type, desc, original = value) {
    let name, str;
    let extra = ' ';
    desc = desc ||
        Object.getOwnPropertyDescriptor(value, key) || {
        value: value[key],
        enumerable: true,
    };
    if (desc.value !== undefined) {
        const diff = ctx.compact !== true || type !== kObjectType ? 2 : 3;
        ctx.indentationLvl += diff;
        str = formatValue(ctx, desc.value, recurseTimes);
        if (diff === 3 && ctx.breakLength < getStringWidth(str, ctx.colors)) {
            extra = `\n${' '.repeat(ctx.indentationLvl)}`;
        }
        ctx.indentationLvl -= diff;
    }
    else if (desc.get !== undefined) {
        const label = desc.set !== undefined ? 'Getter/Setter' : 'Getter';
        const s = ctx.stylize;
        const sp = 'special';
        if (ctx.getters &&
            (ctx.getters === true ||
                (ctx.getters === 'get' && desc.set === undefined) ||
                (ctx.getters === 'set' && desc.set !== undefined))) {
            try {
                const tmp = desc.get.call(original);
                ctx.indentationLvl += 2;
                if (tmp === null) {
                    str = `${s(`[${label}:`, sp)} ${s('null', 'null')}${s(']', sp)}`;
                }
                else if (typeof tmp === 'object') {
                    str = `${s(`[${label}]`, sp)} ${formatValue(ctx, tmp, recurseTimes)}`;
                }
                else {
                    const primitive = formatPrimitive(s, tmp, ctx);
                    str = `${s(`[${label}:`, sp)} ${primitive}${s(']', sp)}`;
                }
                ctx.indentationLvl -= 2;
            }
            catch (err) {
                const message = `<Inspection threw (${isError(err) ? err.message : String(err)})>`;
                str = `${s(`[${label}:`, sp)} ${message}${s(']', sp)}`;
            }
        }
        else {
            str = ctx.stylize(`[${label}]`, sp);
        }
    }
    else if (desc.set !== undefined) {
        str = ctx.stylize('[Setter]', 'special');
    }
    else {
        str = ctx.stylize('undefined', 'undefined');
    }
    if (type === kArrayType) {
        return str;
    }
    if (typeof key === 'symbol') {
        const tmp = Symbol.prototype.toString
            .call(key)
            .replace(strEscapeSequencesReplacer, escapeFn);
        name = ctx.stylize(tmp, 'symbol');
    }
    else if (keyStrRegExp.exec(key) !== null) {
        name =
            key === '__proto__'
                ? "['__proto__']"
                : ctx.stylize(key, 'name');
    }
    else {
        name = ctx.stylize(strEscape(key), 'string');
    }
    if (desc.enumerable === false) {
        name = `[${name}]`;
    }
    return `${name}:${extra}${str}`;
}
function isBelowBreakLength(ctx, output, start, base) {
    // Each entry is separated by at least a comma. Thus, we start with a total
    // length of at least `output.length`. In addition, some cases have a
    // whitespace in-between each other that is added to the total as well.
    // TODO(BridgeAR): Add Unicode support. Use the readline getStringWidth
    // function. Check the performance overhead and make it an opt-in in case it's
    // significant.
    let totalLength = output.length + start;
    if (totalLength + output.length > ctx.breakLength)
        return false;
    for (let i = 0; i < output.length; i++) {
        if (ctx.colors) {
            totalLength += removeColors(output[i]).length;
        }
        else {
            totalLength += output[i].length;
        }
        if (totalLength > ctx.breakLength) {
            return false;
        }
    }
    // Do not line up properties on the same line if `base` contains line breaks.
    return base === '' || !base.includes('\n');
}
function reduceToSingleString(ctx, output, base, braces, extrasType, recurseTimes, value) {
    if (ctx.compact !== true) {
        if (typeof ctx.compact === 'number' && ctx.compact >= 1) {
            // Memorize the original output length. In case the output is grouped,
            // prevent lining up the entries on a single line.
            const entries = output.length;
            // Group array elements together if the array contains at least six
            // separate entries.
            if (extrasType === kArrayExtrasType && entries > 6) {
                output = groupArrayElements(ctx, output, value);
            }
            // `ctx.currentDepth` is set to the most inner depth of the currently
            // inspected object part while `recurseTimes` is the actual current depth
            // that is inspected.
            //
            // Example:
            //
            // const a = { first: [ 1, 2, 3 ], second: { inner: [ 1, 2, 3 ] } }
            //
            // The deepest depth of `a` is 2 (a.second.inner) and `a.first` has a max
            // depth of 1.
            //
            // Consolidate all entries of the local most inner depth up to
            // `ctx.compact`, as long as the properties are smaller than
            // `ctx.breakLength`.
            if (ctx.currentDepth - recurseTimes < ctx.compact &&
                entries === output.length) {
                // Line up all entries on a single line in case the entries do not
                // exceed `breakLength`. Add 10 as constant to start next to all other
                // factors that may reduce `breakLength`.
                const start = output.length +
                    ctx.indentationLvl +
                    braces[0].length +
                    base.length +
                    10;
                if (isBelowBreakLength(ctx, output, start, base)) {
                    const joinedOutput = output.join(', ');
                    if (!joinedOutput.includes('\n')) {
                        return (`${base ? `${base} ` : ''}${braces[0]} ${joinedOutput}` +
                            ` ${braces[1]}`);
                    }
                }
            }
        }
        // Line up each entry on an individual line.
        const indentation = `\n${' '.repeat(ctx.indentationLvl)}`;
        return (`${base ? `${base} ` : ''}${braces[0]}${indentation}  ` +
            `${output.join(`,${indentation}  `)}${indentation}${braces[1]}`);
    }
    // Line up all entries on a single line in case the entries do not exceed
    // `breakLength`.
    if (isBelowBreakLength(ctx, output, 0, base)) {
        return (`${braces[0]}${base ? ` ${base}` : ''} ${output.join(', ')} ` + braces[1]);
    }
    const indentation = ' '.repeat(ctx.indentationLvl);
    // If the opening "brace" is too large, like in the case of "Set {",
    // we need to force the first item to be on the next line or the
    // items will not line up correctly.
    const ln = base === '' && braces[0].length === 1
        ? ' '
        : `${base ? ` ${base}` : ''}\n${indentation}  `;
    // Line up each entry on an individual line.
    return `${braces[0]}${ln}${output.join(`,\n${indentation}  `)} ${braces[1]}`;
}
function hasBuiltInToString(value) {
    // Prevent triggering proxy traps.
    const proxyTarget = internal.getProxyDetails(value);
    if (proxyTarget !== undefined) {
        if (proxyTarget === null || proxyTarget.target === null) {
            return true;
        }
        return hasBuiltInToString(proxyTarget.target);
    }
    // Count objects that have no `toString` function as built-in.
    if (typeof value?.toString !== 'function') {
        return true;
    }
    // The object has a own `toString` property. Thus it's not not a built-in one.
    if (Object.prototype.hasOwnProperty.call(value, 'toString')) {
        return false;
    }
    // Find the object that has the `toString` property as own property in the
    // prototype chain.
    let pointer = value;
    do {
        pointer = Object.getPrototypeOf(pointer);
    } while (!Object.prototype.hasOwnProperty.call(pointer, 'toString'));
    // Check closer if the object is a built-in.
    const descriptor = Object.getOwnPropertyDescriptor(pointer, 'constructor');
    return (descriptor !== undefined &&
        typeof descriptor.value === 'function' &&
        builtInObjects.has(descriptor.value.name));
}
const firstErrorLine = (error) => (isError(error) ? error.message : String(error)).split('\n', 1)[0];
let CIRCULAR_ERROR_MESSAGE;
function tryStringify(arg) {
    try {
        return JSON.stringify(arg);
    }
    catch (err) {
        // Populate the circular error message lazily
        if (!CIRCULAR_ERROR_MESSAGE) {
            try {
                const a = {};
                a.a = a;
                JSON.stringify(a);
            }
            catch (circularError) {
                CIRCULAR_ERROR_MESSAGE = firstErrorLine(circularError);
            }
        }
        if (typeof err === 'object' &&
            err !== null &&
            'name' in err &&
            err.name === 'TypeError' &&
            firstErrorLine(err) === CIRCULAR_ERROR_MESSAGE) {
            return '[Circular]';
        }
        throw err;
    }
}
function format(...args) {
    return formatWithOptionsInternal(undefined, args);
}
function formatWithOptions(inspectOptions, ...args) {
    validateObject(inspectOptions, 'inspectOptions', kValidateObjectAllowArray);
    return formatWithOptionsInternal(inspectOptions, args);
}
function formatNumberNoColor(number, options) {
    return formatNumber(stylizeNoColor, number, options?.numericSeparator ?? inspectDefaultOptions.numericSeparator);
}
function formatBigIntNoColor(bigint, options) {
    return formatBigInt(stylizeNoColor, bigint, options?.numericSeparator ?? inspectDefaultOptions.numericSeparator);
}
function formatWithOptionsInternal(inspectOptions, args) {
    const first = args[0];
    let a = 0;
    let str = '';
    let join = '';
    if (typeof first === 'string') {
        if (args.length === 1) {
            return first;
        }
        let tempStr;
        let lastPos = 0;
        for (let i = 0; i < first.length - 1; i++) {
            if (first.charCodeAt(i) === 37) {
                // '%'
                const nextChar = first.charCodeAt(++i);
                if (a + 1 !== args.length) {
                    switch (nextChar) {
                        case 115: {
                            // 's'
                            const tempArg = args[++a];
                            if (typeof tempArg === 'number') {
                                tempStr = formatNumberNoColor(tempArg, inspectOptions);
                            }
                            else if (typeof tempArg === 'bigint') {
                                tempStr = formatBigIntNoColor(tempArg, inspectOptions);
                            }
                            else if (typeof tempArg !== 'object' ||
                                tempArg === null ||
                                !hasBuiltInToString(tempArg)) {
                                tempStr = String(tempArg);
                            }
                            else {
                                tempStr = inspect(tempArg, {
                                    ...inspectOptions,
                                    compact: 3,
                                    colors: false,
                                    depth: 0,
                                });
                            }
                            break;
                        }
                        case 106: // 'j'
                            tempStr = tryStringify(args[++a]);
                            break;
                        case 100: {
                            // 'd'
                            const tempNum = args[++a];
                            if (typeof tempNum === 'bigint') {
                                tempStr = formatBigIntNoColor(tempNum, inspectOptions);
                            }
                            else if (typeof tempNum === 'symbol') {
                                tempStr = 'NaN';
                            }
                            else {
                                tempStr = formatNumberNoColor(Number(tempNum), inspectOptions);
                            }
                            break;
                        }
                        case 79: // 'O'
                            tempStr = inspect(args[++a], inspectOptions);
                            break;
                        case 111: // 'o'
                            tempStr = inspect(args[++a], {
                                ...inspectOptions,
                                showHidden: true,
                                showProxy: true,
                                depth: 4,
                            });
                            break;
                        case 105: {
                            // 'i'
                            const tempInteger = args[++a];
                            if (typeof tempInteger === 'bigint') {
                                tempStr = formatBigIntNoColor(tempInteger, inspectOptions);
                            }
                            else if (typeof tempInteger === 'symbol') {
                                tempStr = 'NaN';
                            }
                            else {
                                tempStr = formatNumberNoColor(Number.parseInt(tempInteger), inspectOptions);
                            }
                            break;
                        }
                        case 102: {
                            // 'f'
                            const tempFloat = args[++a];
                            if (typeof tempFloat === 'symbol') {
                                tempStr = 'NaN';
                            }
                            else {
                                tempStr = formatNumberNoColor(Number.parseFloat(tempFloat), inspectOptions);
                            }
                            break;
                        }
                        case 99: // 'c'
                            a += 1;
                            tempStr = '';
                            break;
                        case 37: // '%'
                            str += first.slice(lastPos, i);
                            lastPos = i + 1;
                            continue;
                        default: // Any other character is not a correct placeholder
                            continue;
                    }
                    if (lastPos !== i - 1) {
                        str += first.slice(lastPos, i - 1);
                    }
                    str += tempStr;
                    lastPos = i + 1;
                }
                else if (nextChar === 37) {
                    str += first.slice(lastPos, i);
                    lastPos = i + 1;
                }
            }
        }
        if (lastPos !== 0) {
            a++;
            join = ' ';
            if (lastPos < first.length) {
                str += first.slice(lastPos);
            }
        }
    }
    while (a < args.length) {
        const value = args[a];
        str += join;
        str += typeof value !== 'string' ? inspect(value, inspectOptions) : value;
        join = ' ';
        a++;
    }
    return str;
}
function isZeroWidthCodePoint(code) {
    return (code <= 0x1f || // C0 control codes
        (code >= 0x7f && code <= 0x9f) || // C1 control codes
        (code >= 0x300 && code <= 0x36f) || // Combining Diacritical Marks
        (code >= 0x200b && code <= 0x200f) || // Modifying Invisible Characters
        // Combining Diacritical Marks for Symbols
        (code >= 0x20d0 && code <= 0x20ff) ||
        (code >= 0xfe00 && code <= 0xfe0f) || // Variation Selectors
        (code >= 0xfe20 && code <= 0xfe2f) || // Combining Half Marks
        (code >= 0xe0100 && code <= 0xe01ef)); // Variation Selectors
}
/**
 * Returns the number of columns required to display the given string.
 */
function getStringWidth(str, removeControlChars = true) {
    let width = 0;
    if (removeControlChars)
        str = stripVTControlCharacters(str);
    str = str.normalize('NFC');
    for (const char of str) {
        const code = char.codePointAt(0);
        if (isFullWidthCodePoint(code)) {
            width += 2;
        }
        else if (!isZeroWidthCodePoint(code)) {
            width++;
        }
    }
    return width;
}
/**
 * Returns true if the character represented by a given
 * Unicode code point is full-width. Otherwise returns false.
 */
const isFullWidthCodePoint = (code) => {
    // Code points are partially derived from:
    // https://www.unicode.org/Public/UNIDATA/EastAsianWidth.txt
    return (code >= 0x1100 &&
        (code <= 0x115f || // Hangul Jamo
            code === 0x2329 || // LEFT-POINTING ANGLE BRACKET
            code === 0x232a || // RIGHT-POINTING ANGLE BRACKET
            // CJK Radicals Supplement .. Enclosed CJK Letters and Months
            (code >= 0x2e80 && code <= 0x3247 && code !== 0x303f) ||
            // Enclosed CJK Letters and Months .. CJK Unified Ideographs Extension A
            (code >= 0x3250 && code <= 0x4dbf) ||
            // CJK Unified Ideographs .. Yi Radicals
            (code >= 0x4e00 && code <= 0xa4c6) ||
            // Hangul Jamo Extended-A
            (code >= 0xa960 && code <= 0xa97c) ||
            // Hangul Syllables
            (code >= 0xac00 && code <= 0xd7a3) ||
            // CJK Compatibility Ideographs
            (code >= 0xf900 && code <= 0xfaff) ||
            // Vertical Forms
            (code >= 0xfe10 && code <= 0xfe19) ||
            // CJK Compatibility Forms .. Small Form Variants
            (code >= 0xfe30 && code <= 0xfe6b) ||
            // Halfwidth and Fullwidth Forms
            (code >= 0xff01 && code <= 0xff60) ||
            (code >= 0xffe0 && code <= 0xffe6) ||
            // Kana Supplement
            (code >= 0x1b000 && code <= 0x1b001) ||
            // Enclosed Ideographic Supplement
            (code >= 0x1f200 && code <= 0x1f251) ||
            // Miscellaneous Symbols and Pictographs 0x1f300 - 0x1f5ff
            // Emoticons 0x1f600 - 0x1f64f
            (code >= 0x1f300 && code <= 0x1f64f) ||
            // CJK Unified Ideographs Extension B .. Tertiary Ideographic Plane
            (code >= 0x20000 && code <= 0x3fffd)));
};
/**
 * Remove all VT control characters. Use to estimate displayed string width.
 */
function stripVTControlCharacters(str) {
    validateString(str, 'str');
    return str.replace(ansi, '');
}
function isRpcWildcardType(_value) {
    return false;
}
function isEntry(value) {
    return Array.isArray(value) && value.length === 2;
}
function maybeGetEntries(value) {
    // If this value is an RPC type with a wildcard property handler (e.g. `RpcStub`), don't try to
    // call `entries()` on it. This won't be an `entries()` function, and calling it with `.call()`
    // would dispose the stub.
    if (isRpcWildcardType(value))
        return;
    const entriesFunction = value['entries'];
    if (typeof entriesFunction !== 'function')
        return;
    const entriesIterator = entriesFunction.call(value);
    if (typeof entriesIterator !== 'object' || entriesIterator === null)
        return;
    if (!(Symbol.iterator in entriesIterator))
        return;
    const entries = Array.from(entriesIterator);
    if (!entries.every(isEntry))
        return;
    return entries;
}
const kEntries = Symbol('kEntries');
function hasEntries(value) {
    return typeof value === 'object' && value !== null && kEntries in value;
}
// Registry-driven inspect for Cells platform objects. Workerd generates
// this from its C++ JSG class registrations; Cells' platform classes are
// plain JS with own data properties, so the equivalent registration data —
// an ordered [name, getter] list, optional `hidden` inspect-only entries
// rendered in [brackets], and `entries: true` for map-like rendering — is
// declared per class in the stamps at the end of this file.
function formatJsgResourceType(config, depth, options) {
    const name = config.name;
    if (depth < 0)
        return options.stylize(`[${name}]`, 'special');
    // Build a plain object for inspection. If this value has an `entries()`
    // function, add those entries for map-like `K => V` formatting. Note we
    // can't use a `Map` here as a key may have multiple values (e.g.
    // URLSearchParams).
    const record = {};
    let maybeEntries;
    if (config.entries) {
        maybeEntries = maybeGetEntries(this);
        if (maybeEntries !== undefined)
            record[kEntries] = maybeEntries;
    }
    for (const { 0: key, 1: get } of config.props)
        record[key] = get(this);
    // Additional inspect-only properties are non-enumerable so they appear
    // in square brackets.
    for (const { 0: key, 1: get } of config.hidden || []) {
        Object.defineProperty(record, key, {
            value: get(this),
            enumerable: false,
        });
    }
    // Format the plain object
    const inspected = inspect(record, {
        ...options,
        depth: options.depth == null ? null : depth,
        showHidden: true, // Show non-enumerable inspect-only properties
    });
    if (maybeEntries === undefined) {
        return `${name} ${inspected}`;
    }
    // Inspecting an entries object gives something like
    // `Object(1) { 'a' => '1' }`, whereas we want `Headers(1) { 'a' => '1' }`.
    return `${name}${inspected.replace('Object', '')}`;
}

// Copyright (c) 2017-2022 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in Workerd's LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0
//
// Adapted from Node.js. Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
/* TODO: the following is adopted code, enabling linting one day */
/* eslint-disable */
const kStrict = true;
const kNoIterator = 0;
const kIsArray = 1;
const kIsSet = 2;
const kIsMap = 3;
function areSimilarRegExps(a, b) {
    return (a.source === b.source && a.flags === b.flags && a.lastIndex === b.lastIndex);
}
function areSimilarFloatArrays(a, b) {
    if (a.byteLength !== b.byteLength) {
        return false;
    }
    for (let offset = 0; offset < a.byteLength; offset++) {
        if (a[offset] !== b[offset]) {
            return false;
        }
    }
    return true;
}
function areSimilarTypedArrays(a, b) {
    if (a.byteLength !== b.byteLength) {
        return false;
    }
    return (compare(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), new Uint8Array(b.buffer, b.byteOffset, b.byteLength)) === 0);
}
function areEqualArrayBuffers(buf1, buf2) {
    return (buf1.byteLength === buf2.byteLength &&
        compare(new Uint8Array(buf1), new Uint8Array(buf2)) === 0);
}
function areEqualBoxedPrimitives(val1, val2) {
    if (isNumberObject(val1)) {
        return (isNumberObject(val2) &&
            Object.is(Number.prototype.valueOf.call(val1), Number.prototype.valueOf.call(val2)));
    }
    if (isStringObject(val1)) {
        return (isStringObject(val2) &&
            String.prototype.valueOf.call(val1) ===
                String.prototype.valueOf.call(val2));
    }
    if (isBooleanObject(val1)) {
        return (isBooleanObject(val2) &&
            Boolean.prototype.valueOf.call(val1) ===
                Boolean.prototype.valueOf.call(val2));
    }
    if (isBigIntObject(val1)) {
        return (isBigIntObject(val2) &&
            BigInt.prototype.valueOf.call(val1) ===
                BigInt.prototype.valueOf.call(val2));
    }
    if (isSymbolObject(val1)) {
        return (isSymbolObject(val2) &&
            Symbol.prototype.valueOf.call(val1) ===
                Symbol.prototype.valueOf.call(val2));
    }
    // Should be unreachable, here just as a backup.
    throw new Error(`Unknown boxed type ${val1}`);
}
function innerDeepEqual(val1, val2, strict, memos) {
    // All identical values are equivalent, as determined by ===.
    if (val1 === val2) {
        if (val1 !== 0)
            return true;
        return strict ? Object.is(val1, val2) : true;
    }
    // Check more closely if val1 and val2 are equal.
    if (strict) {
        if (typeof val1 !== 'object') {
            return (typeof val1 === 'number' && Number.isNaN(val1) && Number.isNaN(val2));
        }
        if (typeof val2 !== 'object' || val1 === null || val2 === null) {
            return false;
        }
        if (Object.getPrototypeOf(val1) !== Object.getPrototypeOf(val2)) {
            return false;
        }
    }
    else {
        if (val1 === null || typeof val1 !== 'object') {
            if (val2 === null || typeof val2 !== 'object') {
                // TODO: eslint-disable-next-line eqeqeq
                return val1 == val2 || (Number.isNaN(val1) && Number.isNaN(val2));
            }
            return false;
        }
        if (val2 === null || typeof val2 !== 'object') {
            return false;
        }
    }
    const val1Tag = Object.prototype.toString.call(val1);
    const val2Tag = Object.prototype.toString.call(val2);
    if (val1Tag !== val2Tag) {
        return false;
    }
    if (Array.isArray(val1)) {
        // Check for sparse arrays and general fast path
        if (!Array.isArray(val2) || val1.length !== val2.length) {
            return false;
        }
        const filter = strict ? ONLY_ENUMERABLE : ONLY_ENUMERABLE | SKIP_SYMBOLS;
        const keys1 = getOwnNonIndexProperties(val1, filter);
        const keys2 = getOwnNonIndexProperties(val2, filter);
        if (keys1.length !== keys2.length) {
            return false;
        }
        return keyCheck(val1, val2, strict, memos, kIsArray, keys1);
    }
    else if (val1Tag === '[object Object]') {
        return keyCheck(val1, val2, strict, memos, kNoIterator);
    }
    else if (isDate(val1)) {
        if (!isDate(val2) ||
            Date.prototype.getTime.call(val1) !== Date.prototype.getTime.call(val2)) {
            return false;
        }
    }
    else if (isRegExp(val1)) {
        if (!isRegExp(val2) || !areSimilarRegExps(val1, val2)) {
            return false;
        }
    }
    else if (isNativeError(val1) || val1 instanceof Error) {
        // Do not compare the stack as it might differ even though the error itself
        // is otherwise identical.
        if ((!isNativeError(val2) && !(val2 instanceof Error)) ||
            val1.message !== val2.message ||
            val1.name !== val2.name) {
            return false;
        }
    }
    else if (isArrayBufferView(val1)) {
        if (!isArrayBufferView(val2))
            return false;
        if (val1[Symbol.toStringTag] !== val2[Symbol.toStringTag]) {
            return false;
        }
        if (!strict &&
            (isFloat16Array(val1) || isFloat32Array(val1) || isFloat64Array(val1))) {
            if (!areSimilarFloatArrays(val1, val2)) {
                return false;
            }
        }
        else if (!areSimilarTypedArrays(val1, val2)) {
            return false;
        }
        // Buffer.compare returns true, so val1.length === val2.length. If they both
        // only contain numeric keys, we don't need to exam further than checking
        // the symbols.
        const filter = strict ? ONLY_ENUMERABLE : ONLY_ENUMERABLE | SKIP_SYMBOLS;
        const keys1 = getOwnNonIndexProperties(val1, filter);
        const keys2 = getOwnNonIndexProperties(val2, filter);
        if (keys1.length !== keys2.length) {
            return false;
        }
        return keyCheck(val1, val2, strict, memos, kNoIterator, keys1);
    }
    else if (isSet(val1)) {
        if (!isSet(val2) ||
            val1.size !== val2.size) {
            return false;
        }
        return keyCheck(val1, val2, strict, memos, kIsSet);
    }
    else if (isMap(val1)) {
        if (!isMap(val2) ||
            val1.size !==
                val2.size) {
            return false;
        }
        return keyCheck(val1, val2, strict, memos, kIsMap);
    }
    else if (isAnyArrayBuffer(val1)) {
        if (!isAnyArrayBuffer(val2) ||
            !areEqualArrayBuffers(val1, val2)) {
            return false;
        }
    }
    else if (isBoxedPrimitive(val1)) {
        if (!areEqualBoxedPrimitives(val1, val2)) {
            return false;
        }
    }
    else if (Array.isArray(val2) ||
        isArrayBufferView(val2) ||
        isSet(val2) ||
        isMap(val2) ||
        isDate(val2) ||
        isRegExp(val2) ||
        isAnyArrayBuffer(val2) ||
        isBoxedPrimitive(val2) ||
        isNativeError(val2) ||
        val2 instanceof Error) {
        return false;
    }
    return keyCheck(val1, val2, strict, memos, kNoIterator);
}
function getEnumerables(val, keys) {
    return keys.filter((k) => val.propertyIsEnumerable(k));
}
function keyCheck(val1, val2, strict, memos, iterationType, aKeys) {
    // For all remaining Object pairs, including Array, objects and Maps,
    // equivalence is determined by having:
    // a) The same number of owned enumerable properties
    // b) The same set of keys/indexes (although not necessarily the same order)
    // c) Equivalent values for every corresponding key/index
    // d) For Sets and Maps, equal contents
    // Note: this accounts for both named and indexed properties on Arrays.
    if (arguments.length === 5) {
        aKeys = Object.keys(val1);
        const bKeys = Object.keys(val2);
        // The pair must have the same number of owned properties.
        if (aKeys.length !== bKeys.length) {
            return false;
        }
    }
    // Cheap key test
    let i = 0;
    for (; i < aKeys.length; i++) {
        if (!val2.propertyIsEnumerable(aKeys[i])) {
            return false;
        }
    }
    if (strict && arguments.length === 5) {
        const symbolKeysA = Object.getOwnPropertySymbols(val1);
        if (symbolKeysA.length !== 0) {
            let count = 0;
            for (i = 0; i < symbolKeysA.length; i++) {
                const key = symbolKeysA[i];
                if (val1.propertyIsEnumerable(key)) {
                    if (!val2.propertyIsEnumerable(key)) {
                        return false;
                    }
                    aKeys.push(key);
                    count++;
                }
                else if (val2.propertyIsEnumerable(key)) {
                    return false;
                }
            }
            const symbolKeysB = Object.getOwnPropertySymbols(val2);
            if (symbolKeysA.length !== symbolKeysB.length &&
                getEnumerables(val2, symbolKeysB).length !== count) {
                return false;
            }
        }
        else {
            const symbolKeysB = Object.getOwnPropertySymbols(val2);
            if (symbolKeysB.length !== 0 &&
                getEnumerables(val2, symbolKeysB).length !== 0) {
                return false;
            }
        }
    }
    if (aKeys.length === 0 &&
        (iterationType === kNoIterator ||
            (iterationType === kIsArray && val1.length === 0) ||
            val1.size === 0)) {
        return true;
    }
    // Use memos to handle cycles.
    if (memos === undefined) {
        memos = {
            val1: new Map(),
            val2: new Map(),
            position: 0,
        };
    }
    else {
        // We prevent up to two map.has(x) calls by directly retrieving the value
        // and checking for undefined. The map can only contain numbers, so it is
        // safe to check for undefined only.
        const val2MemoA = memos.val1.get(val1);
        if (val2MemoA !== undefined) {
            const val2MemoB = memos.val2.get(val2);
            if (val2MemoB !== undefined) {
                return val2MemoA === val2MemoB;
            }
        }
        memos.position++;
    }
    memos.val1.set(val1, memos.position);
    memos.val2.set(val2, memos.position);
    const areEq = objEquiv(val1, val2, strict, aKeys, memos, iterationType);
    memos.val1.delete(val1);
    memos.val2.delete(val2);
    return areEq;
}
function setHasEqualElement(set, val1, strict, memo) {
    // Go looking.
    for (const val2 of set) {
        if (innerDeepEqual(val1, val2, strict, memo)) {
            // Remove the matching element to make sure we do not check that again.
            set.delete(val2);
            return true;
        }
    }
    return false;
}
function findLooseMatchingPrimitives(prim) {
    switch (typeof prim) {
        case 'undefined':
            return null;
        case 'object': // Only pass in null as object!
            return undefined;
        case 'symbol':
            return false;
        case 'string':
            return !Number.isNaN(+prim);
        // Loose equal entries exist only if the string is possible to convert to
        // a regular number and not NaN.
        case 'number':
            return !Number.isNaN(prim);
    }
    return true;
}
function setMightHaveLoosePrim(a, b, prim) {
    const altValue = findLooseMatchingPrimitives(prim);
    if (altValue != null)
        return altValue;
    return b.has(altValue) && !a.has(altValue);
}
function mapMightHaveLoosePrim(a, b, prim, item, memo) {
    const altValue = findLooseMatchingPrimitives(prim);
    if (altValue != null) {
        return altValue;
    }
    const curB = b.get(altValue);
    if ((curB === undefined && !b.has(altValue)) ||
        !innerDeepEqual(item, curB, false, memo)) {
        return false;
    }
    return !a.has(altValue) && innerDeepEqual(item, curB, false, memo);
}
function setEquiv(a, b, strict, memo) {
    // This is a lazily initiated Set of entries which have to be compared
    // pairwise.
    let set = null;
    for (const val of a) {
        // Note: Checking for the objects first improves the performance for object
        // heavy sets but it is a minor slow down for primitives. As they are fast
        // to check this improves the worst case scenario instead.
        if (typeof val === 'object' && val !== null) {
            if (set === null) {
                set = new Set();
            }
            // If the specified value doesn't exist in the second set it's a non-null
            // object (or non strict only: a not matching primitive) we'll need to go
            // hunting for something that's deep-(strict-)equal to it. To make this
            // O(n log n) complexity we have to copy these values in a new set first.
            set.add(val);
        }
        else if (!b.has(val)) {
            if (strict)
                return false;
            // Fast path to detect missing string, symbol, undefined and null values.
            if (!setMightHaveLoosePrim(a, b, val)) {
                return false;
            }
            if (set === null) {
                set = new Set();
            }
            set.add(val);
        }
    }
    if (set !== null) {
        for (const val of b) {
            // We have to check if a primitive value is already
            // matching and only if it's not, go hunting for it.
            if (typeof val === 'object' && val !== null) {
                if (!setHasEqualElement(set, val, strict, memo))
                    return false;
            }
            else if (!strict &&
                !a.has(val) &&
                !setHasEqualElement(set, val, strict, memo)) {
                return false;
            }
        }
        return set.size === 0;
    }
    return true;
}
function mapHasEqualEntry(set, map, key1, item1, strict, memo) {
    // To be able to handle cases like:
    //   Map([[{}, 'a'], [{}, 'b']]) vs Map([[{}, 'b'], [{}, 'a']])
    // ... we need to consider *all* matching keys, not just the first we find.
    for (const key2 of set) {
        if (innerDeepEqual(key1, key2, strict, memo) &&
            innerDeepEqual(item1, map.get(key2), strict, memo)) {
            set.delete(key2);
            return true;
        }
    }
    return false;
}
function mapEquiv(a, b, strict, memo) {
    let set = null;
    for (const { 0: key, 1: item1 } of a) {
        if (typeof key === 'object' && key !== null) {
            if (set === null) {
                set = new Set();
            }
            set.add(key);
        }
        else {
            // By directly retrieving the value we prevent another b.has(key) check in
            // almost all possible cases.
            const item2 = b.get(key);
            if ((item2 === undefined && !b.has(key)) ||
                !innerDeepEqual(item1, item2, strict, memo)) {
                if (strict)
                    return false;
                // Fast path to detect missing string, symbol, undefined and null
                // keys.
                if (!mapMightHaveLoosePrim(a, b, key, item1, memo))
                    return false;
                if (set === null) {
                    set = new Set();
                }
                set.add(key);
            }
        }
    }
    if (set !== null) {
        for (const { 0: key, 1: item } of b) {
            if (typeof key === 'object' && key !== null) {
                if (!mapHasEqualEntry(set, a, key, item, strict, memo))
                    return false;
            }
            else if (!strict &&
                (!a.has(key) || !innerDeepEqual(a.get(key), item, false, memo)) &&
                !mapHasEqualEntry(set, a, key, item, false, memo)) {
                return false;
            }
        }
        return set.size === 0;
    }
    return true;
}
function objEquiv(a, b, strict, keys, memos, iterationType) {
    // Sets and maps don't have their entries accessible via normal object
    // properties.
    let i = 0;
    if (iterationType === kIsSet) {
        if (!setEquiv(a, b, strict, memos)) {
            return false;
        }
    }
    else if (iterationType === kIsMap) {
        if (!mapEquiv(a, b, strict, memos)) {
            return false;
        }
    }
    else if (iterationType === kIsArray) {
        for (; i < a.length; i++) {
            if (a.hasOwnProperty(i)) {
                if (!b.hasOwnProperty(i) ||
                    !innerDeepEqual(a[i], b[i], strict, memos)) {
                    return false;
                }
            }
            else if (b.hasOwnProperty(i)) {
                return false;
            }
            else {
                // Array is sparse.
                const keysA = Object.keys(a);
                for (; i < keysA.length; i++) {
                    const key = keysA[i];
                    if (!b.hasOwnProperty(key) ||
                        !innerDeepEqual(a[key], b[key], strict, memos)) {
                        return false;
                    }
                }
                if (keysA.length !== Object.keys(b).length) {
                    return false;
                }
                return true;
            }
        }
    }
    // The pair must have equivalent values for every corresponding key.
    // Possibly expensive deep test:
    for (i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (!innerDeepEqual(a[key], b[key], strict, memos)) {
            return false;
        }
    }
    return true;
}
function isDeepStrictEqual(val1, val2) {
    return innerDeepEqual(val1, val2, kStrict);
}

// Copyright (c) 2017-2023 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in Workerd's LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0
//
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
/* TODO: the following is adopted code, enabling linting one day */
/* eslint-disable */
let debugImpls = {};
function debuglogImpl(set) {
    if (debugImpls[set] === undefined) {
        debugImpls[set] = function debug(...args) {
            const msg = formatWithOptions({}, ...args);
            console.log(format('%s: %s\n', set, msg));
        };
    }
    return debugImpls[set];
}
// In Node.js' implementation, debuglog availability is determined by the NODE_DEBUG
// environment variable. However, we don't have access to the environment variables
// in the same way. Instead, we'll just always enable debuglog on the requested sets.
function debuglog(set, cb) {
    function init() {
        set = set.toUpperCase();
    }
    let debug = (...args) => {
        init();
        debug = debuglogImpl(set);
        if (typeof cb === 'function') {
            cb(debug);
        }
        switch (args.length) {
            case 1:
                return debug(args[0]);
            case 2:
                return debug(args[0], args[1]);
            default:
                return debug(...args);
        }
    };
    const logger = (...args) => {
        switch (args.length) {
            case 1:
                return debug(args[0]);
            case 2:
                return debug(args[0], args[1]);
            default:
                return debug(...args);
        }
    };
    Object.defineProperty(logger, 'enabled', {
        get() {
            return true;
        },
        configurable: true,
        enumerable: true,
    });
    return logger;
}

// ---- MIMEType / MIMEParams -------------------------------------------------
// Native in Workerd (workerd/util/mimetype.h); compact JS equivalent
// implementing WHATWG "parse a MIME type".
const MIME_TOKEN = /^[!#$%&'*+\-.^_`|~A-Za-z0-9]+$/;
const MIME_VALUE = /^[\t\u0020-\u007e\u0080-\u00ff]*$/;
const kParams = Symbol("kParams");
class MIMEParams {
  constructor() {
    this[kParams] = new Map();
  }
  delete(name) {
    this[kParams].delete(`${name}`);
  }
  get(name) {
    const v = this[kParams].get(`${name}`);
    return v === undefined ? null : v;
  }
  has(name) {
    return this[kParams].has(`${name}`);
  }
  set(name, value) {
    name = `${name}`;
    value = `${value}`;
    if (!MIME_TOKEN.test(name)) {
      throw new ERR_INVALID_ARG_VALUE("name", name);
    }
    if (value !== "" && !MIME_VALUE.test(value)) {
      throw new ERR_INVALID_ARG_VALUE("value", value);
    }
    this[kParams].set(name.toLowerCase(), value);
  }
  *entries() {
    yield* this[kParams].entries();
  }
  *keys() {
    yield* this[kParams].keys();
  }
  *values() {
    yield* this[kParams].values();
  }
  [Symbol.iterator]() {
    return this.entries();
  }
  toString() {
    let out = "";
    for (const { 0: key, 1: value } of this[kParams]) {
      if (out.length) out += ";";
      out += key + "=";
      out += value !== "" && MIME_TOKEN.test(value)
        ? value
        : `"${value.replace(/[\\"]/g, "\\$&")}"`;
    }
    return out;
  }
  toJSON() {
    return this.toString();
  }
}
const parseMimeParams = (rest, params) => {
  let i = 0;
  while (i < rest.length) {
    while (rest[i] === ";" || /[\t\n\r ]/.test(rest[i] || "")) i++;
    let name = "";
    while (i < rest.length && rest[i] !== ";" && rest[i] !== "=") {
      name += rest[i++];
    }
    if (rest[i] === ";") continue;
    i++; // '='
    let value = "";
    if (rest[i] === '"') {
      i++;
      while (i < rest.length && rest[i] !== '"') {
        if (rest[i] === "\\" && i + 1 < rest.length) i++;
        value += rest[i++];
      }
      i++;
      while (i < rest.length && rest[i] !== ";") i++;
    } else {
      while (i < rest.length && rest[i] !== ";") value += rest[i++];
      value = value.replace(/[\t\n\r ]+$/, "");
    }
    name = name.toLowerCase();
    if (
      name !== "" && MIME_TOKEN.test(name) && MIME_VALUE.test(value) &&
      !params[kParams].has(name)
    ) {
      params[kParams].set(name, value);
    }
    i++;
  }
};
const kType = Symbol("kType");
const kSubtype = Symbol("kSubtype");
class MIMEType {
  constructor(input) {
    input = `${input}`.replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, "");
    const slash = input.indexOf("/");
    if (slash === -1) {
      throw new ERR_INVALID_ARG_VALUE("input", input);
    }
    const type = input.slice(0, slash);
    const semi = input.indexOf(";", slash);
    const subtype = (semi === -1 ? input.slice(slash + 1)
      : input.slice(slash + 1, semi)).replace(/[\t\n\r ]+$/, "");
    if (!MIME_TOKEN.test(type) || !MIME_TOKEN.test(subtype)) {
      throw new ERR_INVALID_ARG_VALUE("input", input);
    }
    this[kType] = type.toLowerCase();
    this[kSubtype] = subtype.toLowerCase();
    Object.defineProperty(this, "params", {
      value: new MIMEParams(),
      enumerable: true,
    });
    if (semi !== -1) parseMimeParams(input.slice(semi + 1), this.params);
  }
  get type() {
    return this[kType];
  }
  set type(v) {
    v = `${v}`;
    if (!MIME_TOKEN.test(v)) throw new ERR_INVALID_ARG_VALUE("type", v);
    this[kType] = v.toLowerCase();
  }
  get subtype() {
    return this[kSubtype];
  }
  set subtype(v) {
    v = `${v}`;
    if (!MIME_TOKEN.test(v)) throw new ERR_INVALID_ARG_VALUE("subtype", v);
    this[kSubtype] = v.toLowerCase();
  }
  get essence() {
    return `${this[kType]}/${this[kSubtype]}`;
  }
  toString() {
    const params = this.params.toString();
    return params === "" ? this.essence : `${this.essence};${params}`;
  }
  toJSON() {
    return this.toString();
  }
}

// ---- util surface (src/node/util.ts) ---------------------------------------
const debug = debuglog;

// EOL-in-Node-23 predicates. Workerd keeps them behind the (default-off)
// remove_nodejs_compat_eol_v23 flag; Cells matches the default.
const eolIsBoolean = (val) => typeof val === "boolean";
const eolIsBuffer = (val) => globalThis.Buffer.isBuffer(val);
const eolIsDate = (val) => val instanceof Date;
const eolIsError = (val) =>
  typeof Error.isError === "function"
    ? Error.isError(val)
    : isNativeError(val) || val instanceof Error;
const eolIsFunction = (val) => typeof val === "function";
const eolIsNull = (val) => val === null;
const eolIsNullOrUndefined = (val) => val == null;
const eolIsNumber = (val) => typeof val === "number";
const eolIsObject = (val) => val != null && typeof val === "object";
const eolIsPrimitive = (val) =>
  val === null || (typeof val !== "object" && typeof val !== "function");
const eolIsRegExp = (val) => val instanceof RegExp;
const eolIsString = (val) => typeof val === "string";
const eolIsSymbol = (val) => typeof val === "symbol";
const eolIsUndefined = (val) => val === undefined;

function isArray(val) {
  return Array.isArray(val);
}

const kCustomPromisifiedSymbol = Symbol.for("nodejs.util.promisify.custom");
const kCustomPromisifyArgsSymbol = Symbol.for(
  "nodejs.util.promisify.custom.args",
);

function promisify(original) {
  validateFunction(original, "original");
  if (original[kCustomPromisifiedSymbol]) {
    const fn = original[kCustomPromisifiedSymbol];
    validateFunction(fn, "util.promisify.custom");
    return Object.defineProperty(fn, kCustomPromisifiedSymbol, {
      value: fn,
      enumerable: false,
      writable: false,
      configurable: true,
    });
  }
  // Names to create an object from in case the callback receives multiple
  // arguments, e.g. ['bytesRead', 'buffer'] for fs.read.
  const argumentNames = original[kCustomPromisifyArgsSymbol];
  function fn(...args) {
    return new Promise((resolve, reject) => {
      args.push((err, ...values) => {
        if (err) {
          reject(err);
          return;
        }
        if (argumentNames !== undefined && values.length > 1) {
          const obj = {};
          for (let i = 0; i < argumentNames.length; i++) {
            obj[argumentNames[i]] = values[i];
          }
          resolve(obj);
        } else {
          resolve(values[0]);
        }
      });
      Reflect.apply(original, this, args);
    });
  }
  Object.setPrototypeOf(fn, Object.getPrototypeOf(original));
  Object.defineProperty(fn, kCustomPromisifiedSymbol, {
    value: fn,
    enumerable: false,
    writable: false,
    configurable: true,
  });
  const descriptors = Object.getOwnPropertyDescriptors(original);
  const propertiesValues = Object.values(descriptors);
  for (let i = 0; i < propertiesValues.length; i++) {
    // We want to use null-prototype objects to not rely on globally mutable
    // %Object.prototype%.
    Object.setPrototypeOf(propertiesValues[i], null);
  }
  return Object.defineProperties(fn, descriptors);
}
promisify.custom = kCustomPromisifiedSymbol;

function inherits(ctor, superCtor) {
  if (ctor == null) throw new ERR_INVALID_ARG_TYPE("ctor", "Function", ctor);
  if (superCtor === undefined || superCtor === null) {
    throw new ERR_INVALID_ARG_TYPE("superCtor", "Function", superCtor);
  }
  if (superCtor.prototype === undefined) {
    throw new ERR_INVALID_ARG_TYPE(
      "superCtor.prototype",
      "Object",
      superCtor.prototype,
    );
  }
  Object.defineProperty(ctor, "super_", {
    value: superCtor,
    writable: true,
    configurable: true,
  });
  Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
}

function _extend(target, source) {
  // Don't do anything if source isn't an object
  if (source === null || typeof source !== "object") return target;
  const keys = Object.keys(source);
  let i = keys.length;
  while (i--) {
    target[keys[i]] = source[keys[i]];
  }
  return target;
}

function toUSVString(input) {
  return `${input}`.toWellFormed();
}

function pad(n) {
  return `${n}`.padStart(2, "0");
}

// prettier-ignore
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug",
  "Sep", "Oct", "Nov", "Dec"];

function timestamp() {
  const d = new Date();
  const t = [pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds())]
    .join(":");
  return `${d.getDate()} ${months[d.getMonth()]} ${t}`;
}

function log(...args) {
  console.log("%s - %s", timestamp(), format(...args));
}

function parseArgs() {
  // We currently have no plans to implement the util.parseArgs API.
  throw new Error("node:util parseArgs is not implemented");
}

function transferableAbortController() {
  throw new Error("node:util transferableAbortController is not implemented");
}

function transferableAbortSignal() {
  throw new Error("node:util transferableAbortSignal is not implemented");
}

async function aborted(signal, resource) {
  if (signal === undefined) {
    throw new ERR_INVALID_ARG_TYPE("signal", "AbortSignal", signal);
  }
  // Node.js holds the resource weakly and lets the promise hang forever if
  // it is collected; Workerd (and Cells) validate the argument but ignore
  // it so GC is not observable.
  validateAbortSignal(signal, "signal");
  validateObject(resource, "resource", kValidateObjectAllowObjects);
  if (signal.aborted) return Promise.resolve();
  const { promise, resolve } = Promise.withResolvers();
  const opts = { __proto__: null, once: true };
  signal.addEventListener("abort", resolve, opts);
  return promise;
}

function deprecate(fn, _1, _2, _3) {
  // Workerd silently returns the input unmodified; so do we.
  return fn;
}

// Workerd implements getCallSites in C++; this uses V8's CallSite API via
// Error.prepareStackTrace. Both names are exported for the same compat
// reason as upstream (getCallSite shipped first).
function getCallSites(frames = 10, _options) {
  if (typeof frames === "object" && frames !== null) {
    frames = 10;
  }
  const target = {};
  const prepare = Error.prepareStackTrace;
  Error.prepareStackTrace = (_error, sites) => sites;
  Error.captureStackTrace(target, getCallSites);
  const sites = target.stack;
  Error.prepareStackTrace = prepare;
  if (!Array.isArray(sites)) return [];
  return sites.slice(0, frames).map((site) => ({
    functionName: site.getFunctionName() ?? "",
    scriptName: site.getFileName() ?? "",
    scriptId: `${site.getScriptId?.() ?? ""}`,
    lineNumber: site.getLineNumber() ?? 0,
    column: site.getColumnNumber() ?? 0,
    columnNumber: site.getColumnNumber() ?? 0,
  }));
}
const getCallSite = getCallSites;

function getSystemErrorMap() {
  throw new Error("node:util getSystemErrorMap is not implemented");
}

function getSystemErrorName() {
  throw new Error("node:util getSystemErrorName is not implemented");
}

function getSystemErrorMessage() {
  throw new Error("node:util getSystemErrorMessage is not implemented");
}

function escapeStyleCode(code) {
  if (code === undefined) return "";
  return `\u001b[${code}m`;
}

// Workerd's streams_util predicates, reduced to what styleText probes.
const isWhatwgReadableStream = (v) =>
  typeof ReadableStream === "function" && v instanceof ReadableStream;
const isWhatwgWritableStream = (v) =>
  typeof WritableStream === "function" && v instanceof WritableStream;
const isNodeStream = (v) =>
  v !== null && typeof v === "object" &&
  (typeof v.pipe === "function" || typeof v.write === "function");

function isTTYStream(stream) {
  return (
    stream != null &&
    typeof stream === "object" &&
    "isTTY" in stream &&
    !!stream.isTTY &&
    typeof stream.getColorDepth === "function"
  );
}

// We do not implement process.stdout, so a placeholder stands in for it.
const stdoutPlaceholder = Object.create(null);
function styleText(
  format_,
  text,
  { validateStream = true, stream = stdoutPlaceholder } = {},
) {
  validateString(text, "text");
  if (validateStream !== true) {
    validateBoolean(validateStream, "options.validateStream");
  }
  let skipColorize = false;
  if (validateStream) {
    if (
      !isWhatwgReadableStream(stream) &&
      !isWhatwgWritableStream(stream) &&
      !isNodeStream(stream) &&
      stream !== stdoutPlaceholder
    ) {
      throw new ERR_INVALID_ARG_TYPE(
        "stream",
        ["ReadableStream", "WritableStream", "Stream"],
        stream,
      );
    }
    // If the stream is falsy or should not be colorized, skip colorizing.
    skipColorize = isTTYStream(stream) ? stream.getColorDepth() > 2 : true;
  }
  const formatArray = Array.isArray(format_) ? format_ : [format_];
  let left = "";
  let right = "";
  for (const key of formatArray) {
    if (key === "none") continue;
    const formatCodes =
      typeof key === "string" ? inspect.colors[key] : undefined;
    if (formatCodes == null) {
      validateOneOf(key, "format", Object.keys(inspect.colors));
    }
    if (skipColorize) continue;
    left += escapeStyleCode(formatCodes ? formatCodes[0] : undefined);
    right =
      `${escapeStyleCode(formatCodes ? formatCodes[1] : undefined)}${right}`;
  }
  return skipColorize ? text : `${left}${text}${right}`;
}

function _errnoException() {
  throw new ERR_METHOD_NOT_IMPLEMENTED("_errnoException");
}

function _exceptionWithHostPort() {
  throw new ERR_METHOD_NOT_IMPLEMENTED("_exceptionWithHostPort");
}

const types = {
  isCryptoKey,
  isKeyObject,
  isAsyncFunction,
  isGeneratorFunction,
  isGeneratorObject,
  isAnyArrayBuffer,
  isArrayBuffer,
  isArgumentsObject,
  isBoxedPrimitive,
  isDataView,
  isMap,
  isMapIterator,
  isModuleNamespaceObject,
  isNativeError,
  isPromise,
  isProxy,
  isSet,
  isSetIterator,
  isSharedArrayBuffer,
  isWeakMap,
  isWeakSet,
  isRegExp,
  isDate,
  isStringObject,
  isSymbolObject,
  isNumberObject,
  isBooleanObject,
  isBigIntObject,
  isArrayBufferView,
  isBigInt64Array,
  isBigUint64Array,
  isFloat16Array,
  isFloat32Array,
  isFloat64Array,
  isInt8Array,
  isInt16Array,
  isInt32Array,
  isTypedArray,
  isUint8Array,
  isUint8ClampedArray,
  isUint16Array,
  isUint32Array,
  isExternal,
};

// ---- Buffer inspect --------------------------------------------------------
// Workerd's internal_buffer stamps this at Buffer definition time; Cells'
// Buffer lives in the eager prelude, so the (lazy) util module stamps it.
// Port of Buffer.prototype.inspect from internal_buffer.ts.
const INSPECT_MAX_BYTES = 50;
globalThis.Buffer.prototype.inspect = function bufferInspect(
  _recurseTimes,
  ctx,
) {
  let str = "";
  const max = Math.min(this.byteLength, INSPECT_MAX_BYTES);
  str = this.toString("hex", 0, max)
    .replace(/(.{2})/g, "$1 ")
    .trim();
  const remaining = this.byteLength - max;
  if (remaining > 0) {
    str += ` ... ${remaining} more byte${remaining > 1 ? "s" : ""}`;
  }
  // Inspect special properties as well, if possible.
  if (ctx) {
    let extras = false;
    const filter = ctx.showHidden ? ALL_PROPERTIES : ONLY_ENUMERABLE;
    const obj = { __proto__: null };
    getOwnNonIndexProperties(this, filter).forEach((key) => {
      extras = true;
      obj[key] = this[key];
    });
    if (extras) {
      if (this.length !== 0) str += ", ";
      // '[Object: null prototype] {'.length === 26
      str += inspect(obj, {
        ...ctx,
        breakLength: Infinity,
        compact: true,
      }).slice(27, -2);
    }
  }
  return "<Buffer " + str + ">";
};
globalThis.Buffer.prototype[customInspectSymbol] =
  globalThis.Buffer.prototype.inspect;

// ---- platform-object inspect registry --------------------------------------
// See formatJsgResourceType above. Property order in each stamp matches
// Workerd's inspect output exactly.
const stamp = (ctor, config) => {
  if (typeof ctor !== "function") return;
  Object.defineProperty(ctor.prototype, internal.kResourceTypeInspect, {
    value: config,
    configurable: true,
  });
};
stamp(globalThis.URL, {
  name: "URL",
  props: [
    ["origin", (v) => v.origin],
    ["href", (v) => v.href],
    ["protocol", (v) => v.protocol],
    ["username", (v) => v.username],
    ["password", (v) => v.password],
    ["host", (v) => v.host],
    ["hostname", (v) => v.hostname],
    ["port", (v) => v.port],
    ["pathname", (v) => v.pathname],
    ["search", (v) => v.search],
    ["hash", (v) => v.hash],
    ["searchParams", (v) => v.searchParams],
  ],
});
stamp(globalThis.URLSearchParams, {
  name: "URLSearchParams",
  entries: true,
  props: [],
});
stamp(globalThis.Headers, {
  name: "Headers",
  entries: true,
  props: [],
  hidden: [["immutable", (v) => !!v._immutable]],
});
stamp(globalThis.FormData, {
  name: "FormData",
  entries: true,
  props: [],
});
stamp(globalThis.Blob, {
  name: "Blob",
  props: [
    ["size", (v) => v.size],
    ["type", (v) => v.type],
  ],
});
stamp(globalThis.File, {
  name: "File",
  props: [
    ["name", (v) => v.name],
    ["lastModified", (v) => v.lastModified],
    ["size", (v) => v.size],
    ["type", (v) => v.type],
  ],
});
stamp(globalThis.Request, {
  name: "Request",
  props: [
    ["method", (v) => v.method],
    ["url", (v) => v.url],
    ["headers", (v) => v.headers],
    ["redirect", (v) => v.redirect],
    ["fetcher", (v) => v.fetcher ?? null],
    ["signal", (v) => v.signal],
    ["cf", (v) => v.cf],
    ["integrity", () => ""],
    ["keepalive", () => false],
    ["body", (v) => v.body],
    ["bodyUsed", (v) => v.bodyUsed],
  ],
});
stamp(globalThis.Response, {
  name: "Response",
  props: [
    ["status", (v) => v.status],
    ["statusText", (v) => v.statusText],
    ["headers", (v) => v.headers],
    ["ok", (v) => v.ok],
    ["redirected", (v) => v.redirected],
    ["url", (v) => v.url],
    ["webSocket", (v) => v.webSocket ?? null],
    ["cf", (v) => v.cf],
    ["type", (v) => v.type],
    ["body", (v) => v.body],
    ["bodyUsed", (v) => v.bodyUsed],
  ],
});
stamp(globalThis.AbortSignal, {
  name: "AbortSignal",
  props: [
    ["aborted", (v) => v.aborted],
    ["reason", (v) => v.reason],
    ["onabort", (v) => v.onabort ?? null],
  ],
});
stamp(globalThis.ReadableStream, {
  name: "ReadableStream",
  props: [["locked", (v) => v.locked]],
  hidden: [
    ["state", (v) =>
      v._errored ? "errored" : v._closed ? "closed" : "readable"],
    ["supportsBYOB", (v) =>
      v.__celldBodyBytes !== undefined || v.__celldStreamId !== undefined],
    ["length", (v) =>
      v._expectedLength === undefined
        ? undefined
        : BigInt(v._expectedLength)],
  ],
});
stamp(globalThis.WebSocket, {
  name: "WebSocket",
  props: [
    ["readyState", (v) => v.readyState],
    ["url", (v) => v.url ?? null],
    ["protocol", (v) => v.protocol ?? ""],
    ["extensions", (v) => v.extensions ?? ""],
    ["binaryType", (v) => v.binaryType],
  ],
});
stamp(globalThis.MessageEvent, {
  name: "MessageEvent",
  props: [
    ["ports", (v) => v.ports ?? []],
    ["source", (v) => v.source ?? null],
    ["lastEventId", (v) => v.lastEventId],
    ["origin", (v) => (v.origin === "" || v.origin == null ? null : v.origin)],
    ["data", (v) => v.data],
    ["type", (v) => v.type],
    ["eventPhase", (v) => v.eventPhase],
    ["composed", (v) => v.composed],
    ["bubbles", (v) => v.bubbles],
    ["cancelable", (v) => v.cancelable],
    ["defaultPrevented", (v) => v.defaultPrevented],
    ["returnValue", (v) => v.returnValue],
    ["currentTarget", (v) => v.currentTarget ?? null],
    ["target", (v) => v.target ?? null],
    ["srcElement", (v) => v.target ?? null],
    ["timeStamp", (v) => v.timeStamp],
    ["isTrusted", (v) => v.isTrusted],
    ["cancelBubble", (v) => v.cancelBubble],
    ["NONE", () => 0],
    ["CAPTURING_PHASE", () => 1],
    ["AT_TARGET", () => 2],
    ["BUBBLING_PHASE", () => 3],
  ],
});

// ---- module objects --------------------------------------------------------
const utilModule = {
  types,
  callbackify,
  promisify,
  inspect,
  format,
  formatWithOptions,
  stripVTControlCharacters,
  inherits,
  _extend,
  MIMEParams,
  MIMEType,
  toUSVString,
  log,
  aborted,
  debuglog,
  debug,
  deprecate,
  getSystemErrorMap,
  getSystemErrorMessage,
  getSystemErrorName,
  // Node.js originally exposed TextEncoder and TextDecoder off the util
  // module, so Workerd (and Cells) do the same.
  TextEncoder: globalThis.TextEncoder,
  TextDecoder: globalThis.TextDecoder,
  parseArgs,
  parseEnv,
  styleText,
  transferableAbortController,
  transferableAbortSignal,
  getCallSite,
  getCallSites,
  isDeepStrictEqual,
  _errnoException,
  _exceptionWithHostPort,
  isArray,
  // EOL methods
  isBoolean: eolIsBoolean,
  isBuffer: eolIsBuffer,
  isDate: eolIsDate,
  isError: eolIsError,
  isFunction: eolIsFunction,
  isNull: eolIsNull,
  isNullOrUndefined: eolIsNullOrUndefined,
  isNumber: eolIsNumber,
  isObject: eolIsObject,
  isPrimitive: eolIsPrimitive,
  isRegExp: eolIsRegExp,
  isString: eolIsString,
  isSymbol: eolIsSymbol,
  isUndefined: eolIsUndefined,
};
utilModule.default = utilModule;
globalThis.__utilModule = utilModule;
globalThis.__utilTypesModule = { ...types, default: types };
})();
