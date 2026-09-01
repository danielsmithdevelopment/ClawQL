#!/usr/bin/env node
/**
 * Smoke test for PixelDrop smart-upload harness (HTTP + static checks).
 * For full conversion test, run the harness in a browser with test-large.png.
 *
 *   cd examples/mcp-api-adapter/pixeldrop && python3 -m http.server 8765 &
 *   node examples/mcp-api-adapter/pixeldrop/smoke-test.mjs
 */
const BASE = "http://127.0.0.1:8765";

async function fetchOk(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res;
}

async function main() {
  console.log("Checking HTTP server…");
  await fetchOk(`${BASE}/smart-upload-test-harness.html`);
  await fetchOk(`${BASE}/pixeldrop-broken-demo.html`);
  const template = await (await fetchOk(`${BASE}/file-upload-smart.htmx.html`)).text();
  for (const needle of ["{{toolName}}", "createImageBitmap", "MAX_OUTPUT_BYTES"]) {
    if (!template.includes(needle)) throw new Error(`Template missing: ${needle}`);
  }

  const broken = await (await fetchOk(`${BASE}/pixeldrop-broken-demo.html`)).text();
  for (const needle of [
    "Unsupported binary file",
    "MAX_SIZE_BYTES = 2 * 1024 * 1024",
    "upload_photo",
    "uploadToBackend",
  ]) {
    if (!broken.includes(needle)) throw new Error(`Broken demo missing: ${needle}`);
  }

  const harness = await (await fetchOk(`${BASE}/smart-upload-test-harness.html`)).text();
  if (!harness.includes("file-upload-smart.htmx.html")) {
    throw new Error("Harness missing template fetch");
  }

  console.log("All smoke checks passed.");
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
