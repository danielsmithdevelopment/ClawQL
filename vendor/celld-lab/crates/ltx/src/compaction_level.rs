//! Litestream-compatible LTX compaction-level definitions.

use crate::error::{Error, Result};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// The level that contains complete database snapshots.
pub const SNAPSHOT_LEVEL: i32 = 9;

/// One non-snapshot compaction level.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CompactionLevel {
    /// The numeric level, which must match its position in the level list.
    pub level: i32,
    /// The interval for compaction from the preceding level.
    pub interval: Duration,
}

impl CompactionLevel {
    /// Returns the start of the current interval in UTC time.
    pub fn previous_compaction_at(self, now: SystemTime) -> SystemTime {
        if self.interval.is_zero() {
            return now;
        }
        let elapsed = now.duration_since(UNIX_EPOCH).unwrap_or_default();
        let interval = self.interval.as_nanos();
        let truncated = elapsed.as_nanos() - elapsed.as_nanos() % interval;
        UNIX_EPOCH + Duration::from_nanos(truncated.min(u128::from(u64::MAX)) as u64)
    }

    /// Returns the start of the next interval in UTC time.
    pub fn next_compaction_at(self, now: SystemTime) -> SystemTime {
        self.previous_compaction_at(now) + self.interval
    }
}

/// The canonical Litestream v0.5.16 non-snapshot levels.
pub const DEFAULT_COMPACTION_LEVELS: [CompactionLevel; 4] = [
    CompactionLevel {
        level: 0,
        interval: Duration::ZERO,
    },
    CompactionLevel {
        level: 1,
        interval: Duration::from_secs(30),
    },
    CompactionLevel {
        level: 2,
        interval: Duration::from_secs(5 * 60),
    },
    CompactionLevel {
        level: 3,
        interval: Duration::from_secs(60 * 60),
    },
];

/// A validated ordered collection of non-snapshot levels.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompactionLevels(Vec<CompactionLevel>);

impl CompactionLevels {
    /// Creates and validates an ordered level collection.
    pub fn new(levels: Vec<CompactionLevel>) -> Result<Self> {
        let levels = Self(levels);
        levels.validate()?;
        Ok(levels)
    }

    /// Returns the canonical Litestream v0.5.16 levels.
    pub fn defaults() -> Self {
        Self(DEFAULT_COMPACTION_LEVELS.to_vec())
    }

    /// Returns the ordered level slice.
    pub fn as_slice(&self) -> &[CompactionLevel] {
        &self.0
    }

    /// Returns a non-snapshot level by its numeric index.
    pub fn level(&self, level: i32) -> Result<CompactionLevel> {
        if level == SNAPSHOT_LEVEL {
            return Err(invalid("the snapshot level is not a compaction level"));
        }
        self.0
            .get(usize::try_from(level).map_err(|_| invalid("level is out of bounds"))?)
            .copied()
            .ok_or_else(|| invalid("level is out of bounds"))
    }

    /// Returns the highest non-snapshot level.
    pub fn max_level(&self) -> i32 {
        self.0.len() as i32 - 1
    }

    /// Returns whether a level exists or is the snapshot level.
    pub fn is_valid_level(&self, level: i32) -> bool {
        level == SNAPSHOT_LEVEL || (0..=self.max_level()).contains(&level)
    }

    /// Returns the preceding level, including the level before a snapshot.
    pub fn previous_level(&self, level: i32) -> Option<i32> {
        if level == SNAPSHOT_LEVEL {
            Some(self.max_level())
        } else {
            level.checked_sub(1).filter(|level| *level >= 0)
        }
    }

    /// Returns the following level, including the snapshot transition.
    pub fn next_level(&self, level: i32) -> Option<i32> {
        if level == SNAPSHOT_LEVEL {
            None
        } else if level == self.max_level() {
            Some(SNAPSHOT_LEVEL)
        } else {
            level
                .checked_add(1)
                .filter(|level| self.is_valid_level(*level))
        }
    }

    fn validate(&self) -> Result<()> {
        if self.0.is_empty() {
            return Err(invalid("at least one compaction level is required"));
        }
        for (index, level) in self.0.iter().enumerate() {
            if level.level != index as i32 {
                return Err(invalid("compaction levels are out of order"));
            }
            if level.level >= SNAPSHOT_LEVEL {
                return Err(invalid("a compaction level exceeds the maximum"));
            }
            if (level.level == 0) != level.interval.is_zero() {
                return Err(invalid("a compaction interval is invalid"));
            }
        }
        Ok(())
    }
}

fn invalid(message: &'static str) -> Error {
    Error::Other(message.into())
}
