#!/usr/bin/env node
/**
 * Reference external ID-JAG signer for CLAWQL_ID_JAG_TEE_SIGN_CMD.
 *
 * Contract:
 * - stdin: JSON `{ "claims": JWTPayload, "header": { alg, kid?, typ? } }`
 * - stdout: compact JWS (three dot-separated segments)
 * - stderr: optional diagnostics (ignored by parent on success)
 *
 * Key material (first match):
 * - CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM
 * - CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM_PATH
 * - CLAWQL_MCP_OAUTH_PRIVATE_KEY_PEM
 * - CLAWQL_MCP_OAUTH_PRIVATE_KEY_PEM_PATH
 */

import { readFileSync } from "node:fs";
import { SignJWT, importPKCS8 } from "jose";

function readPem() {
  const inline =
    process.env.CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM?.trim() ||
    process.env.CLAWQL_MCP_OAUTH_PRIVATE_KEY_PEM?.trim();
  if (inline) return inline;
  const path =
    process.env.CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM_PATH?.trim() ||
    process.env.CLAWQL_MCP_OAUTH_PRIVATE_KEY_PEM_PATH?.trim();
  if (path) return readFileSync(path, "utf8");
  throw new Error(
    "missing_signing_key: set CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM or _PATH (or MCP OAuth PEM vars)"
  );
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    throw new Error("empty_stdin");
  }
  const body = JSON.parse(raw);
  if (!body.header?.alg) {
    throw new Error("missing_header_alg");
  }
  const pem = readPem();
  const key = await importPKCS8(pem, body.header.alg);
  const jwt = await new SignJWT(body.claims)
    .setProtectedHeader({
      alg: body.header.alg,
      ...(body.header.kid ? { kid: body.header.kid } : {}),
      ...(body.header.typ ? { typ: body.header.typ } : {}),
    })
    .sign(key);
  process.stdout.write(jwt);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
