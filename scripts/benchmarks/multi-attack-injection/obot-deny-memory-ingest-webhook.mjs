#!/usr/bin/env node
/**
 * Obot-native HTTP webhook filter: deny tools/call for memory_ingest.
 *
 * This is Obot's documented best-config surface (gateway webhook filters),
 * not a ClawQL deny-tools stand-in. Obot intercepts the call, posts here,
 * and blocks on non-200. See https://docs.obot.ai/functionality/filters/
 *
 *   PORT=18796 node obot-deny-memory-ingest-webhook.mjs
 *   # Optional: WEBHOOK_SECRET=… (verify X-Obot-Signature-256)
 */
import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT || process.env.OBOT_FILTER_PORT || 18796);
const SECRET = process.env.WEBHOOK_SECRET?.trim() || "";
const DENY_TOOLS = new Set(
  String(process.env.DENY_TOOLS || "memory_ingest")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

function verifySignature(rawBody, header) {
  if (!SECRET) return true;
  if (!header) return false;
  const got = String(header).replace(/^sha256=/i, "");
  const expected = createHmac("sha256", SECRET).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(got, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function toolNameFromMessage(msg) {
  if (!msg || typeof msg !== "object") return null;
  if (msg.method !== "tools/call") return null;
  const params = msg.params || {};
  return params.name || params.toolName || params.tool || null;
}

const server = createServer(async (req, res) => {
  const path = (req.url || "/").split("?")[0];
  if (req.method === "GET" && (path === "/health" || path === "/")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        filter: "obot-deny-memory-ingest",
        deny: [...DENY_TOOLS],
        webhook: "/webhook",
      })
    );
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405).end("method not allowed");
    return;
  }

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  const sig = req.headers["x-obot-signature-256"];
  if (!verifySignature(raw, sig)) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_signature" }));
    return;
  }

  let msg;
  try {
    msg = JSON.parse(raw.toString("utf8"));
  } catch {
    res.writeHead(400).end("invalid json");
    return;
  }

  const tool = toolNameFromMessage(msg);
  const leaf = tool ? String(tool).split(/[./]/).pop() : null;
  const deny =
    tool &&
    [...DENY_TOOLS].some(
      (d) => tool === d || leaf === d || String(tool).endsWith(`.${d}`)
    );

  if (deny) {
    res.writeHead(403, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        accept: false,
        reason: `Obot webhook filter blocked tool: ${tool}`,
      })
    );
    return;
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ status: "accepted", accept: true }));
});

server.listen(PORT, "0.0.0.0", () => {
  process.stderr.write(
    `[obot-deny-memory-ingest-webhook] ready http://0.0.0.0:${PORT}/webhook deny=${[...DENY_TOOLS].join(",")}\n`
  );
});
