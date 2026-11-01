// Copyright 2026 Deno Land Inc. Apache-2.0 license.

use super::{ActivityGuard, AppHandle};
use crate::js::{answer_ticket, GatedAnswer, RequestId};
use celld_logic::RequestError;
use std::future::Future;

/// A locally routed request and its activity lifetime.
pub struct LocalRequest<'a> {
    app: &'a AppHandle,
    activity: ActivityGuard,
    #[cfg(all(test, celld_internal_tests))]
    omit_read_position_for_tooth: bool,
    #[cfg(all(test, celld_internal_tests))]
    mutation_position_for_tooth: Option<Option<u64>>,
}

/// A handler failure or a rejected output, with the original failure retained.
#[derive(Debug)]
pub enum LocalRequestFailure {
    Handler(anyhow::Error),
    OutputGate {
        verdict: RequestError,
        handler: Option<anyhow::Error>,
    },
}

/// A gated result and the activity that must follow its response body.
pub struct LocalRequestCompletion<T> {
    pub result: Result<T, LocalRequestFailure>,
    pub activity: ActivityGuard,
}

impl AppHandle {
    /// Bind a locally admitted request to its handler and response lifetime.
    pub fn local_request(
        &self,
        request: u64,
        cell: String,
        request_id: Option<RequestId>,
        origin: &'static str,
    ) -> LocalRequest<'_> {
        LocalRequest {
            app: self,
            activity: self.activity_for(request, cell, request_id, origin),
            #[cfg(all(test, celld_internal_tests))]
            omit_read_position_for_tooth: false,
            #[cfg(all(test, celld_internal_tests))]
            mutation_position_for_tooth: None,
        }
    }
}

impl LocalRequest<'_> {
    // Reproduce the old read ticket at the request boundary. Keep the handler's
    // original sample so the omitted position remains detectable.
    #[cfg(all(test, celld_internal_tests))]
    pub(crate) fn without_read_position_for_tooth(mut self) -> Self {
        self.omit_read_position_for_tooth = true;
        self
    }

    // Damage only the production ticket after the handler has returned its
    // actual SQLite sample. Rewriting both would conceal the missing proof.
    #[cfg(all(test, celld_internal_tests))]
    pub(crate) fn with_mutation_position_for_tooth(mut self, position: Option<u64>) -> Self {
        self.mutation_position_for_tooth = Some(position);
        self
    }

    /// Execute a handler and hold its answer until its output ticket resolves.
    pub async fn run<T: GatedAnswer>(
        self,
        handler: impl Future<Output = anyhow::Result<T>>,
    ) -> LocalRequestCompletion<T> {
        let result = handler.await;
        // A failed handler can reveal a committed or observed position too.
        // Gating successes alone lets its error escape before that position is
        // durable and leaves later read-only requests without a barrier.
        let ticket = answer_ticket(&result);
        #[cfg(all(test, celld_internal_tests))]
        let ticket = ticket.map(|mut ticket| {
            if self.omit_read_position_for_tooth && ticket.position.is_none() {
                ticket.observed = None;
            }
            if let (Some(_), Some(position)) = (ticket.position, self.mutation_position_for_tooth) {
                ticket.position = position;
            }
            ticket
        });
        let result = match ticket {
            Some(ticket) => {
                self.activity.set_phase("output_gate", false, false);
                if let Some(position) = ticket.position {
                    self.activity.gate_started(position);
                }
                // The activity owns the request used by the gate. Accepting
                // another request here could acknowledge a different write or
                // release this cell while its answer still waits for proof.
                let gated = self.app.gate_output(self.activity.request, ticket).await;
                self.activity.gate_finished(gated.is_ok());
                match gated {
                    Ok(()) => result.map_err(LocalRequestFailure::Handler),
                    Err(verdict) => Err(LocalRequestFailure::OutputGate {
                        verdict,
                        handler: result.err(),
                    }),
                }
            }
            None => result.map_err(LocalRequestFailure::Handler),
        };
        // A streaming answer still pins the cell. Returning only its value
        // would drop the guard before the response-body owner can retain it.
        LocalRequestCompletion {
            result,
            activity: self.activity,
        }
    }
}
