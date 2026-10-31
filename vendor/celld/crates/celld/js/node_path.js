// node:path for Cells.
//
// Injected lazily into the generated stub module, so an isolate that never
// imports it pays nothing.
//
// Ported from Workerd's `src/node/internal/internal_path.ts` (Apache-2.0),
// itself adapted from Node.js (Joyent/Node contributors, MIT), with types
// stripped. The `node-internal:constants` / `node-internal:validators`
// imports are inlined below; everything else is verbatim.
(() => {
  const CHAR_DOT = 46;
  const CHAR_FORWARD_SLASH = 47;
  const CHAR_BACKWARD_SLASH = 92;
  const CHAR_COLON = 58;
  const CHAR_QUESTION_MARK = 63;
  const CHAR_UPPERCASE_A = 65;
  const CHAR_UPPERCASE_Z = 90;
  const CHAR_LOWERCASE_A = 97;
  const CHAR_LOWERCASE_Z = 122;

  const invalidArgType = (name, expected, value) => {
    const e = new TypeError(
      `The "${name}" argument must be of type ${expected}. ` +
        `Received ${value === null ? "null" : typeof value}`,
    );
    e.code = "ERR_INVALID_ARG_TYPE";
    return e;
  };
  const validateString = (value, name) => {
    if (typeof value !== "string") {
      throw invalidArgType(name, "string", value);
    }
  };
  const validateObject = (value, name) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw invalidArgType(name, "object", value);
    }
  };

  function isPathSeparator(code) {
    return code === CHAR_FORWARD_SLASH || code === CHAR_BACKWARD_SLASH;
  }
  function isPosixPathSeparator(code) {
    return code === CHAR_FORWARD_SLASH;
  }
  function isWindowsDeviceRoot(code) {
    return code >= CHAR_UPPERCASE_A && code <= CHAR_UPPERCASE_Z ||
      code >= CHAR_LOWERCASE_A && code <= CHAR_LOWERCASE_Z;
  }
  function normalizeString(path, allowAboveRoot, separator, isPathSeparator2) {
    let res = "";
    let lastSegmentLength = 0;
    let lastSlash = -1;
    let dots = 0;
    let code = 0;
    for (let i = 0; i <= path.length; ++i) {
      if (i < path.length) code = path.charCodeAt(i);
      else if (isPathSeparator2(code)) break;
      else code = CHAR_FORWARD_SLASH;
      if (isPathSeparator2(code)) {
        if (lastSlash === i - 1 || dots === 1) {
        } else if (dots === 2) {
          if (
            res.length < 2 || lastSegmentLength !== 2 ||
            res.charCodeAt(res.length - 1) !== CHAR_DOT ||
            res.charCodeAt(res.length - 2) !== CHAR_DOT
          ) {
            if (res.length > 2) {
              const lastSlashIndex = res.lastIndexOf(separator);
              if (lastSlashIndex === -1) {
                res = "";
                lastSegmentLength = 0;
              } else {
                res = res.slice(0, lastSlashIndex);
                lastSegmentLength = res.length - 1 - res.lastIndexOf(separator);
              }
              lastSlash = i;
              dots = 0;
              continue;
            } else if (res.length !== 0) {
              res = "";
              lastSegmentLength = 0;
              lastSlash = i;
              dots = 0;
              continue;
            }
          }
          if (allowAboveRoot) {
            res += res.length > 0 ? `${separator}..` : "..";
            lastSegmentLength = 2;
          }
        } else {
          if (res.length > 0) {
            res += `${separator}${path.slice(lastSlash + 1, i)}`;
          } else res = path.slice(lastSlash + 1, i);
          lastSegmentLength = i - lastSlash - 1;
        }
        lastSlash = i;
        dots = 0;
      } else if (code === CHAR_DOT && dots !== -1) {
        ++dots;
      } else {
        dots = -1;
      }
    }
    return res;
  }
  function formatExt(ext) {
    return ext ? `${ext[0] === "." ? "" : "."}${ext}` : "";
  }
  function _format(sep, pathObject) {
    validateObject(pathObject, "pathObject");
    const dir = pathObject.dir || pathObject.root;
    const base = pathObject.base ||
      `${pathObject.name || ""}${formatExt(pathObject.ext)}`;
    if (!dir) {
      return base;
    }
    return dir === pathObject.root ? `${dir}${base}` : `${dir}${sep}${base}`;
  }
  const win32 = {
    resolve(...args) {
      let resolvedDevice = "";
      let resolvedTail = "";
      let resolvedAbsolute = false;
      for (let i = args.length - 1; i >= -1; i--) {
        let path;
        if (i >= 0) {
          path = args[i];
          validateString(path, `paths[${i}]`);
          if (path.length === 0) {
            continue;
          }
        } else if (resolvedDevice.length === 0) {
          path = "/";
        } else {
          path = "/";
          if (
            path.slice(0, 2).toLowerCase() !== resolvedDevice.toLowerCase() &&
            path.charCodeAt(2) === CHAR_BACKWARD_SLASH
          ) {
            path = `${resolvedDevice}\\`;
          }
        }
        const len = path.length;
        let rootEnd = 0;
        let device = "";
        let isAbsolute = false;
        const code = path.charCodeAt(0);
        if (len === 1) {
          if (isPathSeparator(code)) {
            rootEnd = 1;
            isAbsolute = true;
          }
        } else if (isPathSeparator(code)) {
          isAbsolute = true;
          if (isPathSeparator(path.charCodeAt(1))) {
            let j = 2;
            let last = j;
            while (j < len && !isPathSeparator(path.charCodeAt(j))) {
              j++;
            }
            if (j < len && j !== last) {
              const firstPart = path.slice(last, j);
              last = j;
              while (j < len && isPathSeparator(path.charCodeAt(j))) {
                j++;
              }
              if (j < len && j !== last) {
                last = j;
                while (j < len && !isPathSeparator(path.charCodeAt(j))) {
                  j++;
                }
                if (j === len || j !== last) {
                  device = `\\\\${firstPart}\\${path.slice(last, j)}`;
                  rootEnd = j;
                }
              }
            }
          } else {
            rootEnd = 1;
          }
        } else if (
          isWindowsDeviceRoot(code) && path.charCodeAt(1) === CHAR_COLON
        ) {
          device = path.slice(0, 2);
          rootEnd = 2;
          if (len > 2 && isPathSeparator(path.charCodeAt(2))) {
            isAbsolute = true;
            rootEnd = 3;
          }
        }
        if (device.length > 0) {
          if (resolvedDevice.length > 0) {
            if (device.toLowerCase() !== resolvedDevice.toLowerCase()) {
              continue;
            }
          } else {
            resolvedDevice = device;
          }
        }
        if (resolvedAbsolute) {
          if (resolvedDevice.length > 0) break;
        } else {
          resolvedTail = `${path.slice(rootEnd)}\\${resolvedTail}`;
          resolvedAbsolute = isAbsolute;
          if (isAbsolute && resolvedDevice.length > 0) {
            break;
          }
        }
      }
      resolvedTail = normalizeString(
        resolvedTail,
        !resolvedAbsolute,
        "\\",
        isPathSeparator,
      );
      return resolvedAbsolute
        ? `${resolvedDevice}\\${resolvedTail}`
        : `${resolvedDevice}${resolvedTail}` || ".";
    },
    normalize(path) {
      validateString(path, "path");
      const len = path.length;
      if (len === 0) return ".";
      let rootEnd = 0;
      let device;
      let isAbsolute = false;
      const code = path.charCodeAt(0);
      if (len === 1) {
        return isPosixPathSeparator(code) ? "\\" : path;
      }
      if (isPathSeparator(code)) {
        isAbsolute = true;
        if (isPathSeparator(path.charCodeAt(1))) {
          let j = 2;
          let last = j;
          while (j < len && !isPathSeparator(path.charCodeAt(j))) {
            j++;
          }
          if (j < len && j !== last) {
            const firstPart = path.slice(last, j);
            last = j;
            while (j < len && isPathSeparator(path.charCodeAt(j))) {
              j++;
            }
            if (j < len && j !== last) {
              last = j;
              while (j < len && !isPathSeparator(path.charCodeAt(j))) {
                j++;
              }
              if (j === len) {
                return `\\\\${firstPart}\\${path.slice(last)}\\`;
              }
              if (j !== last) {
                device = `\\\\${firstPart}\\${path.slice(last, j)}`;
                rootEnd = j;
              }
            }
          }
        } else {
          rootEnd = 1;
        }
      } else if (
        isWindowsDeviceRoot(code) && path.charCodeAt(1) === CHAR_COLON
      ) {
        device = path.slice(0, 2);
        rootEnd = 2;
        if (len > 2 && isPathSeparator(path.charCodeAt(2))) {
          isAbsolute = true;
          rootEnd = 3;
        }
      }
      let tail = rootEnd < len
        ? normalizeString(
          path.slice(rootEnd),
          !isAbsolute,
          "\\",
          isPathSeparator,
        )
        : "";
      if (tail.length === 0 && !isAbsolute) tail = ".";
      if (tail.length > 0 && isPathSeparator(path.charCodeAt(len - 1))) {
        tail += "\\";
      }
      if (device === void 0) {
        return isAbsolute ? `\\${tail}` : tail;
      }
      return isAbsolute ? `${device}\\${tail}` : `${device}${tail}`;
    },
    isAbsolute(path) {
      validateString(path, "path");
      const len = path.length;
      if (len === 0) return false;
      const code = path.charCodeAt(0);
      return isPathSeparator(code) || // Possible device root
        len > 2 && isWindowsDeviceRoot(code) &&
          path.charCodeAt(1) === CHAR_COLON &&
          isPathSeparator(path.charCodeAt(2));
    },
    join(...args) {
      if (args.length === 0) return ".";
      let joined;
      let firstPart;
      for (let i = 0; i < args.length; ++i) {
        const arg = args[i];
        validateString(arg, "path");
        if (arg.length > 0) {
          if (joined === void 0) {
            joined = arg;
            firstPart = arg;
          } else joined += `\\${arg}`;
        }
      }
      if (joined === void 0 || firstPart === void 0) return ".";
      let needsReplace = true;
      let slashCount = 0;
      if (isPathSeparator(firstPart.charCodeAt(0))) {
        ++slashCount;
        const firstLen = firstPart.length;
        if (firstLen > 1 && isPathSeparator(firstPart.charCodeAt(1))) {
          ++slashCount;
          if (firstLen > 2) {
            if (isPathSeparator(firstPart.charCodeAt(2))) ++slashCount;
            else {
              needsReplace = false;
            }
          }
        }
      }
      if (needsReplace) {
        while (
          slashCount < joined.length &&
          isPathSeparator(joined.charCodeAt(slashCount))
        ) {
          slashCount++;
        }
        if (slashCount >= 2) joined = `\\${joined.slice(slashCount)}`;
      }
      return win32.normalize(joined);
    },
    relative(from, to) {
      validateString(from, "from");
      validateString(to, "to");
      if (from === to) return "";
      const fromOrig = win32.resolve(from);
      const toOrig = win32.resolve(to);
      if (fromOrig === toOrig) return "";
      from = fromOrig.toLowerCase();
      to = toOrig.toLowerCase();
      if (from === to) return "";
      if (fromOrig.length !== from.length || toOrig.length !== to.length) {
        const fromSplit = fromOrig.split("\\");
        const toSplit = toOrig.split("\\");
        if (fromSplit[fromSplit.length - 1] === "") {
          fromSplit.pop();
        }
        if (toSplit[toSplit.length - 1] === "") {
          toSplit.pop();
        }
        const fromLen2 = fromSplit.length;
        const toLen2 = toSplit.length;
        const length2 = fromLen2 < toLen2 ? fromLen2 : toLen2;
        let i2;
        for (i2 = 0; i2 < length2; i2++) {
          if (fromSplit[i2]?.toLowerCase() !== toSplit[i2]?.toLowerCase()) {
            break;
          }
        }
        if (i2 === 0) {
          return toOrig;
        } else if (i2 === length2) {
          if (toLen2 > length2) {
            return toSplit.slice(i2).join("\\");
          }
          if (fromLen2 > length2) {
            return "..\\".repeat(fromLen2 - 1 - i2) + "..";
          }
          return "";
        }
        return "..\\".repeat(fromLen2 - i2) + toSplit.slice(i2).join("\\");
      }
      let fromStart = 0;
      while (
        fromStart < from.length &&
        from.charCodeAt(fromStart) === CHAR_BACKWARD_SLASH
      ) {
        fromStart++;
      }
      let fromEnd = from.length;
      while (
        fromEnd - 1 > fromStart &&
        from.charCodeAt(fromEnd - 1) === CHAR_BACKWARD_SLASH
      ) {
        fromEnd--;
      }
      const fromLen = fromEnd - fromStart;
      let toStart = 0;
      while (
        toStart < to.length && to.charCodeAt(toStart) === CHAR_BACKWARD_SLASH
      ) {
        toStart++;
      }
      let toEnd = to.length;
      while (
        toEnd - 1 > toStart && to.charCodeAt(toEnd - 1) === CHAR_BACKWARD_SLASH
      ) {
        toEnd--;
      }
      const toLen = toEnd - toStart;
      const length = fromLen < toLen ? fromLen : toLen;
      let lastCommonSep = -1;
      let i = 0;
      for (; i < length; i++) {
        const fromCode = from.charCodeAt(fromStart + i);
        if (fromCode !== to.charCodeAt(toStart + i)) break;
        else if (fromCode === CHAR_BACKWARD_SLASH) lastCommonSep = i;
      }
      if (i !== length) {
        if (lastCommonSep === -1) return toOrig;
      } else {
        if (toLen > length) {
          if (to.charCodeAt(toStart + i) === CHAR_BACKWARD_SLASH) {
            return toOrig.slice(toStart + i + 1);
          }
          if (i === 2) {
            return toOrig.slice(toStart + i);
          }
        }
        if (fromLen > length) {
          if (from.charCodeAt(fromStart + i) === CHAR_BACKWARD_SLASH) {
            lastCommonSep = i;
          } else if (i === 2) {
            lastCommonSep = 3;
          }
        }
        if (lastCommonSep === -1) lastCommonSep = 0;
      }
      let out = "";
      for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) {
        if (i === fromEnd || from.charCodeAt(i) === CHAR_BACKWARD_SLASH) {
          out += out.length === 0 ? ".." : "\\..";
        }
      }
      toStart += lastCommonSep;
      if (out.length > 0) return `${out}${toOrig.slice(toStart, toEnd)}`;
      if (toOrig.charCodeAt(toStart) === CHAR_BACKWARD_SLASH) ++toStart;
      return toOrig.slice(toStart, toEnd);
    },
    toNamespacedPath(path) {
      if (typeof path !== "string" || path.length === 0) return path;
      const resolvedPath = win32.resolve(path);
      if (resolvedPath.length <= 2) return path;
      if (resolvedPath.charCodeAt(0) === CHAR_BACKWARD_SLASH) {
        if (resolvedPath.charCodeAt(1) === CHAR_BACKWARD_SLASH) {
          const code = resolvedPath.charCodeAt(2);
          if (code !== CHAR_QUESTION_MARK && code !== CHAR_DOT) {
            return `\\\\?\\UNC\\${resolvedPath.slice(2)}`;
          }
        }
      } else if (
        isWindowsDeviceRoot(resolvedPath.charCodeAt(0)) &&
        resolvedPath.charCodeAt(1) === CHAR_COLON &&
        resolvedPath.charCodeAt(2) === CHAR_BACKWARD_SLASH
      ) {
        return `\\\\?\\${resolvedPath}`;
      }
      return resolvedPath;
    },
    dirname(path) {
      validateString(path, "path");
      const len = path.length;
      if (len === 0) return ".";
      let rootEnd = -1;
      let offset = 0;
      const code = path.charCodeAt(0);
      if (len === 1) {
        return isPathSeparator(code) ? path : ".";
      }
      if (isPathSeparator(code)) {
        rootEnd = offset = 1;
        if (isPathSeparator(path.charCodeAt(1))) {
          let j = 2;
          let last = j;
          while (j < len && !isPathSeparator(path.charCodeAt(j))) {
            j++;
          }
          if (j < len && j !== last) {
            last = j;
            while (j < len && isPathSeparator(path.charCodeAt(j))) {
              j++;
            }
            if (j < len && j !== last) {
              last = j;
              while (j < len && !isPathSeparator(path.charCodeAt(j))) {
                j++;
              }
              if (j === len) {
                return path;
              }
              if (j !== last) {
                rootEnd = offset = j + 1;
              }
            }
          }
        }
      } else if (
        isWindowsDeviceRoot(code) && path.charCodeAt(1) === CHAR_COLON
      ) {
        rootEnd = len > 2 && isPathSeparator(path.charCodeAt(2)) ? 3 : 2;
        offset = rootEnd;
      }
      let end = -1;
      let matchedSlash = true;
      for (let i = len - 1; i >= offset; --i) {
        if (isPathSeparator(path.charCodeAt(i))) {
          if (!matchedSlash) {
            end = i;
            break;
          }
        } else {
          matchedSlash = false;
        }
      }
      if (end === -1) {
        if (rootEnd === -1) return ".";
        end = rootEnd;
      }
      return path.slice(0, end);
    },
    basename(path, suffix) {
      if (suffix !== void 0) validateString(suffix, "suffix");
      validateString(path, "path");
      let start = 0;
      let end = -1;
      let matchedSlash = true;
      if (
        path.length >= 2 && isWindowsDeviceRoot(path.charCodeAt(0)) &&
        path.charCodeAt(1) === CHAR_COLON
      ) {
        start = 2;
      }
      if (
        suffix !== void 0 && suffix.length > 0 && suffix.length <= path.length
      ) {
        if (suffix === path) return "";
        let extIdx = suffix.length - 1;
        let firstNonSlashEnd = -1;
        for (let i = path.length - 1; i >= start; --i) {
          const code = path.charCodeAt(i);
          if (isPathSeparator(code)) {
            if (!matchedSlash) {
              start = i + 1;
              break;
            }
          } else {
            if (firstNonSlashEnd === -1) {
              matchedSlash = false;
              firstNonSlashEnd = i + 1;
            }
            if (extIdx >= 0) {
              if (code === suffix.charCodeAt(extIdx)) {
                if (--extIdx === -1) {
                  end = i;
                }
              } else {
                extIdx = -1;
                end = firstNonSlashEnd;
              }
            }
          }
        }
        if (start === end) end = firstNonSlashEnd;
        else if (end === -1) end = path.length;
        return path.slice(start, end);
      }
      for (let i = path.length - 1; i >= start; --i) {
        if (isPathSeparator(path.charCodeAt(i))) {
          if (!matchedSlash) {
            start = i + 1;
            break;
          }
        } else if (end === -1) {
          matchedSlash = false;
          end = i + 1;
        }
      }
      if (end === -1) return "";
      return path.slice(start, end);
    },
    extname(path) {
      validateString(path, "path");
      let start = 0;
      let startDot = -1;
      let startPart = 0;
      let end = -1;
      let matchedSlash = true;
      let preDotState = 0;
      if (
        path.length >= 2 && path.charCodeAt(1) === CHAR_COLON &&
        isWindowsDeviceRoot(path.charCodeAt(0))
      ) {
        start = startPart = 2;
      }
      for (let i = path.length - 1; i >= start; --i) {
        const code = path.charCodeAt(i);
        if (isPathSeparator(code)) {
          if (!matchedSlash) {
            startPart = i + 1;
            break;
          }
          continue;
        }
        if (end === -1) {
          matchedSlash = false;
          end = i + 1;
        }
        if (code === CHAR_DOT) {
          if (startDot === -1) startDot = i;
          else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
          preDotState = -1;
        }
      }
      if (
        startDot === -1 || end === -1 || // non-dot char right before the dot
        preDotState === 0 || // right-most trimmed component is '..'
        preDotState === 1 && startDot === end - 1 && startDot === startPart + 1
      ) {
        return "";
      }
      return path.slice(startDot, end);
    },
    format(path) {
      return _format("\\", path);
    },
    parse(path) {
      validateString(path, "path");
      const ret = { root: "", dir: "", base: "", ext: "", name: "" };
      if (path.length === 0) return ret;
      const len = path.length;
      let rootEnd = 0;
      let code = path.charCodeAt(0);
      if (len === 1) {
        if (isPathSeparator(code)) {
          ret.root = ret.dir = path;
          return ret;
        }
        ret.base = ret.name = path;
        return ret;
      }
      if (isPathSeparator(code)) {
        rootEnd = 1;
        if (isPathSeparator(path.charCodeAt(1))) {
          let j = 2;
          let last = j;
          while (j < len && !isPathSeparator(path.charCodeAt(j))) {
            j++;
          }
          if (j < len && j !== last) {
            last = j;
            while (j < len && isPathSeparator(path.charCodeAt(j))) {
              j++;
            }
            if (j < len && j !== last) {
              last = j;
              while (j < len && !isPathSeparator(path.charCodeAt(j))) {
                j++;
              }
              if (j === len) {
                rootEnd = j;
              } else if (j !== last) {
                rootEnd = j + 1;
              }
            }
          }
        }
      } else if (
        isWindowsDeviceRoot(code) && path.charCodeAt(1) === CHAR_COLON
      ) {
        if (len <= 2) {
          ret.root = ret.dir = path;
          return ret;
        }
        rootEnd = 2;
        if (isPathSeparator(path.charCodeAt(2))) {
          if (len === 3) {
            ret.root = ret.dir = path;
            return ret;
          }
          rootEnd = 3;
        }
      }
      if (rootEnd > 0) ret.root = path.slice(0, rootEnd);
      let startDot = -1;
      let startPart = rootEnd;
      let end = -1;
      let matchedSlash = true;
      let i = path.length - 1;
      let preDotState = 0;
      for (; i >= rootEnd; --i) {
        code = path.charCodeAt(i);
        if (isPathSeparator(code)) {
          if (!matchedSlash) {
            startPart = i + 1;
            break;
          }
          continue;
        }
        if (end === -1) {
          matchedSlash = false;
          end = i + 1;
        }
        if (code === CHAR_DOT) {
          if (startDot === -1) startDot = i;
          else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
          preDotState = -1;
        }
      }
      if (end !== -1) {
        if (
          startDot === -1 || // non-dot char right before the dot
          preDotState === 0 || // right-most trimmed component is '..'
          preDotState === 1 && startDot === end - 1 &&
            startDot === startPart + 1
        ) {
          ret.base = ret.name = path.slice(startPart, end);
        } else {
          ret.name = path.slice(startPart, startDot);
          ret.base = path.slice(startPart, end);
          ret.ext = path.slice(startDot, end);
        }
      }
      if (startPart > 0 && startPart !== rootEnd) {
        ret.dir = path.slice(0, startPart - 1);
      } else ret.dir = ret.root;
      return ret;
    },
    matchesGlob(_path, _pattern) {
      throw new Error("path.win32.matchesGlob() is not implemented.");
    },
    sep: "\\",
    delimiter: ";",
    win32: null,
    posix: null,
  };
  const posix = {
    /**
     * path.resolve([from ...], to)
     * @param {...string} args
     * @returns {string}
     */
    resolve(...args) {
      let resolvedPath = "";
      let resolvedAbsolute = false;
      for (let i = args.length - 1; i >= 0 && !resolvedAbsolute; i--) {
        const path = args[i];
        validateString(path, `paths[${i}]`);
        if (path.length === 0) {
          continue;
        }
        resolvedPath = `${path}/${resolvedPath}`;
        resolvedAbsolute = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
      }
      if (!resolvedAbsolute) {
        const cwd = "/";
        resolvedPath = `${cwd}/${resolvedPath}`;
        resolvedAbsolute = true;
      }
      resolvedPath = normalizeString(
        resolvedPath,
        !resolvedAbsolute,
        "/",
        isPosixPathSeparator,
      );
      if (resolvedAbsolute) {
        return `/${resolvedPath}`;
      }
      return resolvedPath.length > 0 ? resolvedPath : ".";
    },
    /**
     * @param {string} path
     * @returns {string}
     */
    normalize(path) {
      validateString(path, "path");
      if (path.length === 0) return ".";
      const isAbsolute = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
      const trailingSeparator =
        path.charCodeAt(path.length - 1) === CHAR_FORWARD_SLASH;
      path = normalizeString(path, !isAbsolute, "/", isPosixPathSeparator);
      if (path.length === 0) {
        if (isAbsolute) return "/";
        return trailingSeparator ? "./" : ".";
      }
      if (trailingSeparator) path += "/";
      return isAbsolute ? `/${path}` : path;
    },
    /**
     * @param {string} path
     * @returns {boolean}
     */
    isAbsolute(path) {
      validateString(path, "path");
      return path.length > 0 && path.charCodeAt(0) === CHAR_FORWARD_SLASH;
    },
    /**
     * @param {...string} args
     * @returns {string}
     */
    join(...args) {
      if (args.length === 0) return ".";
      let joined;
      for (let i = 0; i < args.length; ++i) {
        const arg = args[i];
        validateString(arg, "path");
        if (arg.length > 0) {
          if (joined === void 0) joined = arg;
          else joined += `/${arg}`;
        }
      }
      if (joined === void 0) return ".";
      return posix.normalize(joined);
    },
    /**
     * @param {string} from
     * @param {string} to
     * @returns {string}
     */
    relative(from, to) {
      validateString(from, "from");
      validateString(to, "to");
      if (from === to) return "";
      from = posix.resolve(from);
      to = posix.resolve(to);
      if (from === to) return "";
      let fromStart = 0;
      while (
        fromStart < from.length &&
        from.charCodeAt(fromStart) === CHAR_FORWARD_SLASH
      ) {
        fromStart++;
      }
      let fromEnd = from.length;
      while (
        fromEnd - 1 > fromStart &&
        from.charCodeAt(fromEnd - 1) === CHAR_FORWARD_SLASH
      ) {
        fromEnd--;
      }
      const fromLen = fromEnd - fromStart;
      let toStart = 0;
      while (
        toStart < to.length && to.charCodeAt(toStart) === CHAR_FORWARD_SLASH
      ) {
        toStart++;
      }
      let toEnd = to.length;
      while (
        toEnd - 1 > toStart && to.charCodeAt(toEnd - 1) === CHAR_FORWARD_SLASH
      ) {
        toEnd--;
      }
      const toLen = toEnd - toStart;
      const length = fromLen < toLen ? fromLen : toLen;
      let lastCommonSep = -1;
      let i = 0;
      for (; i < length; i++) {
        const fromCode = from.charCodeAt(fromStart + i);
        if (fromCode !== to.charCodeAt(toStart + i)) break;
        else if (fromCode === CHAR_FORWARD_SLASH) lastCommonSep = i;
      }
      if (i === length) {
        if (toLen > length) {
          if (to.charCodeAt(toStart + i) === CHAR_FORWARD_SLASH) {
            return to.slice(toStart + i + 1);
          }
          if (i === 0) {
            return to.slice(toStart + i);
          }
        } else if (fromLen > length) {
          if (from.charCodeAt(fromStart + i) === CHAR_FORWARD_SLASH) {
            lastCommonSep = i;
          } else if (i === 0) {
            lastCommonSep = 0;
          }
        }
      }
      let out = "";
      for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) {
        if (i === fromEnd || from.charCodeAt(i) === CHAR_FORWARD_SLASH) {
          out += out.length === 0 ? ".." : "/..";
        }
      }
      return `${out}${to.slice(toStart + lastCommonSep)}`;
    },
    /**
     * @param {string} path
     * @returns {string}
     */
    toNamespacedPath(path) {
      return path;
    },
    /**
     * @param {string} path
     * @returns {string}
     */
    dirname(path) {
      validateString(path, "path");
      if (path.length === 0) return ".";
      const hasRoot = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
      let end = -1;
      let matchedSlash = true;
      for (let i = path.length - 1; i >= 1; --i) {
        if (path.charCodeAt(i) === CHAR_FORWARD_SLASH) {
          if (!matchedSlash) {
            end = i;
            break;
          }
        } else {
          matchedSlash = false;
        }
      }
      if (end === -1) return hasRoot ? "/" : ".";
      if (hasRoot && end === 1) return "//";
      return path.slice(0, end);
    },
    /**
     * @param {string} path
     * @param {string} [suffix]
     * @returns {string}
     */
    basename(path, suffix) {
      if (suffix !== void 0) validateString(suffix, "ext");
      validateString(path, "path");
      let start = 0;
      let end = -1;
      let matchedSlash = true;
      if (
        suffix !== void 0 && suffix.length > 0 && suffix.length <= path.length
      ) {
        if (suffix === path) return "";
        let extIdx = suffix.length - 1;
        let firstNonSlashEnd = -1;
        for (let i = path.length - 1; i >= 0; --i) {
          const code = path.charCodeAt(i);
          if (code === CHAR_FORWARD_SLASH) {
            if (!matchedSlash) {
              start = i + 1;
              break;
            }
          } else {
            if (firstNonSlashEnd === -1) {
              matchedSlash = false;
              firstNonSlashEnd = i + 1;
            }
            if (extIdx >= 0) {
              if (code === suffix.charCodeAt(extIdx)) {
                if (--extIdx === -1) {
                  end = i;
                }
              } else {
                extIdx = -1;
                end = firstNonSlashEnd;
              }
            }
          }
        }
        if (start === end) end = firstNonSlashEnd;
        else if (end === -1) end = path.length;
        return path.slice(start, end);
      }
      for (let i = path.length - 1; i >= 0; --i) {
        if (path.charCodeAt(i) === CHAR_FORWARD_SLASH) {
          if (!matchedSlash) {
            start = i + 1;
            break;
          }
        } else if (end === -1) {
          matchedSlash = false;
          end = i + 1;
        }
      }
      if (end === -1) return "";
      return path.slice(start, end);
    },
    /**
     * @param {string} path
     * @returns {string}
     */
    extname(path) {
      validateString(path, "path");
      let startDot = -1;
      let startPart = 0;
      let end = -1;
      let matchedSlash = true;
      let preDotState = 0;
      for (let i = path.length - 1; i >= 0; --i) {
        const code = path.charCodeAt(i);
        if (code === CHAR_FORWARD_SLASH) {
          if (!matchedSlash) {
            startPart = i + 1;
            break;
          }
          continue;
        }
        if (end === -1) {
          matchedSlash = false;
          end = i + 1;
        }
        if (code === CHAR_DOT) {
          if (startDot === -1) startDot = i;
          else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
          preDotState = -1;
        }
      }
      if (
        startDot === -1 || end === -1 || // non-dot char right before the dot
        preDotState === 0 || // right-most trimmed component is '..'
        preDotState === 1 && startDot === end - 1 && startDot === startPart + 1
      ) {
        return "";
      }
      return path.slice(startDot, end);
    },
    format: _format.bind(null, "/"),
    /**
     * @param {string} path
     * @returns {{
     *   dir: string;
     *   root: string;
     *   base: string;
     *   name: string;
     *   ext: string;
     *   }}
     */
    parse(path) {
      validateString(path, "path");
      const ret = { root: "", dir: "", base: "", ext: "", name: "" };
      if (path.length === 0) return ret;
      const isAbsolute = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
      let start;
      if (isAbsolute) {
        ret.root = "/";
        start = 1;
      } else {
        start = 0;
      }
      let startDot = -1;
      let startPart = 0;
      let end = -1;
      let matchedSlash = true;
      let i = path.length - 1;
      let preDotState = 0;
      for (; i >= start; --i) {
        const code = path.charCodeAt(i);
        if (code === CHAR_FORWARD_SLASH) {
          if (!matchedSlash) {
            startPart = i + 1;
            break;
          }
          continue;
        }
        if (end === -1) {
          matchedSlash = false;
          end = i + 1;
        }
        if (code === CHAR_DOT) {
          if (startDot === -1) startDot = i;
          else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
          preDotState = -1;
        }
      }
      if (end !== -1) {
        const start2 = startPart === 0 && isAbsolute ? 1 : startPart;
        if (
          startDot === -1 || // non-dot char right before the dot
          preDotState === 0 || // right-most trimmed component is '..'
          preDotState === 1 && startDot === end - 1 &&
            startDot === startPart + 1
        ) {
          ret.base = ret.name = path.slice(start2, end);
        } else {
          ret.name = path.slice(start2, startDot);
          ret.base = path.slice(start2, end);
          ret.ext = path.slice(startDot, end);
        }
      }
      if (startPart > 0) ret.dir = path.slice(0, startPart - 1);
      else if (isAbsolute) ret.dir = "/";
      return ret;
    },
    matchesGlob(_path, _pattern) {
      throw new Error("path.posix.matchesGlob() is not implemented.");
    },
    sep: "/",
    delimiter: ":",
    win32: null,
    posix: null,
  };
  posix.win32 = win32.win32 = win32;
  posix.posix = win32.posix = posix;
  globalThis.__pathModule = posix;
  globalThis.__pathWin32Module = win32;
})();
