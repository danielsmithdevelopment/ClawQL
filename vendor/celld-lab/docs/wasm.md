# WebAssembly

A Worker bundle can import a `.wasm` file. As in Wrangler, the import gives
the compiled module, not the bytes.

```js
import addModule from "./add.wasm";

const { exports } = new WebAssembly.Instance(addModule);

export default {
  fetch() {
    return new Response(String(exports.add(2, 3)));
  },
};
```

`celld deploy` uploads each imported wasm file beside the bundle and marks the
deployment with the `wasm-v1` feature. A node that predates this feature
refuses the deployment, so a mixed fleet fails at deploy time, not at request
time.

celld compiles each wasm module once per process, so later isolates and cell
activations reuse it.

## Example

The [WebAssembly example](../examples/wasm) compiles a Rust Durable Object and
imports its WebAssembly module.

<!-- celld-example: wasm -->

## Prebuilt Workers

With `no_bundle: true`, celld preserves the entry JavaScript byte for byte. It
applies Wrangler's default `**/*.wasm` and `**/*.wasm?module` patterns below
the directory that contains `main`. For example, `main: "./dist/shim.mjs"` can
import `"./add.wasm"` or `"./lib/add.wasm"` from `dist`. The module names keep
these relative paths. This mode does not require esbuild.

The scan uploads WASM files that the JavaScript does not import, so use a
dedicated build output directory. It skips `.git`, `.celld`, `.wrangler`, and
symbolic links to directories. It refuses a symbolic link whose name matches a
WASM pattern, so copy the file into the build output instead.

celld does not implement the other
[Wrangler module discovery settings](https://developers.cloudflare.com/workers/wrangler/configuration/#find-additional-modules).
It does not discover additional JavaScript modules and does not accept
`rules`, `base_dir`, or `find_additional_modules`. The JavaScript must already
be bundled, and its WASM imports must be relative to the entry directory.

## Rust with workers-rs

[workers-rs](https://github.com/cloudflare/workers-rs) builds a JavaScript shim
and a wasm file, and the shim is a normal entry point for `celld deploy`.

1. Install the build tool: `cargo install worker-build`.
2. Build the crate: `worker-build --release`.
3. Point the config at the shim:

```jsonc
{
  "name": "my-app",
  "main": "./build/worker/shim.mjs",
  "compatibility_date": "2026-01-01",
}
```

4. Deploy: `celld deploy`.

celld resolves entrypoint and Durable Object classes through the shim's Proxy
wrapper. A workers-rs API that needs a runtime feature missing from
[Cloudflare compatibility](cloudflare-compat.md) does not work.

## Dynamic Workers

Pass wasm to a dynamically loaded worker as `{ wasm: bytes }` in the `modules`
map, and the worker imports a compiled module. celld refuses bare bytes, as
workerd does.

```js
const worker = env.loader.load({
  compatibilityDate: "2025-01-01",
  mainModule: "main.js",
  modules: {
    "main.js": `import m from "./add.wasm"; ...`,
    "add.wasm": { wasm: wasmBytes },
  },
});
```

## Limits

Wasm bytes count against the deployment size limits like JavaScript modules. A
module that does not compile fails the importing module with a
`WebAssembly.CompileError` that names the file.
