import { z } from "zod";
import { defineAgent, method, http } from "@golemcloud/golem-ts-sdk";

/**
 * Kill-mid-write peer agent: POSTs to a mock ledger, then sleeps so the harness
 * can `simulate-crash` while the HTTP call is in flight. Recovery re-sends the
 * request with Golem's idempotency key (outbound HTTP semantics).
 */
export const WriteAgent = defineAgent({
  name: "WriteAgent",
  id: { trial: z.string() },
  http: http.mount("/writes/{trial}"),
  methods: {
    charge: method({
      input: {
        ledgerUrl: z.string(),
        idempotencyKey: z.string(),
        upstreamMode: z.enum(["idempotent", "non_idempotent"]),
        holdMs: z.number().optional(),
      },
      returns: z.object({
        status: z.number(),
        body: z.string(),
      }),
      http: http.post("/charge"),
    }),
    lastStatus: method({
      input: {},
      returns: z.number().nullable(),
      http: http.get("/last-status"),
    }),
  },
});

export const WriteAgentImpl = WriteAgent.implement({
  init: ({ id }) => ({ trial: id.trial, lastStatus: null as number | null }),
  methods: {
    async charge({ ledgerUrl, idempotencyKey, upstreamMode, holdMs }) {
      const response = await fetch(ledgerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Idempotency-Key": idempotencyKey,
          "X-Upstream-Mode": upstreamMode,
          "X-Hold-Ms": String(holdMs ?? 2500),
          "X-Trial": this.trial,
        },
        body: JSON.stringify({
          trial: this.trial,
          idempotencyKey,
          upstreamMode,
        }),
      });
      const body = await response.text();
      this.lastStatus = response.status;
      return { status: response.status, body };
    },
    lastStatus() {
      return this.lastStatus;
    },
  },
});
