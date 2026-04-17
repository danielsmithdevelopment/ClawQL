/**
 * Minimal Cuckoo filter (Fan et al.–style) for approximate set membership on string keys
 * (e.g. vault `chunk_id`). Serialized to a BLOB for `memory.db` / Postgres (issue #25).
 */

import { createHash } from "node:crypto";

const MAGIC = Buffer.from("CLCF", "ascii");
const SERIAL_VERSION = 1;
const BUCKET_SIZE = 4;
const MAX_RELOCATIONS = 500;

function nextPow2(n: number): number {
  if (n <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(n));
}

function mask(bits: number): number {
  return (1 << bits) - 1;
}

/** f-bit fingerprint, never zero (zero is reserved for empty slot). */
export function fingerprintFromKey(key: string, fpBits: number): number {
  const h = createHash("sha256").update(key, "utf8").digest();
  let fp = h.readUInt32BE(4) & mask(fpBits);
  if (fp === 0) fp = 1;
  return fp;
}

function hashFpForXor(fp: number, fpBits: number): number {
  const h = createHash("sha256").update(`cuckoo:fp:${fpBits}:${fp}`).digest();
  return h.readUInt32BE(0);
}

export class CuckooFilter {
  readonly bucketCount: number;
  readonly fingerprintBits: number;
  /** Flat: bucketCount * BUCKET_SIZE slots, 0 = empty */
  private readonly slots: Uint16Array;
  /** Non-empty slots (may exceed logical inserts if relocations duplicated — use for metrics only). */
  private itemCount = 0;

  constructor(bucketCount: number, fingerprintBits: number) {
    if (bucketCount < 8 || (bucketCount & (bucketCount - 1)) !== 0) {
      throw new Error("CuckooFilter: bucketCount must be a power of 2 and >= 8");
    }
    if (fingerprintBits < 8 || fingerprintBits > 16) {
      throw new Error("CuckooFilter: fingerprintBits must be in [8, 16]");
    }
    this.bucketCount = bucketCount;
    this.fingerprintBits = fingerprintBits;
    this.slots = new Uint16Array(bucketCount * BUCKET_SIZE);
  }

  private index1(key: string): number {
    const h = createHash("sha256").update(key, "utf8").digest();
    return h.readUInt32BE(0) & (this.bucketCount - 1);
  }

  private altIndex(bucket: number, fp: number): number {
    return (bucket ^ (hashFpForXor(fp, this.fingerprintBits) & (this.bucketCount - 1))) >>> 0;
  }

  private slotIndex(bucket: number, slot: number): number {
    return bucket * BUCKET_SIZE + slot;
  }

  private tryPutFp(bucket: number, fp: number): boolean {
    const base = bucket * BUCKET_SIZE;
    for (let s = 0; s < BUCKET_SIZE; s++) {
      if (this.slots[base + s] === 0) {
        this.slots[base + s] = fp;
        this.itemCount++;
        return true;
      }
    }
    return false;
  }

  private bucketHasFp(bucket: number, fp: number): boolean {
    const base = bucket * BUCKET_SIZE;
    for (let s = 0; s < BUCKET_SIZE; s++) {
      if (this.slots[base + s] === fp) return true;
    }
    return false;
  }

  /** Insert one key; returns false if structure is too full (caller should grow and retry). */
  insert(key: string): boolean {
    const fp = fingerprintFromKey(key, this.fingerprintBits);
    const b1 = this.index1(key);
    const b2 = this.altIndex(b1, fp);
    if (this.tryPutFp(b1, fp)) return true;
    if (this.tryPutFp(b2, fp)) return true;

    let b = Math.random() < 0.5 ? b1 : b2;
    let curFp = fp;
    for (let n = 0; n < MAX_RELOCATIONS; n++) {
      const slot = (Math.random() * BUCKET_SIZE) | 0;
      const si = this.slotIndex(b, slot);
      const evicted = this.slots[si];
      if (evicted === 0) {
        this.slots[si] = curFp;
        this.itemCount++;
        return true;
      }
      this.slots[si] = curFp;
      curFp = evicted;
      b = this.altIndex(b, curFp);
      if (this.tryPutFp(b, curFp)) return true;
    }
    return false;
  }

  /** False-negative free only if key was inserted; may return true for absent keys. */
  maybeContains(key: string): boolean {
    const fp = fingerprintFromKey(key, this.fingerprintBits);
    const i1 = this.index1(key);
    const i2 = this.altIndex(i1, fp);
    return this.bucketHasFp(i1, fp) || this.bucketHasFp(i2, fp);
  }

  get size(): number {
    return this.itemCount;
  }

  serialize(): Uint8Array {
    const header = Buffer.alloc(24);
    MAGIC.copy(header, 0);
    header.writeUInt16LE(SERIAL_VERSION, 4);
    header.writeUInt16LE(this.fingerprintBits, 6);
    header.writeUInt32LE(this.bucketCount, 8);
    header.writeUInt32LE(this.itemCount, 12);
    header.writeUInt32LE(BUCKET_SIZE, 16);
    header.writeUInt32LE(0, 20);
    const body = Buffer.from(this.slots.buffer, this.slots.byteOffset, this.slots.byteLength);
    return new Uint8Array(Buffer.concat([header, body]));
  }

  static deserialize(buf: Uint8Array): CuckooFilter {
    if (buf.length < 24) throw new Error("CuckooFilter: truncated header");
    const header = Buffer.from(buf.buffer, buf.byteOffset, 24);
    if (header.subarray(0, 4).compare(MAGIC) !== 0) {
      throw new Error("CuckooFilter: bad magic");
    }
    const ver = header.readUInt16LE(4);
    if (ver !== SERIAL_VERSION) throw new Error(`CuckooFilter: unsupported version ${ver}`);
    const fpBits = header.readUInt16LE(6);
    const bucketCount = header.readUInt32LE(8);
    const bucketSize = header.readUInt32LE(16);
    if (bucketSize !== BUCKET_SIZE) throw new Error("CuckooFilter: bucket size mismatch");
    const expected = 24 + bucketCount * BUCKET_SIZE * 2;
    if (buf.length < expected) throw new Error("CuckooFilter: truncated body");
    const f = new CuckooFilter(bucketCount, fpBits);
    const dv = new DataView(buf.buffer, buf.byteOffset + 24, bucketCount * BUCKET_SIZE * 2);
    for (let i = 0; i < f.slots.length; i++) {
      f.slots[i] = dv.getUint16(i * 2, true);
    }
    let c = 0;
    for (let i = 0; i < f.slots.length; i++) {
      if (f.slots[i] !== 0) c++;
    }
    f.itemCount = c;
    return f;
  }

  /** Rebuild a filter containing all keys (e.g. chunk ids); grows buckets until insertion succeeds. */
  static fromKeys(keys: readonly string[], options?: { fingerprintBits?: number }): CuckooFilter {
    const fpBits = options?.fingerprintBits ?? 12;
    const uniq = [...new Set(keys)];
    let bucketCount = nextPow2(Math.max(64, Math.ceil(uniq.length / 0.9 / BUCKET_SIZE)));
    for (let grow = 0; grow < 24; grow++) {
      const f = new CuckooFilter(bucketCount, fpBits);
      let ok = true;
      for (const k of uniq) {
        if (!f.insert(k)) {
          ok = false;
          break;
        }
      }
      if (ok) return f;
      bucketCount *= 2;
    }
    throw new Error("CuckooFilter.fromKeys: could not build filter");
  }
}
