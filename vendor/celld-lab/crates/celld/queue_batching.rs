// Copyright 2026 Deno Land Inc. Apache-2.0 license.

/// Two stages of one internal policy: producer calls share a transaction,
/// then pending writes from multiple Queues share a fleet log capture.
/// Removing the second wait can regress mixed-Queue tail latency even when
/// a single busy Queue gets faster. Neither wait is a durability deadline.
#[derive(Clone, Copy)]
pub(crate) struct Timing {
    pub producer_ms: u64,
    pub log_ms: u64,
}

const DEFAULT: Timing = Timing {
    producer_ms: 4,
    log_ms: 1,
};

pub(crate) fn timing() -> Timing {
    #[cfg(all(test, celld_internal_tests))]
    if let Some(timing) = OVERRIDE.get() {
        return timing;
    }
    DEFAULT
}

#[cfg(all(test, celld_internal_tests))]
thread_local! {
    static OVERRIDE: std::cell::Cell<Option<Timing>> = const { std::cell::Cell::new(None) };
}

/// Capture the timings during construction, before tasks can change threads.
/// Restore the prior policy on unwind so one scenario cannot alter another.
#[cfg(all(test, celld_internal_tests))]
pub(crate) fn with_timing_for_test<T>(timing: Timing, build: impl FnOnce() -> T) -> T {
    struct Reset(Option<Timing>);
    impl Drop for Reset {
        fn drop(&mut self) {
            OVERRIDE.set(self.0);
        }
    }
    let _reset = Reset(OVERRIDE.replace(Some(timing)));
    build()
}
