// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! The production selector for the Actor execution domain.

use super::*;
use futures_util::StreamExt as _;

impl Actor {
    /// Runs the production start-select-step loop.
    ///
    /// This selector stays unbiased because production permits every
    /// ready-input order. Direct callers can use [`Actor::start`] and
    /// [`Actor::step`] without this raw Tokio select.
    pub async fn run(mut self, mut rx: mpsc::UnboundedReceiver<Message>) {
        let mut effects = FuturesUnordered::new();
        let mut delays = DelayQueue::new();
        let mut timer_slots = TimerSlots::<delay_queue::Key>::default();
        let mut out = StepOutput::default();
        self.start(&mut out);
        drain_step_output(&mut out, &mut effects, &mut delays, &mut timer_slots);
        loop {
            crate::asyncrt::select! {
                message = rx.recv() => {
                    let Some(message) = message else {
                        break;
                    };
                    self.step(ActorInput::Message(message), &mut out);
                }
                Some(completed) = effects.next(), if !effects.is_empty() => {
                    self.step(ActorInput::Completed(completed), &mut out);
                }
                Some(expired) = delays.next(), if !delays.is_empty() => {
                    let arm = expired.into_inner();
                    if timer_slots.fire(&arm.slot, arm.ordinal).is_some() {
                        self.step(ActorInput::TimerFired(arm.timer), &mut out);
                    }
                }
            }
            drain_step_output(&mut out, &mut effects, &mut delays, &mut timer_slots);
        }
    }
}
