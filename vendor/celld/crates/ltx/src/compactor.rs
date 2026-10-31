//! A streaming port of `superfly/ltx` v0.5.2 `Compactor`.
//!
//! The compactor keeps one decompressed page per input. It does not build a
//! database-sized page map. Inputs must be ordered by transaction range.

use crate::codec::{Decoder, Encoder};
use crate::error::{Error, Result};
use crate::ltx::{Header, PageHeader, Trailer, VERSION};
use crate::TXID;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};

/// The current progress of a compaction.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CompactorStatus {
    /// The last page number processed by the merge.
    pub page_number: u32,
    /// The final input's commit page count.
    pub total: u32,
}

impl CompactorStatus {
    pub fn is_zero(self) -> bool {
        self.page_number == 0 && self.total == 0
    }

    pub fn fraction(self) -> f64 {
        if self.total == 0 {
            0.0
        } else {
            f64::from(self.page_number) / f64::from(self.total)
        }
    }
}

/// Merges ordered LTX inputs into one byte-compatible LTX output.
pub struct Compactor<W, R> {
    encoder: Encoder<W>,
    inputs: Vec<CompactorInput<R>>,
    page_number: AtomicU32,
    total: AtomicU32,

    /// Flags to set on the compacted LTX header.
    pub header_flags: u32,
    /// Allows gaps in the ordered input transaction ranges.
    pub allow_non_contiguous_txids: bool,
}

impl<W: Write, R: Read> Compactor<W, R> {
    pub fn new(writer: W, readers: Vec<R>) -> Self {
        Self {
            encoder: Encoder::new_block(writer),
            inputs: readers
                .into_iter()
                .map(|reader| CompactorInput {
                    decoder: Decoder::new(reader),
                    page: None,
                    data: Vec::new(),
                })
                .collect(),
            page_number: AtomicU32::new(0),
            total: AtomicU32::new(0),
            header_flags: 0,
            allow_non_contiguous_txids: false,
        }
    }

    pub fn header(&self) -> Header {
        self.encoder.header
    }

    pub fn trailer(&self) -> Trailer {
        self.encoder.trailer
    }

    pub fn status(&self) -> CompactorStatus {
        CompactorStatus {
            page_number: self.page_number.load(Ordering::Relaxed),
            total: self.total.load(Ordering::Relaxed),
        }
    }

    pub fn writer(&self) -> &W {
        &self.encoder.writer
    }

    pub fn writer_mut(&mut self) -> &mut W {
        &mut self.encoder.writer
    }

    pub fn into_writer(self) -> W {
        self.encoder.writer
    }

    pub fn compact(&mut self) -> Result<()> {
        if self.inputs.is_empty() {
            return Err(Error::LTXCorrupted);
        }

        for input in &mut self.inputs {
            input.decoder.decode_header()?;
        }

        for index in 1..self.inputs.len() {
            let previous = self.inputs[index - 1].decoder.header;
            let current = self.inputs[index].decoder.header;
            if previous.page_size != current.page_size {
                return Err(Error::LTXCorrupted);
            }
            if !self.allow_non_contiguous_txids
                && !is_contiguous(previous.max_txid, current.min_txid, current.max_txid)
            {
                return Err(Error::LTXCorrupted);
            }
        }

        let first = self.inputs[0].decoder.header;
        let last = self.inputs[self.inputs.len() - 1].decoder.header;
        self.encoder.encode_header(Header {
            version: VERSION,
            flags: self.header_flags,
            page_size: first.page_size,
            commit: last.commit,
            min_txid: first.min_txid,
            max_txid: last.max_txid,
            timestamp: last.timestamp,
            pre_apply_checksum: first.pre_apply_checksum,
            ..Header::default()
        })?;
        self.total.store(last.commit, Ordering::Relaxed);

        for input in &mut self.inputs {
            input.data.resize(first.page_size as usize, 0);
        }

        loop {
            let Some(page_number) = self.fill_page_buffers()? else {
                break;
            };
            self.write_page_buffer(page_number)?;
            self.page_number.store(page_number, Ordering::Relaxed);
        }

        for input in &mut self.inputs {
            input.decoder.close()?;
        }

        let post_apply_checksum = self.inputs[self.inputs.len() - 1]
            .decoder
            .trailer
            .post_apply_checksum;
        self.encoder.close(post_apply_checksum)
    }

    fn fill_page_buffers(&mut self) -> Result<Option<u32>> {
        let mut minimum = None;
        for input in &mut self.inputs {
            if input.page.is_none() {
                input.page = input.decoder.decode_page(&mut input.data)?;
            }
            if let Some(page) = input.page {
                minimum = Some(minimum.map_or(page.pgno, |value: u32| value.min(page.pgno)));
            }
        }
        Ok(minimum)
    }

    fn write_page_buffer(&mut self, page_number: u32) -> Result<()> {
        let commit = self.encoder.header.commit;
        let mut written = false;
        for input in self.inputs.iter_mut().rev() {
            let Some(page) = input.page else {
                continue;
            };
            if page.pgno != page_number {
                continue;
            }
            input.page = None;
            if written || page_number > commit {
                continue;
            }
            written = true;
            self.encoder.encode_page(page, &input.data)?;
        }
        Ok(())
    }
}

fn is_contiguous(previous_max: TXID, min: TXID, max: TXID) -> bool {
    min.0 <= previous_max.0.wrapping_add(1) && max > previous_max
}

struct CompactorInput<R> {
    decoder: Decoder<R>,
    page: Option<PageHeader>,
    data: Vec<u8>,
}
