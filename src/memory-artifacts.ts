/**
 * Optional Cuckoo + Merkle artifacts beside `vault_document` / `vault_chunk` (issues #25 / #37).
 */

import type { Database } from "sql.js";
import { CuckooFilter } from "./cuckoo-filter.js";
import { buildMerkleSnapshot, type MerkleDocumentRow } from "./merkle-tree.js";
import { recordCuckooRebuild } from "./memory-cuckoo-metrics.js";
import { ensurePgVectorSchema, getPostgresVectorPool } from "./vector-store/pgvector.js";

export function cuckooMembershipArtifactsEnabled(): boolean {
  return process.env.CLAWQL_CUCKOO_ENABLED === "1";
}

export function merkleIntegrityArtifactsEnabled(): boolean {
  return process.env.CLAWQL_MERKLE_ENABLED === "1";
}

function envFingerprintBits(): number {
  const v = process.env.CLAWQL_CUCKOO_FINGERPRINT_BITS?.trim();
  if (!v) return 12;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return 12;
  return Math.min(16, Math.max(8, n));
}

export type MemoryArtifactPayload = {
  cuckooBlob: Uint8Array | null;
  merkle: { rootHex: string; leafCount: number; treeHeight: number } | null;
};

/**
 * Run inside the same sql.js transaction after `vault_*` rows are written.
 * No-op if both feature flags are off.
 */
export function rebuildSqliteMemoryArtifacts(db: Database): MemoryArtifactPayload {
  const cuckooOn = cuckooMembershipArtifactsEnabled();
  const merkleOn = merkleIntegrityArtifactsEnabled();
  if (!cuckooOn && !merkleOn) {
    return { cuckooBlob: null, merkle: null };
  }

  const now = new Date().toISOString();
  let cuckooBlob: Uint8Array | null = null;
  let merkle: MemoryArtifactPayload["merkle"] = null;

  if (cuckooOn) {
    const ids: string[] = [];
    const sel = db.prepare("SELECT chunk_id FROM vault_chunk");
    while (sel.step()) {
      const row = sel.getAsObject() as { chunk_id: string };
      ids.push(row.chunk_id);
    }
    sel.free();
    const fpBits = envFingerprintBits();
    const filter = CuckooFilter.fromKeys(ids, { fingerprintBits: fpBits });
    cuckooBlob = filter.serialize();
    recordCuckooRebuild({
      at: now,
      chunkKeyCount: ids.length,
      fingerprintBits: fpBits,
      bucketCount: filter.bucketCount,
      filterSlotOccupancy: filter.size,
    });
    db.run(`DELETE FROM clawql_cuckoo_chunk_membership`);
    db.run(
      `INSERT INTO clawql_cuckoo_chunk_membership (id, filter_blob, updated_at) VALUES (1, ?, ?)`,
      [cuckooBlob, now]
    );
  }

  if (merkleOn) {
    const rows: MerkleDocumentRow[] = [];
    const sel = db.prepare("SELECT path, body_sha256 FROM vault_document ORDER BY path");
    while (sel.step()) {
      const row = sel.getAsObject() as { path: string; body_sha256: string };
      rows.push({ path: row.path, bodySha256Hex: row.body_sha256 });
    }
    sel.free();
    const snap = buildMerkleSnapshot(rows);
    merkle = {
      rootHex: snap.rootHex,
      leafCount: snap.leafCount,
      treeHeight: snap.treeHeight,
    };
    db.run(`DELETE FROM vault_merkle_snapshot`);
    db.run(
      `INSERT INTO vault_merkle_snapshot (id, root_hex, leaf_count, tree_height, built_at) VALUES (1, ?, ?, ?, ?)`,
      [snap.rootHex, snap.leafCount, snap.treeHeight, now]
    );
  }

  return { cuckooBlob, merkle };
}

export async function syncMemoryArtifactsToPostgres(
  cuckooBlob: Uint8Array | null,
  merkle: { rootHex: string; leafCount: number; treeHeight: number } | null
): Promise<void> {
  const pool = getPostgresVectorPool();
  if (!pool) return;
  if (!cuckooBlob && !merkle) return;

  const client = await pool.connect();
  try {
    await ensurePgVectorSchema(client);
    if (cuckooBlob) {
      await client.query(
        `INSERT INTO clawql_cuckoo_chunk_membership (id, filter_blob, updated_at)
         VALUES (1, $1, NOW())
         ON CONFLICT (id) DO UPDATE SET filter_blob = EXCLUDED.filter_blob, updated_at = NOW()`,
        [Buffer.from(cuckooBlob)]
      );
    }
    if (merkle) {
      await client.query(
        `INSERT INTO clawql_vault_merkle (id, root_hex, leaf_count, tree_height, built_at)
         VALUES (1, $1, $2, $3, NOW())
         ON CONFLICT (id) DO UPDATE SET
           root_hex = EXCLUDED.root_hex,
           leaf_count = EXCLUDED.leaf_count,
           tree_height = EXCLUDED.tree_height,
           built_at = NOW()`,
        [merkle.rootHex, merkle.leafCount, merkle.treeHeight]
      );
    }
  } finally {
    client.release();
  }
}
