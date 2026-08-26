import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exportPKCS8, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";

const binDir = join(dirname(fileURLToPath(import.meta.url)), "..", "bin");
const signCmd = join(binDir, "id-jag-sign-cmd.mjs");

function runSignCmd(
  pem: string,
  payload: { claims: Record<string, unknown>; header: { alg: string; kid?: string } }
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [signCmd], {
      env: {
        ...process.env,
        CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM: pem,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += c.toString();
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

describe("id-jag-sign-cmd.mjs contract", () => {
  it("signs stdin JSON to compact JWS on stdout", async () => {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const result = await runSignCmd(pem, {
      claims: { sub: "user-1", iss: "https://issuer.test" },
      header: { alg: "RS256", kid: "cmd-kid" },
    });
    expect(result.code).toBe(0);
    expect(result.stdout.trim().split(".")).toHaveLength(3);
  });

  it("reads PEM from path env", async () => {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const dir = await mkdtemp(join(tmpdir(), "clawql-tee-cmd-"));
    const keyPath = join(dir, "key.pem");
    await writeFile(keyPath, pem);

    const result = await new Promise<{ code: number | null; stdout: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [signCmd], {
        env: {
          ...process.env,
          CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM: "",
          CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM_PATH: keyPath,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      child.stdout.on("data", (c) => {
        stdout += c.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout }));
      child.stdin.write(
        JSON.stringify({
          claims: { sub: "path-key" },
          header: { alg: "RS256" },
        })
      );
      child.stdin.end();
    });

    expect(result.code).toBe(0);
    expect(result.stdout.trim().split(".")).toHaveLength(3);
  });
});
