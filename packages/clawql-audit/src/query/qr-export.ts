/**
 * QR air-gap export: CBOR → RaptorQ fountain → ChaCha20-Poly1305 → HMAC → QR (ECC M).
 * Keys from env/KMS only — never from request body.
 */

import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import cbor from "cbor";
import { Effect } from "effect";
import QRCode from "qrcode";
import type { WORMEntry } from "../entry.js";
import { AuditError } from "../errors.js";

export type QRExportConfig = {
  chunkSizeBytes?: number;
  /** Redundancy factor ≥ 1 (default 1.5). Extra repair packets ≈ (factor - 1) × source packets. */
  redundancy?: number;
  qrVersion?: number;
  /** Override env for tests. */
  encryptionKeyHex?: string;
  hmacKeyHex?: string;
};

export type QRChunkPayload = {
  index: number;
  total: number;
  data: string;
  hmac: string;
  chainRoot: string;
};

export type QRExportResult = {
  chunkCount: number;
  /** Data-URL PNG QR codes (ECC M). */
  qrCodes: string[];
  chainRoot: string;
  exportedAt: string;
  transferLength: number;
};

const requireEnv = (name: string, override?: string): Effect.Effect<string, AuditError> =>
  Effect.gen(function* () {
    const v = override?.trim() || process.env[name]?.trim();
    if (!v) {
      return yield* Effect.fail(
        new AuditError({
          reason: `${name} must be set (32-byte hex) before QR export`,
        })
      );
    }
    if (!/^[0-9a-fA-F]{64}$/.test(v)) {
      return yield* Effect.fail(
        new AuditError({ reason: `${name} must be 64 hex chars (32 bytes)` })
      );
    }
    return v;
  });

function chacha20Encrypt(plaintext: Uint8Array, key: Buffer): Effect.Effect<Buffer, AuditError> {
  return Effect.try({
    try: () => {
      const iv = randomBytes(12);
      const cipher = createCipheriv("chacha20-poly1305", key, iv, {
        authTagLength: 16,
      });
      const enc = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
      const tag = cipher.getAuthTag();
      return Buffer.concat([iv, tag, enc]);
    },
    catch: (cause) =>
      new AuditError({ reason: "ChaCha20 encrypt failed", cause }),
  });
}

function hmacSha256Hex(data: Buffer, key: Buffer): Effect.Effect<string> {
  return Effect.sync(() => createHmac("sha256", key).update(data).digest("hex"));
}

type RaptorqModule = {
  initSync: (module: Buffer) => unknown;
  Encoder: {
    with_defaults: (data: Uint8Array, mtu: number) => {
      encode: (repairPacketsPerBlock: number) => Uint8Array[];
      free: () => void;
    };
  };
};

function findRaptorqFiles(): { js: string; wasm: string } {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    const js = join(dir, "node_modules", "raptorq", "raptorq.js");
    const wasm = join(dir, "node_modules", "raptorq", "raptorq_bg.wasm");
    if (existsSync(js) && existsSync(wasm)) return { js, wasm };
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("raptorq package not found under node_modules");
}

async function loadRaptorq(): Promise<RaptorqModule> {
  const { js, wasm } = findRaptorqFiles();
  const mod = (await import(pathToFileURL(js).href)) as RaptorqModule;
  mod.initSync(readFileSync(wasm));
  return mod;
}

/** RaptorQ WASM requires MTU ≥ 64 in practice. */
const MIN_MTU = 64;

export const exportToQR = (
  entries: readonly WORMEntry[],
  config: QRExportConfig = {}
): Effect.Effect<QRExportResult, AuditError> =>
  Effect.gen(function* () {
    if (entries.length === 0) {
      return yield* Effect.fail(new AuditError({ reason: "QR export requires at least one entry" }));
    }

    const encryptionKeyHex = yield* requireEnv(
      "CLAWQL_AUDIT_QR_ENCRYPTION_KEY",
      config.encryptionKeyHex
    );
    const hmacKeyHex = yield* requireEnv("CLAWQL_AUDIT_QR_HMAC_KEY", config.hmacKeyHex);
    const encryptionKey = Buffer.from(encryptionKeyHex, "hex");
    const hmacKey = Buffer.from(hmacKeyHex, "hex");

    const payload = Buffer.from(cbor.encode(entries));
    const mtu = Math.max(MIN_MTU, config.chunkSizeBytes ?? 1200);
    const redundancy = config.redundancy ?? 1.5;

    const raptorq = yield* Effect.tryPromise({
      try: () => loadRaptorq(),
      catch: (cause) =>
        new AuditError({ reason: "Failed to load raptorq WASM", cause }),
    });

    const packets = yield* Effect.try({
      try: () => {
        const encoder = raptorq.Encoder.with_defaults(new Uint8Array(payload), mtu);
        try {
          const sourceEstimate = Math.max(1, Math.ceil(payload.length / mtu));
          const repair = Math.max(0, Math.ceil(sourceEstimate * (redundancy - 1)));
          return encoder.encode(repair);
        } finally {
          encoder.free();
        }
      },
      catch: (cause) =>
        new AuditError({ reason: "RaptorQ encode failed", cause }),
    });

    const chainRoot = entries[entries.length - 1]!.hash;
    const authenticated: QRChunkPayload[] = [];

    for (let i = 0; i < packets.length; i++) {
      const encrypted = yield* chacha20Encrypt(packets[i]!, encryptionKey);
      const hmac = yield* hmacSha256Hex(encrypted, hmacKey);
      authenticated.push({
        index: i,
        total: packets.length,
        data: encrypted.toString("base64"),
        hmac,
        chainRoot,
      });
    }

    const qrVersion = config.qrVersion;
    const qrCodes = yield* Effect.tryPromise({
      try: () =>
        Promise.all(
          authenticated.map((chunk) =>
            QRCode.toDataURL(JSON.stringify(chunk), {
              errorCorrectionLevel: "M",
              ...(qrVersion !== undefined ? { version: qrVersion } : {}),
              margin: 1,
            })
          )
        ),
      catch: (cause) =>
        new AuditError({ reason: "QR code generation failed", cause }),
    });

    return {
      chunkCount: qrCodes.length,
      qrCodes,
      chainRoot,
      exportedAt: new Date().toISOString(),
      transferLength: payload.length,
    };
  });
