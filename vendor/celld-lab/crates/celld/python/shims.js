// Lexical globals for the upstream Pyodide loader in a Python Worker bundle.
//
// `celld deploy` injects this module into the generated bundle with esbuild's
// `--inject`, so each name below shadows the global of the same name only
// inside the bundle. The isolate's own globals are untouched.
//
// The loader runs as if in a browser Web Worker: it finds `importScripts`
// and `WorkerGlobalScope`, reads `self.location`, and fetches its assets.
// Every asset is already in the bundle, so the fetch below serves them and
// refuses any other runtime URL. A Python Worker never downloads runtime
// code at request time.
import interpreter from "./pyodide.asm.wasm";
import sentinel from "./sentinel.wasm";
import stdlib from "./python_stdlib.zip";
import { SENTINEL_BYTES } from "./config.js";

export const RUNTIME_URL = "https://python-runtime.invalid/";

const interpreterResponses = new WeakSet();

export function importScripts(url) {
  throw new Error(`Python runtime scripts are bundled; refusing ${url}`);
}
export class WorkerGlobalScope {}
export const self = Object.create(globalThis);
Object.defineProperty(self, "location", { value: { href: RUNTIME_URL } });

export async function fetch(input, init) {
  const url = String(input instanceof Request ? input.url : input);
  if (url === `${RUNTIME_URL}python_stdlib.zip`) return new Response(stdlib);
  if (url === `${RUNTIME_URL}pyodide.asm.wasm`) {
    const response = new Response(null);
    interpreterResponses.add(response);
    return response;
  }
  if (url.startsWith(RUNTIME_URL)) {
    throw new Error(`Python runtime asset is not bundled: ${url}`);
  }
  return globalThis.fetch(input, init);
}

// JSPI members are omitted. Pyodide 0.28 turns on stack switching when it
// finds `WebAssembly.Suspending`, and in celld each awaited async entry then
// leaks 48 bytes of the 5 MiB Emscripten stack until an entry hangs. Without
// them Pyodide uses its non-switching path, so `pyodide.ffi.run_sync` and
// JS imports that need it are unavailable. Revisit when the pinned runtime
// changes.
const JSPI_MEMBERS = new Set(["Suspending", "promising", "Suspender"]);
export const WebAssembly = {};
for (const name of Object.getOwnPropertyNames(globalThis.WebAssembly)) {
  if (!JSPI_MEMBERS.has(name)) WebAssembly[name] = globalThis.WebAssembly[name];
}

function sameBytes(input, expected) {
  const bytes = ArrayBuffer.isView(input)
    ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
    : new Uint8Array(input);
  return bytes.length === expected.length &&
    bytes.every((byte, index) => byte === expected[index]);
}

// The loader compiles two programs: the interpreter and a tiny GC sentinel.
// Both are deployed as compiled Wasm modules, so compilation returns those
// modules. Any other byte string is refused rather than compiled at run time.
WebAssembly.compile = async (input) => {
  if (sameBytes(input, SENTINEL_BYTES)) return sentinel;
  throw new globalThis.WebAssembly.CompileError(
    "Python runtime requested an unbundled Wasm module",
  );
};
WebAssembly.instantiate = async (input, imports) => {
  if (input instanceof globalThis.WebAssembly.Module) {
    return globalThis.WebAssembly.instantiate(input, imports);
  }
  const module = await WebAssembly.compile(input);
  return { module, instance: await globalThis.WebAssembly.instantiate(module, imports) };
};
WebAssembly.instantiateStreaming = async (source, imports) => {
  const response = await source;
  if (interpreterResponses.has(response)) {
    const instance = await globalThis.WebAssembly.instantiate(interpreter, imports);
    return { module: interpreter, instance };
  }
  return WebAssembly.instantiate(await response.arrayBuffer(), imports);
};
