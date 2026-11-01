# wasm

A Durable Object counter in Rust, compiled to Wasm with
[workers-rs](https://github.com/cloudflare/workers-rs).

`worker-build` is the workers-rs build tool. It compiles the crate to
`wasm32-unknown-unknown`, runs wasm-bindgen over the output, and writes the
JavaScript entry point (`build/worker/shim.mjs`) that `wrangler.jsonc` names as
`main` — you do not write any JavaScript yourself. Install it once, build, and
deploy:

```sh
rustup target add wasm32-unknown-unknown
cargo install worker-build

worker-build --release
celld deploy . --bucket s3://my-cells-bucket
```

```sh
curl http://localhost:8080/c/hello
curl http://localhost:8080/c/hello
curl http://localhost:8080/c/other
```

See [the WebAssembly docs](../../docs/wasm.md) for how celld ships and runs the
`.wasm` module. Contributed by [Connor Hindley](https://github.com/connyay).
