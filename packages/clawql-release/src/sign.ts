import { createPrivateKey, generateKeyPairSync, sign, verify, createPublicKey } from "node:crypto";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { runCommand, commandExists } from "./exec.js";

export type ReleaseSigningKey = {
  algorithm: "ed25519";
  publicKeyHex: string;
  privateKeyPem: string;
  publicKeyPem: string;
};

export function releaseKeysDir(rootDir: string): string {
  return join(rootDir, ".clawql", "keys");
}

export async function ensureReleaseSigningKey(rootDir: string): Promise<ReleaseSigningKey> {
  const dir = releaseKeysDir(rootDir);
  await mkdir(dir, { recursive: true });
  const privPath = join(dir, "release-ed25519.pem");
  const pubPath = join(dir, "release-ed25519.pub.pem");
  try {
    const privateKeyPem = await readFile(privPath, "utf8");
    const publicKeyPem = await readFile(pubPath, "utf8");
    const pub = createPublicKey(publicKeyPem);
    const spki = pub.export({ type: "spki", format: "der" });
    return {
      algorithm: "ed25519",
      publicKeyHex: Buffer.from(spki).toString("hex"),
      privateKeyPem,
      publicKeyPem,
    };
  } catch {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    await writeFile(privPath, privateKeyPem, "utf8");
    await chmod(privPath, 0o600);
    await writeFile(pubPath, publicKeyPem, "utf8");
    const spki = publicKey.export({ type: "spki", format: "der" });
    return {
      algorithm: "ed25519",
      publicKeyHex: Buffer.from(spki).toString("hex"),
      privateKeyPem,
      publicKeyPem,
    };
  }
}

export function signBytes(privateKeyPem: string, data: Buffer | string): string {
  const key = createPrivateKey(privateKeyPem);
  const sig = sign(null, typeof data === "string" ? Buffer.from(data, "utf8") : data, key);
  return sig.toString("hex");
}

export function verifyBytes(publicKeyPem: string, data: Buffer | string, signatureHex: string): boolean {
  try {
    const key = createPublicKey(publicKeyPem);
    return verify(
      null,
      typeof data === "string" ? Buffer.from(data, "utf8") : data,
      key,
      Buffer.from(signatureHex, "hex")
    );
  } catch {
    return false;
  }
}

export async function signFile(
  privateKeyPem: string,
  absPath: string
): Promise<{ signatureHex: string; sha256: string }> {
  const { createHash } = await import("node:crypto");
  const buf = await readFile(absPath);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const signatureHex = signBytes(privateKeyPem, buf);
  return { signatureHex, sha256 };
}

/**
 * Enable signed commits by default for this repo when a signing identity is available.
 * Prefers existing gpg/ssh signing config; otherwise configures SSH signing with a
 * ClawQL-managed ed25519 key under `.clawql/keys/`.
 */
export async function enableSignedCommitsByDefault(rootDir: string): Promise<{
  enabled: boolean;
  format?: "openpgp" | "ssh";
  detail: string;
}> {
  const existingSign = runCommand("git", ["config", "--get", "commit.gpgsign"], {
    cwd: rootDir,
    allowFailure: true,
  }).stdout;
  if (existingSign.toLowerCase() === "true") {
    const format = runCommand("git", ["config", "--get", "gpg.format"], {
      cwd: rootDir,
      allowFailure: true,
    }).stdout;
    return {
      enabled: true,
      format: format === "ssh" ? "ssh" : "openpgp",
      detail: "commit.gpgsign already enabled",
    };
  }

  // Prefer user signing key already configured
  const signingKey = runCommand("git", ["config", "--get", "user.signingkey"], {
    cwd: rootDir,
    allowFailure: true,
  }).stdout;
  if (signingKey) {
    runCommand("git", ["config", "commit.gpgsign", "true"], { cwd: rootDir });
    return { enabled: true, format: "openpgp", detail: `enabled with existing signingkey` };
  }

  // Configure SSH signing with a managed key (git >= 2.34)
  const dir = releaseKeysDir(rootDir);
  await mkdir(dir, { recursive: true });
  const sshKey = join(dir, "git-commit-ssh");
  if (!(await fileExists(sshKey))) {
    if (commandExists("ssh-keygen")) {
      runCommand("ssh-keygen", ["-t", "ed25519", "-f", sshKey, "-N", "", "-C", "clawql-release-signing"], {
        cwd: rootDir,
      });
    } else {
      return {
        enabled: false,
        detail: "no signing key and ssh-keygen unavailable — commits will not be signed",
      };
    }
  }

  runCommand("git", ["config", "gpg.format", "ssh"], { cwd: rootDir });
  runCommand("git", ["config", "user.signingkey", sshKey], { cwd: rootDir });
  runCommand("git", ["config", "commit.gpgsign", "true"], { cwd: rootDir });
  // Allow the key for verification locally
  const allowed = join(dir, "allowed_signers");
  const pub = await readFile(`${sshKey}.pub`, "utf8").catch(() => "");
  if (pub) {
    const email =
      runCommand("git", ["config", "--get", "user.email"], { cwd: rootDir, allowFailure: true })
        .stdout || "clawql-release@localhost";
    await writeFile(allowed, `${email} ${pub.trim()}\n`, "utf8");
    runCommand("git", ["config", "gpg.ssh.allowedSignersFile", allowed], { cwd: rootDir });
  }

  return { enabled: true, format: "ssh", detail: `configured SSH signing key at ${sshKey}` };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

/** Run `git commit` with `-S` when signing is enabled (default). */
export function signedGitCommit(
  rootDir: string,
  message: string,
  opts: { allowUnsigned?: boolean; paths?: string[] } = {}
): void {
  if (opts.paths?.length) {
    runCommand("git", ["add", ...opts.paths], { cwd: rootDir });
  }
  const args = ["commit", "-S", "-m", message];
  if (opts.allowUnsigned) {
    // Fall back without -S if signing fails
    const r = runCommand("git", args, { cwd: rootDir, allowFailure: true });
    if (r.status !== 0) {
      runCommand("git", ["commit", "-m", message], { cwd: rootDir });
    }
    return;
  }
  runCommand("git", args, { cwd: rootDir });
}

/**
 * Attempt cosign sign-blob / verify for an artifact when cosign is installed.
 */
export async function cosignSignBlob(
  absPath: string,
  opts: { dryRun?: boolean } = {}
): Promise<{ ok: boolean; signaturePath?: string; detail: string }> {
  if (opts.dryRun || !commandExists("cosign")) {
    return {
      ok: false,
      detail: opts.dryRun ? "dry-run: skipped cosign" : "cosign not found — use Ed25519 release signatures",
    };
  }
  const sigPath = `${absPath}.sig`;
  const r = runCommand("cosign", ["sign-blob", "--yes", "--output-signature", sigPath, absPath], {
    allowFailure: true,
  });
  if (r.status !== 0) {
    return { ok: false, detail: r.stderr || r.stdout || "cosign sign-blob failed" };
  }
  return { ok: true, signaturePath: sigPath, detail: `signed ${absPath}` };
}
