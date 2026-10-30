#!/usr/bin/env node
/**
 * Show why ClawQL should prefer CPD search tools over full-catalog dumps.
 * Public cash pricing only — not medical advice.
 */
const searchUrl =
  "https://api.costplusdrugs.com/pricelist/cpd/search?term=atorvastatin&strength=20mg";
const fullUrl = "https://api.costplusdrugs.com/pricelist/cpd";

async function main() {
  const offline = process.env.CPD_OFFLINE === "1";
  let searchBytes;
  let fullBytes;
  if (offline) {
    searchBytes = 3920;
    fullBytes = 3_722_723;
  } else {
    const [s, f] = await Promise.all([fetch(searchUrl), fetch(fullUrl)]);
    if (!s.ok || !f.ok) throw new Error(`HTTP search=${s.status} full=${f.status}`);
    searchBytes = Buffer.byteLength(await s.text(), "utf8");
    fullBytes = Buffer.byteLength(await f.text(), "utf8");
  }
  const ratio = fullBytes / Math.max(searchBytes, 1);
  const out = {
    notMedicalAdvice: true,
    offline,
    searchUrl,
    fullUrl,
    searchBytes,
    fullBytes,
    approxPayloadRatio: Number(ratio.toFixed(1)),
    guidance:
      "Route agents to mcp/cost-plus-drugs-pricing/search (or pricelist_*_search). Avoid pricelist_all / pricelist_cpd unless the user explicitly needs the full catalog — ClawQL search ranking already prefers the compact tools when queries look like price questions.",
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
