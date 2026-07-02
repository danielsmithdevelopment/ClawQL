#!/usr/bin/env node
/**
 * Reference HTTP classifier for IDP demos ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248)).
 * Heuristic only — replace with your fine-tuned model in production.
 */
import http from "node:http";

const PORT = Number.parseInt(process.env.PORT ?? "8080", 10);
const MODEL_VERSION = process.env.MODEL_VERSION ?? "reference-heuristic-v1";

function classify(body) {
  const corpus = [
    body.docling_md,
    body.text,
    body.doc_id,
    JSON.stringify(body.docling_json ?? {}),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  let label = "unknown";
  let confidence = 0.5;
  if (/form\s*w-?2|w-?2\s*wage|wages,\s*tips/.test(corpus)) {
    label = "w2";
    confidence = 0.94;
  } else if (/1099|miscellaneous income/.test(corpus)) {
    label = "1099";
    confidence = 0.88;
  } else if (/pay\s*stub|earnings statement/.test(corpus)) {
    label = "pay_stub";
    confidence = 0.86;
  }

  const minConf =
    typeof body.min_confidence === "number" && body.min_confidence >= 0 && body.min_confidence <= 1
      ? body.min_confidence
      : Number.parseFloat(process.env.CLASSIFIER_MIN_CONFIDENCE ?? "0.85");

  return {
    label,
    confidence,
    model_version: MODEL_VERSION,
    needs_hitl: confidence < minConf,
    min_confidence: minConf,
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, model_version: MODEL_VERSION }));
    return;
  }

  if (req.method === "POST" && req.url === "/classify") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let body = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid JSON body" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(classify(body)));
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => {
  console.log(`classifier-http listening on :${PORT} (${MODEL_VERSION})`);
});
