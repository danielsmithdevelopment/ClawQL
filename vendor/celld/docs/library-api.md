# Rust library API

## Select facade

Use `celld::asyncrt::select!` when the source order must not decide a tie. The
macro selects a cyclic start for each poll, and it rejects the `biased;` token.

Use `celld::asyncrt::select_biased!` only when the source order defines the
winner of a tie. The macro polls the branches in source order. The first token
must be a non-empty string literal that states which arm wins and why.

## Durability ownership

The `celld` crate requires one `node_log::DurabilityOwner` for each local
durability stack. The owner keeps the coupled registration. It retains each
live or failed background-task handle until shutdown joins it. It also retains
each admitted release-close task and the final close handle until the
registered managed databases close.

The crate removes these public functions:

- `LtxRepl::set_shipper`
- `LtxRepl::set_bundle_sink`
- `node_log::spawn_maintenance`
- `node_log::spawn_fragment_gc`

The old setter functions installed separate strong references. A
`NodeLogManager` also retains its `LtxRepl`, so these references can create an
ownership cycle.

The old spawn functions detached their task handles. An embedding process
therefore cannot stop or join the tasks during local shutdown.

Construct a `DurabilityOwner` after the node-log recovery completes. Call
`DurabilityOwner::start_background` before the process starts its application
services, and retain the owner for the process lifetime.

Await `LtxRepl::release` when a runtime stops a cell and keeps its local files.
The method admits a managed database close to the owner task group before it
waits. Require an `Ok` result before another activation reuses the local path.
The owner retains the admitted close if the caller is cancelled. An `Err`
result retains the replica, so a later call can retry while the owner accepts
close work. The final owner shutdown also closes a retained replica.

Call `DurabilityOwner::quiesce_and_seal_within` with the remaining process time
during shutdown. A `false` result means that the local fallback ran. Therefore,
the process must not prepare a clean reload.

Stop and join all application and runtime operations before the final local
shutdown. This order prevents an activation from retaining an unregistered
database across the final shutdown snapshot.

Call `DurabilityOwner::shutdown_local_within` after an optional clean-reload
preparation. Pass the remaining process time to this method. A `false` result
means that the local fallback ran before the local shutdown completed, so the
process must exit without unwinding.

A process that has a follower store without a runtime durability stack must
use `DurabilityOwner::new_follower`. This owner starts, stops, and joins the
follower fragment collector.
