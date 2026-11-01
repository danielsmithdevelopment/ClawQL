// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! Alarm installation identity, committed atomically with the alarm row.
use celld_logic::wake::{AlarmSnapshot, AlarmSource, PublicationId};
use rusqlite::{params, Connection, OptionalExtension as _};

/// The ownership protocol advances the epoch before a restored image can
/// write. A same-epoch reopen retains this row, including consumed tombstones.
/// Resetting its sequence would let an old DELETE name a new installation.
/// A new epoch also preserves the sequence: zero then means this image has no
/// alarm history, so an empty cell needs retirement only when a scan finds it.
pub(crate) fn initialize(c: &Connection, scope: &str, epoch: u64) -> anyhow::Result<()> {
    anyhow::ensure!(epoch > 0, "wake writer epoch must be positive");
    c.execute_batch(
        "CREATE TABLE IF NOT EXISTS _cf_WAKE (
           scope TEXT PRIMARY KEY, epoch TEXT NOT NULL CHECK(length(epoch)=16),
           sequence INTEGER NOT NULL CHECK(typeof(sequence)='integer' AND sequence>=0),
           at_ms INTEGER
         );",
    )?;
    let epoch = format!("{epoch:016x}");
    let prior: Option<String> = c
        .query_row(
            "SELECT epoch FROM _cf_WAKE WHERE scope=?1",
            [scope],
            |row| row.get(0),
        )
        .optional()?;
    anyhow::ensure!(
        prior.as_ref().is_none_or(|prior| prior <= &epoch),
        "wake writer epoch cannot move backwards"
    );
    // A legacy alarm has no immutable publication to preserve. Install its
    // identity in the newly authorized epoch without changing the deadline,
    // handler generation, or retry state. Offline migration seeds discovery
    // before any such database opens, including alarms with lost old hints.
    // Existing histories are never rebuilt: that would reuse retired keys.
    c.execute_batch("SAVEPOINT celld_wake_open;")?;
    let result = (|| -> anyhow::Result<()> {
        c.execute(
            "INSERT INTO _cf_WAKE(scope,epoch,sequence,at_ms)
             VALUES(?1,?2,0,(SELECT at_ms FROM _cf_ALARM WHERE scope=?1))
             ON CONFLICT(scope) DO UPDATE SET epoch=excluded.epoch
               WHERE excluded.epoch>_cf_WAKE.epoch",
            params![scope, epoch],
        )?;
        // Triggers also cover handler consumption, retry, and transaction
        // rollback. Callback bookkeeping cannot make identity atomic with SQL.
        c.execute_batch(
            "CREATE TRIGGER IF NOT EXISTS _cf_WAKE_insert AFTER INSERT ON _cf_ALARM BEGIN
               UPDATE _cf_WAKE SET sequence=sequence+1,at_ms=NEW.at_ms WHERE scope=NEW.scope;
             END;
             CREATE TRIGGER IF NOT EXISTS _cf_WAKE_update AFTER UPDATE OF at_ms,generation ON _cf_ALARM BEGIN
               UPDATE _cf_WAKE SET sequence=sequence+1,at_ms=NEW.at_ms WHERE scope=NEW.scope;
             END;
             CREATE TRIGGER IF NOT EXISTS _cf_WAKE_delete AFTER DELETE ON _cf_ALARM BEGIN
               UPDATE _cf_WAKE SET sequence=sequence+1,at_ms=NULL WHERE scope=OLD.scope;
             END;",
        )?;
        let consistent: bool = c.query_row(
            "SELECT at_ms IS (SELECT at_ms FROM _cf_ALARM WHERE scope=?1)
             FROM _cf_WAKE WHERE scope=?1",
            [scope],
            |row| row.get(0),
        )?;
        anyhow::ensure!(consistent, "alarm and wake installation disagree");
        Ok(())
    })();
    if result.is_err() {
        c.execute_batch("ROLLBACK TO celld_wake_open;")?;
    }
    c.execute_batch("RELEASE celld_wake_open;")?;
    result
}

/// Call while holding the connection's source lock. An open transaction has
/// no publication identity yet: its sequence can still be rolled back.
pub(crate) fn snapshot(
    c: &Connection,
    scope: &str,
    position: u64,
) -> anyhow::Result<AlarmSnapshot> {
    anyhow::ensure!(
        c.is_autocommit(),
        "wake snapshot requires a committed transaction"
    );
    // SQLite keeps autocommit enabled while a RETURNING cursor holds an
    // implicit write open. Publishing that sequence before rollback would
    // let the next installation reuse an already published key.
    super::ensure_no_unfinished_write_cursor(c)?;
    let (epoch, sequence, at_ms): (String, u64, Option<i64>) = c.query_row(
        "SELECT epoch,sequence,at_ms FROM _cf_WAKE WHERE scope=?1",
        [scope],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;
    let epoch = u64::from_str_radix(&epoch, 16)?;
    anyhow::ensure!(epoch > 0, "invalid wake writer epoch");
    Ok(AlarmSnapshot::committed(
        at_ms,
        AlarmSource {
            id: PublicationId { epoch, sequence },
            position,
        },
    ))
}
