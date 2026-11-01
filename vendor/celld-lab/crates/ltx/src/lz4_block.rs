//! Byte-compatible LZ4 block compression for `superfly/ltx` v0.5.2.
//!
//! This is a Rust port of `pierrec/lz4` v4.1.23's fast block compressor.
//! `superfly/ltx` uses that implementation, and valid LZ4 encoders can choose
//! different matches. The ordinary `lz4_flex` encoder is format-compatible but
//! does not produce the same bytes, so the LTX writer needs this small pinned
//! implementation to preserve an exact-file compatibility contract.
//!
//! Copyright (c) 2015, Pierre Curto. The source is available under the BSD
//! 3-Clause license. See `LICENSE.pierrec-lz4` in this crate.

const MIN_MATCH: usize = 4;
const WINDOW_LOG: usize = 16;
const WINDOW_SIZE: usize = 1 << WINDOW_LOG;
const WINDOW_MASK: usize = WINDOW_SIZE - 1;
const HASH_LOG: usize = 16;
const HASH_SIZE: usize = 1 << HASH_LOG;
const MATCH_FIND_LIMIT: usize = 10 + MIN_MATCH;

/// The reusable state for the exact upstream fast compressor.
pub(crate) struct Compressor {
    table: Vec<u16>,
    in_use: Vec<u32>,
}

impl Default for Compressor {
    fn default() -> Self {
        Self {
            table: vec![0; HASH_SIZE],
            in_use: vec![0; HASH_SIZE / 32],
        }
    }
}

impl Compressor {
    /// Compresses one independent block with the algorithm used by
    /// `github.com/pierrec/lz4/v4@v4.1.23`.
    pub(crate) fn compress(&mut self, src: &[u8]) -> Vec<u8> {
        self.in_use.fill(0);

        let mut dst = vec![0; compress_bound(src.len())];
        let mut si = 0usize;
        let mut di = 0usize;
        let mut anchor = 0usize;
        let sn = src.len().saturating_sub(MATCH_FIND_LIMIT);

        if src.len() > MATCH_FIND_LIMIT {
            while si < sn {
                let matched = read_u64_le(src, si);
                let mut hash = block_hash(matched);
                let hash2 = block_hash(matched >> 8);

                let mut reference = self.get(hash, si);
                let reference2 = self.get(hash2, si + 1);
                self.put(hash, si);
                self.put(hash2, si + 1);

                let mut offset = si as isize - reference;
                if !matches_at(src, matched as u32, reference, offset) {
                    hash = block_hash(matched >> 16);
                    let reference3 = self.get(hash, si + 2);

                    si += 1;
                    reference = reference2;
                    offset = si as isize - reference;
                    if !matches_at(src, (matched >> 8) as u32, reference, offset) {
                        si += 1;
                        reference = reference3;
                        offset = si as isize - reference;
                        self.put(hash, si);
                        if !matches_at(src, (matched >> 16) as u32, reference, offset) {
                            si += 2 + ((si - anchor) >> 7);
                            continue;
                        }
                    }
                }

                let offset = offset as usize;
                let mut literal_len = si - anchor;
                let mut match_len = MIN_MATCH;

                let mut target = si as isize - offset as isize - 1;
                while literal_len > 0 && target >= 0 && src[si - 1] == src[target as usize] {
                    si -= 1;
                    target -= 1;
                    literal_len -= 1;
                    match_len += 1;
                }

                let match_base = si + MIN_MATCH;
                si += match_len;
                while si + 8 <= sn {
                    let diff = read_u64_le(src, si) ^ read_u64_le(src, si - offset);
                    if diff == 0 {
                        si += 8;
                    } else {
                        si += diff.trailing_zeros() as usize >> 3;
                        break;
                    }
                }
                match_len = si - match_base;

                let token_offset = di;
                dst[token_offset] = match_len.min(0x0f) as u8;
                di += 1;
                if literal_len < 0x0f {
                    dst[token_offset] |= (literal_len << 4) as u8;
                } else {
                    dst[token_offset] |= 0xf0;
                    di = write_length(&mut dst, di, literal_len - 0x0f);
                }

                dst[di..di + literal_len].copy_from_slice(&src[anchor..anchor + literal_len]);
                di += literal_len;
                dst[di..di + 2].copy_from_slice(&(offset as u16).to_le_bytes());
                di += 2;
                anchor = si;

                if match_len >= 0x0f {
                    di = write_length(&mut dst, di, match_len - 0x0f);
                }
                if si >= sn {
                    break;
                }

                hash = block_hash(read_u64_le(src, si - 2));
                self.put(hash, si - 2);
            }
        }

        let mut literal_len = src.len() - anchor;
        if literal_len < 0x0f {
            dst[di] = (literal_len << 4) as u8;
        } else {
            dst[di] = 0xf0;
            di += 1;
            while literal_len >= 0xff + 0x0f {
                dst[di] = 0xff;
                di += 1;
                literal_len -= 0xff;
            }
            dst[di] = (literal_len - 0x0f) as u8;
        }
        di += 1;
        di += copy_into(&mut dst[di..], &src[anchor..]);
        dst.truncate(di);
        dst
    }

    fn get(&self, hash: u32, si: usize) -> isize {
        let hash = hash as usize & (HASH_SIZE - 1);
        let mut pos = 0isize;
        if self.in_use[hash / 32] & (1 << (hash % 32)) != 0 {
            pos = self.table[hash] as isize;
        }
        pos += (si & !WINDOW_MASK) as isize;
        if pos >= si as isize {
            pos -= WINDOW_SIZE as isize;
        }
        pos
    }

    fn put(&mut self, hash: u32, si: usize) {
        let hash = hash as usize & (HASH_SIZE - 1);
        self.table[hash] = si as u16;
        self.in_use[hash / 32] |= 1 << (hash % 32);
    }
}

pub(crate) fn compress_bound(n: usize) -> usize {
    n + n / 255 + 16
}

fn block_hash(value: u64) -> u32 {
    const PRIME_6_BYTES: u64 = 227_718_039_650_203;
    ((value << 16).wrapping_mul(PRIME_6_BYTES) >> (64 - HASH_LOG)) as u32
}

fn read_u64_le(src: &[u8], offset: usize) -> u64 {
    u64::from_le_bytes(src[offset..offset + 8].try_into().expect("checked read"))
}

fn matches_at(src: &[u8], value: u32, reference: isize, offset: isize) -> bool {
    offset > 0
        && offset < WINDOW_SIZE as isize
        && reference >= 0
        && value
            == u32::from_le_bytes(
                src[reference as usize..reference as usize + 4]
                    .try_into()
                    .expect("windowed read"),
            )
}

fn write_length(dst: &mut [u8], mut offset: usize, mut len: usize) -> usize {
    while len >= 0xff {
        dst[offset] = 0xff;
        offset += 1;
        len -= 0xff;
    }
    dst[offset] = len as u8;
    offset + 1
}

fn copy_into(dst: &mut [u8], src: &[u8]) -> usize {
    dst[..src.len()].copy_from_slice(src);
    src.len()
}

#[doc(hidden)]
pub mod internal {
    #[derive(Default)]
    pub struct Compressor(super::Compressor);

    impl Compressor {
        pub fn compress(&mut self, source: &[u8]) -> Vec<u8> {
            self.0.compress(source)
        }
    }
}
