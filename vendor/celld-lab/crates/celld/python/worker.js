// Entrypoint of a Python Worker bundle built by `celld deploy`.
//
// Adapted from workerd at commit da46ad950c54b19158c5ea5cb997a9727491ca17
// (v1.20260926.1): src/pyodide/python-entrypoint-helper.ts. Copyright (c)
// 2026 Cloudflare, Inc. (Apache-2.0). As there, the default export is a
// WorkerEntrypoint class whose constructor creates one instance of the Python
// `Default` class per invocation, `fetch` calls it with the SDK's RPC
// conversions, and a Python awaitable given to waitUntil is kept alive
// until it settles. Changed for celld: the interpreter comes from the
// upstream Pyodide loader, and only `fetch` is dispatched.
//
// celld cannot evaluate an asynchronous module top level, so the interpreter
// starts on the first invocation of the isolate instead of at load. Every
// concurrent first invocation shares that one start. A failed start is kept:
// the interpreter is never started twice in one isolate, so a callback of an
// earlier interpreter can never reach a later one.
import { WorkerEntrypoint } from "cloudflare:workers";
import * as cloudflareWorkers from "cloudflare:workers";
import * as cloudflareSockets from "cloudflare:sockets";
import "./pyodide.asm.js";
import { loadPyodide } from "./pyodide.mjs";
import workerSource from "./worker.py";
import files from "./files.bin";
import { COMPATIBILITY_FLAGS, LOCK, MAIN_MODULE, PROCESS_PTH_FILES } from "./config.js";
import { RUNTIME_URL } from "./shims.js";
import { fatalGate } from "./fatal.js";
import { condemnIsolate } from "celld:python";

// A hard termination inside Wasm abandons the interpreter's frames, and
// celld keeps the isolate in use afterwards, so the next entry would run
// on a broken interpreter. `process.exit()` is the only termination a
// Worker can reach itself, so it throws here instead.
if (globalThis.process) {
  globalThis.process.exit = function exit() {
    throw new Error("process.exit() is not supported in Python Workers on celld");
  };
}

// Files are `u32 count`, then for each file `u32 path length`, the UTF-8
// path under /session/metadata, `u32 size` and the bytes (little endian).
function unpack(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  const u32 = () => {
    const value = view.getUint32(offset, true);
    offset += 4;
    return value;
  };
  const entries = [];
  for (let count = u32(); count > 0; count--) {
    const pathLength = u32();
    const path = decoder.decode(bytes.subarray(offset, offset + pathLength));
    offset += pathLength;
    const size = u32();
    entries.push([path, bytes.subarray(offset, offset + size)]);
    offset += size;
  }
  return entries;
}

// Cloudflare stops the isolate on a fatal interpreter error. celld condemns
// it instead: placement stops choosing it, and the pool frees it once the
// calls in flight drain. The gate fails those calls and the background work,
// and refuses any entry that still reaches this module. Callbacks that
// Python already registered on JS promises are not fenced.
const fatal = fatalGate();

// A Python awaitable passed to waitUntil is a borrowed proxy that Python
// releases when the call returns. Take an owned copy synchronously and
// release it when it settles (workerd getPatchedWaitUntil). The gate ends
// the wait on a fatal error, because the awaitable can no longer settle and
// the invocation would otherwise stay open.
function retaining(waitUntil) {
  return (awaitable) => {
    waitUntil((async () => {
      if (awaitable && typeof awaitable.copy === "function") awaitable = awaitable.copy();
      try {
        await fatal.guard(awaitable);
      } finally {
        if (awaitable && typeof awaitable.destroy === "function") release(awaitable);
      }
    })());
  };
}

const patched = new WeakSet();
function patchWaitUntil(ctx) {
  if (ctx === null || typeof ctx !== "object" || patched.has(ctx)) return;
  if (typeof ctx.waitUntil !== "function") return;
  ctx.waitUntil = retaining(ctx.waitUntil.bind(ctx));
  patched.add(ctx);
}

const workersWaitUntil = retaining(cloudflareWorkers.waitUntil);
const cloudflareWorkersModule = new Proxy(cloudflareWorkers, {
  get(target, property, receiver) {
    return property === "waitUntil"
      ? workersWaitUntil
      : Reflect.get(target, property, receiver);
  },
});

const entrypointHelper = {
  cloudflareWorkersModule,
  cloudflareSocketsModule: cloudflareSockets,
  patchWaitUntil,
  doAnImport(name) {
    throw new Error(`JavaScript module import is not supported in Python Workers on celld: ${name}`);
  },
  patch_env_helper() {
    throw new Error("workers.patch_env is not supported in Python Workers on celld");
  },
};

let started;
function describe(error) {
  try {
    return String(error);
  } catch {
    return "an error that cannot be printed";
  }
}

async function start() {
  const pyodide = await loadPyodide({
    indexURL: RUNTIME_URL,
    lockFileContents: LOCK,
    jsglobals: globalThis,
    // workerd's interpreter environment. The fixed hash seed makes string
    // hashing, and so set iteration order, match Cloudflare.
    env: { HOME: "/session", PYTHONHASHSEED: "111" },
  });
  pyodide._api.on_fatal = (error) => {
    const reason = `Python Worker fatal error: ${describe(error)}`;
    fatal.fail(new Error(reason));
    condemnIsolate(reason);
  };
  pyodide.loadPackage = () => {
    throw new Error("pyodide.loadPackage is disabled");
  };
  for (const [path, contents] of unpack(files)) {
    const full = `/session/metadata/${path}`;
    pyodide.FS.mkdirTree(full.slice(0, full.lastIndexOf("/")));
    pyodide.FS.writeFile(full, contents);
  }
  pyodide.registerJsModule("_pyodide_entrypoint_helper", entrypointHelper);
  pyodide.registerJsModule("_cloudflare_compat_flags", COMPATIBILITY_FLAGS);
  const namespace = pyodide.globals.get("dict")();
  pyodide.runPython(workerSource, { globals: namespace, filename: "<celld-python-worker>" });
  namespace.get("setup_python_search_path")(PROCESS_PTH_FILES);
  const main = pyodide.pyimport(MAIN_MODULE);
  return {
    Default: namespace.get("default_entrypoint")(main),
    callMethod: namespace.get("call_method"),
  };
}

function runtime() {
  if (fatal.error !== null) throw fatal.error;
  return started ??= start();
}

// Release a proxy after a call. A release that throws in `finally` would
// replace the call's own result or error, and the caller must see that
// instead: a failed release costs a leaked proxy at worst, and a fatal
// interpreter error still refuses every later entry through the gate.
function release(proxy) {
  if (fatal.error !== null) return;
  try {
    proxy.destroy();
  } catch {
    // Keep the call's outcome.
  }
}

async function call(entry, name, args) {
  const { callMethod } = await runtime();
  const instance = await entry;
  try {
    if (fatal.error !== null) throw fatal.error;
    const future = callMethod(name === "fetch", instance, name, ...args);
    try {
      return await fatal.guard(future);
    } finally {
      release(future);
    }
  } finally {
    release(instance);
  }
}

export default class Default extends WorkerEntrypoint {
  #instance;

  constructor(ctx, env) {
    super(ctx, env);
    this.#instance = (async () => {
      const { Default: cls } = await runtime();
      if (cls === undefined || cls === null) {
        throw new Error("Handler does not export a fetch() function.");
      }
      return cls(ctx, env);
    })();
    // A failed start is reported by the method call that awaits it.
    this.#instance.catch(() => {});
  }

  fetch(request) {
    return call(this.#instance, "fetch", [request]);
  }
}
