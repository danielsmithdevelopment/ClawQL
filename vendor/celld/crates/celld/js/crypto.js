// Web Crypto implementation for the embedded runtime.
//
// The common WebCrypto paths use typed-array host ops.
// Cells keeps a second, JSON-shaped op for Workers-compatible algorithms that
// require structured arguments (RSA-OAEP, ECDSA, and Ed25519).
(function () {
  const _randomValues = $$randomValues;
  const _digest = $$digest;
  const _hmacSign = $$hmacSign;
  const _hmacVerify = $$hmacVerify;
  const _aesEncrypt = $$aesEncrypt;
  const _aesDecrypt = $$aesDecrypt;

  // MD5 is not in the Web Crypto spec; Cloudflare accepts it for `digest`
  // and DigestStream, and the host op has always implemented it.
  const _CRC_ALGS = new Set(["CRC32", "CRC32C", "CRC64NVME"]);
  const _DIGEST_ALGS = new Set([
    "SHA-1", "SHA-256", "SHA-384", "SHA-512", "MD5",
  ]);
  const _SECRET_KEY_ALGS = new Set(
    ["HMAC", "AES-GCM", "AES-CBC", "AES-CTR"],
  );
  // Algorithms whose keys are asymmetric, whatever celld can then *do* with
  // them: import validates the key, and an unsupported operation throws
  // later at sign/verify/encrypt rather than here.
  // Cloudflare accepts its own pre-standard curve spellings beside the
  // standard ones.
  const _curveName = (curve) =>
    curve === "NODE-ED25519" ? "Ed25519" : String(curve ?? "");
  // The curves celld carries, under every spelling Web Crypto and Node use.
  const _EC_CURVES = {
    "P-256": "P-256", "prime256v1": "P-256", "secp256r1": "P-256",
    "P-384": "P-384", "secp384r1": "P-384",
    "P-521": "P-521", "secp521r1": "P-521",
  };
  const _ASYM_ALGS = new Set([
    "RSASSA-PKCS1-V1_5", "RSA-OAEP", "RSA-PSS", "ECDSA", "ECDH",
    "ED25519", "X25519",
  ]);

  function _toBuf(data) {
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    throw new TypeError("expected an ArrayBuffer or ArrayBufferView");
  }

  function _algorithmName(algorithm) {
    return String(
      typeof algorithm === "string" ? algorithm : algorithm?.name || "",
    ).toUpperCase();
  }

  function _hashName(hash) {
    return _algorithmName(
      typeof hash === "string" ? hash : hash?.name || "SHA-256",
    );
  }

  function _notSupported(message) {
    return new DOMException(message, "NotSupportedError");
  }

  function _operationError(message) {
    return new DOMException(message, "OperationError");
  }

  class CryptoKey {
    constructor(type, algorithm, extractable, usages, material) {
      Object.defineProperties(this, {
        type: { value: type, enumerable: true },
        algorithm: { value: algorithm, enumerable: true },
        extractable: { value: Boolean(extractable), enumerable: true },
        usages: { value: Object.freeze(Array.from(usages || [])), enumerable: true },
        __celldMaterial: { value: material },
      });
    }
    get [Symbol.toStringTag]() { return "CryptoKey"; }
  }

  function _makeKey(type, algorithm, extractable, usages, material) {
    return new CryptoKey(type, algorithm, extractable, usages, material);
  }

  function _extra(operation, input) {
    return JSON.parse(__crypto_operation(operation, JSON.stringify(input)));
  }

  // The AES modes the host ops accept. `encrypt` and `decrypt` both test
  // against this one set, so neither can grow a mode the other refuses.
  const _AES_MODES = new Set(["AES-GCM", "AES-CBC", "AES-CTR"]);

  // All three modes take the same typed-array host ops: the key, the IV or
  // counter block, and the data are all bytes, so nothing here crosses as
  // JSON. CBC is PKCS#7-padded and CTR is its own inverse, so `encrypting`
  // only matters for CBC.
  //
  // AES-CTR names its IV `counter`, and that block belongs to the caller.
  // The host copies every view it is given, so nothing on this path can
  // increment the caller's block in place.
  //
  // AES-GCM reports a failure by returning nothing, and this turns that into
  // the `OperationError` the Web Crypto specification names. The block modes
  // throw from the host with the cause, so they never reach that branch.
  function _aes(name, algorithm, key, data, encrypting) {
    if (name === "AES-GCM" && _toBuf(algorithm.iv).byteLength === 0) {
      throw new DOMException("AES-GCM IV must not be empty.", "OperationError");
    }
    const run = encrypting ? _aesEncrypt : _aesDecrypt;
    const out = run(
      name,
      key.__celldMaterial.bytes,
      _toBuf(name === "AES-CTR" ? algorithm.counter : algorithm.iv),
      _toBuf(data),
    );
    if (!out) {
      throw _operationError(
        name + (encrypting ? " encrypt failed" : " decrypt failed"),
      );
    }
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  }

  class SubtleCrypto {
    get [Symbol.toStringTag]() { return "SubtleCrypto"; }

    async digest(algorithm, data) {
      const name = _algorithmName(algorithm);
      if (!_DIGEST_ALGS.has(name)) {
        throw _notSupported("unsupported digest algorithm: " + name);
      }
      const out = _digest(name, _toBuf(data));
      return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    }

    async importKey(format, keyData, algorithm, extractable, usages) {
      const name = _algorithmName(algorithm);
      if (format === "raw" && _SECRET_KEY_ALGS.has(name)) {
        const raw = _toBuf(keyData).slice();
        const normalized = name === "HMAC"
          ? { name, hash: { name: _hashName(algorithm?.hash) }, length: raw.byteLength * 8 }
          : { name, length: raw.byteLength * 8 };
        return _makeKey(
          "secret", normalized, extractable, usages, { bytes: raw },
        );
      }
      // Asymmetric keys go through the same host import node:crypto uses, so
      // the CryptoKey carries the key type and details beside its bytes.
      // KeyObject.from() then sees a real asymmetric key rather than opaque
      // material, and the key is validated at import instead of at first use.
      if (
        (format === "spki" || format === "pkcs8" ||
          (format === "jwk" && name !== "RSA-OAEP")) &&
        _ASYM_ALGS.has(name)
      ) {
        const jwk = format === "jwk";
        const visibility =
          format === "pkcs8" || (jwk && keyData?.d !== undefined)
            ? "private"
            : "public";
        const imported = _extra("asym-key-import", {
          key: jwk ? keyData : Array.from(_toBuf(keyData)),
          format: jwk ? "jwk" : "der",
          type: jwk ? null : format,
          visibility,
          passphrase: null,
        });
        return _makeKey(visibility, algorithm, extractable, usages, {
          bytes: Uint8Array.from(imported.der),
          keyType: imported.keyType,
          details: imported.details,
        });
      }
      // An RSA-OAEP JWK keeps its JWK form: `rsa-oaep-decrypt` reads the
      // components directly rather than re-deriving them from DER.
      // A JWK's `alg` names the algorithm it was made for. Anything that is
      // not a string is not an algorithm name, and importing it would leave
      // a key claiming to be something it cannot be. (Web Crypto ignores a
      // *mismatched* alg on EC keys -- cloudflare/workerd#1403 -- so only
      // the type is checked, not the value.)
      if (format === "jwk" && keyData?.alg !== undefined &&
          typeof keyData.alg !== "string") {
        throw new DOMException(
          `Unrecognized or unimplemented algorithm "${String(keyData.alg)}"`,
          "NotSupportedError",
        );
      }
      if (format === "jwk" && name === "RSA-OAEP") {
        return _makeKey(
          keyData?.d ? "private" : "public",
          algorithm,
          extractable,
          usages,
          { jwk: structuredClone(keyData) },
        );
      }
      throw _notSupported("unsupported key import");
    }

    async exportKey(format, key) {
      if (format === "raw" && key?.__celldMaterial?.bytes) {
        if (!key.extractable) {
          throw new DOMException("key is not extractable", "InvalidAccessError");
        }
        const raw = key.__celldMaterial.bytes;
        return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
      }
      if (format === "jwk" && key?.__celldMaterial?.jwk) {
        if (!key.extractable) {
          throw new DOMException("key is not extractable", "InvalidAccessError");
        }
        return structuredClone(key.__celldMaterial.jwk);
      }
      // Asymmetric keys export from their normalized DER: spki and pkcs8 as
      // they are stored, jwk through the host.
      const material = key?.__celldMaterial;
      if (material?.keyType !== undefined) {
        if (!key.extractable) {
          throw new DOMException("key is not extractable", "InvalidAccessError");
        }
        const visibility = key.type;
        if (format === "jwk") {
          return _extra("asym-key-export", {
            der: Array.from(material.bytes),
            visibility,
          }).jwk;
        }
        if ((format === "spki" && visibility === "public") ||
            (format === "pkcs8" && visibility === "private")) {
          const der = material.bytes;
          return der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength);
        }
      }
      throw _notSupported("unsupported key export");
    }

    // Cloudflare's extension, not Web Crypto: a constant-time compare for
    // signatures and MACs, where `===` on a decoded string leaks by timing.
    // Equal lengths are required, so this cannot be used to probe length.
    timingSafeEqual(a, b) {
      const left = _toBuf(a), right = _toBuf(b);
      if (left.byteLength !== right.byteLength) {
        throw new TypeError(
          "Input buffers must have the same byte length");
      }
      return $$timingSafeEqual(left, right);
    }

    // ECDH. `length` may be null or undefined, a recent spec change: the
    // shared secret is the curve's field size, so there is a right answer
    // without being told one. A shorter length truncates, as the spec says.
    async deriveBits(algorithm, baseKey, length) {
      const name = _algorithmName(algorithm);
      if (name !== "ECDH") {
        throw _notSupported("unsupported derive algorithm: " + name);
      }
      const publicKey = algorithm?.public;
      if (!publicKey || publicKey.type !== "public") {
        throw new TypeError("ECDH requires a public key in algorithm.public");
      }
      const shared = Uint8Array.from(_extra("ecdh-derive", {
        private: Array.from(_toBuf(baseKey.__celldMaterial.bytes)),
        public: Array.from(_toBuf(publicKey.__celldMaterial.bytes)),
      }).bytes);
      if (length === null || length === undefined) return shared.buffer;
      const bytes = Number(length) / 8;
      if (!Number.isInteger(bytes) || bytes < 0 || bytes > shared.byteLength) {
        throw _operationError("requested length exceeds the derived secret");
      }
      return shared.slice(0, bytes).buffer;
    }

    async deriveKey(algorithm, baseKey, derived, extractable, usages) {
      const name = _algorithmName(derived);
      const length = derived?.length ??
        (name === "AES-GCM" || name === "AES-CBC" || name === "AES-CTR"
          ? 256
          : null);
      const bits = await this.deriveBits(algorithm, baseKey, length);
      return this.importKey(
        "raw", bits, derived, extractable, usages);
    }

    async generateKey(algorithm, extractable, usages) {
      const name = _algorithmName(algorithm);
      if (_SECRET_KEY_ALGS.has(name)) {
        let byteLength;
        if (name === "HMAC") {
          const defaults = {
            "SHA-1": 20,
            "SHA-256": 32,
            "SHA-384": 48,
            "SHA-512": 64,
          };
          const hash = _hashName(algorithm?.hash);
          byteLength = algorithm?.length
            ? Number(algorithm.length) / 8
            : defaults[hash];
          if (!byteLength) throw _notSupported("unsupported HMAC hash: " + hash);
          const raw = new Uint8Array(byteLength);
          crypto.getRandomValues(raw);
          return _makeKey(
            "secret",
            { name, hash: { name: hash }, length: raw.byteLength * 8 },
            extractable,
            usages,
            { bytes: raw },
          );
        }
        byteLength = Number(algorithm?.length || 256) / 8;
        if (byteLength !== 16 && byteLength !== 32) {
          throw new DOMException("AES-GCM length must be 128 or 256", "OperationError");
        }
        const raw = new Uint8Array(byteLength);
        crypto.getRandomValues(raw);
        return _makeKey(
          "secret",
          { name, length: raw.byteLength * 8 },
          extractable,
          usages,
          { bytes: raw },
        );
      }
      if (name === "RSA-OAEP") {
        const pair = _extra("rsa-generate", {});
        return {
          publicKey: _makeKey(
            "public", algorithm, true,
            usages.filter((usage) => usage === "encrypt"),
            { jwk: pair.publicKey },
          ),
          privateKey: _makeKey(
            "private", algorithm, extractable,
            usages.filter((usage) => usage === "decrypt"),
            { jwk: pair.privateKey },
          ),
        };
      }
      // Asymmetric signing keys. `NODE-ED25519` is Cloudflare's pre-standard
      // spelling of Ed25519 and stays as the reported algorithm name, because
      // the caller matched on what it asked for.
      const ASYM_GENERATE = {
        "RSASSA-PKCS1-V1_5": "rsa",
        "RSA-PSS": "rsa",
        "ED25519": "ed25519",
        "NODE-ED25519": "ed25519",
        "ECDSA": "ec",
        "ECDH": "ec",
      };
      const kind = ASYM_GENERATE[name];
      if (kind !== undefined) {
        const options = { type: kind };
        if (kind === "rsa") {
          // Only 3 and 65537 are legal exponents, and celld generates with
          // 65537. Rejecting the rest here is what stops a pathological
          // exponent reaching the prime search at all.
          const raw = algorithm?.publicExponent;
          const bytes = raw ? Array.from(_toBuf(raw)) : [1, 0, 1];
          let exponent = 0;
          for (const byte of bytes) exponent = exponent * 256 + byte;
          if (exponent !== 3 && exponent !== 65537) {
            throw new DOMException(
              `The "publicExponent" must be either 3 or 65537, but got ` +
                `${exponent}.`,
              "OperationError",
            );
          }
          if (exponent !== 65537) {
            throw _notSupported("publicExponent 3 is not implemented");
          }
          options.modulusLength = Number(algorithm?.modulusLength ?? 2048);
        }
        if (kind === "ec") {
          const curve = _EC_CURVES[_curveName(algorithm?.namedCurve)];
          if (curve === undefined)
            throw _notSupported("unsupported curve: " + algorithm?.namedCurve);
          options.namedCurve = curve;
        }
        const pair = _extra("asym-key-generate", options);
        // The algorithm is echoed back with the exponent as a Uint8Array,
        // which is what `crypto_preserve_public_exponent` fixed upstream --
        // an ArrayBuffer there is the bug that flag names.
        const reported = { ...algorithm, name };
        if (kind === "rsa") {
          reported.publicExponent = Uint8Array.from(
            algorithm?.publicExponent ? _toBuf(algorithm.publicExponent) : [1, 0, 1],
          );
        }
        const half = (der, type, allowed) =>
          _makeKey(type, reported, type === "public" ? true : extractable,
            (usages || []).filter((usage) => allowed.includes(usage)), {
              bytes: Uint8Array.from(der),
              keyType: pair.keyType,
              details: pair.details,
            });
        return {
          publicKey: half(pair.publicDer, "public", ["verify", "encrypt"]),
          privateKey: half(pair.privateDer, "private",
            ["sign", "decrypt", "deriveKey", "deriveBits"]),
        };
      }
      throw _notSupported("unsupported key algorithm: " + name);
    }

    async sign(algorithm, key, data) {
      const name = _algorithmName(algorithm || key?.algorithm);
      const bytes = _toBuf(data);
      if (name === "HMAC") {
        const hash = _hashName(key?.algorithm?.hash);
        const sig = _hmacSign(hash, key.__celldMaterial.bytes, bytes);
        if (!sig) throw _operationError("HMAC sign failed");
        return sig.buffer.slice(sig.byteOffset, sig.byteOffset + sig.byteLength);
      }
      const operation = name === "ED25519"
        ? "ed25519-sign"
        : name === "ECDSA"
          ? "p256-sign"
          : null;
      if (!operation) throw _notSupported("unsupported sign algorithm: " + name);
      const result = _extra(operation, {
        key: Array.from(key?.__celldMaterial?.bytes || []),
        data: Array.from(bytes),
      });
      return Uint8Array.from(result.bytes).buffer;
    }

    async verify(algorithm, key, signature, data) {
      const name = _algorithmName(algorithm || key?.algorithm);
      if (name === "HMAC") {
        return _hmacVerify(
          _hashName(key?.algorithm?.hash),
          key.__celldMaterial.bytes,
          _toBuf(signature),
          _toBuf(data),
        );
      }
      const operation = name === "ECDSA"
        ? "p256-verify"
        : name === "RSASSA-PKCS1-V1_5"
        ? "rsa-pkcs1-verify"
        : null;
      if (!operation) {
        throw _notSupported("unsupported verify algorithm: " + name);
      }
      const material = key?.__celldMaterial?.bytes;
      if (!material) throw _notSupported("verify needs an spki public key");
      return _extra(operation, {
        key: Array.from(material),
        data: Array.from(_toBuf(data)),
        signature: Array.from(_toBuf(signature)),
        // ECDSA carries its hash on the call, RSASSA on the key.
        hash: _hashName(
          name === "ECDSA" ? algorithm?.hash : key?.algorithm?.hash,
        ),
      }).ok;
    }

    async encrypt(algorithm, key, data) {
      const name = _algorithmName(algorithm);
      if (_AES_MODES.has(name)) {
        return _aes(name, algorithm, key, data, true);
      }
      throw _notSupported("unsupported encrypt algorithm: " + name);
    }

    async decrypt(algorithm, key, data) {
      const name = _algorithmName(algorithm);
      if (_AES_MODES.has(name)) {
        return _aes(name, algorithm, key, data, false);
      }
      if (name === "RSA-OAEP") {
        const result = _extra("rsa-oaep-decrypt", {
          jwk: key?.__celldMaterial?.jwk,
          data: Array.from(_toBuf(data)),
        });
        return Uint8Array.from(result.bytes).buffer;
      }
      throw _notSupported("unsupported decrypt algorithm: " + name);
    }
  }

  const subtle = new SubtleCrypto();
  const crypto = {
    getRandomValues(array) {
      // Web IDL brand check, observable via node:crypto's webcrypto alias.
      if (this !== crypto) throw new TypeError("Illegal invocation");
      if (
        !(array instanceof Int8Array) &&
        !(array instanceof Uint8Array) &&
        !(array instanceof Uint8ClampedArray) &&
        !(array instanceof Int16Array) &&
        !(array instanceof Uint16Array) &&
        !(array instanceof Int32Array) &&
        !(array instanceof Uint32Array) &&
        !(array instanceof BigInt64Array) &&
        !(array instanceof BigUint64Array)
      ) {
        throw new DOMException(
          "Argument is not an integer-typed array",
          "TypeMismatchError",
        );
      }
      if (array.byteLength > 65536) {
        throw new DOMException(
          "getRandomValues byteLength must be at most 65536",
          "QuotaExceededError",
        );
      }
      _randomValues(array);
      return array;
    },

    randomUUID() {
      const bytes = new Uint8Array(16);
      _randomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const h = (index) => bytes[index].toString(16).padStart(2, "0");
      return h(0) + h(1) + h(2) + h(3) + "-" +
        h(4) + h(5) + "-" + h(6) + h(7) + "-" +
        h(8) + h(9) + "-" + h(10) + h(11) +
        h(12) + h(13) + h(14) + h(15);
    },

    subtle,
    get [Symbol.toStringTag]() { return "Crypto"; },
  };

  // Cloudflare's DigestStream: a WritableStream that hashes what is written
  // to it and resolves `digest` when the stream closes. Not Web Crypto, and
  // the reason a Worker can hash a body it never has to hold whole -- though
  // celld buffers here, as its Hash already does.
  class DigestStream extends WritableStream {
    constructor(algorithm) {
      const name = _algorithmName(algorithm);
      // DigestStream takes the CRC checksums too; `subtle.digest` does not.
      if (!_DIGEST_ALGS.has(name) && !_CRC_ALGS.has(name)) {
        throw _notSupported("unsupported digest algorithm: " + name);
      }
      const state = { chunks: [], written: 0, resolve: null, reject: null };
      const digest = new Promise((resolve, reject) => {
        state.resolve = resolve;
        state.reject = reject;
      });
      super({
        write(chunk) {
          // A string is written as its UTF-8 bytes, as workerd does; every
          // other chunk must already be binary.
          if (typeof chunk !== "string" && !ArrayBuffer.isView(chunk) &&
              !(chunk instanceof ArrayBuffer)) {
            throw new TypeError(
              "DigestStream is a byte stream but received an object of " +
              "non-ArrayBuffer/ArrayBufferView/string type on its " +
              "writable side.");
          }
          const bytes = typeof chunk === "string"
            ? new TextEncoder().encode(chunk)
            : _toBuf(chunk);
          state.chunks.push(bytes);
          state.written += bytes.byteLength;
        },
        close() {
          const joined = new Uint8Array(state.written);
          let offset = 0;
          for (const chunk of state.chunks) {
            joined.set(chunk, offset);
            offset += chunk.byteLength;
          }
          state.chunks.length = 0;
          const out = _digest(name, joined);
          state.resolve(
            out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength));
        },
        abort(reason) {
          state.chunks.length = 0;
          state.reject(reason);
        },
      });
      // A stream that is written to and never closed is legal, and so is one
      // that is disposed. Neither should raise an unhandled rejection just
      // because nobody awaited `digest`.
      digest.catch(() => {});
      Object.defineProperties(this, {
        digest: { value: digest, enumerable: true },
        bytesWritten: { get: () => BigInt(state.written), enumerable: true },
      });
      this.__celldDigestState = state;
    }
    get [Symbol.toStringTag]() { return "DigestStream"; }
    [Symbol.dispose]() {
      const state = this.__celldDigestState;
      if (state.disposed) return; // disposing twice is a no-op
      state.disposed = true;
      state.chunks.length = 0;
      const error = new Error("The DigestStream was disposed.");
      state.reject(error);
      // Error the stream itself, so a later write() rejects with the same
      // reason rather than succeeding into a digest nobody will resolve.
      this.abort(error).catch(() => {});
    }
  }

  crypto.DigestStream = DigestStream;
  globalThis.DigestStream = DigestStream;
  globalThis.CryptoKey = CryptoKey;
  globalThis.SubtleCrypto = SubtleCrypto;
  globalThis.crypto = crypto;
})();

// Last harness script, so this sees every internal the others declared.
// Runtime plumbing must not show up in `for (const k in globalThis)`: a
// bundle walking the globals should find the Web platform and nothing
// else. Host ops are already non-enumerable; these are the JS-side ones.
for (const n of Object.getOwnPropertyNames(globalThis))
  if (n.startsWith("__") || n.startsWith("$$"))
    // A top-level `function` declaration is non-configurable, so a
    // couple of harness helpers cannot be hidden. Harmless: a walker
    // sees a function either way.
    try { Object.defineProperty(globalThis, n, { enumerable: false }); }
    catch { /* non-configurable */ }
