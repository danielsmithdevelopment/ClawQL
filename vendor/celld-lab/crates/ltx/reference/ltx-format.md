# LTX file format (Version 3) — byte layout

Derived from `superfly/ltx` v0.5.2 (`ltx.go`, `checksum.go`, `encoder.go`, and
`decoder.go`). The implementation is in `src/ltx.rs`. All multi-byte integers
are **big-endian**.

## File structure

```
+----------------------+
| Header   (100 bytes) |
+----------------------+
| Page 0               |   PageHeader(6) + Size(4) + LZ4-block(page data)
| Page 1               |
| ...                  |
+----------------------+
| Empty PageHeader (6) |   pgno=0 — terminates the page block
+----------------------+
| Page index           |   varint tuples + end marker + u64 size
+----------------------+
| Trailer  (16 bytes)  |
+----------------------+
```

## Header (100 bytes)

| Offset | Size | Field | Notes |
|-------:|-----:|-------|-------|
| 0  | 4 | Magic | ASCII `"LTX1"` |
| 4  | 4 | Flags (u32) | only `HeaderFlagNoChecksum = 1<<1` is valid |
| 8  | 4 | PageSize (u32) | power of two, 512..=65536 |
| 12 | 4 | Commit (u32) | DB size after txn, in pages |
| 16 | 8 | MinTXID (u64) | |
| 24 | 8 | MaxTXID (u64) | |
| 32 | 8 | Timestamp (i64) | ms since unix epoch |
| 40 | 8 | PreApplyChecksum (u64) | 0 on snapshots (MinTXID==1) |
| 48 | 8 | WALOffset (i64) | 0 if journal |
| 56 | 8 | WALSize (i64) | 0 if journal |
| 64 | 4 | WALSalt1 (u32) | |
| 68 | 4 | WALSalt2 (u32) | |
| 72 | 8 | NodeID (u64) | |
| 80 | 20 | (reserved) | zero |

`IsSnapshot() == (MinTXID == 1)`. Snapshots include all pages and have
`PreApplyChecksum == 0`.

## Page block

Each v0.5.2 page contains a `PageHeader`, a four-byte compressed size, and one
independent raw LZ4 block. The writer uses the fast compressor from
`pierrec/lz4` v4.1.23. The block ends with an **empty PageHeader**
(`pgno == 0`).

**PageHeader (6 bytes):** `Pgno (u32 @0)`, `Flags (u16 @4)`. The
`PageHeaderFlagSize` bit (`1<<0`) marks the size-prefixed block representation.
No other flag is valid.

Files written through LTX v0.5.1 have a zero page flag and one independent LZ4
frame after each page header. A v0.5.2 decoder accepts both representations,
so existing Litestream objects remain readable.

## Page index

After the empty page header, for each page in ascending pgno order:
`uvarint(pgno) ++ uvarint(offset) ++ uvarint(size)` where `offset` is the page's
byte offset from the file start. A v0.5.2 page uses
`size = 6 + 4 + len(compressed page data)`. A legacy page omits the four-byte
size. The index ends with `uvarint(0)` and a big-endian `u64` index length. The
length includes the elements and terminator, but it excludes its own field.

## Trailer (16 bytes)

`PostApplyChecksum (u64 @0)`, `FileChecksum (u64 @8)`.

## Checksums — CRC64-ISO with the ChecksumFlag

- Hasher: **CRC64 / ISO polynomial `0xD800000000000000`**, matching Go
  `crc64.MakeTable(crc64.ISO)` (reflected; init 0; per-update invert-process-invert).
- `ChecksumFlag = 1 << 63` is OR-ed into **every** stored checksum (so it is never 0).
- `ChecksumPage(pgno, data) = ChecksumFlag | CRC64( BE_u32(pgno) ++ data )`.
- Rolling DB checksum (post-apply): start `ChecksumFlag`, then for each non-lock
  page `chksum = ChecksumFlag | (chksum ^ ChecksumPage(pgno, data))`. Verified
  against the trailer's PostApplyChecksum **only for snapshots**.
- **FileChecksum** = `ChecksumFlag | CRC64(feed)`. The v0.5.2 feed contains the
  header and each page header. It also contains each compressed-size field and
  the corresponding uncompressed page data. It then contains the empty page
  header, the page index with its size field, and the post-apply checksum. The
  compressed page bytes are not part of the feed. A legacy feed omits each
  compressed-size field.

## Filename

`<minTXID:016x>-<maxTXID:016x>.ltx`, e.g. `0000000000000001-0000000000000001.ltx`.
