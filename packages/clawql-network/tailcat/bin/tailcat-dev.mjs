#!/usr/bin/env node
/**
 * Development shim for tailcat when prebuilt binaries are unavailable.
 * Implements the subprocess contract documented in packages/clawql-network/README.md.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:net";

const args = process.argv.slice(2);
const cmd = args[0];

function keyPairLabel(seed) {
  return createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

if (cmd === "listen") {
  let derpServer;
  const allowedPublicKeys = [];
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === "--derp-server") derpServer = args[++i];
    else if (a === "--allow-pk") allowedPublicKeys.push(args[++i] ?? "");
  }
  const localKey = keyPairLabel(`listen-${Date.now()}`);
  const token = `tc+dev${randomBytes(18).toString("base64url")}`;
  const server = createServer();
  server.listen(0, "127.0.0.1", () => {
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    process.stdout.write(
      `${JSON.stringify({
        address: token,
        localPublicKey: localKey,
        listenPort: port,
        derpServer: derpServer ?? null,
        allowedPublicKeys,
      })}\n`
    );
  });
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
} else if (cmd === "connect") {
  const address = args[1];
  if (!address?.startsWith("tc+")) {
    console.error("tailcat connect: invalid address");
    process.exit(2);
  }
  const localKey = keyPairLabel(`connect-${address}`);
  const remoteKey = keyPairLabel(`remote-${address}`);
  process.stdout.write(
    `${JSON.stringify({
      address,
      localPublicKey: localKey,
      remotePublicKey: remoteKey,
      derpServer: null,
    })}\n`
  );
  setInterval(() => {}, 60_000);
} else {
  console.error("Usage: tailcat listen [--derp-server URL] [--allow-pk KEY]...");
  console.error("       tailcat connect <tc+...>");
  process.exit(2);
}
